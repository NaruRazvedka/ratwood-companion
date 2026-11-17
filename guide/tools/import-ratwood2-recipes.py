"""Index explicit table-assembly recipes; preserve unresolved types for review."""
import json
import re
import runpy
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'sources/ratwood-2'
helpers=runpy.run_path(str(ROOT/'tools/extract-sprites.py'))


def recipe_blocks(text):
    starts=list(re.finditer(r'^(/datum/food_recipe/[\w/]+)\s*$',text,re.M))
    for i,match in enumerate(starts):
        block=text[match.end():starts[i+1].start() if i+1<len(starts) else len(text)]
        def path(key):
            found=re.search(r'^\t'+key+r' = (/[\w/]+)\s*$',block,re.M)
            return found[1] if found else None
        name=re.search(r'^\tname = "([^"\n]+)"',block,re.M)
        ingredients=re.search(r'^\tingredients = list\((.*?)\)',block,re.S|re.M)
        if not (name and ingredients and path('base_item') and path('result_type')):continue
        entries=[]
        for entry in ingredients[1].split(','):
            entry=re.sub(r'//[^\n]*','',entry).strip()
            if not entry:continue
            parsed=re.fullmatch(r'(/[\w/]+)(?:\s*=\s*(\d+(?:\.\d+)?))?',entry)
            if not parsed:raise ValueError('Unparsed ingredient: '+entry)
            entries.append({'type':parsed[1],'amount':parsed[2]})
        yield {'type':match[1],'name':name[1],'base':path('base_item'),'result':path('result_type'),
               'ingredients':entries,'needsCooking':bool(re.search(r'^\tneeds_cooking = TRUE\b',block,re.M)),
               'line':text[:match.start()].count('\n')+1}


def main():
    global SOURCE
    if '--current' in sys.argv:
        SOURCE=ROOT/'sources/ratwood-current'
        info=json.loads((SOURCE/'manifest.json').read_text(encoding='utf-8'))
        index=[{'path':f['path'],'file':f['path']} for f in info['files'] if f['path'].endswith('.dm')]
        (SOURCE/'definition-index.json').write_text(json.dumps(index)+'\n')
    else:info=json.loads((SOURCE/'index.json').read_text(encoding='utf-8'))
    items={i['type']:i for root_type in ['/obj','/datum/reagent'] for i in helpers['definitions'](SOURCE/'definition-index.json',SOURCE,root_type)}
    aliases={'/obj/item/reagent_containers/food/snacks/egg':'Egg',
             '/obj/item/reagent_containers/food/snacks/sugar':'Sugar',
             '/obj/item/reagent_containers/powder/flour':'Flour',
             '/datum/reagent/water':'Water','/datum/reagent/consumable/milk':'Milk',
             '/datum/reagent/consumable/milk/salted':'Salted milk'}
    def label(path):return items.get(path,{}).get('name') or aliases.get(path)
    rows=[]
    dme=(SOURCE/'roguetown.dme').read_text(encoding='utf-8').replace('\\','/')
    for file in sorted((SOURCE/'modular/Neu_Food/code/recipes').glob('*.dm')):
        relative=file.relative_to(SOURCE).as_posix()
        if relative not in dme:continue
        for row in recipe_blocks(file.read_text(encoding='utf-8')):
            row['baseName']=label(row['base']);row['resultName']=label(row['result'])
            result=items.get(row['result'],{})
            row['heatResults']=[{'method':method,'type':result[field],'name':label(result[field])} for field,method in [('cooked_type','Baking'),('fried_type','Frying')] if result.get(field) and result[field]!=row['result']]
            for ingredient in row['ingredients']:ingredient['name']=label(ingredient['type'])
            row['unresolved']=[p for p in [row['base'],row['result'],*[i['type'] for i in row['ingredients']]] if not label(p)]
            row['source']=f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{info["revision"]}/{relative}#L{row["line"]}'
            rows.append(row)
    (ROOT/'sources/ratwood2-food-recipes.json').write_text(json.dumps(rows,indent=2)+'\n')
    text=(SOURCE/'modular/Neu_Food/code/recipes/stew_recipes.dm').read_text(encoding='utf-8')
    stews=[]
    starts=list(re.finditer(r'^(/datum/stew_recipe/[\w/]+)\s*$',text,re.M))
    for i,m in enumerate(starts):
        block=text[m.end():starts[i+1].start() if i+1<len(starts) else len(text)]
        inputs=re.search(r'^\tinputs = list\((.*?)\)',block,re.S|re.M)
        output=re.search(r'^\toutput = (/[\w/]+)',block,re.M)
        if not(inputs and output):continue
        ingredient_types=re.findall(r'/obj/[\w/]+',inputs[1])
        expression=re.search(r'^\tcooktime = STEW_COOKING_TIME(?:\s*([*/])\s*(\d+))?',block,re.M)
        seconds=60
        if expression and expression[1]:seconds=seconds*int(expression[2]) if expression[1]=='*' else seconds/int(expression[2])
        line=text[:m.start()].count('\n')+1
        stews.append({'type':m[1],'output':output[1],'name':label(output[1]),'inputs':[{'type':p,'name':label(p)} for p in ingredient_types],
                      'seconds':seconds,'unresolved':[p for p in [output[1],*ingredient_types] if not label(p)],
                      'source':f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{info["revision"]}/modular/Neu_Food/code/recipes/stew_recipes.dm#L{line}'})
    (ROOT/'sources/ratwood2-stew-recipes.json').write_text(json.dumps(stews,indent=2)+'\n')
    heating=[]
    for item in items.values():
        for field,method in [('cooked_type','Bake'),('fried_type','Fry')]:
            target=item.get(field)
            if target and target!=item['type'] and item.get('name') and label(target):
                heating.append({'inputType':item['type'],'inputName':item['name'],'outputType':target,'outputName':label(target),'method':method,
                                'source':f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{info["revision"]}/{item["source"]}#L{item["line"]}'})
    (ROOT/'sources/ratwood2-heating.json').write_text(json.dumps(heating,indent=2)+'\n')
    print(json.dumps({'assemblyRecipes':len(rows),'fullyNamed':sum(not r['unresolved'] for r in rows)}))


if __name__=='__main__':main()
