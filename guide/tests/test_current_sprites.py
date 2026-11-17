"""Exact type and DMI frame extraction regressions; no network required."""
import runpy
from pathlib import Path
import tempfile
import unittest

from PIL import Image, PngImagePlugin

TOOL = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'tools/refresh-current-sprites.py'))


class CurrentSprites(unittest.TestCase):
    def test_matching_uses_type_not_a_shared_display_name(self):
        topics = [{'id': 'raw', 'title': 'Meat', 'section': 'items', 'sourceObjectType': '/obj/raw'},
                  {'id': 'cooked', 'title': 'Meat', 'section': 'items', 'sourceObjectType': '/obj/cooked'},
                  {'id': 'unknown', 'title': 'Meat', 'section': 'items', 'sourceObjectType': '/obj/absent'}]
        definitions = [{'type': '/obj/raw', 'icon': 'raw.dmi', 'icon_state': 'raw'},
                       {'type': '/obj/cooked', 'icon': 'cooked.dmi', 'icon_state': 'cooked'}]
        candidates, gaps = TOOL['typed_candidates'](topics, definitions)
        self.assertEqual([i['icon_state'] for _, i in candidates], ['raw', 'cooked'])
        self.assertEqual(gaps[0]['id'], 'unknown')

    def test_both_proprietary_asset_folders_are_excluded(self):
        for folder in TOOL['RESTRICTED']:
            candidates, gaps = TOOL['typed_candidates']([{'id': 'x', 'section': 'items', 'sourceObjectType': '/obj/x'}],
                [{'type': '/obj/x', 'icon': folder + '/test.dmi', 'icon_state': 'x'}])
            self.assertFalse(candidates)
            self.assertIn('license', gaps[0]['reason'])

    def test_first_frame_respects_prior_directions_and_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'sheet.dmi'
            image = Image.new('RGBA', (288, 32), 'red')
            image.paste(Image.new('RGBA', (32, 32), 'green'), (256, 0))
            metadata = PngImagePlugin.PngInfo()
            metadata.add_text('Description', '# BEGIN DMI\nversion = 4.0\nwidth = 32\nheight = 32\nstate = "prior"\ndirs = 4\nframes = 2\nstate = "target"\ndirs = 1\nframes = 1\n# END DMI')
            image.save(path, format='PNG', pnginfo=metadata)
            frame, state = TOOL['first_frame'](path, 'target')
            self.assertEqual(state, 'target')
            self.assertEqual(frame.size, (32, 32))
            self.assertEqual(frame.getpixel((0, 0)), (0, 128, 0, 255))
            with self.assertRaisesRegex(ValueError, 'absent'):
                TOOL['first_frame'](path, 'invented')


if __name__ == '__main__':
    unittest.main()
