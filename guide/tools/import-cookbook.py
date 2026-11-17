"""Retain cookbook row identities and reconciliation, without redistributing its prose."""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('xlsx', type=Path)
    args = parser.parse_args()
    book = runpy.run_path(str(ROOT/'tools/import-workbook.py'))['extract'](args.xlsx)
    entries = []
    for sheet in book['sheets']:
        for row in sheet['rows']:
            cells = {re.sub(r'\d', '', c['cell']): c['text'].strip() for c in row['cells']}
            if not cells.get('A') or not cells.get('C') or cells['A'].lower() in ['item', 'dish', 'name']:
                continue
            title = re.sub(r'\s*\(x\d+\)\s*', '', cells['A'], flags=re.I).strip()
            entries.append({'id': 'cookbook-'+hashlib.sha256((sheet['name']+str(row['row'])).encode()).hexdigest()[:12],
                            'title': title, 'sheet': sheet['name'], 'row': row['row'], 'cells': [c['cell'] for c in row['cells']],
                            'recordHash': hashlib.sha256(json.dumps(cells, sort_keys=True).encode()).hexdigest()})
    result = {'title': 'Community recipe workbook', 'url': 'https://docs.google.com/spreadsheets/d/1yOoJX5YUkUvg6TAqq3EVadf26AHdJYO8PbJ4sd-bJ84/edit',
              'note': 'Only item names, row references and record hashes are redistributed. Preparation claims require source reconciliation.', 'entries': entries}
    (ROOT/'sources/cookbook-ledger.json').write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print(json.dumps({'entries': len(entries), 'tabs': len(book['sheets'])}))


if __name__ == '__main__':
    main()
