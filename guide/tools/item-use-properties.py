"""Player-facing static item specifications. Preserve unresolved expressions as gaps."""
import re

GROUPS = {
 'handling': ('Handling & durability', {
  'w_class':'Item size', 'slot_flags':'Equip slots', 'max_integrity':'Maximum integrity',
  'integrity_failure':'Break threshold (fraction of integrity)', 'equip_delay_self':'Time to equip yourself',
  'unequip_delay_self':'Time to remove yourself', 'slowdown':'Base movement slowdown',
  'anvilrepair':'Repair skill at an anvil', 'sewrepair':'Sewing repair', 'smeltresult':'Smelts into', 'smelt_bar_num':'Smelting bar count'}),
 'weapon': ('Weapon & shield', {
  'force':'Base melee force', 'force_wielded':'Wielded melee force override', 'throwforce':'Base thrown force',
  'associated_skill':'Weapon skill', 'minstr':'Strength requirement value', 'minstr_req':'Hard strength requirement',
  'wlength':'Weapon length class', 'wbalance':'Weapon balance', 'wdefense':'Base parry defense',
  'wdefense_wbonus':'Wielded defense bonus', 'can_parry':'Can parry', 'max_blade_int':'Maximum blade integrity',
  'armor_penetration':'Base armor penetration', 'coverage':'Shield projectile coverage chance',
  'block_chance':'Base block chance', 'special':'Special action', 'alt_grips':'Alternative grips'}),
 'armor': ('Armor & protection', {
  'body_parts_covered':'Covered body zones', 'armor_class':'Armor class', 'armor':'Armor ratings',
  'prevent_crits':'Critical-hit protection flags', 'resistance_flags':'Item resistance flags',
  'cold_protection':'Cold-protected zones', 'heat_protection':'Heat-protected zones',
  'min_cold_protection_temperature':'Minimum cold-protection temperature (K)',
  'max_heat_protection_temperature':'Maximum heat-protection temperature (K)',
  'allowed_race':'Race restrictions', 'allowed_sex':'Sex restrictions'}),
 'ranged': ('Ranged weapon & ammunition', {
  'mag_type':'Magazine or internal ammunition holder', 'ammo_type':'Accepted ammunition',
  'projectile_type':'Projectile', 'max_ammo':'Ammunition capacity', 'caliber':'Caliber',
  'damage':'Base projectile damage', 'damage_type':'Projectile damage type', 'flag':'Projectile armor channel',
  'armor_penetration':'Projectile penetration', 'damage_multiplier':'Weapon projectile multiplier',
  'proj_dmg_mod':'Projectile damage modifier', 'fire_delay':'Base firing delay', 'reloadtime':'Reload time',
  'recoil':'Recoil', 'spread':'Spread', 'accuracy':'Accuracy modifier', 'effective_range':'Effective range'}),
 'tool': ('Tool use', {'tool_behaviour':'Tool function','toolspeed':'Tool action-time multiplier',
  'work_time':'Base work time','hoe_damage':'Integrity cost per work cycle'}),
 'container': ('Container & storage', {'volume':'Reagent capacity (source units)',
  'amount_per_transfer_from_this':'Default transfer amount', 'possible_transfer_amounts':'Available transfer amounts',
  'screen_max_rows':'Storage grid rows', 'screen_max_columns':'Storage grid columns',
  'not_while_equipped':'Must remove to access', 'grid':'Uses grid storage',
  'max_items':'Item-count ceiling (other limits still apply)','max_w_class':'Largest accepted item size',
  'max_combined_w_class':'Combined size capacity','storage_slots':'Storage slots',
  'can_hold':'Accepted item types','cant_hold':'Excluded item types'}),
 'food': ('Food & contents', {'foodtype':'Food groups','list_reagents':'Initial reagent contents',
  'bitesize':'Bite size (source units)','bite_consumption':'Bite consumption (source units)',
  'slice_path':'Slices into','slices_num':'Number of slices','cooked_type':'Bakes into','fried_type':'Fries into',
  'distill_reagent':'Distillation product','seed':'Associated seeds'}),
 'reagent': ('Liquid effects & composition', {'description':'Source effect description','taste_description':'Taste',
  'nutriment_factor':'Nutrition factor','hydration_factor':'Hydration factor','boozepwr':'Alcohol strength value',
  'metabolization_rate':'Metabolism per processing cycle (source units)','overdose_threshold':'Overdose threshold (source units)',
  'addiction_threshold':'Addiction threshold (source units)'}),
 'spell': ('Casting & requirements', {'spell_tier':'Spell tier','associated_skill':'Magic skill','cost':'Learning cost',
  'school':'School','charge_type':'Charge system','recharge_time':'Base recharge setting (deciseconds or charges)',
  'cooldown_min':'Minimum cooldown setting','chargetime':'Base charge time','chargedrain':'Charge drain',
  'releasedrain':'Release drain','devotion_cost':'Devotion cost','mana_cost':'Mana cost','range':'Target range (tiles)',
  'req_items':'Required worn items','req_inhand':'Required held item','invocation_type':'Invocation',
  'gesture_required':'Requires gestures','human_req':'Requires a human caster','antimagic_allowed':'Works under antimagic',
  'clothes_req':'Requires spell clothing','movement_interrupt':'Moving interrupts charge'}),
 'stack': ('Stack & material', {'amount':'Initial stack amount','max_amount':'Maximum stack amount',
  'merge_type':'Merges with','singular_name':'One unit is called'}),
 'plant': ('Planting & harvest', {'plantname':'Plant name','product':'Harvest product',
  'lifespan':'Lifespan','endurance':'Endurance','maturation':'Maturation value','production':'Production value',
  'yield':'Harvest yield value','potency':'Potency','growthstages':'Growth stages','plant_type':'Plant type',
  'plant_def_type':'Plant definition','seed_identity':'Seed identity',
  'produce_type':'Harvest product','produce_amount_min':'Minimum base harvest','produce_amount_max':'Maximum base harvest',
  'maturation_time':'Base maturation time','produce_time':'Base produce time','maturation_nutrition':'Nutrition for maturation',
  'produce_nutrition':'Nutrition for production','perennial':'Regrows after harvesting','weed_immune':'Immune to weeds',
  'can_grow_underground':'Can grow underground','water_drain_rate':'Water drain per source time tick',
  'uproot_loot':'Uprooting products','reagents_add':'Produce reagent settings','growing_time':'Growing time','harvest_amount':'Harvest amount'})
}
INTENT = {'name','desc','damfactor','penfactor','item_d_type','blade_class','reach','chargetime','clickcd',
          'recovery','swingdelay','chargedrain','releasedrain','no_attack','no_early_release'}
