"""Import inherited item properties from pinned DM, without executing it."""
import ast
import hashlib
import json
import math
import re
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REV = '80907df21ed15bde91106da41ce82e6ac6c40069'
URL = f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'
HELPERS = runpy.run_path(str(ROOT/'tools/extract-sprites.py'))
USE = runpy.run_path(str(ROOT/'tools/item-use-properties.py'))
FIELDS = USE['FIELDS'] | {'name','bottle_name','rotprocess','warming','become_rot_type','faretype','quality','sellprice','static_price',
          'sell_value','brew_time','brewed_amount','per_brew_amount','reagent_to_brew','parent_type'}
FARE = {'FARE_IMPOVERISHED':'Fit for the desperate','FARE_POOR':'Fit for the poor',
        'FARE_NEUTRAL':'Decent','FARE_FINE':'Fine','FARE_LAVISH':'Lavish'}
DRINK = {'DRINK_NICE':'Nice','DRINK_GOOD':'Good','DRINK_VERYGOOD':'Very good',
         'DRINK_FANTASTIC':'Fantastic','FOOD_AMAZING':'Amazing','0':'No drink-quality bonus'}
PRICE_NOTE = ('Base source value, not a guaranteed sale quote. Appraisal may randomize it by about 13%; '
              'crafted quality, derived recipe prices, loot status and the buyer can change the result.')
STORAGE_NOTE = ('Approximate time from a newly created item, including its initial warm period, while unprotected. '
                'Ordinary tables halve decay; chests, platters, food vendors, artifact backpacks and cooling tables pause it. '
                'Already-aged food has less time left; processing ticks make the exact boundary approximate.')


def number(expression, constants=None):
    """Only numeric constants and arithmetic; no eval, calls, attributes or DM execution."""
    constants = constants or {}
    if expression is None:
        return None
    expression = str(expression).strip()
    if not re.fullmatch(r'[A-Za-z_0-9\s.+*/()|&<>~\-]+',expression):return None
    if expression in {'null','FALSE'}:
        return 0
    if expression == 'TRUE':
        return 1
    expression = re.sub(r'(?<=\d)\s+(SECONDS|MINUTES|HOURS|DAYS)\b',r' * \1',expression)
    def visit(node):
        if isinstance(node,ast.Expression):return visit(node.body)
        if isinstance(node,ast.Constant) and type(node.value) in (int,float):return node.value
        if isinstance(node,ast.Name) and node.id in constants:return constants[node.id]
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub,ast.Invert)):
            value=visit(node.operand)
            return value if isinstance(node.op,ast.UAdd) else ~value if isinstance(node.op,ast.Invert) else -value
        if isinstance(node,ast.BinOp) and isinstance(node.op,(ast.Add,ast.Sub,ast.Mult,ast.Div,ast.BitOr,ast.BitAnd,ast.LShift,ast.RShift)):
            left,right=visit(node.left),visit(node.right)
            if isinstance(node.op,ast.Add):return left+right
            if isinstance(node.op,ast.Sub):return left-right
            if isinstance(node.op,ast.Mult):return left*right
            if isinstance(node.op,ast.BitOr):return int(left)|int(right)
            if isinstance(node.op,ast.BitAnd):return int(left)&int(right)
            if isinstance(node.op,(ast.LShift,ast.RShift)):
                if not 0 <= right <= 32:raise ValueError('Unsafe shift')
                return int(left)<<int(right) if isinstance(node.op,ast.LShift) else int(left)>>int(right)
            return left/right
        raise ValueError('Nonconstant expression')
    try:
        value=visit(ast.parse(expression,mode='eval'))
        return value if math.isfinite(value) else None
    except (ValueError,SyntaxError,ZeroDivisionError,TypeError,OverflowError):
        return None


