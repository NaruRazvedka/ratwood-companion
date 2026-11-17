# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extract exact typed sprites from the current pinned source; fetch only needed sheets."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HELP = runpy.run_path(str(ROOT / 'tools/extract-sprites.py'))
REPOSITORY = 'Rotwood-Vale/Ratwood-2.0'
RESTRICTED = ('licensed-infraredbaron', 'modular_deserttown/icons/clothing/')


def git_blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def typed_candidates(topics, definitions):
    by_type = {item['type']: item for item in definitions}
    candidates, missing = [], []
    for topic in topics:
        if topic.get('section') != 'items':
            continue
        path = topic.get('sourceObjectType') or topic.get('sourceType')
        item = by_type.get(path)
        if not item:
            missing.append({'id': topic['id'], 'type': path, 'reason': 'No exact object definition in the current snapshot.'})
        elif not item.get('icon') or item.get('icon_state') is None:
            missing.append({'id': topic['id'], 'type': path, 'reason': 'No inherited static icon and state; runtime artwork is not guessed.'})
        elif any(part in item['icon'].lower() for part in RESTRICTED):
            missing.append({'id': topic['id'], 'type': path, 'reason': 'Excluded artwork license directory.'})
        else:
            candidates.append((topic, item))
    return candidates, missing


def first_frame(path, state, fish=False):
    image, width, height, states = HELP['load_sheet'](path)
    actual = state
    if actual not in states and fish and actual + 'com' in states:
        actual += 'com'
    if actual not in states:
        raise ValueError('The referenced state is absent from its sheet.')
    if not 0 < width <= 256 or not 0 < height <= 256:
        raise ValueError('Unsupported native frame dimensions.')
    offset = states[actual]
    columns = image.width // width
    x, y = offset % columns * width, offset // columns * height
    frame = image.crop((x, y, x + width, y + height))
    if not frame.getchannel('A').getbbox():
        raise ValueError('The first referenced frame is transparent.')
    return frame, actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--max-sheets', type=int, default=60, help='Maximum missing sheets to download, prioritized by catalogue coverage.')
    parser.add_argument('--checkout', type=Path, default=ROOT.parent / 'lab/Ratwood-2.0' if (ROOT.parent / 'lab/Ratwood-2.0').exists() else ROOT.parent / '.cache/ratwood-source')
    args = parser.parse_args()
    base = ROOT / 'sources/ratwood-current'
    manifest = json.loads((base / 'manifest.json').read_text())
    revision = manifest['revision']
    definitions = HELP['definitions'](base / 'definition-index.json', base)
    topics = HELP['topics']()
    candidates, gaps = typed_candidates(topics, definitions)
    tree_text = subprocess.check_output(['git', '-C', str(args.checkout), 'ls-tree', '-r', revision], text=True)
    tree = {}
    for line in tree_text.splitlines():
        header, path = line.split('\t', 1)
        if path.endswith('.dmi'):
            tree[path.casefold()] = (path, header.split()[2])
    needed = Counter()
    for topic, item in candidates:
        canonical = tree.get(item['icon'].casefold())
        if canonical:
            needed[canonical] += 1
    local = {}
    asset_root = ROOT / 'assets/sprites'
    for path in asset_root.rglob('*.dmi'):
        if 'client-pack' in path.parts or any(part in str(path).replace('\\', '/').lower() for part in RESTRICTED):
            continue
        local.setdefault(git_blob(path.read_bytes()), path)
    out = asset_root / 'current'
    out.mkdir(parents=True, exist_ok=True)
    downloaded, errors = 0, []
    for (path, sha), count in needed.most_common():
        if sha in local or not args.fetch or downloaded >= args.max_sheets:
            continue
        downloaded += 1
        try:
            url = f'https://raw.githubusercontent.com/{REPOSITORY}/{revision}/{path}'
            request = urllib.request.Request(url, headers={'User-Agent': 'Ratwood-field-guide-sprites'})
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(8 * 1024 * 1024 + 1)
            if len(content) > 8 * 1024 * 1024 or git_blob(content) != sha:
                raise ValueError('Pinned Git blob checksum did not match, or sheet exceeds 8 MiB.')
            target = out / (sha + '.dmi')
            target.write_bytes(content)
            local[sha] = target
        except Exception as error:
            errors.append({'sheet': path, 'reason': str(error)})
    records = []
    for topic, item in candidates:
        canonical = tree.get(item['icon'].casefold())
        if not canonical:
            gaps.append({'id': topic['id'], 'type': item['type'], 'reason': 'Referenced icon sheet absent from the pinned Git tree.'})
            continue
        sheet, sha = canonical
        source_file = local.get(sha)
        if not source_file:
            gaps.append({'id': topic['id'], 'type': item['type'], 'sheet': sheet, 'reason': 'Pinned sheet not downloaded within the current bounded refresh.'})
            continue
        try:
            crop, state = first_frame(source_file, item['icon_state'], item['type'].startswith('/obj/item/reagent_containers/food/snacks/fish'))
            filename = hashlib.sha256((sha + '\0' + state).encode()).hexdigest()[:20] + '.png'
            crop.save(out / filename)
            records.append({'names': [topic['title']], 'topicIds': [topic['id']], 'type': item['type'], 'path': 'assets/sprites/current/' + filename,
                            'source': f'https://github.com/{REPOSITORY}/blob/{revision}/{sheet}', 'sheet': sheet, 'state': state,
                            'initialState': item['icon_state'], 'sha': sha, 'revision': revision,
                            'definition': f'https://github.com/{REPOSITORY}/blob/{revision}/{item["source"]}#L{item["line"]}',
                            'nativeSize': list(crop.size), 'license': 'CC-BY-SA-3.0 unless otherwise indicated in upstream notices',
                            'note': 'Exact object type and inherited static icon/state. Pinned sheet checksum verified; first frame/direction, without runtime tint or overlays.'})
        except (ValueError, AssertionError, KeyError, AttributeError) as error:
            gaps.append({'id': topic['id'], 'type': item['type'], 'sheet': sheet, 'state': item['icon_state'], 'reason': str(error)})
    (ROOT / 'sources/current-sprites.json').write_text(json.dumps(records, indent=2) + '\n')
    report = {'revision': revision, 'items': sum(t.get('section') == 'items' for t in topics), 'typedCandidates': len(candidates),
              'matched': len(records), 'newlyMatched': sum(not next(t for t in topics if t['id'] == r['topicIds'][0]).get('sprite') for r in records),
              'downloadedSheets': downloaded - len(errors), 'downloadErrors': errors, 'gaps': gaps}
    (ROOT / 'sources/current-sprite-gaps.json').write_text(json.dumps(report, indent=2) + '\n')
    (out / 'NOTICE.md').write_text(f'# Ratwood item artwork\n\nExtracted from [{REPOSITORY}](https://github.com/{REPOSITORY}/tree/{revision}), revision `{revision}`.\n\nAssets are CC BY-SA 3.0 unless an upstream file notice specifies otherwise; see the retained source README and project credits. The proprietary licensed-infraredbaron and modular_deserttown/icons/clothing directories and undocumented client-pack images are excluded. Native first-frame crops omit runtime colors and overlays.\n\nEvery crop records its source sheet, original Git blob checksum, state and object definition in `guide/sources/current-sprites.json`.\n')
    print(json.dumps({key: value for key, value in report.items() if key not in ['gaps', 'downloadErrors']} | {'gapCount': len(gaps), 'downloadErrors': len(errors)}))


if __name__ == '__main__':
    main()
