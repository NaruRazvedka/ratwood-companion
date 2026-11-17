# SPDX-License-Identifier: AGPL-3.0-or-later
"""Index pinned recipe and intermediate-processing definitions without executing DM."""
import hashlib
import json
import re
import runpy
import sys
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REV='80907df21ed15bde91106da41ce82e6ac6c40069'
URL=f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'
HELP=runpy.run_path(str(ROOT/'tools/extract-sprites.py'))
PATH=r'/[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+)*'


def uncomment(text):
    text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m[0].count('\n'),text,flags=re.S)
    # Comment markers inside quoted descriptions are not comments.
    return '\n'.join(re.split(r'//(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)',line,maxsplit=1)[0] for line in text.splitlines())


def parse_definitions(text,source):
    """Read literal top-level properties, including multiline lists and var declarations."""
    definitions={}
    current=None
    pending=None
    for number,line in enumerate(uncomment(text).splitlines(),1):
        if pending:
            pending[1]+=' '+line.strip()
            if pending[1].count('(')==pending[1].count(')'):
                current[pending[0]]=pending[1]
                pending=None
            continue
        if line.startswith('/'):
            match=re.fullmatch(PATH+r'/?',line.strip())
            current=definitions.setdefault(line.strip().rstrip('/'),{'type':line.strip().rstrip('/'),'source':source,'line':number,'own':{}}) if match else None
            if current is not None:current=current['own']
        elif current is not None:
            match=re.match(r'^(?:\t| {4})(?:var/)?(?:[\w/]+/)?(\w+)(?:\[\])?\s*=\s*(.*?)\s*$',line)
            if not match:continue
            key,value=match.groups()
            if value.count('(')>value.count(')'):
                pending=[key,value]
            else:current[key]=value
    return definitions


def list_values(value):
    if not value or value=='null':return []
    if re.fullmatch(PATH,value.strip()):return [{'type':value.strip(),'amount':1}]
    if not value.startswith('list('):return []
    result=[]
    for fragment in value[5:-1].split(','):
        match=re.fullmatch(r'\s*('+PATH+r')(?:\s*=\s*([^,]+))?\s*',fragment)
        if not match:continue
        amount=match[2].strip() if match[2] else '1'
        result.append({'type':match[1],'amount':int(amount) if amount.isdigit() else amount})
    return result


def resolve_all(definitions):
    cache={}
    def resolve(path,trail=()):
        if path in cache:return cache[path]
        if path in trail:raise ValueError('Recipe inheritance cycle: '+path)
        own=definitions.get(path,{}).get('own',{})
        parent=own.get('parent_type',path.rsplit('/',1)[0])
        inherited=resolve(parent,trail+(path,)) if parent and parent!=path else {}
        cache[path]={**inherited,**own}
        return cache[path]
    for path in definitions:resolve(path)
    return cache


