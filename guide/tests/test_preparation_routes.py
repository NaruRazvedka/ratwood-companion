"""Regression checks for source inheritance and intermediate preparation paths."""
import json
import runpy
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODULE=runpy.run_path(str(ROOT/'tools/import-preparation-routes.py'))


class PreparationRoutes(unittest.TestCase):
    def test_literal_recipe_inheritance_and_comment_boundaries(self):
        definitions=MODULE['parse_definitions']('''
/datum/crafting_recipe/test
\tvar/tools[] = list(/obj/item/needle)
\treqs = list(
\t\t/obj/item/cloth = 2,
\t)
/* /datum/crafting_recipe/test/disabled
\tresult = /obj/item/fake
*/
/datum/crafting_recipe/test/child
\tname = "Plain // cloth"
\tresult = /obj/item/bandage
\tcraftdiff = 0 // comment
''','fixture.dm')
        resolved=MODULE['resolve_all'](definitions)
        child=resolved['/datum/crafting_recipe/test/child']
        self.assertEqual(MODULE['list_values'](child['tools']),[{'type':'/obj/item/needle','amount':1}])
        self.assertEqual(MODULE['list_values'](child['reqs']),[{'type':'/obj/item/cloth','amount':2}])
        self.assertEqual(child['name'],'"Plain // cloth"')
        self.assertEqual(child['craftdiff'],'0')
        self.assertNotIn('/datum/crafting_recipe/test/disabled',resolved)

    def test_flatten_then_score_is_not_ordinary_dough_slicing(self):
        rows=json.loads((ROOT/'sources/ratwood2-preparation-routes.json').read_text())
        prefix='/obj/item/reagent_containers/food/snacks/rogue/'
        flatten=next(r for r in rows if r['inputType']==prefix+'dough' and r['outputType']==prefix+'flatdough')
        score=next(r for r in rows if r['inputType']==prefix+'flatdough' and r['outputType']==prefix+'foodbase/hardtack_raw')
        self.assertEqual(flatten['evidence'],'source')
        self.assertTrue(any(i['type']=='/obj/item/kitchen/rollingpin' for i in flatten['toolTypes']))
        self.assertEqual(score['outputQuantity'],2)
        self.assertIn('Sharp tool',score['requirements'])
        self.assertEqual(score['evidence'],'source')
        self.assertIn('Slab of dough',score['outputAliases'])
        self.assertFalse(any(r['inputType']==prefix+'dough' and r['outputType']==prefix+'foodbase/hardtack_raw' for r in rows))

    def test_dynamic_alchemy_and_poison_branches_do_not_claim_verified_steps(self):
        rows=json.loads((ROOT/'sources/ratwood2-preparation-routes.json').read_text())
        cauldron=[r for r in rows if r['method']=='Alchemy cauldron']
        self.assertGreater(len(cauldron),10)
        for row in cauldron:
            self.assertEqual(row['evidence'],'needs-review')
            self.assertEqual(row['steps'],[])
            self.assertEqual(row['ingredients'][0]['amount'],90)
            self.assertTrue(row['gaps'])
        for row in rows:
            if row['method']=='Direct food preparation' and 'poison' in row['outputType']:
                self.assertEqual(row['evidence'],'needs-review')
                self.assertEqual(row['steps'],[])

    def test_stateful_pies_have_complete_filling_and_roof_rules(self):
        rows=json.loads((ROOT/'sources/ratwood2-preparation-routes.json').read_text())
        prefix='/obj/item/reagent_containers/food/snacks/rogue/'
        for suffix in ['mushroom','fish','meat','crab','berry','apple','potato','cabbage']:
            route=next(r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'foodbase/handpieraw/'+suffix)
            self.assertEqual(route['evidence'],'source')
            self.assertEqual(route['inputType'],prefix+'piedough')
            self.assertEqual(route['outputQuantity'],1)
            self.assertEqual(len(route['ingredients']),2)
            if suffix=='cabbage':
                self.assertEqual(route['ingredients'][1]['type'],'/obj/item/reagent_containers/food/snacks/grown/cabbage/rogue')
        pumpkin=[r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'pie/cooked/pumpkin']
        self.assertEqual(len(pumpkin),2)
        for route in pumpkin:
            self.assertFalse(any(i['type']==prefix+'piedough' for i in route['ingredients']))
            self.assertEqual([i['type'] for i in route['ingredients']][-3:],[prefix+'cheese','/obj/item/reagent_containers/food/snacks/egg','/obj/item/reagent_containers/food/snacks/sugar'])
        fish=next(r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'pie/cooked/meat/fish')
        self.assertTrue(any(i['type']==prefix+'meat/mince/fish' and i['amount']==3 for i in fish['ingredients']))
        self.assertTrue(any(i['type']==prefix+'piedough' and i['amount']==1 for i in fish['ingredients']))
        poison=next(r for r in rows if r['outputType']==prefix+'foodbase/handpieraw/poison')
        self.assertEqual(poison['evidence'],'needs-review')
        self.assertEqual(poison['steps'],[])
        pumpkin_balls=[r for r in rows if r['method']=='Direct food preparation' and r['outputType']==prefix+'foodbase/pumpkinball_raw' and r['evidence']=='source']
        self.assertEqual(len(pumpkin_balls),3)
        self.assertEqual({r['ingredients'][1]['type'] for r in pumpkin_balls},{prefix+'fruit/pumpkin_sliced',prefix+'preserved/pumpkin_mashed','/obj/item/reagent_containers/food/snacks/pumpkinspice'})
        prezzel=next(r for r in rows if r['outputType']==prefix+'foodbase/prezzel_raw')
        self.assertIn('Dwarf or Dwarven Chef trait',prezzel['requirements'])

    def test_coverage_and_recipe_routes_keep_provenance(self):
        rows=json.loads((ROOT/'sources/ratwood2-preparation-routes.json').read_text())
        coverage=json.loads((ROOT/'sources/ratwood2-preparation-coverage.json').read_text())
        ids={r['id'] for r in rows}
        self.assertEqual(len(ids),len(rows))
        self.assertGreater(len(rows),2000)
        for row in rows:
            self.assertIn('/'+coverage['revision']+'/',row['source'])
            self.assertTrue(row['sources'])
            self.assertTrue(row['steps'] if row['evidence']=='source' else row['gaps'])
        for row in coverage['entries']:
            self.assertTrue(all(id in ids for id in row['routeIds']))
            self.assertTrue(row['routeIds'] or row.get('reason'))
        grain=next(r for r in rows if r['method']=='Milling' and r['outputType']=='/obj/item/reagent_containers/powder/flour')
        self.assertEqual(grain['outputName'].lower(),'flour')

    def test_remaining_stateful_foods_keep_order_units_and_yields(self):
        rows=json.loads((ROOT/'sources/ratwood2-preparation-routes.json').read_text())
        prefix='/obj/item/reagent_containers/food/snacks/rogue/'
        wheel=next(r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'cheddar')
        self.assertTrue(any(i['type']==prefix+'cheese' and i['amount']==4 for i in wheel['ingredients']))
        self.assertIn('five minutes',' '.join(wheel['steps']))
        rice=next(r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'ricewet')
        self.assertEqual(rice['ingredients'][1]['amount'],10)
        for suffix in ['meat/nitzel','meat/nitzel/schnitzel','meat/nitzel/wiener','meat/chickentender']:
            route=next(r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+suffix)
            self.assertIn('egg first',route['steps'][1])
            self.assertEqual(route['ingredients'][-1]['amount'],5)
            self.assertIn('no water',' '.join(route['steps']))
        egg=next(r for r in rows if r['outputType']==prefix+'friedegg/fried' and r['method']=='Reviewed preparation')
        self.assertEqual(egg['inputType'],'/obj/item/reagent_containers/food/snacks/egg')
        pumpkins=[r for r in rows if r['method']=='Reviewed preparation' and r['outputType']==prefix+'fruit/pumpkin_sliced']
        self.assertEqual(len(pumpkins),2)
        self.assertTrue(all(r['outputQuantity']==6 for r in pumpkins))


if __name__=='__main__':unittest.main()
