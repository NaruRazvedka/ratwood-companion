"""Match catalogue artwork against pinned Ratwood 2.0 object definitions."""
import argparse
import hashlib
import json
import runpy
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'sources/ratwood-2'
OUT=ROOT/'assets/sprites/ratwood-2'
helpers=runpy.run_path(str(ROOT/'tools/extract-sprites.py'))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true',help='Download only missing pinned icon sheets')
    args=parser.parse_args()
    info=json.loads((SOURCE/'index.json').read_text(encoding='utf-8'))
    revision=info['revision']
    items=helpers['definitions'](SOURCE/'definition-index.json',SOURCE)
    catalogue=[t for t in helpers['topics']() if t.get('section')=='items']
    normalize=helpers['display_key']
    by_name={}
    for item in sorted(items,key=lambda i:len(i['type'])):
        if item.get('name') and item.get('icon') and item.get('icon_state') is not None:
            by_name.setdefault(normalize(item['name']),item)
    by_type={i['type']:i for i in items}
    candidates={}
    # Keep verified names after catalogue merges so subsequent rebuilds do not lose identities.
    manifest_path=ROOT/'sources/ratwood2-sprites.json'
    if manifest_path.exists():
        for asset in json.loads(manifest_path.read_text(encoding='utf-8')):
            item=by_type.get(asset['type'])
            if item:
                for name in asset['names']:candidates[name]=item
    for topic in catalogue:
        item=by_type.get(topic.get('sourceObjectType')) or by_name.get(normalize(topic['title']))
        if item:candidates[topic['title']]=item
    for alias in json.loads((ROOT/'sources/ratwood2-sprite-aliases.json').read_text(encoding='utf-8')):
        item=by_type[alias['type']]
        candidates[alias['title']]=item
    for alias in json.loads((ROOT/'assets/sprites/source-code/catalogue-aliases.json').read_text(encoding='utf-8')):
        item=by_type.get(alias['type'])
        if item and item.get('icon') and item.get('icon_state') is not None:
            candidates[alias['title']]=item
    # Reviewed client-pack aliases can now be tied to an actual object definition.
    for alias in json.loads((ROOT/'sources/client-sprite-matches.json').read_text(encoding='utf-8')):
        matches=[i for i in items if i.get('icon')==alias['sheet'] and i.get('icon_state')==alias['state']]
        if matches:
            item=min(matches,key=lambda i:len(i['type']))
            for name in alias['names']:candidates.setdefault(name,item)
    decisions=ROOT/'sources/catalogue-decisions.json'
    if decisions.exists():
        for row in json.loads(decisions.read_text(encoding='utf-8'))['decisions']:
            if row['action']=='identify':
                item=by_type.get(row['type'])
                if not item:continue
                assert item.get('icon') and item.get('icon_state') is not None,row
                candidates[row['title']]=item
    (SOURCE/'parsed-items.json').write_text(json.dumps(items,indent=2)+'\n')
    (SOURCE/'sprite-candidates.json').write_text(json.dumps(candidates,indent=2)+'\n')
    OUT.mkdir(exist_ok=True)
    tree=json.loads((SOURCE/'icon-tree.json').read_text(encoding='utf-8'))
    # DM resource paths use inconsistent casing; retain Git's canonical spelling in provenance.
    canonical={p.casefold():p for p in tree}
    manifest=[]
    sheets={}
    missing=[]
    for title,item in candidates.items():
        if not item.get('icon') or item.get('icon_state') is None:continue
        icon,state=canonical.get(item['icon'].casefold(),item['icon']),item['icon_state']
        if icon not in tree or 'licensed-infraredbaron' in icon:continue
        digest=tree[icon]
        source_file=OUT/(digest+'.dmi')
        if not source_file.exists() and args.fetch:
            url=f'https://raw.githubusercontent.com/Rotwood-Vale/Ratwood-2.0/{revision}/{icon}'
            request=urllib.request.Request(url,headers={'User-Agent':'Ratwood-personal-field-guide'})
            with urllib.request.urlopen(request,timeout=30) as response:content=response.read(16*1024*1024)
            assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==digest,icon
            source_file.write_bytes(content)
        if not source_file.exists():continue
        if icon not in sheets:sheets[icon]=helpers['load_sheet'](source_file)
        image,width,height,states=sheets[icon]
        initial_state=state
        runtime_note=''
        if state not in states and item['type'].startswith('/obj/item/reagent_containers/food/snacks/fish') and state+'com' in states:
            # fish/Initialize appends rarity; show its common variant rather than a nonexistent base state.
            state+='com'
            runtime_note=' Common rarity state, following raw_fish.dm fish/Initialize (lines 41-46).'
        if state not in states or (width,height)!=(32,32):
            missing.append({'title':title,'type':item['type'],'sheet':icon,'state':state,'reason':'State absent from referenced sheet or unsupported dimensions'})
            continue
        offset=states[state];x=offset%(image.width//width)*width;y=offset//(image.width//width)*height
        crop=image.crop((x,y,x+width,y+height))
        if not crop.getchannel('A').getbbox():continue
        filename=hashlib.sha256((icon+'\0'+state).encode()).hexdigest()[:16]+'.png'
        crop.save(OUT/filename)
        manifest.append({'names':[title],'path':'assets/sprites/ratwood-2/'+filename,
            'source':f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{revision}/{icon}',
            'sheet':icon,'state':state,'type':item['type'],
            'initialState':initial_state,
            'definition':f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{revision}/{item["source"]}#L{item["line"]}',
            'note':f'Ratwood 2.0 source {revision}; {item["type"]}. Object definition and exact sheet/state matched.{runtime_note} First frame/direction, without runtime tint or overlays. Source presence does not establish live deployment. Assets CC-BY-SA-3.0 unless otherwise indicated; see sources/ratwood-2/README.md.'})
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    (ROOT/'sources/ratwood2-sprite-gaps.json').write_text(json.dumps(missing,indent=2)+'\n')
    print(json.dumps({'definitions':len(items),'candidates':len(candidates),'matched':len(manifest),'sheets':len(sheets)}))


if __name__=='__main__':main()