FIELDS = {field for _,fields in GROUPS.values() for field in fields} | INTENT | {
 'possible_item_intents','gripped_intents','component_type','parent_type','name','desc','is_tool'}
ZONES={'HEAD':'Head','CHEST':'Chest','GROIN':'Groin','VITALS':'Vitals','ARM_LEFT':'Left arm','ARM_RIGHT':'Right arm',
       'HAND_LEFT':'Left hand','HAND_RIGHT':'Right hand','LEG_LEFT':'Left leg','LEG_RIGHT':'Right leg',
       'FOOT_LEFT':'Left foot','FOOT_RIGHT':'Right foot','NECK':'Neck','MOUTH':'Mouth','EARS':'Ears','NOSE':'Nose',
       'LEFT_EYE':'Left eye','RIGHT_EYE':'Right eye','HAIR':'Hair'}
SLOTS={'ITEM_SLOT_BACK_L':'Left back','ITEM_SLOT_BACK_R':'Right back','ITEM_SLOT_MASK':'Mask',
 'ITEM_SLOT_NECK':'Neck','ITEM_SLOT_HANDS':'Hands','ITEM_SLOT_BELT':'Belt','ITEM_SLOT_HEAD':'Head',
 'ITEM_SLOT_SHOES':'Feet','ITEM_SLOT_GLOVES':'Gloves','ITEM_SLOT_RING':'Ring','ITEM_SLOT_HIP':'Hip',
 'ITEM_SLOT_ARMOR':'Armor','ITEM_SLOT_SHIRT':'Shirt','ITEM_SLOT_CLOAK':'Cloak','ITEM_SLOT_PANTS':'Pants',
 'ITEM_SLOT_WRISTS':'Wrists','ITEM_SLOT_EYES':'Eyes','ITEM_SLOT_POCKET':'Pocket exception',
 'ITEM_SLOT_DENYPOCKET':'Cannot go in pockets','ITEM_SLOT_BACKPACK':'Backpack'}
