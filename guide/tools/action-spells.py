"""Source-only spell grants and reviewed mechanics for the pinned content importer."""
import re

ACTION = '/datum/action/cooldown/spell'
LEGACY = '/obj/effect/proc_holder/spell'
ASPECT = '/datum/magic_aspect/'
PATH = r'/[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+)*'


def paths(value):
    return list(dict.fromkeys(re.findall(PATH, value or '')))


def list_field(value, key):
    """Extract one balanced nested list without flattening sibling configuration."""
    match = re.search(r'"' + key + r'"\s*=\s*list\(', value or '')
    if not match:
        return ''
    return balanced_body(value, match.end())


def balanced_body(value, start):
    depth = 1
    for index in range(start, len(value)):
        depth += (value[index] == '(') - (value[index] == ')')
        if depth == 0:
            return value[start:index]
    return ''


def enrich(topics, ledger, definitions, resolved, texts, topic, uid, plain, source, url):
    """Mutate the importer's ordinary topics; no separate runtime/data dependency."""
    by_path = {t.get('sourceType'): t for t in topics}
    constants = dict(re.findall(r'^#define\s+(\w+)\s+([^/\n]+)', '\n'.join(texts.values()), re.M))

    def shown(value):
        value = str(value)
        if value in constants and re.fullmatch(r'\d+(?:\.\d+)?', constants[value].strip()):
            return constants[value].strip() + ' (' + value + ')'
        return re.sub(r'\b(SECONDS|MINUTES|HOURS)\b', lambda m: m[1].lower(), value)

    def fact(t, label, value):
        t['facts'].append({'label': label, 'value': str(value)})

    referenced = set()
    for row in resolved.values():
        for field in ('fixed_spells', 'choice_spells', 'mastery_choice_spells', 'pointbuy_spells', 'variants', 'spells', 'subclass_mage_aspects'):
            referenced.update(paths(row.get(field)))
    # Named declarations are profiles, not a count of playable abilities.
    for path, definition in definitions.items():
        if not (path == ACTION or path.startswith(ACTION + '/')):
            continue
        own = definition['own']; row = resolved[path]
        title = plain(own.get('name')) or (plain(row.get('name')) if path in referenced else '')
        if own.get('abstract_type') == path or not title:
            ledger.append({'type': path, 'family': 'spell', 'state': 'excluded', 'reason': 'Abstract definition or no own literal display name.', 'availability': 'abstract' if own.get('abstract_type') == path else 'unnamed'})
            continue
        t = topic(path, title, 'Spells & abilities', 'spell')
        t['summary'] = plain(row.get('desc')) or 'A named action-family ability in the pinned source.'
        for field, label in [('primary_resource_type', 'Primary resource'), ('primary_resource_cost', 'Base primary cost'), ('secondary_resource_type', 'Secondary resource'), ('secondary_resource_cost', 'Base secondary cost'), ('charge_time', 'Base charge time'), ('cooldown_time', 'Base cooldown'), ('cast_range', 'Cast range'), ('point_cost', 'Learning point cost'), ('invocation_type', 'Invocation'), ('hold_drain', 'Charged hold drain'), ('spell_requirements', 'Casting requirement flags')]:
            if row.get(field) not in (None, 'null'):
                fact(t, label, shown(row[field]))
        if row.get('spell_requirements'):
            t['requirements'].append('Source casting checks: ' + row['spell_requirements'])
        if row.get('required_items') not in (None, 'null', 'list()'):
            t['requirements'].append('Required worn items: ' + row['required_items'])
        fact(t, 'Timing and costs', 'Listed values are base source fields. Character scaling, interruption, target validation and state can change the cast; cast range is not an area-of-effect radius.')
        if row.get('click_to_activate') == 'TRUE':
            t['steps'] = ['Select the spell action.']
            if row.get('charge_required') == 'TRUE':
                if row.get('charge_then_click') == 'TRUE':
                    t['steps'].append('Hold the middle mouse button until charged, release it, then middle-click a valid target when the spell is ready.')
                else:
                    t['steps'].append('Hold the middle mouse button until charged, then release it on a valid target to attempt the cast.')
            else:
                t['steps'].append('Middle-click a valid target to attempt the cast.')
        elif row.get('click_to_activate') == 'FALSE':
            t['steps'] = ['Activate the spell action; the base non-click flow uses the caster as its target and performs any required charge before casting.']
        if ACTION in definitions:
            t['sources'].extend(source(ACTION))
        if path == ACTION + '/featherfall':
            t['steps'].append('The cast applies the Featherfall status to living creatures within range 1 of the caster, including the caster.')
        t['gaps'] = ['Pinned source definition; casting interactions and live-server availability have not been tested.']
        topics.append(t); by_path[path] = t
        ledger.append({'type': path, 'family': 'spell', 'state': 'mapped', 'topicId': t['id']})

    aspects = {}
    grants = {}
    for path, definition in definitions.items():
        if not path.startswith(ASPECT) or not plain(definition['own'].get('name')):
            continue
        row = resolved[path]
        t = topic(path, plain(row['name']) + ' (aspect)', 'Spells & abilities', 'guide')
        description = plain(row.get('desc'))
        t['summary'] = description if description and description != 'TODO' else 'An aspect with the following source-defined spell selections.'
        for field, label in [('fixed_spells', 'Granted while bound'), ('choice_spells', 'Choice spell'), ('mastery_choice_spells', 'Mastery-only choice'), ('pointbuy_spells', 'Point-buy choice')]:
            for spell in paths(row.get(field)):
                if spell not in by_path:
                    continue
                st = by_path[spell]
                fact(t, label, st['title']); fact(st, label + ' from aspect', t['title'])
                t['related'].append(st['id']); st['related'].append(t['id'])
                st['sources'].extend(source(path))
                grants.setdefault(spell, []).append(path)
        # Each named variant contains replacement or additive paths; retain its condition.
        variants = row.get('variants', '')
        for variant in re.findall(r'"([\w -]+)"\s*=\s*list\(', variants):
            for spell in paths(list_field(variants, variant)):
                if spell not in by_path:
                    continue
                st = by_path[spell]
                fact(st, 'Aspect variant reference', t['title'] + ': ' + variant + ' (swap or additive; see source)')
                st['sources'].extend(source(path)); st['related'].append(t['id']); t['related'].append(st['id'])
                grants.setdefault(spell, []).append(path)
        if row.get('pointbuy_budget'):
            fact(t, 'Point-buy budget', row['pointbuy_budget'])
        fact(t, 'Selection', 'Role configuration controls aspect slots, allowed and locked aspects, mastery and variant overrides. Being listed here does not make every selection available to every character.')
        topics.append(t); aspects[path] = t; by_path[path] = t

    reachable_aspects = set()
    role_methods = {}
    for filename, text in texts.items():
        for method in re.finditer(r'^(' + PATH + r')\([^\n]*\)\s*\n([^\n]*(?:\n(?!/)[^\n]*)*)', text, re.M):
            owner = method[1].rsplit('/', 1)[0]
            role_methods.setdefault(owner, []).append((method[2], [{'title': 'Role grant handler', 'url': url + filename + '#L' + str(text[:method.start()].count('\n') + 1)}]))
    for t in list(topics):
        if t['kind'] != 'role':
            continue
        path = t['sourceType']; row = resolved.get(path, {})
        config = row.get('subclass_mage_aspects', '')
        configs = [(config, source(path))] if config and config != 'null' else []
        # Method bodies are bounded by the next top-level definition, never the whole file.
        for body, sources in role_methods.get(path, []):
            for call in re.finditer(r'setup_mage_aspects\(list\(', body):
                configs.append(('conditional setup_mage_aspects ' + balanced_body(body, call.end()), sources))
        for spell in paths(row.get('spells', '')):
            if spell in by_path and by_path[spell]['kind'] == 'spell':
                st = by_path[spell]; fact(st, 'Role spell list', t['title'])
                st['related'].append(t['id']); t['related'].append(st['id']); st['sources'].extend(source(path))
                grants.setdefault(spell, []).append(path)
        for config, sources in configs:
            fact(t, 'Aspect configuration', ' / '.join(k + ': ' + v for k, v in re.findall(r'"(mastery|major|minor|utilities|ward)"\s*=\s*(\w+)', config)) + (' (conditional role setup; see source)' if 'setup_mage_aspects' in config else ''))
            t['sources'].extend(sources)
            locked = paths(list_field(config, 'locked_aspects'))
            for ap, at in aspects.items():
                kind = 'major' if resolved[ap].get('aspect_type') == 'ASPECT_MAJOR' else 'minor' if resolved[ap].get('aspect_type') == 'ASPECT_MINOR' else None
                allowed = paths(list_field(config, 'allowed_' + (kind + 's' if kind else '')))
                slots = re.search(r'"' + (kind or 'no-kind') + r'"\s*=\s*(\d+)', config)
                if ap not in locked and not (slots and int(slots[1]) > 0 and (not allowed or ap in allowed)):
                    continue
                reachable_aspects.add(ap)
                t['related'].append(at['id']); at['related'].append(t['id'])
                fact(at, 'Role configuration permits', t['title'] + (' (locked aspect)' if ap in locked else ' (selection subject to slots and class restrictions)'))
            for spell in paths(list_field(config, 'post_aspect_spells')):
                if spell in by_path:
                    st = by_path[spell]; fact(st, 'Role configuration grants', t['title'] + ' after aspect binding (see conditions)')
                    st['sources'].extend(sources); st['related'].append(t['id']); t['related'].append(st['id'])
                    grants.setdefault(spell, []).append(path)

    for t in topics:
        if t['kind'] != 'spell':
            continue
        path = t['sourceType']
        reachable = any(p in reachable_aspects or p.startswith(('/datum/advclass/', '/datum/job/')) for p in grants.get(path, []))
        availability = 'source-configured route' if reachable else 'aspect-listed; role route unconfirmed' if grants.get(path) else 'declared-only in this index'
        fact(t, 'Availability evidence', availability + '. This is static source evidence, not proof of a selectable or live-server spell.')
        for entry in ledger:
            if entry.get('type') == path:
                entry['availability'] = availability

    add_reviewed_mechanics(topics, definitions, texts, topic, uid, url)


