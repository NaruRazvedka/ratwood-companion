import json
import runpy
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MODULE=runpy.run_path(str(ROOT/'tools/import-item-properties.py'))
USE=MODULE['USE']

class ItemUsePropertiesTests(unittest.TestCase):
    def test_multiline_lists_inheritance_and_proc_assignments(self):
        text='/obj/item/a\n\tname = "A"\n\tforce = 22\n\tarmor = list(\n\t\t"slash" = 3,\n\t\t"stab" = 2,\n\t)\n/obj/item/b\n\tparent_type = /obj/item/a\n\tforce = 0\n/obj/item/b/attack_self()\n\tforce = 999\n'
        raw={}
        for path,key,value in MODULE['blocks'](text,'fixture.dm'):
            raw.setdefault(path,{})
            if key:raw[path][key]=value
        rows=MODULE['resolve_fields'](raw)
        self.assertEqual(rows['/obj/item/b']['force']['expression'],'0')
        self.assertIn('"stab" = 2',rows['/obj/item/b']['armor']['expression'])
        self.assertEqual(MODULE['number']('(1 << 3) | (1 << 4)'),24)
        self.assertIsNone(MODULE['number']('__import__("os").system("bad")'))
        self.assertIsNone(MODULE['number']('1 << 100000000'))
        self.assertEqual(USE['expand']('A',{'A':'B','B':'A'}),'A')

    def test_actual_weapon_intents_armor_and_projectile_are_separate(self):
        rows={r['type']:r for r in json.loads((ROOT/'sources/ratwood2-item-properties.json').read_text(encoding='utf-8'))}
        groups=lambda path:{g['id']:g for g in rows[path]['useCases']}
        facts=lambda g:{f['label']:f['value'] for f in g['facts']}
        sword=groups('/obj/item/rogueweapon/sword')
        self.assertEqual(facts(sword['weapon'])['Base melee force'],'22')
        self.assertEqual(facts(sword['weapon'])['Wielded melee force override'],'25')
        self.assertNotIn('tool',sword)
        cut=sword['possible_item_intents']['attacks'][0]
        self.assertEqual(facts(cut)['Damage multiplier'],'1.2')
        self.assertEqual(facts(cut)['Penetration tier'],'0')
        self.assertEqual(facts(cut)['Base click cooldown (deciseconds)'],'10')
        armor=facts(groups('/obj/item/clothing/suit/roguetown/armor/plate')['armor'])
        self.assertEqual(armor['Covered body zones'],'Chest, Groin, Vitals')
        self.assertNotIn('arms',armor['Covered body zones'].lower())
        self.assertIn('slash: 3',armor['Armor ratings'])
        self.assertNotIn('%',armor['Armor ratings'])
        crossbow=groups('/obj/item/gun/ballistic/revolver/grenadelauncher/crossbow')
        self.assertEqual(facts(crossbow['linked-Loaded projectile'])['Base damage'],'70')
        self.assertEqual(facts(crossbow['linked-Loaded projectile'])['Penetration tier'],'3')

    def test_storage_grid_and_potions_keep_units_and_conditions(self):
        rows={r['type']:r for r in json.loads((ROOT/'sources/ratwood2-item-properties.json').read_text(encoding='utf-8'))}
        bag=next(g for g in rows['/obj/item/storage/backpack/rogue/backpack']['useCases'] if g['id']=='container')
        facts={f['label']:f['value'] for f in bag['facts']}
        self.assertEqual(facts['Storage grid rows'],'7');self.assertEqual(facts['Storage grid columns'],'5')
        self.assertEqual(facts['Must remove to access'],'Yes')
        self.assertIn('ceiling is not',bag['note'])
        potion=next(g for g in rows['/datum/reagent/medicine/healthpot']['useCases'] if g['id']=='reagent')
        self.assertTrue(any(f['property']=='metabolization_rate' for f in potion['facts']))
        self.assertIn('not establish',potion['note'])

    def test_new_fields_keep_pinned_claim_level_sources(self):
        revision=json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text())['revision']
        rows=json.loads((ROOT/'sources/ratwood2-item-properties.json').read_text(encoding='utf-8'))
        for row in rows:
            for group in row.get('useCases',[]):
                for fact in group['facts']+sum([a['facts'] for a in group.get('attacks',[])],[]):
                    self.assertIn('/blob/'+revision+'/',fact['source'])
                    self.assertRegex(fact['source'],r'#L[0-9]+$')

if __name__=='__main__':unittest.main()
