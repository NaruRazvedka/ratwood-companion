"""Read a Google Sheets XLSX export without changing its contents."""
import json
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as E

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'

def extract(path):
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(x.itertext()) for x in E.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        workbook = E.fromstring(archive.read('xl/workbook.xml'))
        sheets = []
        for index, info in enumerate(workbook.find('m:sheets', NS), 1):
            root = E.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml'))
            rows = []
            for row in root.findall('.//m:row', NS):
                cells = []
                for cell in row.findall('m:c', NS):
                    value = cell.find('m:v', NS)
                    text = ''
                    if value is not None:
                        text = strings[int(value.text)] if cell.get('t') == 's' else value.text
                    elif cell.get('t') == 'inlineStr':
                        text = ''.join(cell.find('m:is', NS).itertext())
                    if text and text.strip():
                        cells.append({'cell': cell.get('r'), 'text': text})
                if cells:
                    rows.append({'row': int(row.get('r')), 'cells': cells})
            relpath = f'xl/worksheets/_rels/sheet{index}.xml.rels'
            links = []
            if relpath in archive.namelist():
                for rel in E.fromstring(archive.read(relpath)).findall(REL):
                    if rel.get('Type', '').endswith('/hyperlink'):
                        links.append(rel.get('Target'))
            merges = [x.get('ref') for x in root.findall('m:mergeCells/m:mergeCell', NS)]
            sheets.append({'name': info.get('name'), 'rows': rows, 'links': links, 'mergedRanges': merges})
        return {'title': 'Lowtown Guidebook-Public', 'url': 'https://docs.google.com/spreadsheets/d/1qDhFSDbilSYfFVwSX0FUSQILjcQpcXProwQMTXlZemE/edit', 'imported': '2026-11-12', 'sheets': sheets}

if __name__ == '__main__':
    result = extract(sys.argv[1])
    if len(sys.argv) > 2:
        result['title'] = 'Heartbeast Guide'
        result['url'] = 'https://docs.google.com/spreadsheets/d/1d1V8LnsMO4K-6vSvoc1xVKBDk5vFaQTaFJQELn5yEhg/edit'
    target = pathlib.Path(__file__).resolve().parents[1] / 'sources' / (sys.argv[2] if len(sys.argv) > 2 else 'workbook.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print([(s['name'], len(s['rows'])) for s in result['sheets']])
