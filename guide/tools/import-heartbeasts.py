"""Import named heartbeast aspects and answer tables from the pinned licensed source."""
import hashlib
import html
import json
from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
HELP = runpy.run_path(str(ROOT / 'tools/import-preparation-routes.py'))
FAMILIES = ['concept', 'trait', 'quirk', 'archetype']


def literal(value):
    if not value:
        return ''
    match = re.fullmatch(r'"((?:\\.|[^"\\])*)"', value.strip())
    if not match or '[' in match[1]:
        return ''
    return html.unescape(re.sub('<[^>]*>', '', match[1])).replace('\\n', ' ').replace('\\"', '"').strip()


def text_list(value):
    return [literal(match[0]) for match in re.finditer(r'"(?:\\.|[^"\\])*"', value or '')]


def identity(path):
    return 'heart-' + hashlib.sha256(path.encode()).hexdigest()[:14]


def main():
    base = ROOT / 'sources/ratwood-current'
    manifest = json.loads((base / 'manifest.json').read_text())
    revision = manifest['revision']
    prefix = 'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/' + revision + '/'
    definitions = {}
    texts = {}
    for file in manifest['files']:
        if not file['path'].endswith('.dm'):
            continue
        text = (base / file['path']).read_text(encoding='utf-8-sig')
        texts[file['path']] = text
        for path, row in HELP['parse_definitions'](text, file['path']).items():
            if path in definitions:
                definitions[path]['own'].update(row['own'])
            else:
                definitions[path] = row
    resolved = HELP['resolve_all'](definitions)
    component = texts.get('code/modules/roguetown/roguemachine/heartbeast/heart_component.dm', '')
    evaluation = component.split('/proc/evaluate_answer(', 1)[-1].split('/datum/component/', 1)[0]
    word_score = re.search(r'if\(word_count >= task.min_words && word_count <= task.max_words\)\s*score \+= (\d+)', evaluation)
    punctuation_score = re.search(r'if\(last_char == expected_punctuation\)\s*score \+= (\d+)', evaluation)
    keyword_score = re.search(r'score \+= min\(keywords_found, (\d+)\) \* (\d+)', evaluation)
    passing = re.search(r'if\(score >= (\d+)\)', evaluation)
    scoring_known = all([word_score, punctuation_score, keyword_score, passing])
    canisters = texts.get('code/modules/roguetown/roguemachine/heartbeast/heart_canisters.dm', '')
    fill_time = re.search(r'// Correct item - fill the canister\s*if\(do_after\(user, (\d+) SECONDS\)\)', canisters)

    def name(path):
        row = resolved.get(path, {})
        return literal(row.get('name')) or path.rsplit('/', 1)[-1].replace('_', ' ')

    def source(path):
        row = definitions[path]
        return {'title': 'Ratwood 2.0 heartbeast source', 'url': prefix + row['source'] + '#L' + str(row['line'])}

    topics, coverage = [], []
    for path, definition in definitions.items():
        family = next((f for f in FAMILIES if path.startswith('/datum/flesh_' + f + '/')), None)
        if not family or '/proc/' in path:
            continue
        title = literal(definition['own'].get('name'))
        if not title:
            continue
        row = resolved[path]
        title = title[0].upper() + title[1:]
        t = {'id': identity(path), 'title': title + ' (heartbeast ' + family + ')', 'baseTitle': title,
             'family': family, 'kind': 'heartbeast', 'section': 'reference', 'category': 'Heartbeasts',
             'aliases': [title, 'heartbeast ' + title.lower(), title.lower() + ' ' + family],
             'summary': literal(row.get('description')), 'facts': [{'label': 'Aspect type', 'value': family.title()}],
             'requirements': [], 'steps': [], 'related': [], 'relatedTypes': [], 'sources': [source(path)],
             'status': 'source', 'sourceRevision': revision, 'sourceType': path, 'publicContent': True,
             'gaps': ['Behavior follows the pinned source; the live server and interactions between multiple aspects have not been tested.']}
        if family == 'concept':
            keywords = text_list(row.get('answer_keywords'))
            t['summary'] = 'Heartbeast questions about ' + title.lower() + ', with the accepted answer keywords.'
            t['facts'].append({'label': 'Accepted answer keywords', 'value': ', '.join(keywords)})
            for tier, questions in re.findall(r'(\d+)\s*=\s*list\((.*?)\)', row.get('tier_questions', ''), re.S):
                t['facts'].append({'label': 'Tier ' + tier + ' questions', 'value': ' · '.join(text_list(questions))})
            if scoring_known:
                t['facts'].append({'label': 'How answers are scored', 'value': 'Matching word count gives ' + word_score[1] + ' points; matching the required final punctuation gives ' + punctuation_score[1] + '; each distinct matching keyword gives ' + keyword_score[2] + ', up to ' + keyword_score[1] + ' keywords. After quirk adjustments, a score of ' + passing[1] + ' or more passes.'})
            else:
                t['gaps'].append('The current scoring handler no longer matches the reviewed extraction patterns; its numerical rules need review.')
            t['steps'] = ['Include accepted keywords in your answer. Matching uses case-insensitive substring checks.', 'Follow the beast’s current word-count range and final punctuation. Its traits and quirks can change those requirements.', 'Answer as the beast’s designated listener; other speakers are ignored by this task handler.']
            t['sources'].append({'title': 'Question selection and answer scoring', 'url': prefix + 'code/modules/roguetown/roguemachine/heartbeast/heart_component.dm#L295'})
        else:
            related_fields = {'liked_concepts': 'Liked concepts', 'conflicting_traits': 'Conflicting traits', 'conflicting_quirks': 'Conflicting quirks', 'possible_traits': 'Possible traits', 'possible_quirks': 'Possible quirks'}
            for field, label in related_fields.items():
                values = [item['type'] for item in HELP['list_values'](row.get(field))]
                if field in row:
                    t['facts'].append({'label': label, 'value': ', '.join(name(value) for value in values) or 'None listed'})
                t['relatedTypes'].extend(values)
            approaches = row.get('preferred_approaches', '')
            minimum = re.search(r'"min_words"\s*=\s*(\d+)', approaches)
            maximum = re.search(r'"max_words"\s*=\s*(\d+)', approaches)
            punctuation = re.search(r'"punctuation"\s*=\s*("(?:\\.|[^"\\])*")', approaches)
            if minimum and maximum:
                t['facts'].append({'label': 'Preferred answer length', 'value': minimum[1] + '–' + maximum[1] + ' words'})
            if punctuation:
                t['facts'].append({'label': 'Preferred final punctuation', 'value': literal(punctuation[1])})
            if family == 'trait':
                t['gaps'].append('Task creation applies traits in sequence; a later trait can replace an earlier word-count or punctuation preference. Language quirks can override punctuation.')
            if family == 'quirk':
                categories = {'QUIRK_LANGUAGE': 'Language', 'QUIRK_BEHAVIOR': 'Behavior', 'QUIRK_ENVIRONMENT': 'Environment', 'QUIRK_INTERACT': 'Item interaction'}
                if row.get('quirk_type') in categories:
                    t['facts'].append({'label': 'Quirk category', 'value': categories[row['quirk_type']]})
                if row.get('rarity'):
                    t['facts'].append({'label': 'Selection weight', 'value': row['rarity'] + ' (higher is more common; not a percentage)'})
            colors = text_list(row.get('discharge_colors'))
            if colors:
                t['facts'].append({'label': 'Possible discharge colors', 'value': ', '.join(colors)})
            item = row.get('required_item')
            if item and item.startswith('/obj/'):
                t['requiredItem'] = {'type': item, 'name': name(item)}
                t['relatedTypes'].append(item)
                t['requirements'] = ['Empty aspect canister', name(item), 'Linked aspect rack']
                t['facts'].append({'label': 'Canister ingredient', 'value': '1 × ' + name(item)})
                advances = row.get('calibration_required')
                if advances:
                    t['facts'].append({'label': 'Calibration advances required', 'value': advances})
                fill = ('Filling takes ' + fill_time[1] + ' seconds and consumes the item.') if fill_time else 'Wait for the filling action to finish; it consumes the item.'
                t['steps'] = ['Use an empty aspect canister in hand and attune it to ' + title + '.', 'Use one ' + name(item) + ' on it. ' + fill, 'Insert the filled canister into a matching slot in the linked aspect rack.', 'Answer attempts advance calibration. When the required advances are reached, the aspect must match the beast or the canister breaks.']
                t['sources'].extend([{'title': 'Canister filling and calibration', 'url': prefix + 'code/modules/roguetown/roguemachine/heartbeast/heart_canisters.dm#L151'}, {'title': 'Aspect rack slots', 'url': prefix + 'code/modules/roguetown/roguemachine/heartbeast/heart_rack.dm#L34'}])
        if not t['summary']:
            t['summary'] = 'A heartbeast ' + family + ' defined in the pinned source.'
        topics.append(t)
        coverage.append({'type': path, 'topicId': t['id'], 'family': family, 'state': 'mapped'})
    output = {'revision': revision, 'reviewed': manifest['reviewed'], 'topics': topics, 'coverage': coverage}
    (ROOT / 'sources/current-heartbeasts.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'revision': revision, 'topics': len(topics), 'families': {family: sum(t['family'] == family for t in topics) for family in FAMILIES}}))


if __name__ == '__main__':
    main()
