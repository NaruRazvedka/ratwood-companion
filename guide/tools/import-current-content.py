"""Index player-facing definitions and verified alchemy combinations from one snapshot."""
import hashlib
import html
import itertools
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HELP = runpy.run_path(str(ROOT / 'tools/import-preparation-routes.py'))
ACTION_HELP = runpy.run_path(str(ROOT / 'tools/action-spells.py'))


def plain(value):
    if not value:
        return ''
    match = re.search(r'"((?:\\.|[^"\\])*)"', value)
    if not match:
        return ''
    text = html.unescape(re.sub('<[^>]*>', '', match[1])).replace('\\n', ' ').replace('\\"', '"')
    return '' if '[' in text else text.strip()


def uid(value):
    return 'current-' + hashlib.sha256(value.encode()).hexdigest()[:14]


def combinations_for(target, ingredients):
    """No repeated types and no tied/stronger competing outcomes, matching the cauldron."""
    choices = [i for i in ingredients if target in i['potencies']]
    results = []
    for size in [2, 3, 4]:
        for combo in itertools.combinations(choices, size):
            scores = {}
            for ingredient in combo:
                for outcome, score in ingredient['potencies'].items():
                    scores[outcome] = scores.get(outcome, 0) + score
            if scores.get(target, 0) >= 5 and all(value < scores[target] for outcome, value in scores.items() if outcome != target):
                results.append([i['type'] for i in combo])
                if len(results) == 4:
                    return results
        if results:
            return results
    return results


