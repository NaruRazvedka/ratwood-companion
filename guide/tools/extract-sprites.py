"""Extract pinned Ratwood item states; no network or guessed artwork."""
import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets' / 'sprites'
REV = '74f55d70294af6ac3650d7e2839ef70b3ce7db0d'
REPO = 'https://github.com/Rotwood-Vale/Ratwood-Keep/blob/' + REV + '/'


def normal(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', value)


def display_key(value):
    """Keep the builder's exact title/alias matching behavior."""
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r"['’]", '', value.lower())).strip()


def logical_lines(text):
    """Join DM's backslash continuations without losing source line numbers."""
    pending, start = '', 0
    for number, line in enumerate(text.splitlines(), 1):
        if not pending:
            start = number
        pending += line if not pending else line.lstrip()
        if pending.rstrip().endswith('\\'):
            pending = pending.rstrip()[:-1]
            continue
        yield start, pending
        pending = ''
    if pending:
        yield start, pending


def literal_text(value):
    """Read static DM strings only; interpolated expressions need game context."""
    match = re.fullmatch(r'"((?:\\.|[^"\\])*)"', value.strip())
    if not match or re.search(r'(?<!\\)(?:\\\\)*\[', match[1]):
        return None
    escapes = {'n': '\n', 't': '\t', '"': '"', '\\': '\\', '[': '[', ']': ']'}
    return re.sub(r'\\(.)', lambda m: escapes.get(m[1], '\\'+m[1]), match[1])


def definitions(index_path=None, source_root=ASSETS, root_type='/obj'):
    index = json.loads((index_path or ASSETS / 'source-code/index.json').read_text(encoding='utf-8'))
    types = {}
    for source in index:
        text = (source_root / source['file']).read_text(encoding='utf-8-sig')
        text = re.sub(r'/\*.*?\*/', lambda m: '\n'*m[0].count('\n'), text, flags=re.S)
        current = None
        for number, line in logical_lines(text):
            if line.startswith('/'):
                declaration = line.split('//', 1)[0].strip()
                current = declaration if re.fullmatch(re.escape(root_type)+r'(?:/[A-Za-z0-9_]+)*', declaration) else None
                if current:
                    types.setdefault(current, {'type': current, 'source': source['path'], 'line': number})
            elif current:
                match = re.match(r'^(?:\t| {4})(name|desc|description|bottle_name|bottle_desc|icon|icon_state|parent_type|color|smeltresult|cooked_type|fried_type|slice_path)\s*=\s*(.*)$', line)
                if match:
                    key, value = match.groups()
                    quoted = re.fullmatch(r'("(?:\\.|[^"\\])*"|\x27[^\x27]*\x27)\s*(?://.*)?',value)
                    value = quoted[1] if quoted else value.split('//',1)[0].strip()
                    if key in {'desc', 'description', 'bottle_desc'}:
                        types[current][key] = '' if value.strip()=='null' else literal_text(value)
                        types[current][key+'Source'] = source['path']
                        types[current][key+'Line'] = number
                    elif key in {'parent_type', 'smeltresult', 'cooked_type', 'fried_type', 'slice_path'} and value.startswith('/'):
                        types[current][key] = value.strip()
                    elif value.strip() == 'null':
                        types[current][key] = None
                    elif re.fullmatch(r'"[^"\n]*"|\x27[^\x27\n]*\x27', value):
                        types[current][key] = value[1:-1]
    cache = {}

    def resolve(path, chain=()):
        if path in cache:
            return cache[path]
        if path in chain:
            raise ValueError('Inheritance cycle: ' + path)
        item = types.get(path, {})
        parent = item.get('parent_type', path.rsplit('/', 1)[0])
        result = dict(resolve(parent, chain + (path,))) if parent and parent != path else {}
        result.update(item)
        result['resolvedParent'] = parent
        cache[path] = result
        return result

    return [resolve(path) for path in types]


def topics():
    text = (ROOT / 'data.js').read_text(encoding='utf-8-sig')
    return json.JSONDecoder().raw_decode(text.split('const data=', 1)[1])[0]['topics']