def blocks(text, source):
    text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m[0].count('\n'),text,flags=re.S)
    current=None
    lines=list(HELPERS['logical_lines'](text))
    index=0
    while index<len(lines):
        line,content=lines[index];index+=1
        if content.startswith('/'):
            path=content.split('//',1)[0].strip()
            current=path if re.fullmatch(r'/(?:obj|atom|datum)(?:/\w+)*',path) else None
            if current:yield current,None,{'source':URL+source+f'#L{line}'}
        elif current:
            match=re.match(r'^(?:\t| {4})(?:var/(?:\w+/)*)?(\w+)\s*=\s*(.*?)\s*(?://.*)?$',content)
            if match and match[1] in FIELDS:
                expression=match[2].strip()
                while USE['unclosed_list'](expression) and index<len(lines):
                    expression+=' '+lines[index][1].split('//',1)[0].strip();index+=1
                yield current,match[1],{'expression':expression,'source':URL+source+f'#L{line}'}


def resolve_fields(raw):
    cache={}
    def resolve(path,trail=()):
        if path in cache:return cache[path]
        if path in trail:raise ValueError('Inheritance cycle: '+path)
        own=raw.get(path,{})
        parent=own.get('parent_type',{}).get('expression',path.rsplit('/',1)[0])
        inherited=resolve(parent,trail+(path,)) if parent and parent!=path else {}
        cache[path]={**inherited,**own}
        return cache[path]
    return {path:resolve(path) for path in raw}


def duration(seconds):
    return f'{seconds/60:g} minutes' if seconds%60==0 else f'{seconds:g} seconds'


def aging_stages(text,source,constants):
    result={}
    starts=list(re.finditer(r'^(/datum/brewing_recipe(?:/\w+)*)\s*$',text,re.M))
    for i,match in enumerate(starts):
        block=text[match.end():starts[i+1].start() if i+1<len(starts) else len(text)]
        found=re.search(r'^\tage_times = list\((.*?)\)',block,re.S|re.M)
        if not found:continue
        stages=[]
        for reagent,expression in re.findall(r'(/datum/reagent/[\w/]+)\s*=\s*([^,\n]+)',found[1]):
            value=number(expression,constants)
            if value is not None:stages.append({'type':reagent,'seconds':value/10,'source':URL+source+f'#L{text[:match.start()].count(chr(10))+1}'})
        result[match[1]]=stages
    return result


def shelf_life(fields,constants):
    field=fields.get('rotprocess')
    if not field:return None
    timer=number(field['expression'],constants)
    if timer is None:return {'label':'Variable or unresolved food rot timer','conditions':'The source timer expression could not be reduced safely.','source':field['source']}
    if not timer:return {'label':'Does not rot under the food decay system','seconds':0,'conditions':'The initial rotprocess is null or false. This does not prevent burning or other damage.','source':field['source']}
    warm=number(fields.get('warming',{}).get('expression'),constants)
    result={'label':f'{duration(timer/10)} rot timer','seconds':timer/10,'conditions':STORAGE_NOTE,'source':field['source']}
    if warm is not None:
        result.update(warmingSeconds=warm/10,unprotectedSeconds=max(0,timer+warm)/10)
        result['label']=f'About {duration(result["unprotectedSeconds"])} unprotected ({duration(timer/10)} rot timer)'
    return result