def main():
    global REV, URL
    current = '--current' in sys.argv
    if current:
        REV = json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text())['revision']
        URL = f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'
    current_paths={f['path'] for f in json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text())['files']} if current else set()
    active_dme=(ROOT/'sources/ratwood-current/roguetown.dme').read_text(encoding='utf-8-sig').replace('\\','/') if current else ''
    files={}
    for folder in (['ratwood-current'] if current else ['ratwood-2','ratwood-2-production','ratwood-2-system','ratwood-2-text','ratwood-2-preparation']):
        base=ROOT/'sources'/folder
        for file in sorted(base.rglob('*.dm')):
            relative=file.relative_to(base).as_posix()
            if current and relative not in current_paths:continue
            if current and relative not in active_dme:continue
            if not relative.startswith(('code/','modular/','modular_')):continue
            if any(x in relative.lower() for x in ['/lewd/','/sexcon/','chastity']):continue
            files.setdefault(relative,file)
    index=[{'path':p,'file':f.relative_to(ROOT).as_posix()} for p,f in files.items()]
    index_path=ROOT/'sources/ratwood2-preparation-index.json'
    index_path.write_text(json.dumps(index,indent=2)+'\n')
    objects={i['type']:i for root in ['/obj','/turf','/datum/reagent','/datum/skill'] for i in HELP['definitions'](index_path,ROOT,root)}
    definitions={}
    texts={}
    for path,file in files.items():
        text=file.read_text(encoding='utf-8-sig')
        texts[path]=text
        for key,value in parse_definitions(text,path).items():
            if key in definitions:definitions[key]['own'].update(value['own'])
            else:definitions[key]=value
    resolved=resolve_all(definitions)
    aliases={'/obj/item/reagent_containers/food/snacks/egg':'Egg','/obj/item/reagent_containers/food/snacks/sugar':'Sugar',
             '/obj/item/reagent_containers/powder/flour':'Flour','/datum/reagent/water':'Water',
             '/datum/reagent/consumable/milk':'Milk','/datum/reagent/consumable/milk/salted':'Salted milk',
             '/datum/skill/craft/blacksmithing':'Blacksmithing','/datum/skill/craft/armorsmithing':'Armorsmithing',
             '/datum/skill/craft/crafting':'Crafting','/datum/skill/craft/sewing':'Sewing','/datum/skill/craft/carpentry':'Carpentry',
             '/datum/skill/craft/alchemy':'Alchemy','/datum/skill/craft/ceramics':'Ceramics',
             '/obj/item/clothing/head/peaceflower':'Peaceflower'}
    def label(path):
        value=objects.get(path,{}).get('name')
        if value:return value
        if path and path.startswith('/obj/item/rotation_contraption/'):
            fields=resolved.get(path,{})
            override=HELP['literal_text'](fields.get('item_name',''))
            if override:return override
            placed=fields.get('placed_type')
            placed_name=objects.get(placed,{}).get('name')
            if placed_name:return placed_name+' item'
        raw=resolved.get(path,{}).get('name')
        return (HELP['literal_text'](raw) if raw else None) or aliases.get(path)
    def ingredient(item):return {**item,'name':label(item['type'])}
    routes=[]
    coverage=[]
    def add(method,definition,input_type,output,ingredients,requirements,steps,tools=(),gaps=(),quantity=None,evidence='source',**extra):
        source=URL+definition['source']+f'#L{definition["line"]}'
        identity='\0'.join([method,definition['type'],input_type or '',output,str(definition['line']),extra.get('variant','')])
        requirements=list(requirements)
        if extra.get('skill'):requirements.append('Skill: '+extra['skill'])
        if extra.get('difficulty') is not None:requirements.append('Recipe difficulty: '+str(extra['difficulty']).replace('SKILL_LEVEL_','').lower())
        unnamed=[i['type'] for i in [*ingredients,*tools] if not label(i['type'])]
        if not label(output):unnamed.append(output)
        gaps=list(gaps)
        if unnamed:gaps.append('Display names are not resolved in retained object definitions for: '+', '.join(dict.fromkeys(unnamed))+'. Use the linked source/type identity to verify these materials.')
        row={'id':'prep-'+hashlib.sha256(identity.encode()).hexdigest()[:14],'method':method,'recipeType':definition['type'],
             'inputType':input_type,'inputName':label(input_type) if input_type else None,'outputType':output,'outputName':label(output),
             'ingredients':[ingredient(i) for i in ingredients],'requirements':requirements,'toolTypes':[ingredient(t) for t in tools],
             'steps':list(steps) if evidence=='source' else [],'source':source,'sources':[{'title':'Ratwood 2.0 source','url':source}],
             'evidence':evidence,'outputQuantity':quantity,'gaps':gaps,'priority':{'Reviewed preparation':0,'Direct food preparation':1,'Crafting menu':2,'Smithing':2,'Brewing':2,'Alchemical grinding':2,'Cutting':3,'Milling':3}.get(method,4) if evidence=='source' else 99,**extra}
        routes.append(row)
        return row['id']
    # Concrete recipe datums: inherited tools/materials are as important as direct fields.
    for type_path,definition in sorted(definitions.items()):
        family=next((p for p in ['/datum/crafting_recipe','/datum/anvil_recipe','/datum/alch_grind_recipe','/datum/alch_cauldron_recipe','/datum/brewing_recipe'] if type_path.startswith(p+'/')),None)
        if not family:continue
        data=resolved[type_path]
        if definition['own'].get('abstract_type','').rstrip('/')==type_path:continue
        row={'type':type_path,'source':URL+definition['source']+f'#L{definition["line"]}','family':family,'routeIds':[]}
        name=HELP['literal_text'](data.get('name','')) or type_path.rsplit('/',1)[-1].replace('_',' ')
        skill=data.get('skillcraft') or data.get('appro_skill')
        extra={'recipeName':name,'skill':label(skill) or skill,'difficulty':data.get('craftdiff') or data.get('skill_required')}
        if family=='/datum/crafting_recipe':
            outputs=list_values(data.get('result'))
            inputs=list_values(data.get('reqs'))
            tools=list_values(data.get('tools'))
            requirements=[label(t['type']) or 'Unresolved tool name (see linked source)' for t in tools]
            if data.get('req_table')=='TRUE':requirements.append('Table (craft on its surface)')
            if data.get('always_availible')!='TRUE':requirements.append('Recipe knowledge (availability depends on role/learning)')
            if data.get('req_trait') not in [None,'null']:requirements.append('Required trait: '+data['req_trait'])
            if outputs and inputs:
                for output in outputs:
                    row['routeIds'].append(add('Crafting menu',definition,None,output['type'],inputs,requirements,
                        ['Gather the listed materials and keep the listed tools within reach.',f'Open the crafting menu and select "{name}".','Meet the listed skill/trait requirements and complete the crafting action.'],tools=tools,quantity=output['amount'],knowledgeRequired=data.get('always_availible')!='TRUE',**extra))
        elif family=='/datum/anvil_recipe':
            output=data.get('created_item')
            bar=data.get('req_bar')
            inputs=list_values(bar)+list_values(data.get('additional_items'))
            if output and re.fullmatch(PATH,output) and bar and inputs:
                steps=[f'Heat {label(bar) or "the listed metal bar"} in a forge and transfer it to the anvil with tongs.',f'Select "{name}" and hammer the workpiece.']
                for item in list_values(data.get('additional_items')):steps.append(f'When prompted, add {label(item["type"]) or "the next source-listed material (name unresolved)"}, then hammer again.')
                steps.append('Finish the forging stages and quench the finished workpiece as prompted.')
                row['routeIds'].append(add('Smithing',definition,None,output,inputs,['Forge','Anvil','Hammer','Tongs','Water for quenching'],steps,quantity=int(data.get('createditem_num','1')),alternateBlankType=data.get('req_blade'),**extra))
        elif family=='/datum/alch_grind_recipe':
            input_type=data.get('valid_input')
            if input_type and re.fullmatch(PATH,input_type):
                for output in list_values(data.get('valid_outputs')):
                    row['routeIds'].append(add('Alchemical grinding',definition,input_type,output['type'],[{'type':input_type,'amount':1}],['Alchemical mortar','Pestle'],
                        [f'Place {label(input_type) or input_type} into an alchemical mortar.','Grind with a pestle to create the guaranteed output.'],quantity=output['amount'],bonusOutputs=[ingredient(i) for i in list_values(data.get('bonus_chance_outputs'))],**extra))
        elif family=='/datum/alch_cauldron_recipe':
            scent=HELP['literal_text'](data.get('smells_like',''))
            outputs=list_values(data.get('output_reagents'))+list_values(data.get('output_items'))
            if scent and outputs:
                for output in outputs:
                    row['routeIds'].append(add('Alchemy cauldron',definition,None,output['type'],[{'type':'/datum/reagent/water','amount':90,'unit':'source units (30 ounces)'}],['Cauldron','Heat source','Compatible alchemical ingredients'],
                        [],quantity=output['amount'],evidence='needs-review',gaps=[f'This datum defines the "{scent}" outcome family, not a concrete ingredient recipe. Select ingredient types whose combined potency reaches at least 5 for this outcome; competing outcomes and repeated types require the cauldron runtime rules. The ordinary cauldron requires 90 source units (30 ounces) of water. Output reagent amounts use internal source units.'],scent=scent,**extra))
        elif family=='/datum/brewing_recipe':
            output=data.get('reagent_to_brew')
            duration=re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s+(SECONDS|MINUTES|HOURS)',data.get('brew_time',''))
            if duration:
                extra['seconds']=float(duration[1])*{'SECONDS':1,'MINUTES':60,'HOURS':3600}[duration[2]]
                extra['timeLabel']=duration[1]+' '+duration[2].lower()+' base brewing time; heating can change the speed'
            inputs=[{**i,'unit':'source reagent units'} for i in list_values(data.get('needed_reagents'))]+[{**i,'unit':'crop contribution target (potency-dependent)'} for i in list_values(data.get('needed_crops'))]+list_values(data.get('needed_items'))
            if output and re.fullmatch(PATH,output) and inputs:
                row['routeIds'].append(add('Brewing',definition,None,output,inputs,['Brewing barrel'],
                    [f'Select "{name}" on an empty brewing barrel.','Add the listed ingredients and liquids in the quantities shown.','Start the selected batch and let it complete before drawing the drink.'],quantity=None,outputAliases=[name,HELP['literal_text'](data.get('bottle_name','')) or ''],outputLabel=str(data.get('brewed_amount','Unknown'))+' bottles',brewTimeExpression=data.get('brew_time'),preRequisite=data.get('pre_reqs'),**extra))
        if not row['routeIds']:
            row['state']='needs-review'
            row['reason']='No complete literal input/output route was resolved; may be an abstract parent, inherited/dynamic recipe or unsupported recipe expression.'
        elif all(next(r for r in routes if r['id']==id)['evidence']=='needs-review' for id in row['routeIds']):
            row['state']='needs-review';row['reason']='Only an outcome family or conditional route was resolved; concrete ingredient selection remains unverified.'
        else:row['state']='indexed'
        coverage.append(row)
    # Object processing fields retain explicit nulls, static yields, and inherited targets.
    for type_path,definition in sorted(definitions.items()):
        if not type_path.startswith('/obj/'):continue
        data=resolved[type_path]
        for field,method in [('slice_path','Cutting'),('mill_result','Milling')]:
            target=data.get(field)
            if not target or not re.fullmatch(PATH,target) or target==type_path:continue
            if field=='slice_path' and data.get('slices_num') in ['null','0']:continue
            if not label(type_path) or not label(target):continue
            quantity=data.get('slices_num') if field=='slice_path' else None
            quantity=int(quantity) if quantity and quantity.isdigit() else None
            requirements=['Table or supported cutting surface','Appropriate sharp cutting/chopping tool'] if field=='slice_path' else ['Millstone']
            steps=[f'Place {label(type_path)} on a table or supported cutting surface.','Use the appropriate cutting/chopping tool and complete the cutting action.'] if field=='slice_path' else [f'Put {label(type_path)} into a millstone.',f'Process it to obtain {label(target)}.']
            route=add(method,definition,type_path,target,[{'type':type_path,'amount':1}],requirements,steps,quantity=quantity,
                gaps=[] if quantity else ['A fixed batch yield is not established by the indexed processing fields.'])
            coverage.append({'type':type_path,'field':field,'source':URL+definition['source']+f'#L{definition["line"]}','state':'indexed','routeIds':[route]})
    # Direct food transformations are separate from the table recipe datums.
    for source,text in texts.items():
        if '/Neu_Food/code/' not in source:continue
        lines=uncomment(text).splitlines()
        owner=None
        stack=[]
        method_lines=[]
        spawns=[]
        def flush():
            if not owner:return
            grouped={}
            for spawn in spawns:
                key=(spawn['output'],tuple(spawn['conditions']))
                grouped.setdefault(key,[]).append(spawn)
            for (output,conditions),group in grouped.items():
                first=group[0]
                matched=[re.search(r'istype\(I,\s*('+PATH+r')\)',condition) for condition in conditions]
                additions=[m[1] for m in matched if m]
                alternatives=[]
                for condition in conditions:
                    if '||' in condition and re.fullmatch(r'if\(istype\(I,\s*'+PATH+r'\)(?:\s*\|\|\s*istype\(I,\s*'+PATH+r'\))+\)',condition):
                        alternatives=re.findall(r'istype\(I,\s*('+PATH+r')\)',condition)
                sharp=any('I.get_sharpness()' in c for c in conditions)
                table=any('found_table' in c or 'has_table_surface' in c for c in conditions)
                requirements=['Table'] if table else []
                tools=[]
                inputs=[{'type':owner,'amount':1}]
                for addition in additions:
                    if '/food/' in addition or '/food/snacks/' in addition or '/reagent_containers/' in addition:
                        inputs.append({'type':addition,'amount':1})
                    else:tools.append({'type':addition,'amount':1});requirements.append(label(addition) or addition)
                if sharp:requirements.append('Sharp tool')
                patterns=[r'if\(istype\(I,\s*'+PATH+r'\)\)',r'if\(istype\(I,\s*'+PATH+r'\)(?:\s*\|\|\s*istype\(I,\s*'+PATH+r'\))+\)',r'if\(I.get_sharpness\(\)\)',r'if\(isturf\(loc\)\s*&&\s*\(?found_table\)?\)',r'if\(do_after\(.*\)\)']
                unsupported=[c for c in conditions if not any(re.fullmatch(p,c) for p in patterns)]
                safe=bool((additions or sharp) and not unsupported and label(owner) and label(output))
                # These branches are known to be shadowed by earlier parent-type branches.
                if 'poison' in output:safe=False
                if not any('qdel(src)' in l for l in method_lines):safe=False
                if output.endswith('/prezzel_raw'):requirements.append('Dwarf or Dwarven Chef trait')
                definition={'type':owner,'source':source,'line':first['line']}
                operation='a sharp tool' if sharp else ', then '.join(label(p) or p for p in additions)
                steps=[f'Place {label(owner)} on a table.'] if table else [f'Have {label(owner)} ready.']
                steps.append(f'Apply {operation} to it and complete the preparation action.')
                steps.append(f'The source creates {len(group)} × {label(output)}.')
                gaps=[] if safe else ['Conditional/direct interaction requires manual verification; no complete preparation is asserted.',*unsupported]
                route=add('Direct food preparation',definition,owner,output,inputs,requirements,steps,tools=tools,quantity=len(group),evidence='source' if safe else 'needs-review',gaps=gaps,conditions=list(conditions))
                coverage.append({'type':owner,'source':URL+source+f'#L{first["line"]}','field':'attackby','state':'indexed' if safe else 'needs-review','routeIds':[route],**({'reason':gaps[0]} if gaps else {})})
                for alternative in alternatives[1:]:
                    alternate_inputs=[{**i,'type':alternative} if i['type']==alternatives[0] else i for i in inputs]
                    alternate_steps=[f'Place {label(owner)} on a table.'] if table else [f'Have {label(owner)} ready.']
                    alternate_steps.extend([f'Apply {label(alternative) or "the source-listed alternative filling"} and complete the preparation action.',f'The source creates {len(group)} x {label(output)}.'])
                    alternate_route=add('Direct food preparation',definition,owner,output,alternate_inputs,requirements,alternate_steps,tools=tools,quantity=len(group),evidence='source' if safe else 'needs-review',gaps=gaps,conditions=list(conditions),variant=alternative)
                    coverage[-1]['routeIds'].append(alternate_route)
        for number,line in enumerate(lines,1):
            if line.startswith('/'):
                flush()
                match=re.match(r'('+PATH+r')/attackby\(',line)
                owner=match[1] if match else None
                stack=[];spawns=[];method_lines=[]
                continue
            if not owner:continue
            method_lines.append(line)
            indent=len(line)-len(line.lstrip('\t'))
            if not line.strip():continue
            while stack and indent<=stack[-1][0]:stack.pop()
            if re.match(r'\s*(?:else )?if\(',line):stack.append((indent,line.strip()))
            new=re.search(r'\bnew\s+('+PATH+r')\(',line)
            if new:spawns.append({'output':new[1],'line':number,'conditions':[c for _,c in stack]})
        flush()
    # Reviewed multi-action preparations whose reagent/container state cannot be reduced to istype(I).
    flour='/obj/item/reagent_containers/powder/flour'
    dough='/obj/item/reagent_containers/food/snacks/rogue/dough_base'
    dairy='modular/Neu_Food/code/others/dairy.dm'
    neu='modular/Neu_Food/code/NeuFood.dm'
    reviewed=[
        ({'type':flour,'source':neu,'line':288},flour,dough,[{'type':flour,'amount':1},{'type':'/datum/reagent/water','amount':10,'unit':'source reagent units'}],['Table','Water container'],
         ['Put flour on a table and apply a container holding at least 10 source units of water.','Wait for the wetting action. Use an empty hand on the wet flour and complete kneading to obtain unfinished dough.'],[]),
        ({'type':'/obj/item/reagent_containers','source':dairy,'line':13},None,'/datum/reagent/consumable/milk/salted',[{'type':'/datum/reagent/consumable/milk','amount':15,'unit':'source reagent units'},{'type':'/obj/item/reagent_containers/powder/salt','amount':1}],['Container'],
         ['Put at least 15 source units of milk in a container.','Apply one salt item and finish the timed action; 15 milk units become salted milk.'],[]),
        ({'type':'/obj/item/reagent_containers/glass/bucket','source':dairy,'line':29},None,'/obj/item/reagent_containers/food/snacks/butter',[{'type':'/datum/reagent/consumable/milk/salted','amount':15,'unit':'source reagent units'}],['Bucket','Spoon'],
         ['Put at least 15 source units of salted milk in a bucket.','Use a spoon on the bucket and complete churning to obtain a stick of butter.'],[{'type':'/obj/item/kitchen/spoon','amount':1}]),
        ({'type':'/obj/item/reagent_containers/glass/bucket','source':dairy,'line':117},None,'/obj/item/reagent_containers/food/snacks/rogue/cheese',[{'type':'/datum/reagent/consumable/milk/salted','amount':5,'unit':'source reagent units'}],['Bucket','Cloth'],
         ['Put at least 5 source units of salted milk in a bucket.','Apply cloth and complete straining to obtain fresh cheese.'],[{'type':'/obj/item/natural/cloth','amount':1}]),
    ]
    for definition,input_type,output,inputs,requirements,steps,tools in reviewed:
        route=add('Reviewed preparation',definition,input_type,output,inputs,requirements,steps,tools=tools,quantity=15 if output.startswith('/datum/reagent/') else 1,outputUnit='source reagent units' if output.startswith('/datum/reagent/') else 'items')
        coverage.append({'type':definition['type'],'source':URL+definition['source']+f'#L{definition["line"]}','field':'reviewed processing','state':'indexed','routeIds':[route]})
    prefix='/obj/item/reagent_containers/food/snacks/rogue/'
    raw_dough='modular/Neu_Food/code/raw/raw_dough.dm'
    raw_pies='modular/Neu_Food/code/raw/raw_pies.dm'
    piedough=prefix+'piedough'
    # These calls choose a runtime type argument; the target is explicit at each call site.
    handpie_calls=[
        ('/obj/item/reagent_containers/food/snacks/rogue/truffles','mushroom',842),
        (prefix+'meat/mince/fish','fish',844),(prefix+'meat/mince','meat',846),(prefix+'meat/crab','crab',848),
        ('/obj/item/reagent_containers/food/snacks/grown/berries/rogue','berry',852),
        ('/obj/item/reagent_containers/food/snacks/grown/apple','apple',854),
        (prefix+'veg/potato_sliced','potato',856),('/obj/item/reagent_containers/food/snacks/grown/cabbage/rogue','cabbage',858)]
    for filling,suffix,line in handpie_calls:
        output=prefix+'foodbase/handpieraw/'+suffix
        definition={'type':piedough,'source':raw_dough,'line':line}
        requirements=[]
        steps=[f'Use one {label(filling) or "source-listed filling"} on one pie dough and finish the preparation action.',f'This consumes the filling and pie dough and creates one {label(output)}.','The raw handpie is now ready for its separate baking or frying route.']
        route=add('Reviewed preparation',definition,piedough,output,[{'type':piedough,'amount':1},{'type':filling,'amount':1}],requirements,steps,quantity=1)
        coverage.append({'type':piedough,'source':URL+raw_dough+f'#L{line}','field':'prepare_handpie runtime type argument','state':'indexed','routeIds':[route]})
    definition={'type':piedough,'source':raw_dough,'line':850}
    route=add('Reviewed preparation',definition,piedough,prefix+'foodbase/handpieraw/poison',[{'type':piedough,'amount':1},{'type':'/obj/item/reagent_containers/food/snacks/grown/berries/rogue/poison','amount':1}],[],[],evidence='needs-review',
        gaps=['The poison-berry branch calls the ordinary raw berry handpie type, not the separately defined raw poison handpie. No preparation route for the dedicated poison variant is confirmed.'])
    coverage.append({'type':piedough,'source':URL+raw_dough+'#L850','field':'prepare_handpie runtime type argument','state':'needs-review','routeIds':[route],'reason':'The caller does not select the dedicated poison variant.'})
    # Filled large pies retain one runtime object while cooked_type changes; no new raw subtype is spawned.
    piebottom=prefix+'foodbase/piebottom'
    pie_variants=[
        (prefix+'meat/mince/fish','meat/fish',135,[]),(prefix+'meat/mince/beef','meat',162,[]),
        (prefix+'meat/mince/spider','meat/spider',191,['Dark elf or Underdark Chef trait']),
        (prefix+'meat/crab','crab',377,[]),('/obj/item/reagent_containers/food/snacks/grown/apple','apple',428,[]),
        ('/obj/item/reagent_containers/food/snacks/grown/berries/rogue','berry',475,[]),
        ('/obj/item/reagent_containers/food/snacks/grown/berries/rogue/poison','poison',455,[])]
    pot_fillings=[prefix+'cheddarwedge',prefix+'veg/potato_sliced',prefix+'cheese','/obj/item/reagent_containers/food/snacks/egg',prefix+'meat/bacon',prefix+'meat/mince/poultry','/obj/item/reagent_containers/food/snacks/fat']
    pie_variants.extend((f,'pot',263,[]) for f in pot_fillings)
    for filling,suffix,line,requirements in pie_variants:
        output=prefix+'pie/cooked/'+suffix
        inputs=[{'type':piebottom,'amount':1},{'type':filling,'amount':3},{'type':piedough,'amount':1}]
        steps=['Start with a pie bottom, made by baking a separate pie dough.',f'Add {label(filling) or "the listed filling"} three times, completing each timed action.','Apply another pie dough as the roof after all three filling stages.','Bake the assembled, uncooked pie.']
        gaps=['Pot pie accepts mixtures of its allowed potato, cheese, egg, bacon, poultry-mince and fat fillings across the three filling stages; this route shows a single-filling option.'] if suffix=='pot' else []
        definition={'type':piebottom,'source':raw_pies,'line':line}
        route=add('Reviewed preparation',definition,piebottom,output,inputs,[*requirements,'Oven'],steps,quantity=1,variant=filling,gaps=gaps)
        coverage.append({'type':piebottom,'source':URL+raw_pies+f'#L{line}','field':'reviewed pie process stages','state':'indexed','routeIds':[route]})
    # Crab pie may replace only one later crab filling with shredded cabbage.
    definition={'type':piebottom,'source':raw_pies,'line':404}
    route=add('Reviewed preparation',definition,piebottom,prefix+'pie/cooked/crab',[{'type':piebottom,'amount':1},{'type':prefix+'meat/crab','amount':2},{'type':prefix+'veg/cabbage_sliced','amount':1},{'type':piedough,'amount':1}],['Oven'],
        ['Start with a baked pie bottom and add crab meat first.','Use crab meat for one further filling stage and shredded cabbage for the other; cabbage can replace only one later filling.','Add pie dough as the roof and bake the assembled pie.'],quantity=1,variant='cabbage substitute')
    coverage.append({'type':piebottom,'source':URL+raw_pies+'#L404','field':'reviewed pie substitute','state':'indexed','routeIds':[route]})
    for filling in [prefix+'fruit/pumpkin_sliced',prefix+'preserved/pumpkin_mashed']:
        definition={'type':piebottom,'source':raw_pies,'line':217}
        route=add('Reviewed preparation',definition,piebottom,prefix+'pie/cooked/pumpkin',[{'type':piebottom,'amount':1},{'type':filling,'amount':1},{'type':prefix+'cheese','amount':1},{'type':'/obj/item/reagent_containers/food/snacks/egg','amount':1},{'type':'/obj/item/reagent_containers/food/snacks/sugar','amount':1}],['Oven'],
            ['Start with a baked pie bottom.','Add pumpkin slice or pumpkin mash, then fresh cheese, then an egg, then sugar, completing each action in that order.','Bake the assembled pumpkin pie; this branch does not require a pie-dough roof.'],quantity=1,variant=filling)
        coverage.append({'type':piebottom,'source':URL+raw_pies+'#L217','field':'reviewed pumpkin pie stages','state':'indexed','routeIds':[route]})
    strudel=prefix+'strudeldough'
    definition={'type':strudel,'source':raw_dough,'line':884}
    route=add('Reviewed preparation',definition,strudel,prefix+'strudel',[{'type':strudel,'amount':1},{'type':'/obj/item/reagent_containers/food/snacks/grown/apple','amount':1},{'type':'/obj/item/reagent_containers/food/snacks/grown/nut','amount':1}],['Oven'],
        ['Use an apple on strudel dough and complete the filling action.','Add rocknut after the apple stage and complete the second action.','Bake the filled strudel.'],quantity=1)
    coverage.append({'type':strudel,'source':URL+raw_dough+'#L884','field':'reviewed strudel process stages','state':'indexed','routeIds':[route]})
    def reviewed_route(definition,input_type,output,inputs,requirements,steps,**extra):
        route=add('Reviewed preparation',definition,input_type,output,inputs,requirements,steps,quantity=extra.pop('quantity',1),**extra)
        coverage.append({'type':definition['type'],'source':URL+definition['source']+f'#L{definition["line"]}','field':'reviewed stateful preparation','state':'indexed','routeIds':[route]})
    # Washing and maturation mutate state or schedule a callback instead of creating an immediate new output.
    rice='/obj/item/reagent_containers/food/snacks/grown/rice'
    reviewed_route({'type':rice,'source':neu,'line':348},rice,prefix+'ricewet',[{'type':rice,'amount':1},{'type':'/datum/reagent/water','amount':10,'unit':'source reagent units'}],['Table','Water container'],
        ['Put rice grain on a table. Apply a container with at least 10 source units of water and finish wetting it.','Use an empty hand on the wet rice and complete the washing action to obtain washed rice.'])
    wheel=prefix+'cheddar'
    reviewed_route({'type':prefix+'foodbase/cheesewheel','source':dairy,'line':133},None,wheel,[{'type':'/obj/item/natural/cloth','amount':1},{'type':prefix+'cheese','amount':4}],['Table'],
        ['Put cloth on a table and apply the first fresh cheese to begin an unfinished wheel.','Apply three more fresh cheeses to the unfinished wheel on the table, completing each action.','After the fourth cheese, leave the maturing package for five minutes. It becomes a cheese wheel and returns the cloth.'])
    reviewed_route({'type':wheel,'source':dairy,'line':215},wheel,wheel+'/aged',[{'type':wheel,'amount':1}],[],
        ['Leave a whole, unaged cheese wheel undisturbed where aging can progress.','Its source aging transformation produces an aged cheese wheel when its freshness/aging counter completes.'],
        gaps=['The initial counter uses SHELFLIFE_LONG; actual elapsed aging time depends on the food-processing and preservation rules. This is maturation, not a claim that the cheese becomes rotten.'])
    pumpkin='/obj/item/natural/shellplant/pumpkin'
    shellsource='code/modules/farming/shellplant.dm'
    reviewed_route({'type':pumpkin,'source':shellsource,'line':30},pumpkin,prefix+'fruit/pumpkin_sliced',[{'type':pumpkin,'amount':1}],['Short blade with Cut intent','Spoon'],
        ['Use a short blade with Cut intent to open the pumpkin.','Use a spoon on the opened pumpkin repeatedly to scoop out its six flesh portions.','Finishing the pumpkin leaves its shell; seed extraction can also occur.'],quantity=6,gaps=['Seed yield is random and is not part of the fixed six-slice yield.'])
    reviewed_route({'type':pumpkin,'source':shellsource,'line':39},pumpkin,prefix+'fruit/pumpkin_sliced',[{'type':pumpkin,'amount':1}],['Chopping tool with Chop intent'],
        ['Use Chop intent with an appropriate chopping tool on the pumpkin.','Complete the action to produce its six remaining flesh portions; this route destroys the pumpkin instead of preserving its shell.'],quantity=6,variant='chop')
    egg='/obj/item/reagent_containers/food/snacks/egg'
    reviewed_route({'type':egg,'source':'modular/Neu_Farming/code/eggs.dm','line':1},egg,prefix+'friedegg/fried',[{'type':egg,'amount':1}],['Frying pan','Lit hearth'],
        ['Place a frying pan on a lit hearth.','Use an egg on the pan/hearth to crack it into the pan and allow it to fry.','Retrieve the fried egg when cooking completes.'])
    # The source's egg-first breading order differs from several workbook rows.
    deep_source='modular/Neu_Food/code/raw/raw_deep_fried.dm'
    deep_variants=[('nitzel',prefix+'meat/nitzel',9),('schnitzel',prefix+'meat/nitzel/schnitzel',47),('chickentender',prefix+'meat/chickentender',110),('wienernitzel',prefix+'meat/nitzel/wiener',148)]
    for raw_suffix,output,line in deep_variants:
        raw=prefix+'foodbase/'+raw_suffix
        definition={'type':raw,'source':deep_source,'line':line}
        reviewed_route(definition,raw,output,[{'type':raw,'amount':1},{'type':egg,'amount':1},{'type':prefix+'toastcrumbs','amount':1},{'type':'/datum/reagent/consumable/oil/tallow','amount':5,'unit':'source reagent units'}],['Pot on a lit hearth','Tallow; no water in the pot'],
            [f'Prepare {label(raw) or "the tenderized raw base"} using its linked tenderizing route.','Apply an egg first and complete the action, then apply toast crumbs and complete the coating action.','Prepare a hearth-mounted pot containing at least 5 source units of tallow and no water. Fat can be rendered into tallow in the pot.','Use the fully coated food on the hearth pot to deep-fry it; retrieve the finished food.'])
        routes[-1]['sources'].append({'title':'Deep-frying hearth interaction','url':URL+'code/game/objects/lighting/rogue_fires.dm#L641'})
    raw=prefix+'foodbase/squires_delight'
    reviewed_route({'type':raw,'source':deep_source,'line':88},raw,'/obj/item/reagent_containers/food/snacks/squiresdelight',[{'type':raw,'amount':1},{'type':prefix+'toastcrumbs','amount':1},{'type':'/datum/reagent/consumable/oil/tallow','amount':5,'unit':'source reagent units'}],['Pot on a lit hearth','Tallow; no water in the pot'],
        ['Begin with the unfinished butter-and-egg base from its linked recipe.','Apply toast crumbs and complete the coating action.','Deep-fry the coated base in a hearth-mounted pot with at least 5 source units of tallow and no water.'])
    routes[-1]['sources'].append({'title':'Deep-frying hearth interaction','url':URL+'code/game/objects/lighting/rogue_fires.dm#L641'})
    fat='/obj/item/reagent_containers/food/snacks/fat'
    reviewed_route({'type':fat,'source':'code/game/objects/lighting/rogue_fires.dm','line':633},fat,'/datum/reagent/consumable/oil/tallow',[{'type':fat,'amount':1}],['Pot on a lit hearth','No water in the pot'],
        ['Put an empty pot on a lit hearth; ensure it contains no water.','Use a lump of animal fat on the hearth pot and complete rendering. The fat is consumed and adds 20 source reagent units of liquid tallow.'],quantity=20,outputUnit='source reagent units')
    routes[-1]['sources'].append({'title':'Animal fat rendering yield','url':URL+'modular/Neu_Food/code/others/fat.dm#L10'})
    # These two table recipes had unresolved display-name dependencies in the earlier index.
    reviewed_route({'type':'/datum/food_recipe/cake/peace_cake','source':'modular/Neu_Food/code/recipes/cakes_recipes.dm','line':136},prefix+'frostedcake',prefix+'peacecake',[{'type':prefix+'frostedcake','amount':1},{'type':'/obj/item/clothing/head/peaceflower','amount':1}],['Table'],
        ['Put frosted cake on a table.','Apply one peaceflower and finish the preparation action to make peace cake.'])
    reviewed_route({'type':'/datum/food_recipe/seafood/ale_cod','source':'modular/Neu_Food/code/recipes/fish_recipes.dm','line':15},prefix+'fryfish/cod',prefix+'alecod',[{'type':prefix+'fryfish/cod','amount':1},{'type':'/datum/reagent/consumable/ethanol/beer','amount':1,'unit':'source reagent units'}],['Table','Container holding beer'],
        ['Put cooked cod on a table.','Apply a container with at least 1 source unit of beer and finish the recipe step to make alecod.'],gaps=['The source recipe requests 1 internal reagent unit; the earlier workbook quantity of roughly 3 ounces is retained only as community guidance.'])
    # Stable deduplication; the same output can legitimately have several preparation routes.
    routes=list({r['id']:r for r in routes}.values())
    # This result is an initializer-only spawner: the crafted item becomes two paired stones.
    sending_source='code/game/objects/items/rogueitems/magic/mageitems.dm'
    sending_text=texts.get(sending_source,'')
    sending_match=re.search(r'^/obj/item/sendingstonesummoner/Initialize\(mapload\)(.*?)(?=^/|\Z)',sending_text,re.M|re.S)
    if sending_match and sending_match[1].count('new /obj/item/natural/stone/sending(loc)')==2 and 'qdel(src)' in sending_match[1]:
        for route in routes:
            if route['outputType']=='/obj/item/sendingstonesummoner':
                route['spawnedBy']=route['outputType'];route['outputType']='/obj/item/natural/stone/sending'
                route['outputName']=label(route['outputType']);route['outputQuantity']=(route['outputQuantity'] or 1)*2
                route['sources'].append({'title':'Paired sending-stone creation','url':URL+sending_source+'#L'+str(sending_text[:sending_match.start()].count('\n')+1)})
    if current:
        # Hand-reviewed interaction templates cannot silently survive a changed source file.
        for route in routes:
            if route['method'] != 'Reviewed preparation':continue
            relative=route['source'].split('/blob/'+REV+'/',1)[-1].split('#',1)[0]
            old=next((ROOT/'sources'/folder/relative for folder in ['ratwood-2','ratwood-2-production','ratwood-2-system','ratwood-2-text','ratwood-2-preparation'] if (ROOT/'sources'/folder/relative).exists()),None)
            if not old or old.read_bytes() != files.get(relative,old).read_bytes():
                route['evidence']='needs-review';route['steps']=[]
                route['gaps'].append('The interaction source changed since its manual review. Recheck the current source before following the historical procedure.')
    for route in routes:
        if route['outputType']==prefix+'foodbase/hardtack_raw':route['outputAliases']=['Slab of dough','Cracker dough']
    routes.sort(key=lambda r:(r['outputType'],r['method'],r['id']))
    (ROOT/'sources/ratwood2-preparation-routes.json').write_text(json.dumps(routes,indent=2)+'\n')
    report={'revision':REV,'reviewed':json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text())['reviewed'] if current else '2026-11-15','files':len(files),'routeCount':len(routes),'actionableRoutes':sum(r['evidence']=='source' for r in routes),
            'methods':dict(Counter(r['method'] for r in routes)),'entries':coverage}
    (ROOT/'sources/ratwood2-preparation-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='entries'}))


if __name__=='__main__':main()
