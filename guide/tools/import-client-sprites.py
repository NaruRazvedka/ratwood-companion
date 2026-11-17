"""Extract reviewed DMI states from a locally cached server resource pack."""
import argparse
import hashlib
import io
import json
import re
import struct
from pathlib import Path

from PIL import Image
import runpy

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://rsc.ratwood.rip/roguetown-2026-02-20.rsc'
PNG = b'\x89PNG\r\n\x1a\n'


def embedded_pngs(data):
    for match in re.finditer(re.escape(PNG), data):
        start = match.start()
        name = re.search(rb'([A-Za-z0-9_ /\\.\-]+)\x00$', data[max(0, start-240):start])
        if not name:
            continue
        end = start + 8
        while end + 12 <= len(data):
            size = struct.unpack('>I', data[end:end+4])[0]
            kind = data[end+4:end+8]
            end += size + 12
            if end > len(data):
                break
            if kind == b'IEND':
                content = data[start:end]
                Image.open(io.BytesIO(content)).verify()
                yield name[1].decode().replace('\\', '/'), content
                break


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    args = parser.parse_args()
    data = args.pack.read_bytes()
    mappings = json.loads((ROOT/'sources/client-sprite-matches.json').read_text(encoding='utf-8'))
    wanted = {row['sheet'] for row in mappings}
    output = ROOT/'assets/sprites/client-pack'
    output.mkdir(exist_ok=True)
    load_sheet = runpy.run_path(str(ROOT/'tools/extract-sprites.py'))['load_sheet']
    sheets, index = {}, []
    for name, content in embedded_pngs(data):
        if name not in wanted:
            continue
        digest = hashlib.sha256(content).hexdigest()
        destination = output/(digest[:16]+'.dmi')
        destination.write_bytes(content)
        sheets[name] = load_sheet(destination)
        index.append({'path': name, 'file': str(destination.relative_to(ROOT)).replace('\\','/'), 'sha256': digest})
    sprites = []
    for row in mappings:
        image, width, height, states = sheets[row['sheet']]
        assert (width, height) == (32, 32), row
        offset = states[row['state']]
        x, y = offset % (image.width//width)*width, offset//(image.width//width)*height
        filename = hashlib.sha256((row['sheet']+'\0'+row['state']).encode()).hexdigest()[:16]+'.png'
        image.crop((x,y,x+width,y+height)).save(output/filename)
        sprites.append({'names': row['names'], 'path': 'assets/sprites/client-pack/'+filename,
                        'source': SOURCE, 'sheet': row['sheet'], 'state': row['state'],
                        'note': 'Server-distributed client pack, filename dated 2026-02-20; cached locally 2026-11-08 and inspected 2026-11-12. Reviewed state-name match; first frame/direction, without runtime tint or overlays. This establishes artwork presence, not recipe availability. Pack-specific redistribution permission is not established; personal offline reference only.'})
    (ROOT/'sources/client-sprites.json').write_text(json.dumps(sprites, indent=2)+'\n')
    (output/'index.json').write_text(json.dumps({'source': SOURCE, 'packSHA256': hashlib.sha256(data).hexdigest(), 'reviewed': '2026-11-12', 'sheets': index}, indent=2)+'\n')
    print(f'Extracted {len(sprites)} reviewed states from {len(sheets)} server-pack sheets.')


if __name__ == '__main__':
    main()