def main():
    base = ROOT / 'sources/ratwood-current'
    manifest = json.loads((base / 'manifest.json').read_text())
    revision = manifest['revision']
    subprocess.run([sys.executable, str(ROOT/'tools/import-ratwood2-recipes.py'), '--current'], check=True)
    subprocess.run([sys.executable, str(ROOT/'tools/import-preparation-routes.py'), '--current'], check=True)
    subprocess.run([sys.executable, str(ROOT/'tools/import-item-text.py'), '--current'], check=True)
    subprocess.run([sys.executable, str(ROOT/'tools/import-item-properties.py'), '--current'], check=True)
    url = 'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/' + revision + '/'
    definitions, texts = {}, {}
    dme=(base/'roguetown.dme').read_text(encoding='utf-8-sig').replace('\\','/')
    excluded_files=[]
    for file in manifest['files']:
        if not file['path'].endswith('.dm'):
            continue
        if file['path'] not in dme:
            excluded_files.append({'path':file['path'],'reason':'Not included by the pinned roguetown.dme.'})
            continue
        text = (base / file['path']).read_text(encoding='utf-8-sig')
        texts[file['path']] = text
        for path, row in HELP['parse_definitions'](text, file['path']).items():
            if path in definitions:
                definitions[path]['own'].update(row['own'])
            else:
                definitions[path] = row
    resolved = HELP['resolve_all'](definitions)
    names = {path: plain(row.get('name') or row.get('title')) for path, row in resolved.items()}
    old = json.loads((ROOT / 'sources/ratwood2-item-text.json').read_text()) if (ROOT / 'sources/ratwood2-item-text.json').exists() else []
    for row in old:
        if not names.get(row['type']):
            names[row['type']] = row.get('name')

    def label(path):
        return names.get(path) or path.rsplit('/', 1)[-1].replace('_', ' ').capitalize()

    def source(path):
        row = definitions[path]
        return [{'title': 'Ratwood 2.0 source', 'url': url + row['source'] + '#L' + str(row['line'])}]

    def topic(path, title, category, kind, section='reference'):
        return {'id': uid(path), 'title': title, 'kind': kind, 'section': section, 'category': category,
                'summary': '', 'aliases': [], 'requirements': [], 'steps': [], 'facts': [], 'related': [],
                'sources': source(path), 'status': 'source', 'sourceRevision': revision, 'sourceType': path,
                'gaps': [], 'publicContent': True}

    topics, ledger = [], []
    for path, definition in definitions.items():
        row = resolved[path]
        title = plain(definition['own'].get('name') or definition['own'].get('title'))
        kind = 'trait' if path.startswith('/datum/special_trait/') else 'skill' if path.startswith('/datum/skill/') else 'role' if path.startswith(('/datum/advclass/', '/datum/job/roguetown/')) else 'spell' if path.startswith('/obj/effect/proc_holder/spell/') else None
        if not kind:
            continue
        if not title or definition['own'].get('abstract_type') == path:
            ledger.append({'type': path, 'state': 'excluded', 'reason': 'No own display name, or abstract definition.'})
            continue
        category = {'trait': 'Traits', 'skill': 'Skills', 'role': 'Roles', 'spell': 'Spells & abilities'}[kind]
        t = topic(path, title, category, kind)
        if kind == 'role':
            t['aliases'] = [title]
            t['title'] = title + (' (role)' if path.startswith('/datum/job/') else ' (specialty)')
            for subclass in HELP['list_values'](row.get('job_subclasses')):
                t['related'].append(uid(subclass['type']))
        t['summary'] = plain(row.get('desc')) or plain(row.get('tutorial')) or ('A ' + kind + ' defined by Ratwood.')
        if kind == 'trait':
            t['traitClass'] = 'Special trait'
            greeting = plain(row.get('greet_text'))
            if greeting:
                t['facts'].append({'label': 'In-game notice', 'value': greeting})
            t['facts'].append({'label': 'Acquisition', 'value': 'Special-trait system; availability depends on the character and server rules. This is not a selectable-role guarantee.'})
        for field, name in [('recharge_time', 'Cooldown'), ('chargetime', 'Charge time'), ('releasedrain', 'Release drain'), ('chargedrain', 'Charge drain'), ('range', 'Range'), ('school', 'School')]:
            value = row.get(field)
            if kind == 'spell' and value and value != 'null':
                value=re.sub(r'\b(SECONDS|MINUTES|HOURS)\b',lambda m:m[1].lower(),value)
                t['facts'].append({'label': name, 'value': value})
        if kind == 'role':
            for field in ['subclass_skills', 'skills']:
                for skill in HELP['list_values'](row.get(field)):
                    t['facts'].append({'label': label(skill['type']), 'value': str(skill['amount']).replace('SKILL_LEVEL_', '').replace('_', ' ').title()})
                    t['related'].append(uid(skill['type']))
            if row.get('subclass_stats'):
                t['facts'].append({'label': 'Starting stat modifiers', 'value': row['subclass_stats'].replace('list(', '').rstrip(')').replace('STATKEY_', '').replace(' = ', ' ')})
        if kind == 'skill':
            if row.get('max_untraited_level'):
                t['facts'].append({'label': 'Ordinary training limit', 'value': row['max_untraited_level'].replace('SKILL_LEVEL_', '').title()})
        t['gaps'].append('Conditional effects and character-specific restrictions are described in the linked source; live-server deployment has not been checked.')
        topics.append(t)
        ledger.append({'type': path, 'topicId': t['id'], 'state': 'mapped', 'family': kind})

    # Character choices use a separate customization hierarchy from random special traits.
    level_names={0:'None',1:'Novice',2:'Apprentice',3:'Journeyman',4:'Expert',5:'Master',6:'Legendary'}
    level_values={name:int(value) for name,value in re.findall(r'^#define\s+(SKILL_LEVEL_\w+)\s+(\d+)',texts.get('code/__DEFINES/skills.dm',''),re.M)}
    for path, definition in definitions.items():
        family=next((p for p in ['/datum/quirk/','/datum/virtue/','/datum/charflaw/'] if path.startswith(p)),None)
        if not family:continue
        row=resolved[path]
        title=plain(definition['own'].get('name'))
        if not title or path.endswith('/none') or definition['own'].get('abstract_type')==path:
            ledger.append({'type':path,'family':'character-choice','state':'excluded','reason':'Empty choice, abstract parent, or no own display name.'})
            continue
        choice='Quirk' if family=='/datum/quirk/' else 'Virtue' if family=='/datum/virtue/' else 'Vice / flaw'
        t=topic(path,title,'Character creation','trait');t['traitClass']='Character creation';t['choiceType']=choice
        t['summary']=plain(row.get('desc')) or 'A named '+choice.lower()+' in character setup.'
        t['facts'].append({'label':'Choice type','value':choice})
        for field,title_label in [('point_cost','Quirk-point cost'),('point_value','Quirk points granted'),('triumph_cost','Triumph cost')]:
            if field in row:t['facts'].append({'label':title_label,'value':row[field]})
        for field,title_label in [('custom_text','Effect'),('warning_text','Warning')]:
            value=plain(row.get(field))
            if value:t['facts'].append({'label':title_label,'value':value})
        t['facts'].append({'label':'Creation-time configuration','value':'Available' if row.get('configurable')=='TRUE' else 'None specified'})
        for skill in HELP['list_values'](row.get('added_skills')):
            amount=level_values.get(skill['amount'],skill['amount'])
            value=label(skill['type'])+' '+(('+' if int(amount)>=0 else '')+str(amount)+' ranks' if str(amount).lstrip('-').isdigit() else 'has a conditional adjustment (see source)')
            t['facts'].append({'label':'Skill adjustment','value':value})
            t['related'].append(uid(skill['type']))
        for skill,amount,cap in re.findall(r'list\((/datum/skill/[\w/]+),\s*(-?\d+),\s*(\d+)\)',row.get('added_skills','')):
            t['facts'].append({'label':'Skill adjustment','value':label(skill)+' '+('+' if int(amount)>=0 else '')+amount+' ranks, up to '+level_names.get(int(cap),cap)})
            t['related'].append(uid(skill))
        for stat,amount in re.findall(r'STATKEY_(\w+)\s*=\s*(-?\d+)',row.get('added_stats','')):
            t['facts'].append({'label':'Stat adjustment','value':stat+' '+('+' if int(amount)>=0 else '')+amount})
        for field,title_label in [('incompatible_virtues','Incompatible virtue'),('incompatible_quirks','Incompatible quirk'),('incompatible_vices','Incompatible vice')]:
            for entry in HELP['list_values'](row.get(field)):
                t['facts'].append({'label':title_label,'value':label(entry['type'])});t['related'].append(uid(entry['type']))
        if row.get('ephemeral')=='TRUE':t['facts'].append({'label':'Processing','value':'Disabled while marked ephemeral'})
        t['gaps']=['Character-setup availability and conditional effects follow the linked source; live-server configuration has not been checked.']
        topics.append(t);ledger.append({'type':path,'family':'character-choice','state':'mapped','topicId':t['id']})

    # Status datums often have no own name: only publish ones with a real named player alert.
    for path,definition in definitions.items():
        if not path.startswith('/datum/status_effect/'):continue
        row=resolved[path];alert=row.get('alert_type');alert_row=resolved.get(alert,{})
        title=plain(alert_row.get('name')) if definition['own'].get('alert_type') else ''
        if not title:
            ledger.append({'type':path,'family':'status-effect','state':'excluded','reason':'No own statically named player alert; internal status identity is not used as a made-up display name.'})
            continue
        t=topic(path,title,'Status effects','effect');t['traitClass']='Effect'
        t['summary']=plain(alert_row.get('desc')) or 'A named status shown by the game.'
        if alert in definitions:t['sources']+=source(alert)
        duration=row.get('duration')
        if duration and duration!='null':
            shown=re.sub(r'\b(SECONDS|MINUTES|HOURS)\b',lambda m:m[1].lower(),duration)
            if re.fullmatch(r'\d+(?:\.\d+)?',shown):shown=str(float(shown)/10)+' seconds'
            elif shown=='-1':shown='No automatic expiry in the listed duration'
            t['facts'].append({'label':'Listed duration','value':shown})
        for stat,amount in re.findall(r'STATKEY_(\w+)\s*=\s*(-?\d+)',row.get('effectedstats','')):
            t['facts'].append({'label':'Stat adjustment','value':stat+' '+('+' if int(amount)>=0 else '')+amount})
        if row.get('status_type'):t['facts'].append({'label':'Repeated application','value':row['status_type'].replace('STATUS_EFFECT_','').replace('_',' ').lower()})
        t['gaps']=['The applying ability or item can change duration and removal conditions. An effect-granted trait is not necessarily temporary.']
        topics.append(t);ledger.append({'type':path,'family':'status-effect','state':'mapped','topicId':t['id']})

    trait_file='code/__DEFINES/traits.dm'
    trait_text=texts.get(trait_file,'')
    trait_names=dict(re.findall(r'^#define\s+(TRAIT_\w+)\s+"([^"\n]+)"',trait_text,re.M))
    tooltips={m[1]:plain('"'+m[2]+'"') for m in re.finditer(r'^\s*(TRAIT_\w+)\s*=\s*span_\w+\("((?:\\.|[^"\\])*)"',trait_text,re.M)}
    trait_ids={}
    for flag,title in trait_names.items():
        if not tooltips.get(flag):
            ledger.append({'type':flag,'family':'trait-flag','state':'excluded','reason':'Internal flag or named trait without a static player-facing explanation; no effect is invented.'})
            continue
        identifier=uid(flag);trait_ids[flag]=identifier
        line=trait_text[:trait_text.index('#define '+flag+' ')].count('\n')+1 if '#define '+flag+' ' in trait_text else 1
        topics.append({'id':identifier,'title':title,'kind':'trait','section':'reference','category':'Traits','traitClass':'Mechanical trait',
                       'summary':tooltips[flag],'aliases':[flag],'requirements':[],'steps':[],'facts':[{'label':'Availability','value':'Granted by character traits, roles or effects that explicitly supply it. This entry does not imply that it can be selected at character creation.'}],
                       'related':[],'sources':[{'title':'Ratwood trait definitions','url':url+trait_file+'#L'+str(line)}],
                       'status':'source','sourceRevision':revision,'sourceType':flag,'publicContent':True,
                       'gaps':['Exact granting and removal conditions depend on the role or effect that supplies this trait.']})
        ledger.append({'type':flag,'family':'trait-flag','state':'mapped','topicId':identifier})
    by_topic_id={t['id']:t for t in topics}
    method_grants={}
    for text in texts.values():
        methods=list(re.finditer(r'^(/[A-Za-z0-9_/]+)\([^\n]*\)\s*\n',text,re.M))
        for index,method in enumerate(methods):
            following=text[method.end():]
            boundary=re.search(r'^/[A-Za-z_]',following,re.M)
            body=following[:boundary.start()] if boundary else following
            owner=method[1].rsplit('/',1)[0]
            flags=re.findall(r'ADD_TRAIT\([^,\n]+,\s*(TRAIT_\w+)',body)
            if flags:method_grants.setdefault(owner,set()).update(flags)
    for t in list(topics):
        path=t.get('sourceType');row=resolved.get(path,{})
        if t['kind']=='role':
            declared=re.findall(r'TRAIT_\w+',row.get('traits_applied','')+' '+row.get('job_traits',''));grant_class='Role granted'
        elif t.get('traitClass')=='Character creation':
            declared=re.findall(r'TRAIT_\w+',row.get('added_traits',''));grant_class='Character creation'
        elif t['kind'] in ['effect','spell']:
            declared=[];grant_class='Effect granted'
        elif t.get('traitClass')=='Special trait':
            declared=[];grant_class='Special trait granted'
        else:continue
        flags=set(declared)|method_grants.get(path,set())
        for flag in sorted(flags):
            if flag not in trait_ids:continue
            target=by_topic_id[trait_ids[flag]]
            t['related'].append(target['id']);t['facts'].append({'label':'Granted trait' if flag in declared else 'Can grant trait','value':trait_names[flag]})
            target['related'].append(t['id']);target['facts'].append({'label':'Granted by' if flag in declared else 'Can be granted by','value':t['title']})
            target.setdefault('traitClasses',['Mechanical trait'])
            if grant_class not in target['traitClasses']:target['traitClasses'].append(grant_class)
            target['traitClass']=' / '.join(target['traitClasses'])
            if grant_class=='Role granted':target['category']='Role traits'
            elif grant_class=='Effect granted' and target['category']!='Role traits':target['category']='Effect traits'
        for flag in re.findall(r'TRAIT_\w+',row.get('incompatible_traits','')):
            if flag in trait_names:
                t['facts'].append({'label':'Incompatible existing trait','value':trait_names[flag]})
                if flag in trait_ids:t['related'].append(trait_ids[flag])

    ingredients = []
    for path, row in resolved.items():
        if not path.startswith('/obj/item/alch/') or not names.get(path):
            continue
        potency = {row[field]: score for field, score in [('major_pot', 3), ('med_pot', 2), ('minor_pot', 1)] if row.get(field, '').startswith('/datum/alch_cauldron_recipe/')}
        if potency:
            ingredients.append({'type': path, 'potencies': potency})
    for path, row in resolved.items():
        if not path.startswith('/datum/alch_cauldron_recipe/') or path not in definitions:
            continue
        outputs = HELP['list_values'](row.get('output_reagents')) + HELP['list_values'](row.get('output_items'))
        combos = combinations_for(path, ingredients)
        for output in outputs:
            t = topic(path, plain(row.get('name')) or label(path), 'Potions', 'potion', 'items')
            t['id'] = uid(output['type'])
            t['sourceObjectType'] = output['type']
            old_names = {'health_potion':['Healing (Red)','Health potion'], 'big_health_potion':['Strong Healing'], 'mana_potion':['Mana (Blue)'], 'big_mana_potion':['Strong Mana'], 'stam_potion':['Stamina (Green)'], 'big_stam_potion':['Strong Stamina'], 'big_antidote':['Strong Antidote'], 'str_potion':['Strength'], 'spd_potion':['Speed'], 'con_potion':['Constitution'], 'end_potion':['Endurance'], 'int_potion':['Intelligence'], 'per_potion':['Perception'], 'luck_potion':['Fortune'], 'big_stam_poison':['Strong Stamina Poison'], 'fire_potion':['Fire Resistance Potion'], 'doompoison':['Doom Poison']}
            t['aliases'] = old_names.get(path.rsplit('/',1)[-1], [])
            t['aliases'] += {'stamina_potion':['Stamina (Green)'], 'big_stamina_potion':['Strong Stamina'], 'strong_antidote':['Strong Antidote'], 'lck_potion':['Fortune'], 'berrypoison':['Death Poison']}.get(path.rsplit('/',1)[-1], [])
            if output['type'].endswith('/emberwine'):
                t['title'] = 'Emberwine'
                t['aliases'] = ['Aphrodisiac Wine', 'Amberwine']
            t['summary'] = 'Prepared in an alchemy cauldron. Choose one ingredient combination.'
            skill = row.get('skill_required', 'SKILL_LEVEL_APPRENTICE').replace('SKILL_LEVEL_', '').title()
            scent = plain(row.get('smells_like'))
            t['facts'] = [{'label': 'Alchemy required', 'value': skill}, {'label': 'Finished scent', 'value': scent}, {'label': 'Batch yield', 'value': str(output['amount']) + (' internal reagent units (3 units per ounce)' if output['type'].startswith('/datum/reagent/') else ' item(s)')}]
            if output['type'].endswith('/emberwine'):
                t['facts'].append({'label': 'Recipe conflict', 'value': 'The older euphrasia + rosa + urtica combination ties another outcome. Use one of the unambiguous combinations listed here.'})
            t['recipeRoutes'] = []
            for index, combo in enumerate(combos):
                t['recipeRoutes'].append({'id': uid(path + str(index)), 'name': ' + '.join(label(i) for i in combo), 'method': 'Alchemy cauldron', 'skill': 'Alchemy',
                    'ingredients': [{'type': i, 'name': label(i), 'amount': 1} for i in combo] + [{'type': '/datum/reagent/water', 'name': 'Water', 'amount': 30, 'unit': 'ounces'}],
                    'requirements': ['Normal cauldron', 'Heat source', skill + ' Alchemy'], 'outputQuantity': output['amount'], 'outputType': output['type'],
                    'outputLabel': (str(round(output['amount']/3, 2)) + ' ounces (' + str(output['amount']) + ' source units)') if output['type'].startswith('/datum/reagent/') else str(output['amount']) + ' item(s)',
                    'steps': ['Put at least 30 ounces of water in a normal cauldron and light it.', 'Add one of each ingredient in this combination, whole. The person adding the last ingredient must have ' + skill + ' Alchemy.', 'Let the cauldron finish boiling. Its completion message describes ' + (scent or 'the recipe scent') + '.', 'Collect the finished batch in a suitable container. Additional water does not increase the fixed recipe yield.'], 'gaps': [], 'sources': source(path)})
            if combos:
                t['steps'] = t['recipeRoutes'][0]['steps']
                t['requirements'] = t['recipeRoutes'][0]['requirements']
                t['gaps'].append('Ingredient combinations follow the pinned scoring rules; live-server deployment has not been checked.')
            if not combos:
                t['gaps'].append('No unambiguous combination of up to four distinct indexed ingredients was confirmed. The outcome is listed without a fabricated ingredient recipe.')
            topics.append(t)
            ledger.append({'type': path, 'topicId': t['id'], 'state': 'mapped' if combos else 'needs-review', 'family': 'cauldron', 'combinations': len(combos)})

    acquisition = []
    for path, row in resolved.items():
        if not path.startswith('/mob/living/simple_animal/') or path not in definitions or not names.get(path):
            continue
        for field, result in [('botched_butcher_results', 'botched'), ('butcher_results', 'normal'), ('perfect_butcher_results', 'perfect')]:
            for output in HELP['list_values'](row.get(field)):
                acquisition.append({'id': uid(path + field + output['type']), 'name': label(path) + ' · ' + result, 'method': 'Butchery', 'animalType': path, 'animalName': label(path),
                    'outputType': output['type'], 'outputName': label(output['type']), 'outputQuantity': output['amount'], 'quality': result,
                    'ingredients': [{'type': path, 'name': label(path) + ' carcass', 'amount': 1}], 'requirements': ['Suitable butchering tool', 'Animal carcass'],
                    'steps': ['Obtain a ' + label(path) + ' carcass.', 'Butcher the carcass with a suitable tool, or ask a butcher to process it.', 'Collect the resulting materials. This yield corresponds to a ' + result + ' butchering result.'], 'sources': source(path), 'gaps': []})

    training = {'id': 'reference-alchemy-training', 'title': 'Learning Alchemy', 'kind': 'guide', 'section': 'guides', 'category': 'Alchemy', 'summary': 'Successful mortar recipes train Alchemy even when starting without the skill.', 'aliases': ['apprentice alchemy', 'grinding experience', 'mortar training'], 'requirements': ['Mortar', 'Pestle', 'Ingredients with an alchemical grinding recipe'], 'steps': ['Put a supported ingredient, such as stone, seeds, or bone, in the mortar.', 'Use the pestle on the loaded mortar normally. Middle-click processing uses a separate interaction and does not award this recipe experience.', 'Each completed alchemical grind awards experience equal to current Intelligence. Apprentice begins at 250 experience; from zero, divide 250 by Intelligence and round upward.', 'Once Apprentice, you meet the regular health potion and Emberwine skill requirements. The strong health potion requires Expert.'], 'facts': [], 'related': [], 'sources': [{'title': 'Mortar experience', 'url': url + 'code/modules/roguetown/roguecrafting/alchemy/mortarpestle.dm'}, {'title': 'Skill thresholds', 'url': url + 'code/__DEFINES/skills.dm'}], 'status': 'source', 'sourceRevision': revision, 'publicContent': True, 'gaps': []}
    training['kind'] = 'training'
    training['section'] = 'reference'
    training['gaps'] = ['Training experience is source-backed; live-server deployment has not been checked.']
    topics.append(training)
    ACTION_HELP['enrich'](topics, ledger, definitions, resolved, texts, topic, uid, plain, source, url)
    ids = {t['id'] for t in topics}
    for t in topics:
        t['related'] = list(dict.fromkeys(i for i in t['related'] if i in ids and i != t['id']))
    acquisition.sort(key=lambda r: (0 if any(s in r['animalName'].lower() for s in ['cow', 'chicken', 'goat', 'swine']) else 1, r['animalName'], {'normal': 0, 'perfect': 1, 'botched': 2}[r['quality']]))
    data = {'revision': revision, 'reviewed': manifest['reviewed'], 'topics': topics, 'acquisition': acquisition, 'coverage': ledger, 'excludedFiles':excluded_files}
    (ROOT / 'sources/current-content.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'topics': len(topics), 'butcheryRoutes': len(acquisition), 'coverage': len(ledger), 'revision': revision}))


if __name__ == '__main__':
    main()
