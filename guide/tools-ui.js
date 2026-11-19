/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function(){
  'use strict';
  const api=globalThis.GuideScenarioTools,data=globalThis.GUIDE_DATA,esc=globalThis.GuideCore?.escapeHTML||((s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  if(!api||!data)return;
  const q=s=>document.querySelector(s),byId=new Map(data.topics.map(t=>[t.id,t])),pending=new Map();
  const items=data.topics.filter(t=>t.section==='items').sort((a,b)=>a.title.localeCompare(b.title));
  const label=t=>t.title;
  const find=value=>items.find(t=>label(t)===value)||byId.get(value);
  async function load(value){
    const t=find(value);if(!t)throw Error('Choose an item from the catalogue suggestions.');
    if(t.detailLoaded||!data.detailBundles?.[t.id])return t;
    const file=data.detailBundles[t.id];
    if(!/^details\/[a-z0-9]+\.js$/.test(file))throw Error('Invalid local detail-bundle path.');
    if(!pending.has(file))pending.set(file,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=file+(data.contentVersion?'?v='+data.contentVersion:'');s.onload=resolve;s.onerror=()=>{pending.delete(file);reject(Error('Could not open the local item details. Keep details/ beside this page.'));};document.head.append(s);}));
    await pending.get(file);const detail=globalThis.GUIDE_TOPIC_DETAILS?.[t.id];if(!detail)throw Error('The item detail is missing from its bundle.');Object.assign(t,detail,{detailLoaded:true});return t;
  }
  const options=(rows,blank='Choose…')=>`<option value="">${esc(blank)}</option>`+rows.map(([value,name])=>`<option value="${esc(value)}">${esc(name)}</option>`).join('');
  const select=(name,title,rows,blank)=>`<label>${esc(title)}<select name="${name}">${options(rows,blank)}</select></label>`;
  const num=(name,title,value,min=0,max='',step='any')=>`<label>${esc(title)}<input name="${name}" type="number" min="${min}" ${max!==''?`max="${max}"`:''} step="${step}" value="${value}" required></label>`;
  const check=(name,title,checked=false)=>`<label class="scenario-check"><input name="${name}" type="checkbox" ${checked?'checked':''}>${esc(title)}</label>`;
  const picker=(name,title,id)=>`<label>${esc(title)}<input name="${name}" list="scenario-items" value="${esc(byId.has(id)?label(byId.get(id)):'')}" autocomplete="off" required></label>`;
  const skill=(name,title,level=2)=>select(name,title,Array.from({length:7},(_,i)=>[i,['Untrained','Novice','Apprentice','Journeyman','Expert','Master','Legendary'][i]]));
  const fmt=n=>Number.isFinite(n)?Number(n.toFixed(2)).toLocaleString():'Unknown';
  const duration=n=>Number.isFinite(n)?(n>=60?fmt(n/60)+' min':fmt(n)+' sec'):'Unknown';
  const link=t=>`<a href="index.html#topic=${encodeURIComponent(t.id)}">${esc(t.title)} ↗</a>`;
  const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const note=text=>`<p class="scenario-note">${esc(text)}</p>`;
  const sources={cauldron:'code/modules/roguetown/roguecrafting/alchemy/cauldron.dm#L55',smelting:'code/modules/roguetown/roguejobs/blacksmith/smelter.dm#L131',farming:'code/modules/farming/soil.dm#L660',brewing:'code/modules/farming/fermentation_keg.dm#L320',weapons:'code/game/objects/items/rogueweapons/intents.dm',armor:'code/modules/mob/living/living_defense.dm#L12'};
  const names={cauldron:'Cauldron potency',smelting:'Furnace batch',farming:'Crop conditions',brewing:'Brewing timeline',weapons:'Base attacks',armor:'One armor channel'};
  let active='cauldron';
  const values=form=>Object.fromEntries(new FormData(form));
  const records=data.scenarioData?.cauldron;
  function formHTML(){
    if(active==='cauldron')return `<fieldset><legend>Ingredient items</legend>${Array.from({length:4},(_,i)=>select('ingredient'+i,'Ingredient '+(i+1),(records?.ingredients||[]).map(r=>[r.type,r.name]),'Empty slot')).join('')}</fieldset><fieldset><legend>Cauldron state</legend>${num('water','Water (source units; 90 = 30 drams)',90)}${skill('skill','Alchemy level')}${check('portable','Folding cauldron: 3 slots, 60 water units')}${check('lit','Cauldron is lit',true)}<p>The game rejects duplicate ingredient types. Highest competing potency wins at five or more points; major/medium/minor contribute 3/2/1.</p></fieldset>`;
    if(active==='smelting')return `<fieldset><legend>Inputs’ smelting results</legend><p class="scenario-note">Choose each input’s “Smelts into” type. These are result identities, not fuel added to the fire.</p>${Array.from({length:4},(_,i)=>select('input'+i,'Input '+(i+1),[['/obj/item/rogueore/coal','Coal'],['/obj/item/rogueore/coal/charcoal','Charcoal'],...['iron','copper','tin','aaslag','gold','silver','steel','bronze','blacksteel'].map(n=>['/obj/item/ingot/'+n,n+' bar'])],'Empty slot')).join('')}</fieldset><fieldset><legend>Furnace</legend>${check('great','Great furnace (four-item capacity)',true)}${skill('skill','Smelting level')}<p>Keep the fire fueled separately. Right-click inserts a fuel-capable item for smelting. This checker assumes the furnace remains lit.</p></fieldset>`;
    if(active==='farming')return `<fieldset><legend>Ordinary crop</legend>${picker('crop','Crop or produce entry','item-wheat-grain')}${num('weeds','Weeds (% of maximum)',0,0,100)}${num('health','Plant health (% of maximum)',100,0,100)}${check('water','Enough water throughout',true)}${check('nutrition','Enough nutrition throughout',true)}${check('underground','Underground / no sky')}${check('dead','Plant is dead')}${check('ready','Produce already ready for harvest')}</fieldset><fieldset><legend>Constant conditions</legend>${check('tilled','Tilled ×1.6')}${check('fertilized','Fertilized ×2')}${check('pollinated','Pollinated ×1.75')}${check('dendorFertility','Dendor fertility world trait ×2')}${check('fertility','Fertility world trait ×1.5')}${check('drought','Dendor drought world trait ×0.4')}${check('blessed','Blessed soil +20%')}${check('livingLight','Living Light +10%')}${check('rune','Dendor rune +5%')}<small>Natural bonuses add together, capped at 35%. Timers assume these effects and sufficient resources persist.</small></fieldset>`;
    if(active==='brewing')return `<fieldset><legend>Recorded recipe</legend>${picker('brew','Brewed drink or recipe entry','sheet-8-r5')}${num('elapsed','Elapsed since starting (seconds)',0)}<small>Use a drink entry with imported Brewing information.</small></fieldset><fieldset><legend>Equipment and heat</legend>${check('heated','Using a heated distiller')}<small>A heated distiller halves a non-heat recipe’s timer. Heat-requiring progress assumes continuously sufficient heat; elapsed time alone cannot establish readiness in a round.</small></fieldset>`;
    if(active==='weapons')return ['a','b'].map((n,i)=>`<fieldset><legend>Weapon ${i+1}</legend>${picker('weapon'+n,'Weapon',items.find(t=>t.title==='greatsword')?.id)}<label>Attack and grip<select name="attack${n}"><option>Loading recorded attacks…</option></select></label></fieldset>`).join('');
    return `<fieldset><legend>Incoming hit</legend>${num('damage','Incoming damage before this check',100)}${select('channel','Armor channel',['blunt','slash','stab','piercing','fire','acid','bullet'].map(n=>[n,n]))}${num('penetration','Penetration tier',3,0,5,1)}${check('chunked','Sharp weapon is chunked (≤20% blade integrity)')}</fieldset><fieldset><legend>Effective protection</legend>${picker('armorItem','Optional armor page (clear to enter tier manually)',items.find(t=>t.title==='Steel Half-Plate')?.id)}${num('tier','Effective tier (used only with no armor page)',3,0,5,1)}<small>The selected item supplies its recorded channel rating. It must actually cover the struck body zone. No fit, layers, armor damage, breakage, debuffs or overflow is simulated.</small></fieldset>`;
  }
  function render(){
    q('#scenario-tabs').innerHTML=Object.entries(names).map(([key,name])=>`<button type="button" data-tool="${key}" aria-pressed="${key===active}">${esc(name)}</button>`).join('');
    q('#scenario-workspace').innerHTML=`<h2>${names[active]}</h2><form id="scenario-form" class="scenario-form">${formHTML()}<button class="scenario-wide" type="submit">Check scenario</button></form><div id="scenario-output" class="scenario-result" role="status" aria-live="polite">Choose inputs, then check the scenario.</div><details class="scenario-evidence"><summary>Source and limits</summary><p>Rules are pinned to retained Ratwood source revision ${api.revision.slice(0,7)}. They do not identify a live server’s configuration or state.</p><a href="${api.source(sources[active])}" target="_blank" rel="noopener">Read the source handler ↗</a><p><a href="sources/current-native-mechanics.json">Read the isolated native test record</a>.</p><p>Unknown quantities remain unknown. These tools do not track inventory, predict full combat damage or run a live countdown.</p></details><datalist id="scenario-items">${items.map(t=>`<option value="${esc(label(t))}"></option>`).join('')}</datalist>`;
    if(active==='cauldron'){q('[name=skill]').value='2';if(records){q('[name=ingredient0]').value='/obj/item/alch/coaldust';q('[name=ingredient1]').value='/obj/item/alch/silverdust';}else q('#scenario-output').textContent='Cauldron potency records are unavailable in this bundle; rebuild the pinned source data.';}
    if(active==='smelting'){q('[name=skill]').value='2';for(const [i,type]of ['/obj/item/rogueore/coal',...Array(3).fill('/obj/item/ingot/iron')].entries())q(`[name=input${i}]`).value=type;}
    if(active==='armor'){q('[name=channel]').value='slash';q('[name=armorItem]').required=false;}
    if(active==='weapons'){updateAttacks('a');updateAttacks('b');}
  }
  async function updateAttacks(n){
    const input=q(`[name=weapon${n}]`),target=q(`[name=attack${n}]`);if(!input||!target)return;
    const value=input.value;
    try{const t=await load(value);if(!target.isConnected||input.value!==value)return;const attacks=(t.itemProperties?.useCases||[]).flatMap(g=>(g.attacks||[]).map((a,i)=>({value:g.id+':'+i,name:a.name+' · '+(g.id==='gripped_intents'?'wielded':'standard')})));target.innerHTML=options(attacks.map(a=>[a.value,a.name]),'Choose attack');if(attacks.length)target.value=attacks[0].value;}catch(e){if(target.isConnected)target.innerHTML=`<option value="">${esc(e.message)}</option>`;}
  }
  async function calculate(form){
    const v=values(form),on=n=>v[n]==='on';let html='';
    if(data.currentSource?.revision&&data.currentSource.revision!==api.revision)throw Error('These scenario rules need review against this bundle’s newer source revision.');
    if(active==='cauldron'){
      if(!records||data.scenarioData?.held)throw Error('Pinned cauldron records are unavailable.');
      const r=api.cauldron([0,1,2,3].map(i=>v['ingredient'+i]).filter(Boolean),records,{water:v.water,skill:v.skill,lit:on('lit'),portable:on('portable')});
      html=`<h3>${esc(({ready:'Potency and skill conditions met',tie:'Tied highest potency',water:'Not enough water',unlit:'Fire is out',insufficient:'No recipe reaches five points','skill-failure':'Skill failure','unknown-skill':'Skill gate unknown'})[r.state])}</h3>${table(['Competing recipe','Points','Required skill'],r.ranked.map(r=>[r.name||r.type,r.score,r.skillRequired??'Unknown']))}${r.winner?.topicId?`<p><a href="index.html#topic=${encodeURIComponent(r.winner.topicId)}">Open ${esc(r.winner.name)} recipe</a></p>${r.winner.outputQuantity!=null?note('Fixed yield: '+r.winner.outputQuantity+' '+r.winner.outputUnit):''}`:''}${note(r.note)}${note('Completion requires 20 brewing progress calls and the following handler call to resolve. Process ticks are not converted to wall-clock seconds.')}`;
    }else if(active==='smelting'){
      const r=api.smelting([0,1,2,3].map(i=>v['input'+i]).filter(Boolean),{great:on('great'),skill:v.skill});
      html=`<h3>${esc(r.alloy?r.quantity+' '+r.alloy+' bars':r.quantity+' ordinary result item(s)')}</h3><p>${r.ticks} process ticks before the completion call.</p>${note(r.note)}${table(['Insertion quality tier','Probability'],Object.entries(r.quality).map(([tier,p])=>[tier,fmt(p*100)+'%']))}${note('These are per-input insertion rolls, not an exact probability forecast of final alloy quality. Fuel is not included in the alloy input count.')}`;
    }else if(active==='farming'){
      const t=await load(v.crop),m=api.fact(t,'maturation_time'),p=api.fact(t,'produce_time');
      if(!m?.value?.endsWith(' seconds')||!p?.value?.endsWith(' seconds'))throw Error('This entry has no confirmed ordinary-crop maturation and production timers.');
      const r=api.farming({...Object.fromEntries(['tilled','fertilized','pollinated','dendorFertility','fertility','drought','blessed','livingLight','rune','water','nutrition','underground','dead','ready'].map(n=>[n,on(n)])),water:on('water')||api.fact(t,'water_drain_rate')?.value==='0',maturation:parseFloat(m.value),production:parseFloat(p.value),weeds:v.weeds,health:v.health,canUnderground:api.fact(t,'can_grow_underground')?.value==='Yes'});
      html=`<h3>${r.stalls.length?'Growth stalled':'Idealized growth ×'+fmt(r.multiplier)}</h3><p>${link(t)}</p>`+(r.stalls.length?`<ul>${r.stalls.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:`<div class="scenario-visual"><div>Maturation<strong>${duration(r.maturationSeconds)}</strong></div><div>Then production<strong>${duration(r.productionSeconds)}</strong></div><div>Combined estimate<strong>${duration(r.totalSeconds)}</strong></div></div>`)+note('From a newly planted ordinary crop, assuming constant conditions and adequate nutrition/water for both stages. Buffs expire, stages advance on process calls, and growth consumes resources. This is not a harvest promise or a timer for seedlings, trees or bushes.');
    }else if(active==='brewing'){
      const t=await load(v.brew),b=t.itemProperties?.brewing;if(!b)throw Error('This entry has no imported brewing timeline. Choose a brewed drink entry.');
      const heat=data.scenarioData?.brewing?.find(r=>r.type===b.recipeType);if(!heat)throw Error('The exact recipe’s heating requirement has not been confirmed.');
      const r=api.brewing(b,{elapsed:v.elapsed,heated:on('heated'),heatRequired:heat.heatRequired});
      html=`<h3>${r.blocked?'Heating equipment required':r.conditional?'Conditional heated timeline':r.remainingSeconds?'Brewing stage':'Pouring stage: '+esc(r.stage)}</h3><p>${link(t)}</p>`+note(heat.heatRequired?'Recipe heat condition: stay above '+heat.minimumHeatKelvin+' K.':'This recorded recipe has no heat requirement.')+(r.blocked?'':`<div class="scenario-visual"><div>Ideal brew time<strong>${duration(r.brewSeconds)}</strong></div><div>Remaining under assumptions<strong>${duration(r.remainingSeconds)}</strong></div><div>Time aging after brew<strong>${duration(r.ageSeconds)}</strong></div></div>${table(['Aging stage','After brewing (strictly greater than)','After ideal start'],r.stages.map(s=>[s.name||s.type,duration(s.afterBrewSeconds),duration(s.afterStartSeconds)]))}`)+note(r.note)+note(b.conditions||'');
    }else if(active==='weapons'){
      const results=[];for(const n of ['a','b']){const t=await load(v['weapon'+n]),[id,index]=v['attack'+n].split(':'),g=t.itemProperties?.useCases?.find(g=>g.id===id),a=g?.attacks?.[Number(index)];if(!a)throw Error('Choose a recorded attack for each weapon.');results.push({t,...api.weaponAttack(t,a,{wielded:id==='gripped_intents'})});}
      html=`<h3>Base attack comparison</h3>${table(['Weapon','Attack','Force','Multiplier','Base attack','Channel'],results.map(r=>[r.t.title,r.name,r.force,r.multiplier,fmt(r.baseAttack),r.channel]))}<p class="scenario-links">${results.map(r=>link(r.t)).join(' ')}</p>${note(results[0].note)}`;
    }else{
      let tier=v.tier,t;if(v.armorItem){t=await load(v.armorItem);const ratings=api.fact(t,'armor')?.value||'',match=ratings.match(new RegExp('(?:^|;\\s*)'+v.channel+':\\s*([0-9.]+)'));if(!match)throw Error('This item has no confirmed rating for the selected channel.');tier=Number(match[1]);}
      const r=api.armor({damage:v.damage,tier,penetration:v.penetration,channel:v.channel,chunked:on('chunked')});
      html=`<h3>${fmt(r.passed)} nominal damage passed beyond this check</h3>${t?`<p>${link(t)} · effective ${esc(v.channel)} tier ${esc(tier)}</p>`:''}${note(r.note)}${note('Blunt can pass zero damage while damaging armor. A fully blocked branch may return a damage ×10 sentinel; that value is not extra damage inflicted on armor.')}`;
    }
    return html;
  }
  q('#scenario-version').textContent='Retained source '+api.revision.slice(0,7)+' · Source formulas; executable checks cover selected armor, furnace and cauldron cases. No live-server state.';
  q('#scenario-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b){active=b.dataset.tool;render();}});
  q('#scenario-workspace').addEventListener('change',e=>{if(e.target.name==='weapona')updateAttacks('a');if(e.target.name==='weaponb')updateAttacks('b');});
  q('#scenario-workspace').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,output=q('#scenario-output'),button=form.querySelector('[type=submit]');button.disabled=true;output.textContent='Checking the source scenario…';try{const html=await calculate(form);if(output.isConnected)output.innerHTML=html;}catch(err){if(output.isConnected)output.innerHTML=`<p class="scenario-error">${esc(err.message)}</p>`;}finally{button.disabled=false;}});
  render();
})();
