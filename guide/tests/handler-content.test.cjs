/* SPDX-License-Identifier: AGPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {apply,revision}=require('../tools/handler-content.cjs');
const initial=require('../data.js'),data=apply(structuredClone(initial));
const topic=type=>data.topics.find(t=>(t.sourceObjectType||t.sourceType)===type);
const grown='/obj/item/reagent_containers/food/snacks/grown/';
const retained=file=>fs.readFileSync(path.join(__dirname,'../sources/ratwood-current',file),'utf8');
test('wheat acquisition stays type-distinct through harvest, shucking, seed extraction and milling',()=>{
  const stalk=topic('/obj/item/natural/chaff/wheat'),grain=topic(grown+'wheat'),seed=topic('/obj/item/seeds/wheat'),flour=topic('/obj/item/reagent_containers/powder/flour');
  assert.equal(grain.id,'item-wheat-grain');assert.equal(stalk.id,'prep-73df1beff713');
  assert.equal(stalk.recipeRoutes.find(r=>r.method==='Farming').ingredients[0].id,seed.id);
  const shuck=grain.recipeRoutes.find(r=>r.method==='Shucking');
  assert.equal(shuck.ingredients[0].id,stalk.id);assert.equal(shuck.outputQuantity,1);
  assert.equal(shuck.coProducts[0].type,'/obj/item/natural/fibers');assert.equal(shuck.coProducts[0].amount,1);
  assert.match(shuck.requirements.join(' '),/Empty active hand/);
  const thresh=grain.recipeRoutes.find(r=>r.method==='Threshing');
  assert.equal(thresh.tools[0].type,'/obj/item/rogueweapon/mace/woodclub');
  assert.match(thresh.steps.join(' '),/targeted stalk.*directly/);
  const extraction=seed.recipeRoutes.find(r=>r.method==='Seed extraction');
  assert.equal(extraction.outputQuantity,null);assert.equal(extraction.destructive,true);
  assert.match(extraction.steps.join(' '),/5% failure/);assert.match(extraction.steps.join(' '),/1–4/);
  const milling=flour.recipeRoutes.find(r=>r.method==='Millstone'&&r.ingredients[0].id===grain.id);
  assert.equal(milling.outputQuantity,1);assert.equal(milling.tools[0].id,topic('/obj/item/millstone').id);
  assert.match(retained('code/modules/farming/produce.dm'),/mill_result = \/obj\/item\/reagent_containers\/powder\/flour/);
});
test('drying rack use preserves its build recipes and variable leather yield',()=>{
  const rack=topic('/obj/machinery/tanningrack'),leather=topic('/obj/item/natural/hide/cured');
  const r=leather.recipeRoutes.find(r=>r.method==='Drying rack');
  assert.equal(r.ingredients[0].type,'/obj/item/natural/hide');assert.equal(r.outputQuantity,null);
  assert.match(r.requirements.join(' '),/Anchored rack/);assert.match(r.steps.join(' '),/min\(Skincraft level \+ 1, 6\)/);
  assert.equal(r.coProducts[0].amount,null);
  assert.match(rack.sections.find(s=>s.title==='Use').text,/stake toggles anchoring/);
  assert.deepEqual(rack.preparationRoutes,initial.topics.find(t=>t.id===rack.id).preparationRoutes);
  assert.match(retained('code/modules/roguetown/roguejobs/tailor/tanning.dm'),/rand\(1, min\(skill_level \+ 1, 6\)\)/);
});
test('smelting handlers use one output despite multi-bar declarations and distinguish alloy capacity',()=>{
  const iron=topic('/obj/item/ingot/iron');
  const r=iron.recipeRoutes.find(r=>r.method==='Stone furnace'&&r.ingredients[0].type==='/obj/item/rogueore/iron');
  assert.equal(r.outputQuantity,1);assert.match(r.steps.join(' '),/multi-bar smelting is disabled/);
  assert.equal(r.tools.find(t=>t.role==='station').type,'/obj/machinery/light/rogue/smelter');
  const normal=topic('/obj/machinery/light/rogue/smelter').sections[0].text;
  const great=topic('/obj/machinery/light/rogue/smelter/great').sections[0].text;
  assert.match(normal,/holds one item and uses 20 process ticks/);assert.match(great,/holds four inputs and uses 30 process ticks/);
  assert.match(great,/smeltresult types/);assert.match(normal,/fuel\/smelt choice/);assert.match(normal,/quality.*insertion/);
  const steel=topic('/obj/item/ingot/steel').recipeRoutes.find(r=>r.method==='Great furnace alloy');
  assert.equal(steel.outputQuantity,4);assert.deepEqual(steel.ingredients.map(i=>i.amount),[1,3]);
  assert.match(retained('code/modules/roguetown/roguejobs/blacksmith/smelter.dm'),/\/\/ while\(item.smelt_bar_num\)/);
});
test('all handler links resolve and application is idempotent without removing existing IDs',()=>{
  const ids=new Set(data.topics.map(t=>t.id));
  for(const t of initial.topics)assert.ok(ids.has(t.id),t.id);
  for(const t of data.topics)for(const r of t.recipeRoutes||[]){
    if(r.sourceRevision!==revision||!r.id.startsWith('handler-'))continue;
    for(const i of [...r.ingredients,...r.tools,...r.coProducts])assert.ok(ids.has(i.id),i.type);
    assert.ok(r.sources.every(s=>s.url.includes('/'+revision+'/')));
  }
  const before=JSON.stringify(data);assert.equal(JSON.stringify(apply(data)),before);
});
test('Sinew keeps actual imported butchery routes and gains an acquisition lead',()=>{
  const t=topic('/obj/item/alch/sinew');assert.match(t.summary,/butchering animals/);
  assert.deepEqual(t.recipeRoutes,initial.topics.find(old=>old.id===t.id).recipeRoutes);
});
