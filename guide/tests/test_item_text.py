import json
import runpy
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
helper=runpy.run_path(str(ROOT/'tools/extract-sprites.py'))
importer=runpy.run_path(str(ROOT/'tools/import-item-text.py'))


class ItemTextTest(unittest.TestCase):
    def definitions(self,text):
        def read(path,**kwargs):
            return json.dumps([{'path':'sample.dm','file':'sample.dm'}]) if path.name=='index.json' else text
        with patch.object(Path,'read_text',read):
            return {r['type']:r for r in helper['definitions'](Path('index.json'),Path('.'))}

    def test_multiline_description_and_escapes(self):
        rows=self.definitions('/obj/base\n\tdesc = "A \\\n\tlong description with \\"quotes\\"."\n'.replace('\\\\"','\\"'))
        self.assertEqual(rows['/obj/base']['desc'],'A long description with "quotes".')
        self.assertEqual(rows['/obj/base']['descLine'],2)

    def test_inherited_description_and_explicit_parent(self):
        rows=self.definitions('/obj/base\n\tdesc = "Base text"\n/obj/other\n\tparent_type = /obj/base\n/obj/other/child\n\tname = "Child"\n')
        self.assertEqual(rows['/obj/other/child']['desc'],'Base text')
        self.assertEqual(rows['/obj/other/child']['descSource'],'sample.dm')
        self.assertEqual(rows['/obj/other/child']['resolvedParent'],'/obj/other')

    def test_dynamic_and_null_descriptions_do_not_inherit_stale_text(self):
        rows=self.definitions('/obj/base\n\tdesc = "Base text"\n/obj/base/dynamic\n\tdesc = "[name] changes"\n/obj/base/empty\n\tdesc = null\n')
        self.assertIsNone(rows['/obj/base/dynamic']['desc'])
        self.assertEqual(rows['/obj/base/empty']['desc'],'')

    def test_block_comments_keep_source_line_numbers(self):
        rows=self.definitions('/* comment\nsecond line\n*/\n/obj/base\n    desc = "Text"\n')
        self.assertEqual(rows['/obj/base']['descLine'],5)
        rows=self.definitions('/obj/base\n\tdesc = "See https://example.com" // source comment\n')
        self.assertEqual(rows['/obj/base']['desc'],'See https://example.com')

    def test_mechanics_inherit_and_skip_context_dependent_messages(self):
        text='/obj/base/get_mechanics_examine(mob/user)\n\t. += span_info("Shared hint")\n/obj/base/child/get_mechanics_examine(mob/user)\n    . = ..()\n    . += span_notice("Specific hint")\n    if(wet)\n        . += span_info("Only when wet")\n    . += span_info("[amount] water")\n'
        methods=importer['mechanics_methods'](text,'sample.dm')
        hints,contextual=importer['inherited_mechanics']('/obj/base/child',{},methods)
        self.assertEqual([h['text'] for h in hints],['Shared hint','Specific hint'])
        self.assertEqual(hints[1]['owner'],'/obj/base/child')
        self.assertTrue(contextual)
        self.assertIn('#L5',hints[1]['source'])

    def test_mechanics_override_without_parent_call(self):
        methods=importer['mechanics_methods']('/obj/base/get_mechanics_examine(mob/user)\n\t. += "Base"\n/obj/base/child/get_mechanics_examine(mob/user)\n\t. += "Child"\n','sample.dm')
        hints,_=importer['inherited_mechanics']('/obj/base/child',{},methods)
        self.assertEqual([h['text'] for h in hints],['Child'])

    def test_source_html_becomes_plain_text_without_evaluating_it(self):
        self.assertEqual(importer['plain']('<b>Cut</b><br>then mix &amp; knead'),'Cut\nthen mix & knead')
        self.assertIsNone(helper['literal_text']('initial(desc) + "Text"'))
        self.assertEqual(helper['literal_text'](r'"\[literal]"'),'[literal]')
        self.assertIsNone(helper['literal_text'](r'"\\[dynamic]"'))


if __name__=='__main__':unittest.main()