BOOLS={'sewrepair','can_parry','minstr_req','no_early_release','not_while_equipped','grid','perennial','weed_immune','can_grow_underground','gesture_required','human_req','antimagic_allowed','clothes_req','movement_interrupt'}
TIMES={'equip_delay_self','unequip_delay_self','work_time','fire_delay','reloadtime','maturation_time','produce_time'}
NOTES={
 'handling':'Initial source values. Damage, quality, enchantments and item interactions can change them. Item size is an inventory class, not weight in kilograms.',
 'weapon':'Force is the starting melee damage value, not guaranteed health damage. Attack mode, grip, stats, skill, quality, armor and item condition affect the result. A zero wielded override does not mean the weapon deals zero damage.',
 'armor':'Coverage lists the initial protected zones, not a chance to block. Armor ratings are source tiers or ratings, not percentages. Fit, layering, open visors, damaged or removed parts, and special effects can change protection.',
 'ranged':'The ammunition and projectile have their own properties. Shot damage, draw or reload speed and accuracy can also depend on the shooter and weapon state.',
 'tool':'A tool action-time multiplier is not a skill level. Check the preparation route for the required skill and workstation.',
 'container':'Capacity and transfer amounts use the game’s source reagent units. Grid space, item footprints, size limits and type restrictions apply together. The item-count ceiling is not the number of objects that fit in the grid. Additional insertion rules can be set during play.',
 'food':'Initial contents and processing targets come from the item definition. Runtime preparation, portion size, quality and serving can change the result.',
 'plant':'These are the initial source growth settings. Values without a stated time unit are not converted into minutes or seconds.',
 'reagent':'Liquid definitions describe the initial reagent. Effect strength depends on dose, metabolism and conditions in the effect handler. A zero overdose threshold does not establish that any dose is safe.',
 'spell':'Initial casting settings, before character modifiers and special cast checks. The charge system determines whether a recharge setting means time or a number of charges. Required items and restrictions can also be enforced by the spell handler.',
 'stack':'Initial quantity describes a newly created stack; it is not a crafting yield.'}


def unclosed_list(value):
    clean=re.sub(r'"(?:\\.|[^"\\])*"|\'[^\']*\'', '', value)
    return clean.count('(')>clean.count(')')


def expand(value,macros,trail=()):
    value=value.strip()
    if value in macros and value not in trail and len(trail)<12:
        return expand(macros[value],macros,(*trail,value))
    return value


def list_values(value):
    if not value.startswith('list(') or not value.endswith(')'):return None
    return [v.strip() for v in re.split(r',(?=(?:[^"\']|"[^"]*"|\'[^\']*\')*$)',value[5:-1]) if v.strip()]


