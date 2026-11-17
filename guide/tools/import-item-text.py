"""Import static descriptions and examine-mechanics text, never execute DM."""
import json
import re
import runpy
import sys
from html import unescape
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
helpers=runpy.run_path(str(ROOT/'tools/extract-sprites.py'))
REV='80907df21ed15bde91106da41ce82e6ac6c40069'
URL=f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'


def plain(text):
    text=re.sub(r'<br\s*/?>','\n',text,flags=re.I)
    return unescape(re.sub(r'</?[A-Za-z][^>]*>','',text)).strip()


def mechanics_methods(text,path):
    """Keep unconditional static messages; flag context-dependent additions."""
    text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m[0].count('\n'),text,flags=re.S)
    methods={}
    current=None
    for number,line in helpers['logical_lines'](text):
        if line.startswith('/'):
            match=re.match(r'(/obj(?:/\w+)*)/get_mechanics_examine\([^\n]*\)',line)
            current=methods.setdefault(match[1],{'parent':False,'entries':[],'contextual':False}) if match else None
        elif current is not None:
            if re.match(r'^(?:\t| {4})\. = \.\.\(\)',line):current['parent']=True
            if re.match(r'^\s+\. \+=',line):
                value=re.sub(r'^\s+\. \+=\s*','',line).strip()
                wrapper=re.fullmatch(r'span_\w+\(("(?:\\.|[^"\\])*")\)\s*(?://.*)?',value)
                value=wrapper[1] if wrapper else value
                message=helpers['literal_text'](value)
                indent=len(re.match(r'^\s*',line)[0].expandtabs(4))
                if indent!=4 or message is None:
                    current['contextual']=True
                else:
                    current['entries'].append({'text':plain(message),'source':URL+path+f'#L{number}'})
    return methods


def inherited_mechanics(path,objects,methods,trail=()):
    if not path or path in trail:return [],False
    parent=objects.get(path,{}).get('resolvedParent',path.rsplit('/',1)[0])
    method=methods.get(path)
    entries,contextual=inherited_mechanics(parent,objects,methods,trail+(path,)) if not method or method['parent'] else ([],False)
    if method:
        entries=entries+[{**entry,'owner':path} for entry in method['entries']]
        contextual=contextual or method['contextual']
    return entries,contextual


def main():
    global REV, URL
    current='--current' in sys.argv
    manifest=json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text()) if current else None
    if current:
        REV=manifest['revision'];URL=f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'
    # Include the targeted system/production evidence already pinned to this revision.
    files={}
    for folder in (['ratwood-current'] if current else ['ratwood-2','ratwood-2-production','ratwood-2-system','ratwood-2-text']):
        base=ROOT/'sources'/folder
        for file in sorted(base.rglob('*.dm')):
            relative=file.relative_to(base).as_posix()
            if current and relative not in {f['path'] for f in manifest['files']}:continue
            if relative.startswith(('code/','modular/','modular_')):files.setdefault(relative,file)
    index=[{'path':path,'file':file.relative_to(ROOT).as_posix()} for path,file in files.items()]
    index_path=ROOT/'sources/ratwood2-item-text-index.json'
    index_path.write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
    objects={item['type']:item for root_type in ['/obj','/turf','/datum/reagent','/datum/brewing_recipe'] for item in helpers['definitions'](index_path,ROOT,root_type)}
    methods={}
    for path,file in files.items():methods.update(mechanics_methods(file.read_text(encoding='utf-8-sig'),path))
    rows=[]
    for item in objects.values():
        field='bottle_desc' if item['type'].startswith('/datum/brewing_recipe') else 'description' if item['type'].startswith('/datum/') else 'desc'
        text=item.get(field)
        mechanics,contextual=inherited_mechanics(item['type'],objects,methods) if field=='desc' else ([],False)
        description={'text':plain(text),'source':URL+item[field+'Source']+f'#L{item[field+"Line"]}'} if text is not None else None
        rows.append({'type':item['type'],'name':item.get('name'),'aliases':[item['bottle_name']] if item.get('bottle_name') else [],'description':description,'descriptionKind':'Bottle description' if field=='bottle_desc' else 'Description','mechanics':mechanics,'contextualMechanics':contextual,'descriptionDynamic':field in item and text is None})
    (ROOT/'sources/ratwood2-item-text.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'types':len(rows),'descriptions':sum(bool(r['description']) for r in rows),'mechanics':sum(bool(r['mechanics']) for r in rows)}))


if __name__=='__main__':main()
