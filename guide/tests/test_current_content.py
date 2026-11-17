import runpy
import unittest
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1]/'tools/import-current-content.py'))


class AlchemyCombinationTests(unittest.TestCase):
    def test_competing_tie_is_rejected_and_distinct_winning_pair_is_accepted(self):
        ingredients = [
            {'type':'euphrasia','potencies':{'wine':2,'speed':3}},
            {'type':'rosa','potencies':{'wine':2,'temperature':3}},
            {'type':'urtica','potencies':{'wine':1,'speed':2}},
            {'type':'sinew','potencies':{'wine':3,'endurance':2}},
        ]
        combinations = MODULE['combinations_for']('wine',ingredients)
        self.assertIn(['euphrasia','sinew'],combinations)
        self.assertNotIn(['euphrasia','rosa','urtica'],combinations)
        self.assertTrue(all(len(set(c))==len(c) for c in combinations))

    def test_incomplete_or_tied_ingredients_do_not_fabricate_a_recipe(self):
        self.assertEqual(MODULE['combinations_for']('wine',[{'type':'one','potencies':{'wine':3,'other':3}}]),[])


if __name__ == '__main__':
    unittest.main()