def load_sheet(path):
    image = Image.open(path)
    metadata = image.info.get('Description', '')
    width = int(re.search(r'\bwidth = (\d+)', metadata).group(1))
    height = int(re.search(r'\bheight = (\d+)', metadata).group(1))
    states, offset = {}, 0
    for block in re.split(r'(?m)^state = ', metadata)[1:]:
        name = re.match(r'"(.*?)"', block).group(1)
        states[name] = offset
        offset += int(re.search(r'dirs = (\d+)', block).group(1)) * int(re.search(r'frames = (\d+)', block).group(1))
    assert offset * width * height <= image.width * image.height
    return image.convert('RGBA'), width, height, states


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', action='store_true')
    args = parser.parse_args()
    items = definitions()
    known = {item['type']: item for item in items}
    assert known['/obj/item/reagent_containers/food/snacks/rogue/dough']['icon'] == 'modular/Neu_Food/icons/food.dmi'
    assert known['/obj/item/clothing/suit/roguetown/armor/chainmail/iron']['icon_state'] == 'ichainmail'
    catalogue = topics()
    wanted = {}
    for topic in catalogue:
        for name in [topic['title'], *topic.get('aliases', [])]:
            wanted.setdefault(normal(name), []).append(topic['title'])
    matched = []
    for item in items:
        if item.get('name') and item.get('icon') and item.get('icon_state') is not None:
            key = normal(item['name'])
            if key in wanted and '[' not in item['icon_state']:
                item = dict(item)
                item['names'] = list(dict.fromkeys([item['name'], *wanted[key]]))
                matched.append(item)
    by_type = {item['type']: item for item in items}
    aliases_path = ASSETS / 'source-code/catalogue-aliases.json'
    for alias in json.loads(aliases_path.read_text(encoding='utf-8')):
        item = dict(by_type[alias['type']])
        assert item.get('icon') and item.get('icon_state') is not None, alias
        item['names'] = [alias['title']]
        item['alias_reason'] = alias['reason']
        if alias.get('filename'):
            assert re.fullmatch(r'[a-z0-9-]+\.png', alias['filename'])
            item['filename'] = alias['filename']
        matched.append(item)
    (ASSETS / 'source-code/parsed-items.json').write_text(json.dumps(items, indent=2) + '\n', encoding='utf-8')
    (ASSETS / 'source-code/matched-items.json').write_text(json.dumps(matched, indent=2) + '\n', encoding='utf-8')
    needed = sorted({item['icon'] for item in matched})
    (ASSETS / 'source-code/needed-icons.json').write_text(json.dumps(needed, indent=2) + '\n', encoding='utf-8')
    if args.scan:
        print(json.dumps({'definitions': len(items), 'matching_types': len(matched), 'matching_titles': len({n for x in matched for n in x['names'] if n in {t['title'] for t in catalogue}}), 'icons': needed}, indent=2))
        return
    icon_index = json.loads((ASSETS / 'source-icons/index.json').read_text(encoding='utf-8'))
    sheets = {x['path']: ASSETS / x['file'] for x in icon_index}
    for name in ['food', 'produce', 'natural', 'cooking']:
        sheets['icons/roguetown/items/' + name + '.dmi'] = ASSETS / (name + '-source.dmi')
    for name in ['32', 'tools']:
        sheets['icons/roguetown/weapons/' + name + '.dmi'] = ASSETS / (name + '-source.dmi')
    sheets['icons/obj/hydroponics/seeds.dmi'] = ASSETS / 'seeds-source.dmi'
    # Prefer the base named item over its slices, role variants or plated subtype.
    matched.sort(key=lambda x: (bool(x.get('alias_reason')), -len(x['type'])), reverse=True)
    chosen, skipped, images = {}, [], {}
    for item in matched:
        icon, state = item['icon'], item['icon_state']
        if icon not in sheets or 'licensed-infraredbaron' in icon:
            skipped.append({'type': item['type'], 'reason': 'source sheet missing or excluded license directory'})
            continue
        if icon not in images:
            images[icon] = load_sheet(sheets[icon])
        image, width, height, states = images[icon]
        if state not in states:
            skipped.append({'type': item['type'], 'reason': 'state absent from exact source sheet: ' + state})
            continue
        index = states[state]
        x, y = index % (image.width // width) * width, index // (image.width // width) * height
        crop = image.crop((x, y, x + width, y + height))
        composite_note = ''
        if icon == 'icons/roguetown/items/produce.dmi' and state == 'berries':
            overlay_index = states['berriesc5']
            ox = overlay_index % (image.width // width) * width
            oy = overlay_index // (image.width // width) * height
            crop = Image.alpha_composite(crop, image.crop((ox, oy, ox + width, oy + height)))
            composite_note = ' Jacksberry base plus its actual berriesc5 full-bunch overlay; runtime color omitted, so not a poison indicator.'
        if not crop.getchannel('A').getbbox():
            skipped.append({'type': item['type'], 'reason': 'state is transparent'})
            continue
        filename = item.get('filename', 'item-' + hashlib.sha256((icon + ':' + state).encode()).hexdigest()[:14] + '.png')
        crop.save(ASSETS / filename)
        assert Image.open(ASSETS / filename).tobytes() == crop.tobytes()
        note = ('Historical Ratwood ' + REV + '; ' + item['type'] + '; icon_state=' + state
                + ', first frame/direction. Base icon pixels only; runtime tints and overlays may differ. '
                + 'Definition: ' + REPO + item['source'] + '. '
                + item.get('alias_reason', 'Exact normalized source display name matched catalogue title.') + composite_note
                + ' Original Ratwood assets: AGPL-3.0 unless indicated; inherited TG art: CC-BY-SA-3.0. '
                + 'See bundled UPSTREAM-README.md and UPSTREAM-LICENSE.txt.')
        entry = {'names': [], 'path': 'assets/sprites/' + filename, 'source': REPO + icon, 'note': note}
        for name in item['names']:
            key = display_key(name)
            if key not in chosen:
                chosen[key] = (name, entry)
    # Preserve the original reviewed aliases for introductory pages and base ingredients.
    original_path = ASSETS / 'source-code/original-sprites.json'
    if not original_path.exists():
        original_path.write_text((ROOT / 'sources/sprites.json').read_text(encoding='utf-8'), encoding='utf-8')
    for entry in json.loads(original_path.read_text(encoding='utf-8')):
        for name in entry['names']:
            chosen.setdefault(display_key(name), (name, dict(entry, names=[])))
    registry = {}
    for name, entry in chosen.values():
        row = registry.setdefault(entry['path'], dict(entry, names=[]))
        if name not in row['names']:
            row['names'].append(name)
    rows = list(registry.values())
    assert chosen[display_key('Butter')][1]['path'] == 'assets/sprites/butter.png'
    assert chosen[display_key('Butter Slice')][1]['path'] == 'assets/sprites/butter-slice.png'
    assert chosen[display_key('Butter')][1]['path'] != chosen[display_key('Butter Slice')][1]['path']
    for row in rows:
        image = Image.open(ROOT / row['path'])
        assert image.mode == 'RGBA' and image.getchannel('A').getbbox()
        assert row['names'] and row['source'].startswith(REPO)
    (ROOT / 'sources/sprites.json').write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')
    report, unmatched = {}, []
    for topic in catalogue:
        found = display_key(topic['title']) in chosen
        counts = report.setdefault(topic['category'], {'matched': 0, 'unmatched': 0})
        counts['matched' if found else 'unmatched'] += 1
        if not found:
            unmatched.append({key: topic.get(key) for key in ['id', 'title', 'category', 'kind']})
    coverage = {'revision': REV, 'definitions': len(items), 'unique_sprite_files': len(rows),
                'matched_topics': sum(x['matched'] for x in report.values()),
                'unmatched_topics': len(unmatched), 'categories': report, 'skipped_types': skipped}
    physical = [topic for topic in catalogue if topic.get('section') == 'items']
    coverage['physical_catalogue'] = {
        'matched': sum(display_key(topic['title']) in chosen for topic in physical),
        'total': len(physical),
    }
    coverage['physical_catalogue']['unmatched'] = len(physical) - coverage['physical_catalogue']['matched']
    (ASSETS / 'source-code/coverage.json').write_text(json.dumps(coverage, indent=2) + '\n', encoding='utf-8')
    (ASSETS / 'source-code/unmatched-catalogue.json').write_text(json.dumps(unmatched, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(coverage, indent=2))


if __name__ == '__main__':
    main()