def use_cases(path,fields,objects,constants,macros,number,literal):
    def name(typepath):
        value=objects.get(typepath,{}).get('name',{}).get('expression','')
        return literal(value) or typepath.rsplit('/',1)[-1].replace('_',' ')
    def flags(value,mapping):
        bits=number(value,constants)
        if bits is None:return None
        found=[label for key,label in mapping.items() if constants.get(key) and bits & int(constants[key])==int(constants[key])]
        known=0
        for key in mapping:known|=int(constants.get(key,0))
        if bits & ~known:found.append('Additional source flags: '+str(bits & ~known))
        return ', '.join(found) or 'None'
    def display(value,key=''):
        original=value;value=expand(value,macros)
        if key in {'body_parts_covered','cold_protection','heat_protection'}:
            return flags(value,ZONES) or 'Unresolved coverage: '+original
        if key in {'resistance_flags','prevent_crits','foodtype'} and re.fullmatch(r'[A-Z][A-Z_0-9]*(?:\s*\|\s*[A-Z][A-Z_0-9]*)*',original):
            return original.replace('|',', ').replace('_',' ').title()
        if key=='slot_flags':return flags(value,SLOTS) or 'Unresolved slots: '+original
        if key in BOOLS and value in {'TRUE','FALSE','null','0','1'}:return 'Yes' if value in {'TRUE','1'} else 'No'
        if value=='null':return 'None'
        if value.startswith('/') and re.fullmatch(r'/[\w/]+',value):return name(value)
        text=literal(value)
        if text is not None:return re.sub('<[^>]*>','',text)
        entries=list_values(value)
        if entries is not None:
            return '; '.join(((literal(pair[0].strip()) or display(pair[0].strip()))+': '+display(pair[1],key)) if len(pair:=v.split('=',1))==2 else display(v) for v in entries) or 'None'
        numeric=number(value,constants)
        if numeric is not None:
            if key in TIMES:return f'{numeric/10:g} seconds'
            if key in {'coverage','block_chance'}:return f'{numeric:g}%'
            if original.startswith(('WEIGHT_CLASS_','WLENGTH_','WBALANCE_','ARMOR_CLASS_')):
                return original.split('_',2)[-1].replace('_',' ').title()+f' ({numeric:g})'
            return f'{numeric:g}'
        if key in {'max_integrity','force','force_wielded','damage','minstr','wdefense','max_blade_int','volume','metabolization_rate'}:
            return 'Variable or unresolved: '+original[:180]
        if re.fullmatch(r'[A-Z][A-Z_0-9]*(?:\s*\|\s*[A-Z][A-Z_0-9]*)*',original):
            return original.replace('PREVENT_CRITS','Critical protection').replace('CRITICAL_RESISTANCE','Critical resistance').replace('_',' ').title()
        return 'Variable or unresolved: '+original[:180]
    groups=[]
    isweapon=path.startswith('/obj/item/rogueweapon/') or '/gun/' in path
    ranged=path.startswith(('/obj/item/gun/','/obj/item/ammo_','/obj/projectile/'))
    food='/food/' in path or '/grown/' in path or path.startswith('/obj/item/seeds/')
    for key,(title,labels) in GROUPS.items():
        if key=='handling' and not path.startswith(('/obj/item/','/obj/structure/')):continue
        if key=='reagent' and not path.startswith('/datum/reagent/'):continue
        if key=='spell' and not path.startswith('/obj/effect/proc_holder/spell/'):continue
        if key=='weapon' and not (isweapon or number(fields.get('force',{}).get('expression'),constants)):continue
        if key=='armor' and not path.startswith('/obj/item/clothing/'):continue
        if key=='ranged' and not ranged:continue
        if key=='tool' and not (fields.get('tool_behaviour',{}).get('expression') not in {None,'NONE','0','null'} or fields.get('is_tool',{}).get('expression')=='TRUE'):continue
        if key=='container' and not ('/reagent_containers/' in path or '/storage/' in path or fields.get('component_type')):continue
        if key=='food' and not food:continue
        if key=='stack' and '/stack/' not in path:continue
        if key=='plant' and not (path.startswith('/obj/item/seeds/') or fields.get('seed')):continue
        sourcefields=fields
        if key=='plant':
            seed=objects.get(fields.get('seed',{}).get('expression'),fields)
            sourcefields={**fields,**seed,**objects.get(seed.get('plant_def_type',{}).get('expression'),{})}
        if key=='container' and (component:=fields.get('component_type',{}).get('expression')) in objects:
            sourcefields={**fields,**objects[component]}
        facts=[]
        for field,label in labels.items():
            if field not in sourcefields:continue
            record=sourcefields[field]
            facts.append({'label':label,'value':display(record['expression'],field),'property':field,'source':record['source'],
                          **({'type':record['expression']} if record['expression'].startswith('/') else {})})
        if facts:groups.append({'id':key,'title':title,'facts':facts,'note':NOTES.get(key,'')})
    for mode,label in [('possible_item_intents','Attacks — standard grip'),('gripped_intents','Attacks — wielded grip')]:
        if mode not in fields or not (isweapon or number(fields.get('force',{}).get('expression'),constants)):continue
        values=list_values(expand(fields[mode]['expression'],macros))
        attacks=[]
        for value in values or []:
            target=expand(value,macros);intent=objects.get(target,{})
            if not intent:
                attacks.append({'name':'Attack not resolved','facts':[],'gap':value});continue
            attack={'name':name(target),'type':target,'description':literal(intent.get('desc',{}).get('expression','')) or '', 'facts':[]}
            for field,title in [('item_d_type','Armor damage channel'),('damfactor','Damage multiplier'),('penfactor','Penetration tier'),('reach','Reach (tiles)'),('chargetime','Base charge (deciseconds)'),('clickcd','Base click cooldown (deciseconds)'),('recovery','Stationary recovery (deciseconds)'),('swingdelay','Swing delay (deciseconds)'),('releasedrain','Release fatigue cost'),('chargedrain','Full-charge fatigue drain'),('no_early_release','Must fully charge')]:
                if field in intent:attack['facts'].append({'label':title,'value':display(intent[field]['expression'],field),'source':intent[field]['source']})
            attacks.append(attack)
        if attacks:groups.append({'id':mode,'title':label,'facts':[], 'attacks':attacks,'note':'Base intent settings; runtime overrides and character effects can change timings and damage. Deciseconds are tenths of a second.'})
    if ranged:
        mag=expand(fields.get('mag_type',{}).get('expression',''),macros)
        ammo=expand(fields.get('ammo_type',objects.get(mag,{}).get('ammo_type',{})).get('expression',''),macros)
        projectile=expand(fields.get('projectile_type',objects.get(ammo,{}).get('projectile_type',{})).get('expression',''),macros)
        for typepath,label in [(ammo,'Compatible ammunition'),(projectile,'Loaded projectile')]:
            if not typepath or typepath==path or typepath not in objects:continue
            target=objects[typepath];facts=[]
            for field,title in [('damage','Base damage'),('damage_type','Damage type'),('flag','Armor channel'),('armor_penetration','Penetration tier'),('max_ammo','Capacity')]:
                if field in target:facts.append({'label':title,'value':display(target[field]['expression'],field),'source':target[field]['source']})
            groups.append({'id':'linked-'+label,'title':label+': '+name(typepath),'type':typepath,'facts':facts,'note':'Default loaded type only; other compatible ammunition can have different damage and effects.'})
    return groups
