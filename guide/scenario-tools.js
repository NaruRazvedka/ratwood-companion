/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function(root){
  'use strict';
  const revision='2d61e02c69520dacb0f4edc1d269395713cbeafb';
  const source=file=>`https://github.com/Rotwood-Vale/Ratwood-2.0/blob/${revision}/${file}`;
  function number(value,name,min=0,max=Infinity){if(value===null||value===''||typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw Error(`${name} must be a number between ${min} and ${max===Infinity?'no upper limit':max}.`);return Number(value);}
  const facts=t=>(t?.itemProperties?.useCases||[]).flatMap(g=>g.facts||[]);
  const fact=(t,key)=>facts(t).find(f=>f.property===key);
  function cauldron(inputs,records,{water=90,skill=2,lit=true,portable=false}={}){
    if(!Array.isArray(inputs)||inputs.length<1||inputs.length>(portable?3:4))throw Error('This cauldron accepts '+(portable?'one to three':'one to four')+' distinct ingredient items.');
    if(new Set(inputs).size!==inputs.length)throw Error('The game rejects duplicate ingredient types.');
    water=number(water,'Water');skill=number(skill,'Alchemy skill',0,6);
    const scores=new Map(),byType=new Map(records.ingredients.map(i=>[i.type,i]));
    for(const type of inputs){const i=byType.get(type);if(!i)throw Error('An ingredient has no confirmed potency record.');for(const [key,points]of [['major',3],['medium',2],['minor',1]])if(i[key])scores.set(i[key],(scores.get(i[key])||0)+points);}
    const ranked=[...scores].map(([type,score])=>({type,score,...records.recipes.find(r=>r.type===type)})).sort((a,b)=>b.score-a.score);
    const leaders=ranked.filter(r=>r.score===ranked[0]?.score),winner=leaders.length===1&&leaders[0].score>=5?leaders[0]:null;
    const state=!lit?'unlit':water<(portable?60:90)?'water':!ranked.length||ranked[0].score<5?'insufficient':leaders.length>1?'tie':!Number.isFinite(winner?.skillRequired)?'unknown-skill':skill<winner.skillRequired?'skill-failure':'ready';
    return {state,ranked,winner,leaders,note:state==='tie'?'Highest scores are tied; no winner is promised.':state==='skill-failure'?'The recipe skill gate fails: water and ingredients turn into yuck.':state==='ready'?'At least five points and the skill gate are met. Outputs belong to the recipe, not to water quantity.':'Check the listed condition before brewing.'};
  }
  function smelting(inputs,{great=false,skill=0}={}){
    skill=number(skill,'Smelting skill',0,6);if(!Number.isInteger(skill))throw Error('Skill must be a whole level.');
    if(!inputs.length||inputs.length>(great?4:1))throw Error(`This furnace accepts ${great?'one to four inputs':'one input'}.`);
    const count={};for(const t of inputs){if(typeof t!=='string'||!t.startsWith('/obj/item/'))throw Error('Every input needs its confirmed smeltresult type.');count[t]=(count[t]||0)+1;}
    const n=suffix=>count['/obj/item/'+suffix]||0;
    let alloy=null,quantity=inputs.length;
    if(great){if(n('rogueore/coal')+n('rogueore/coal/charcoal')===1&&n('ingot/iron')===3){alloy='steel';quantity=4;}
      else if(n('ingot/tin')+2*n('ingot/copper')===7){alloy='bronze';quantity=4;}
      else if(3*n('ingot/aaslag')+2*n('ingot/gold')===11){alloy='gilbranze';quantity=4;}
      else if(n('ingot/silver')+2*n('ingot/steel')===7){alloy='blacksteel';quantity=2;}}
    const quality={};if(skill===6)quality[6]=1;else{const lo=skill*15+10,hi=Math.max(30,skill*25);for(let roll=lo;roll<=hi;roll++){const tier=Math.min(6,Math.floor(roll/25)+1);quality[tier]=(quality[tier]||0)+1;}for(const tier of Object.keys(quality))quality[tier]/=hi-lo+1;}
    return {alloy,quantity,outputs:alloy?[{type:'/obj/item/ingot/'+alloy,amount:quantity}]:inputs.map(type=>({type,amount:1})),ticks:great?30:20,quality,note:alloy?'Alloy quality uses the rounded-down combined input-quality calculation, including the handler’s initial spoil-tier offset. Individual insertion-roll probabilities are shown below.':'One ordinary result per input. smelt_bar_num does not multiply this yield.'};
  }
  function farming({maturation,production,tilled=false,fertilized=false,pollinated=false,dendorFertility=false,fertility=false,drought=false,blessed=false,livingLight=false,rune=false,weeds=0,health=100,water=true,nutrition=true,underground=false,canUnderground=false,dead=false,ready=false}={}){
    maturation=number(maturation,'Maturation seconds',0.001);production=number(production,'Production seconds',0.001);weeds=number(weeds,'Weeds %',0,100);health=number(health,'Health %',0,100);
    const stalls=[];if(dead)stalls.push('Plant is dead');if(ready)stalls.push('Ripe produce already awaits harvest');if(!water)stalls.push('No water for a water-consuming crop');if(!nutrition)stalls.push('No nutrition');if(underground&&!canUnderground)stalls.push('This crop cannot grow underground');
    let multiplier=(tilled?1.6:1)*(fertilized?2:1)*(pollinated?1.75:1)*(dendorFertility?2:1)*(fertility?1.5:1)*(drought?.4:1)*(1+Math.min(.35,(blessed?.2:0)+(livingLight?.1:0)+(rune?.05:0)));
    if(weeds>=30)multiplier*=.75;if(weeds>=60)multiplier*=.75;if(health<=60)multiplier*=.75;if(health<=30)multiplier*=.75;
    if(stalls.length)return {stalls,multiplier:0,maturationSeconds:null,productionSeconds:null,totalSeconds:null};
    return {stalls,multiplier,maturationSeconds:maturation/multiplier,productionSeconds:production/multiplier,totalSeconds:(maturation+production)/multiplier};
  }
  function brewing(record,{heated=false,heatRequired=false,elapsed=0}={}){
    const seconds=number(record?.brewSeconds,'Recorded brew seconds',0.001);elapsed=number(elapsed,'Elapsed seconds');
    if(heatRequired&&!heated)return {blocked:true,note:'This recipe needs a heated distiller.'};
    const brewSeconds=seconds*(heated&&!heatRequired?.5:1),stages=(record.ageTimes||[]).map(s=>({...s,afterBrewSeconds:number(s.seconds,'Aging threshold'),afterStartSeconds:brewSeconds+number(s.seconds,'Aging threshold')}));
    return {blocked:false,brewSeconds,remainingSeconds:Math.max(0,brewSeconds-elapsed),ageSeconds:Math.max(0,elapsed-brewSeconds),stages,stage:stages.filter(s=>elapsed>s.afterStartSeconds).at(-1)?.name||'Base recipe',conditional:heatRequired,note:'Aging thresholds use strictly greater elapsed time. Aging is measured after brewing when pouring; bottling has a recorded age-reset discrepancy. Heated progress assumes continuous sufficient heat.'};
  }
  function weaponAttack(topic,attack,{wielded=false}={}){
    const base=number(fact(topic,'force')?.value,'Recorded base force');
    const override=fact(topic,'force_wielded')?.value;
    const force=wielded&&override!=null&&Number(override)>0?number(override,'Wielded force'):base;
    const multiplier=number(attack?.facts?.find(f=>f.label==='Damage multiplier')?.value,'Recorded attack multiplier');
    return {force,multiplier,baseAttack:force*multiplier,name:attack.name,channel:attack.facts.find(f=>f.label==='Armor damage channel')?.value||'Unknown',note:'Base force × intent multiplier only. Stats, skills, quality, grip changes, sharpness, timing, armor and target state are not simulated; this is not HP damage or DPS.'};
  }
  function armor({damage,tier,penetration=0,channel='slash',chunked=false}={}){
    damage=number(damage,'Incoming damage');tier=number(tier,'Armor tier',0,10);penetration=number(penetration,'Penetration tier',0,10);
    if(!['blunt','slash','stab','piercing','fire','acid','bullet'].includes(channel))throw Error('Choose a supported armor channel.');
    let passed=damage,blocked=0;
    if(channel==='blunt'&&tier>0)blocked=damage;
    else if(['fire','acid','bullet'].includes(channel)&&tier>0)blocked=damage*(1-1/(1+.2*tier));
    else if(tier>0){if(channel==='piercing')blocked=penetration>=tier?damage*.8:damage*10;else blocked=penetration>=tier&&penetration>0?damage*(1-(.4+penetration*.1)):damage*10;}
    if(chunked&&channel!=='blunt')blocked=damage*10;
    passed=Math.max(0,damage-blocked);
    return {blocked,passed,note:'Single run_armor_check branch with a supplied effective tier. No equipment coverage, layers, destruction, integrity overflow, debuffs, resistance or final HP application is simulated. Projectile piercing uses 20% passage at equal OR greater penetration in this handler.'};
  }
  const api={revision,source,facts,fact,cauldron,smelting,farming,brewing,weaponAttack,armor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GuideScenarioTools=api;
})(globalThis);
