import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT = runpy.run_path(str(ROOT / 'tools/import-current-content.py'))
MODULE = IMPORT['ACTION_HELP']
PARSE = IMPORT['HELP']['parse_definitions']
RESOLVE = IMPORT['HELP']['resolve_all']
A = MODULE['ACTION']


def extract(texts, initial=()):
    definitions = {}
    for file, text in texts.items():
        definitions.update(PARSE(text, file))
    resolved = RESOLVE(definitions)
    def source(path):
        row = definitions[path]
        return [{'title': 'Fixture source', 'url': 'https://source/' + row['source'] + '#L' + str(row['line'])}]
    def topic(path, title, category, kind):
        return {'id': IMPORT['uid'](path), 'sourceType': path, 'title': title, 'category': category, 'kind': kind, 'facts': [], 'sources': source(path), 'requirements': [], 'steps': [], 'related': [], 'gaps': []}
    topics = [topic(path, title, 'Roles', kind) for path, title, kind in initial]
    ledger = []
    MODULE['enrich'](topics, ledger, definitions, resolved, texts, topic, IMPORT['uid'], IMPORT['plain'], source, 'https://source/')
    return {t['sourceType']: t for t in topics}, ledger


class ActionSpellTests(unittest.TestCase):
    def test_inheritance_fixed_choice_variants_and_role_restrictions(self):
        text = f'''{A}
\tabstract_type = {A}
\tname = "Spell"
\tcast_range = 7
\tprimary_resource_type = SPELL_COST_STAMINA
{A}/fixed
\tname = "Fixed"
{A}/choice
\tname = "Choice"
{A}/variant
\tname = "Variant"
{A}/variant/inherited
{A}/unreachable
\tname = "Declaration only"
/datum/magic_aspect/test
\tname = "Test"
\taspect_type = ASPECT_MINOR
\tfixed_spells = list({A}/fixed)
\tchoice_spells = list({A}/choice)
\tvariants = list("mastery" = list({A}/fixed = {A}/variant, VARIANT_ADDITIVE = {A}/variant/inherited))
/datum/advclass/test
\tname = "Test role"
\tsubclass_mage_aspects = list("minor" = 1, "allowed_minors" = list(/datum/magic_aspect/test))
'''
        topics, ledger = extract({'fixture.dm': text}, [('/datum/advclass/test', 'Test role', 'role')])
        self.assertNotIn(A, topics)
        self.assertTrue(any(r.get('availability') == 'abstract' for r in ledger))
        for suffix in ('fixed', 'choice', 'variant', 'variant/inherited'):
            spell = topics[A + '/' + suffix]
            self.assertIn({'label': 'Cast range', 'value': '7'}, spell['facts'])
            self.assertIn('source-configured route', next(f['value'] for f in spell['facts'] if f['label'] == 'Availability evidence'))
            self.assertEqual(spell['id'], IMPORT['uid'](A + '/' + suffix))
        self.assertIn('declared-only', next(f['value'] for f in topics[A + '/unreachable']['facts'] if f['label'] == 'Availability evidence'))
        self.assertIn(IMPORT['uid']('/datum/magic_aspect/test'), topics['/datum/advclass/test']['related'])

    def test_conditional_setup_does_not_mix_allowed_lists_between_calls(self):
        value = 'list("allowed_minors" = list(/datum/magic_aspect/one), "post_aspect_spells" = list(' + A + '/two))'
        self.assertEqual(MODULE['paths'](MODULE['list_field'](value, 'allowed_minors')), ['/datum/magic_aspect/one'])

    def test_pinned_featherfall_and_augmentation(self):
        base = ROOT / 'sources/ratwood-current'
        files = ['code/modules/spells/spell_cooldown.dm', 'code/modules/spells/spell_types/wizard/augmentation/featherfall.dm', 'code/modules/spells/spell_types/wizard/minor_aspects.dm', 'code/__DEFINES/spell_defines.dm']
        topics, _ = extract({f: (base / f).read_text(encoding='utf-8-sig') for f in files})
        feather = topics[A + '/featherfall']
        facts = {f['label']: f['value'] for f in feather['facts']}
        self.assertEqual(facts['Base charge time'], '1 seconds')
        self.assertEqual(facts['Base cooldown'], '2 minutes')
        self.assertEqual(facts['Base primary cost'], '20 (SPELLCOST_UTILITY_BUFF)')
        self.assertEqual(facts['Primary resource'], 'SPELL_COST_STAMINA')
        self.assertIn('SPELL_REQUIRES_HUMAN', facts['Casting requirement flags'])
        self.assertIn('Lesser Augmentation', facts['Point-buy choice from aspect'])
        self.assertIn('adjacent', feather['summary'])
        self.assertTrue(any('/minor_aspects.dm#L' in s['url'] for s in feather['sources']))

    def test_reviewed_potion_conditions_and_mechanic_sources(self):
        base = ROOT / 'sources/ratwood-current'
        reagent_file = 'code/modules/roguetown/roguecrafting/alchemy/reagents.dm'
        reagent_text = (base / reagent_file).read_text(encoding='utf-8-sig')
        topics = [{'sourceObjectType': '/datum/reagent/medicine/' + name, 'facts': [], 'sources': [], 'gaps': []} for name in ('healthpot', 'stronghealth', 'manapot', 'stampot', 'antidote')]
        definitions = {'/datum/status_effect/buff/residual_focus': {}, '/obj/machinery/light/rogue/cauldron': {}}
        def topic(path, title, category, kind):
            return {'sourceType': path, 'title': title, 'category': category, 'kind': kind}
        MODULE['add_reviewed_mechanics'](topics, definitions, {reagent_file: reagent_text}, topic, IMPORT['uid'], 'https://source/')
        self.assertIn('volume > 0.99', topics[0]['facts'][0]['value'])
        self.assertIn('3×', topics[1]['facts'][0]['value'])
        self.assertIn('TRAIT_INFINITE_STAMINA', topics[2]['facts'][0]['value'])
        self.assertIn('fatigue', topics[3]['facts'][0]['value'])
        self.assertIn('harmful reagent', topics[4]['facts'][0]['value'])
        self.assertTrue(topics[4]['sources'][0]['url'].endswith('#L129'))
        residual = next(t for t in topics if t.get('id') == 'reference-residual-focus')
        self.assertIn('do not add', residual['facts'][0]['value'])
        portable = next(t for t in topics if t.get('id') == 'reference-portable-cauldron')
        self.assertIn('Three ingredient slots', portable['facts'][1]['value'])
        self.assertIn('not twenty seconds', portable['facts'][2]['value'])


if __name__ == '__main__':
    unittest.main()