def add_reviewed_mechanics(topics, definitions, texts, topic, uid, url):
    reagent_file = 'code/modules/roguetown/roguecrafting/alchemy/reagents.dm'
    effects = {
        'healthpot': (17, 'Each on_mob_life call: restore up to 15 blood, capped at normal; heal_wounds(3) if wounds exist. With volume > 0.99: brute/burn/clone −1.75×REM, oxygen −1.25, brain −5×REM and eyes −1×REM. Does not call toxin healing. At volume >= 60 the handler removes 2 units of ordinary health potion.'),
        'stronghealth': (42, 'Each on_mob_life call: restore up to 20 blood, capped at normal; heal_wounds(6) if wounded. With volume > 0.99: brute/burn/clone −7×REM, oxygen −5, brain −5×REM and eyes −2.5×REM. Metabolism is 3× ordinary health potion. At volume >= 60 it removes ordinary health potion, as written in source.'),
        'manapot': (72, 'Each on_mob_life call adds 30 energy unless the recipient has TRAIT_INFINITE_STAMINA. This restores energy, rather than reducing fatigue.'),
        'strongmana': (85, 'Each on_mob_life call adds 120 energy unless the recipient has TRAIT_INFINITE_STAMINA. Metabolism is 3× ordinary mana potion.'),
        'stampot': (101, 'With volume > 0.99 each on_mob_life call uses stamina_add(-20), reducing fatigue. This is distinct from energy restoration.'),
        'strongstam': (113, 'With volume > 0.99 each on_mob_life call uses stamina_add(-50), reducing fatigue. It has the same listed metabolism as ordinary stamina potion.'),
        'antidote': (134, 'With volume > 0.99 each on_mob_life call heals 4 toxin damage. Separately, each harmful reagent is removed by 1 source unit per call. Metabolism: 0.1× REAGENTS_METABOLISM.'),
        'strong_antidote': (155, 'With volume > 0.99 each on_mob_life call heals 12 toxin damage. Separately, the handler requests removal of 3 source units for each harmful reagent (passes the reagent datum). Metabolism: 0.1× REAGENTS_METABOLISM.'),
    }
    for t in topics:
        path = t.get('sourceObjectType', '')
        if not path.startswith('/datum/reagent/medicine/') or path.rsplit('/', 1)[-1] not in effects:
            continue
        line, effect = effects[path.rsplit('/', 1)[-1]]
        handler = path + '/on_mob_life('
        reagent_text = texts.get(reagent_file, '')
        if handler in reagent_text:
            line = reagent_text[:reagent_text.index(handler)].count('\n') + 1
        t['facts'].append({'label': 'Treatment per metabolism call', 'value': effect})
        t['sources'].append({'title': 'Potion on_mob_life handler', 'url': url + reagent_file + '#L' + str(line)})
        t['gaps'].append('Source handler values, not guaranteed recovery per swallowed unit or per second. Wound distribution, body state, metabolism scheduling and caps affect results; no safe dose is inferred from overdose_threshold.')

    mechanics = [
        ('reference-residual-focus', 'Spell implements and Residual Focus', '/datum/status_effect/buff/residual_focus', 'Holding an implement during an action-family cast can recover energy over 20 seconds.', [
            ('Refund pool', 'The casting handler sums actual stamina and energy spent; devotion and blood are excluded. The held implement with the highest implement_refund wins; two implements do not add together.'),
            ('Recovery', 'The pool is spent gradually through energy_add over 20 seconds. Further casts add to the pool and refresh duration. This does not lower the initial cost or immediately refund stamina.'),
            ('Limits', 'Energy caps and actual status scheduling affect received energy; the source pool is not a guarantee of an exact recovered total in play.')], [('code/modules/spells/spell_cooldown.dm',1548), ('code/datums/status_effects/rogue/residual_focus.dm',1), ('code/game/objects/items/spell_implements/_spell_implement.dm',1)]),
        ('reference-portable-cauldron', 'Normal and portable alchemy cauldrons', '/obj/machinery/light/rogue/cauldron', 'A folding cauldron has different capacity and water requirements.', [
            ('Normal cauldron', 'Four distinct ingredient slots; at least 90 source units (30 ounces) of water.'),
            ('Folding cauldron', 'Three ingredient slots; at least 60 source units (20 ounces) of water. A four-ingredient normal-cauldron combination does not fit.'),
            ('Processing', 'While lit, supplied with ingredients and enough water, the counter increments on process calls; resolution occurs on a later call. Twenty increments are not twenty seconds. Inserting an ingredient resets progress and records the last contributor, whose skill is checked.'),
            ('Yield', 'Recipes specify a fixed output batch. Adding extra water does not scale that yield.')], [('code/modules/roguetown/roguecrafting/alchemy/cauldron.dm',56), ('code/modules/roguetown/roguecrafting/alchemy/cauldron.dm',135), ('code/modules/roguetown/roguecrafting/alchemy/cauldron.dm',194)]),
    ]
    for identifier, title, path, summary, facts, sources in mechanics:
        if path not in definitions:
            continue
        t = topic(path, title, 'Alchemy' if 'cauldron' in identifier else 'Spells & abilities', 'guide')
        t['id'] = identifier; t['summary'] = summary
        # A mechanic explanation is distinct from the item/effect used as its evidence.
        t.pop('sourceType',None)
        t['facts'] = [{'label': label, 'value': value} for label, value in facts]
        t['sources'] = [{'title': 'Pinned mechanic source', 'url': url + file + '#L' + str(line)} for file, line in sources]
        t['gaps'] = ['Pinned source inspection; native runtime and live-server interactions have not been verified.']
        t['related'] = [uid(path)] if 'residual' in identifier else []
        topics.append(t)