def main():
    global REV, URL
    current='--current' in sys.argv
    manifest=json.loads((ROOT/'sources/ratwood-current/manifest.json').read_text()) if current else None
    if current:
        REV=manifest['revision'];URL=f'https://github.com/Rotwood-Vale/Ratwood-2.0/blob/{REV}/'
    files={}
    for folder in (['ratwood-current'] if current else ['ratwood-2','ratwood-2-production','ratwood-2-system','ratwood-2-text','ratwood-2-properties']):
        base=ROOT/'sources'/folder
        for file in sorted(base.rglob('*.dm')):
            relative=file.relative_to(base).as_posix()
            if current and relative not in {f['path'] for f in manifest['files']}:continue
            if relative.startswith(('code/','modular/','modular_')):files.setdefault(relative,file)
    if current:
        includes=re.findall(r'^#include \"([^\"]+)\"', (ROOT/'sources/ratwood-current/roguetown.dme').read_text(encoding='utf-8-sig'), re.M)
        files={name:files[name] for name in (p.replace('\\','/') for p in includes) if name in files}
    raw={}
    for source,file in files.items():
        for path,key,value in blocks(file.read_text(encoding='utf-8-sig'),source):
            own=raw.setdefault(path,{})
            if key:own[key]=value
            else:own.setdefault('_definition',value)
    objects=resolve_fields(raw)
    constants={'SECONDS':10,'MINUTES':600,'HOURS':36000,'DAYS':864000}
    macros={}
    for source,file in files.items():
        for _,line in HELPERS['logical_lines'](file.read_text(encoding='utf-8-sig')):
            match=re.match(r'^#define\s+(\w+)\s+(.+)',line)
            if match:macros[match[1]]=match[2].split('//',1)[0].strip()
    for _ in range(12):
        for key,expression in macros.items():
            value=number(expression,constants)
            if value is not None:constants[key]=value
    result=[]
    aging={}
    for source,file in files.items():
        if '/brewing_recipes/' in source:aging.update(aging_stages(file.read_text(encoding='utf-8-sig'),source,constants))
    default_price=objects['/atom/movable']['sellprice']
    keg=objects['/obj/structure/fermentation_keg']['sellprice']
    keg_price=number(keg['expression'],constants)
    def literal(fields,key):return HELPERS['literal_text'](fields.get(key,{}).get('expression',''))
    for path,fields in objects.items():
        if not (path.startswith('/obj/') or path.startswith('/datum/reagent/') or path.startswith('/datum/brewing_recipe/')):continue
        name=literal(fields,'name')
        if not name:continue
        row={'type':path,'name':name,'aliases':[],'sources':[fields['_definition']['source']]}
        shelf=shelf_life(fields,constants)
        outcome=fields.get('become_rot_type',{})
        target=outcome.get('expression','')
        if shelf and shelf.get('seconds',0)>0 and target.startswith('/obj/'):
            target_fields=objects.get(target,{})
            target_name=literal(target_fields,'name') or target
            shelf['outcome']={'type':target,'name':target_name,'source':outcome['source']}
            time=shelf.get('unprotectedSeconds',shelf['seconds'])
            shelf['label']=f'About {duration(time)} unprotected, then becomes {target_name}'
            shelf['conditions']+=' This decay timer creates the named replacement instead of simply spoiling this item. Replacement waits while the item is held directly by a character. Protected storage pauses this transformation too.'
            next_shelf=shelf_life(target_fields,constants)
            if next_shelf:
                shelf['outcome']['shelfLife']=next_shelf
                shelf['conditions']+=' The replacement has no further food rot timer.' if next_shelf.get('seconds')==0 else ' The replacement starts its own food timer.'
            row['sources'].append(outcome['source'])
        if shelf:row['shelfLife']=shelf
        if path.startswith('/datum/reagent/'):
            row['shelfLife']={'label':'No solid-food rot timer defined for this liquid','conditions':'Liquid definitions use different mechanics; aging is listed separately where the brewing recipe defines it.','source':fields['_definition']['source']}
        fare=fields.get('faretype') if path.startswith('/obj/') else fields.get('quality')
        if fare:
            code=fare['expression'];label=(FARE if path.startswith('/obj/') else DRINK).get(code)
            if label:
                row['quality']={'label':label,'code':code,'source':fare['source'],'conditions':'Base fare before serving. A platter raises food one rank, up to Lavish; favorites and hated foods have separate effects.' if path.startswith('/obj/') else 'Drink-quality rating; separate from solid-food fare ranks.'}
        if path.startswith('/obj/'):
            price=fields.get('sellprice',default_price);amount=number(price['expression'],constants)
            row['value']={'label':f'{amount:g} mammons base value' if amount else 'No fixed base value; recipe-derived appraisal may apply','conditions':PRICE_NOTE,'source':price['source']}
            if amount is not None:row['value']['amount']=amount
            else:row['value']['label']='Variable or unresolved base value'
        if path.startswith('/datum/brewing_recipe/'):
            quote=fields.get('sell_value');amount=number(quote['expression'],constants) if quote else None
            bottles=number(fields.get('brewed_amount',{}).get('expression'),constants)
            portion=number(fields.get('per_brew_amount',{}).get('expression'),constants)
            brewtime=number(fields.get('brew_time',{}).get('expression'),constants)
            bottle_name=literal(fields,'bottle_name')
            reagent=fields.get('reagent_to_brew',{}).get('expression')
            row['aliases']=[s for s in [bottle_name,literal(objects.get(reagent,{}),'name')] if s]
            # Reviewed workbook spellings that differ from the source display names.
            row['aliases']+= {'/datum/brewing_recipe/jack_wine':['Wine-Jacksberry'],'/datum/brewing_recipe/beer':['Beer-Wheat'],
                             '/datum/brewing_recipe/beer/oat':['Ale-Oats'],'/datum/brewing_recipe/beer/rice':['Wine-Rice'],
                             '/datum/brewing_recipe/aqua_vitae':['Aqua Vitae']}.get(path,[])
            row['brewing']={'recipeType':path,'reagentType':reagent,'recipeQuote':amount,'barrelValue':amount+keg_price if amount is not None and keg_price is not None else None,
                            'bottleValue':math.floor(amount/bottles) if amount is not None and bottles else None,
                            'bottles':bottles,'batchVolume':portion*bottles if portion is not None and bottles else None,
                            'brewSeconds':brewtime/10 if brewtime is not None else None,'source':fields['_definition']['source'],
                            'conditions':'Recipe quote excludes the empty keg. An untapped finished keg adds its 15-mammon base; tapping sets the keg price to zero. Sealed bottle value is recipe quote divided by bottle count, rounded down (BYOND single-argument round). Unsealing a brewer bottle sets its sellprice to zero. Aging changes the reagent, not this price formula. These are source values, not guaranteed buyer payouts.'}
            stages=aging.get(path,[])
            row['brewing']['ageTimes']=[{**stage,'name':literal(objects.get(stage['type'],{}),'name') or stage['type']} for stage in stages]
            if stages:
                row['brewing']['conditions']+=' Aging thresholds are measured after brewing when pouring. The bottling code resets age_start_time before reading it, so bottled maturity has an unresolved timing discrepancy.'
            row['value']={'amount':row['brewing']['barrelValue'],'label':f'{row["brewing"]["barrelValue"]:g} mammons finished-keg base value' if row['brewing']['barrelValue'] is not None else 'Finished-keg value unresolved',
                          'conditions':row['brewing']['conditions'],'source':URL+'code/modules/farming/fermentation_keg.dm#L346'}
            liquid=objects.get(reagent,{})
            quality=liquid.get('quality')
            if quality and quality['expression'] in DRINK:row['quality']={'code':quality['expression'],'label':DRINK[quality['expression']],'source':quality['source'],'conditions':'Initial brewed reagent; aging can change its drink quality.'}
            row['shelfLife']={'label':'No solid-food rot timer; check brewing and aging stages','conditions':'Brewing duration is a production time, not a spoilage deadline.','source':fields['_definition']['source']}
        row['useCases']=USE['use_cases'](path,fields,objects,constants,macros,number,HELPERS['literal_text'])
        if row.get('brewing') and (reagent:=row['brewing'].get('reagentType')) in objects:
            row['useCases']+=USE['use_cases'](reagent,objects[reagent],objects,constants,macros,number,HELPERS['literal_text'])
        for field in ['shelfLife','quality','value']:
            if field in row:row['sources'].append(row[field]['source'])
        row['sources'] += [f['source'] for group in row['useCases'] for f in group['facts'] if f.get('source')]
        row['sources']=list(dict.fromkeys(row['sources']))
        result.append(row)
    out=ROOT/'sources/ratwood2-item-properties.json'
    out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    evidence=[]
    for source,file in files.items():
        if 'ratwood-2-properties' in str(file):
            data=file.read_bytes();evidence.append({'path':source,'sha':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()})
    evidence_path=ROOT/('sources/current-properties-index.json' if current else 'sources/ratwood-2-properties/index.json')
    evidence_path.write_text(json.dumps({'revision':REV,'reviewed':manifest['reviewed'] if current else '2026-11-15','note':'Static properties imported from the pinned source; not a live-server verification.','files':evidence},indent=2)+'\n')
    print(json.dumps({'types':len(result),'foodTimers':sum('shelfLife' in r and r['type'].startswith('/obj/') for r in result),'qualities':sum('quality' in r for r in result),'brews':sum('brewing' in r for r in result)}))


if __name__=='__main__':main()
