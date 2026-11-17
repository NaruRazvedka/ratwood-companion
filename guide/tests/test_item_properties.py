"""Regressions for inherited timers, null overrides and brewing price semantics."""
import json
import runpy
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODULE=runpy.run_path(str(ROOT/'tools/import-item-properties.py'))


class PropertiesTests(unittest.TestCase):
    def test_numeric_expressions_are_constant_only(self):
        number=MODULE['number']
        constants={'MINUTES':600,'SHELFLIFE_SHORT':9000}
        self.assertEqual(number('15 MINUTES',constants),9000)
        self.assertEqual(number('SHELFLIFE_SHORT / 2',constants),4500)
        self.assertEqual(number('null',constants),0)
        self.assertIsNone(number('__import__("os").getcwd()',constants))
        self.assertIsNone(number('1 / 0',constants))
        self.assertIsNone(number('world.time',constants))

    def test_inheritance_retains_explicit_null_override(self):
        raw={}
        text='/obj/food\n\tvar/rotprocess = 30 MINUTES\n\tvar/warming = 5 MINUTES\n/obj/food/child\n\trotprocess = null\n'
        for path,key,value in MODULE['blocks'](text,'fixture.dm'):
            raw.setdefault(path,{})
            if key:raw[path][key]=value
        resolved=MODULE['resolve_fields'](raw)
        self.assertEqual(resolved['/obj/food/child']['warming']['expression'],'5 MINUTES')
        shelf=MODULE['shelf_life'](resolved['/obj/food/child'],{'MINUTES':600})
        self.assertEqual(shelf['seconds'],0)
        self.assertIn('Does not rot',shelf['label'])
        parent=MODULE['shelf_life'](resolved['/obj/food'],{'MINUTES':600})
        self.assertEqual(parent['seconds'],1800)
        self.assertEqual(parent['unprotectedSeconds'],2100)
        self.assertIn('halve decay',parent['conditions'])

    def test_real_food_and_wine_values_have_distinct_meanings(self):
        rows={row['type']:row for row in json.loads((ROOT/'sources/ratwood2-item-properties.json').read_text(encoding='utf-8'))}
        wine=rows['/datum/brewing_recipe/jack_wine']['brewing']
        self.assertEqual(wine['recipeQuote'],50)
        self.assertEqual(wine['barrelValue'],65)
        self.assertEqual(wine['bottleValue'],8)
        self.assertEqual(wine['bottles'],6)
        self.assertEqual(wine['brewSeconds'],300)
        self.assertEqual([stage['seconds'] for stage in wine['ageTimes']],[600,1200])
        spidermead=rows['/datum/brewing_recipe/spidermead']['brewing']
        self.assertEqual(spidermead['recipeQuote'],75)
        self.assertEqual(spidermead['bottleValue'],12) # BYOND round(A) floors.
        aubergine=rows['/obj/item/reagent_containers/food/snacks/rogue/preserved/eggplantstuffedcheese']
        self.assertEqual(aubergine['quality']['label'],'Lavish')
        self.assertEqual(aubergine['shelfLife']['seconds'],2700)
        self.assertEqual(aubergine['shelfLife']['unprotectedSeconds'],3000)
        dough=rows['/obj/item/reagent_containers/food/snacks/rogue/butterdough']
        self.assertEqual(dough['shelfLife']['seconds'],0)
        self.assertEqual(dough['quality']['label'],'Fit for the desperate')
        self.assertIn('recipe-derived',dough['value']['label'])

    def test_cheese_decay_is_aging_not_a_false_spoilage_deadline(self):
        rows={row['type']:row for row in json.loads((ROOT/'sources/ratwood2-item-properties.json').read_text(encoding='utf-8'))}
        for suffix in ['cheddar','cheddarwedge']:
            shelf=rows['/obj/item/reagent_containers/food/snacks/rogue/'+suffix]['shelfLife']
            self.assertEqual(shelf['seconds'],2700)
            self.assertEqual(shelf['unprotectedSeconds'],3000)
            self.assertEqual(shelf['outcome']['type'],'/obj/item/reagent_containers/food/snacks/rogue/'+suffix+'/aged')
            self.assertEqual(shelf['outcome']['shelfLife']['seconds'],0)
            self.assertIn('then becomes',shelf['label'])
            self.assertIn('pauses this transformation',shelf['conditions'])
            self.assertIn('no further food rot timer',shelf['conditions'])
        aged=rows['/obj/item/reagent_containers/food/snacks/rogue/cheddar/aged']['shelfLife']
        self.assertEqual(aged['seconds'],0)
        self.assertNotIn('outcome',aged)


if __name__=='__main__':unittest.main()
