"""Check recorded native evidence provenance; these tests do not start BYOND."""
import hashlib
import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / 'tools/native-mechanics' if (ROOT/'tools/native-mechanics').exists() else ROOT/'lab/mechanics-tests'
PREPARE = runpy.run_path(str(LAB / 'prepare.py')) if (LAB/'prepare.py').exists() else None


class NativeMechanicsEvidenceTests(unittest.TestCase):
    @unittest.skipUnless(PREPARE, 'Private native harness is not distributed; public source hashes are checked below.')
    def test_extracted_blocks_match_pinned_source_and_recorded_hashes(self):
        blocks, records = PREPARE['extract']()
        manifest = json.loads((LAB / 'manifest.json').read_text())
        self.assertEqual(records, manifest['sourceBlocks'])
        self.assertGreaterEqual(len(blocks), 8)
        for row in manifest['harnessFiles']:
            self.assertEqual(hashlib.sha256((LAB / row['path']).read_bytes()).hexdigest(), row['sha256'], row['path'])

    @unittest.skipUnless((LAB/'results.json').exists(), 'Fresh local native output is optional; published assertion vectors are checked below.')
    def test_recorded_native_run_is_complete_and_matches_manifest(self):
        results = json.loads((LAB / 'results.json').read_text(encoding='utf-8-sig'))
        self.assertEqual(results['revision'], PREPARE['REVISION'])
        self.assertEqual(results['evidenceKind'], 'native-isolated-handler')
        self.assertEqual(results['byondVersion'], '516.1688')
        self.assertEqual(results['manifestSha256'], hashlib.sha256((LAB / 'manifest.json').read_bytes()).hexdigest())
        self.assertEqual(results['total'], len(results['checks']))
        self.assertEqual(results['passed'], results['total'])
        checks = {row['id']: row for row in results['checks']}
        self.assertEqual(len(checks), results['total'])
        for row in checks.values():
            self.assertTrue(row['passed'], row['id'])
            self.assertLessEqual(abs(row['actual'] - row['expected']), row['tolerance'], row['id'])
        for name, expected in {
            'furnace-bars-10-output-count': 1,
            'cauldron-180-fixed-output': 100,
            'cauldron-score-four-rejected': 0,
            'cauldron-missing-lastuser-no-output': 0,
            'cauldron-skill-below-yuck': 90,
            'armor-block-slash-pen3-tier3': 30,
            'armor-block-piercing-pen4-tier3': 80,
            'dough-roll-cancel-no-output': 0,
            'flatdough-cut-two-crackerdough': 2,
        }.items():
            self.assertEqual(checks[name]['expected'], expected)

    def test_distributable_evidence_matches_run_without_local_identity(self):
        public_file = ROOT / 'guide/sources/current-native-mechanics.json'
        public = json.loads(public_file.read_text())
        self.assertEqual(public['revision'],json.loads((ROOT/'guide/sources/ratwood-current/manifest.json').read_text())['revision'])
        self.assertEqual(public['passed'],public['total'])
        self.assertEqual(public['total'],len(public['checks']))
        self.assertTrue(all(row['passed'] for row in public['checks']))
        for block in public['sourceBlocks']:
            source=ROOT/'guide/sources/ratwood-current'/block['path']
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),block['sourceSha256'],block['path'])
        if (LAB/'results.json').exists():
            results=json.loads((LAB/'results.json').read_text(encoding='utf-8-sig'))
            for key in ['revision','evidenceKind','byondVersion','recordedAtUtc','manifestSha256','passed','total','checks']:
                self.assertEqual(public[key],results[key],key)
        self.assertEqual(public['execution']['bind'], '127.0.0.1')
        self.assertTrue(public['limitations'])
        self.assertNotIn('Logged in as', public_file.read_text())
        self.assertNotIn('C:/Users/', public_file.read_text())


if __name__ == '__main__':
    unittest.main()
