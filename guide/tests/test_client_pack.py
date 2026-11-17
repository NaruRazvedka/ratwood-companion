"""Small checks for the cache image boundary reader; no real cache required."""
import io
import runpy
import unittest
from pathlib import Path
from PIL import Image

read_images=runpy.run_path(str(Path(__file__).resolve().parents[1]/'tools/import-client-sprites.py'))['embedded_pngs']
recipe_blocks=runpy.run_path(str(Path(__file__).resolve().parents[1]/'tools/import-ratwood2-recipes.py'))['recipe_blocks']

class ClientPackTest(unittest.TestCase):
    def test_complete_png_and_filename(self):
        stream=io.BytesIO()
        Image.new('RGBA',(32,32)).save(stream,format='PNG')
        png=stream.getvalue()
        found=list(read_images(b'\x01icons/food.dmi\0'+png+b'ignored trailer'))
        self.assertEqual(found,[('icons/food.dmi',png)])

    def test_truncated_chunks_are_not_extracted(self):
        self.assertEqual(list(read_images(b'icons/a.dmi\0\x89PNG\r\n\x1a\n\xff\xff\xff\xffIDATgarbage')),[])

    def test_unlabelled_png_is_not_extracted(self):
        stream=io.BytesIO();Image.new('RGBA',(32,32)).save(stream,format='PNG')
        self.assertEqual(list(read_images(stream.getvalue())),[])

    def test_source_recipe_order_and_liquid_amounts(self):
        source='/datum/food_recipe/sample\n\tname = "Sample"\n\tbase_item = /obj/base\n\tingredients = list(\n\t\t/obj/first,\n\t\t/datum/reagent/water = 10\n\t)\n\tresult_type = /obj/result\n\tneeds_cooking = TRUE\n'
        row=list(recipe_blocks(source))[0]
        self.assertEqual([r['type'] for r in row['ingredients']],['/obj/first','/datum/reagent/water'])
        self.assertEqual(row['ingredients'][1]['amount'],'10')
        self.assertTrue(row['needsCooking'])

    def test_unknown_recipe_expressions_require_review(self):
        source='/datum/food_recipe/sample\n\tname = "Sample"\n\tbase_item = /obj/base\n\tingredients = list(/obj/item = SOME_MACRO)\n\tresult_type = /obj/result\n'
        with self.assertRaises(ValueError):list(recipe_blocks(source))

if __name__=='__main__':unittest.main()
