const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const data=require('../data.js');
const core=require('../core.js');
const auditFile=path.join(__dirname,'../sources/recipe-guidance-audit.json');
const audit=fs.existsSync(auditFile)?JSON.parse(fs.readFileSync(auditFile,'utf8')):null;
const routes=require('../sources/ratwood2-preparation-routes.json');
const byId=new Map(data.topics.map(t=>[t.id,t]));

test('each catalogue item has an explicit procedure audit result',()=>{
  const items=data.topics.filter(t=>t.section==='items');
  if(audit){
    assert.equal(audit.items.length,items.length);
    assert.equal(new Set(audit.items.map(r=>r.id)).size,items.length);
    for(const row of audit.items){assert.ok(byId.has(row.id));assert.ok(row.note);}
    assert.equal(audit.processingCoverage.length,routes.length);
    for(const row of audit.processingCoverage)if(row.topicId)assert.ok(byId.has(row.topicId));
  }
  for(const item of items)assert.ok(['source','incomplete','conflict'].includes(core.recipeProfile(item).evidence),item.id);
  for(const t of items)for(const r of t.preparationRoutes||[]){assert.equal(r.evidence,'source');assert.ok(r.steps.length);for(const i of r.ingredients)if(i.id)assert.ok(byId.has(i.id));}
});

test('hardtack chain includes table rolling, sharp-tool scoring, two slabs, and final baking',()=>{
  const hardtack=data.topics.find(t=>t.title==='Hardtack');
  assert.match(hardtack.steps.join(' '),/Bake crackerdough.*oven/);
  const slab=data.topics.find(t=>t.sourceObjectType==='/obj/item/reagent_containers/food/snacks/rogue/foodbase/hardtack_raw');
  assert.ok(slab.aliases.includes('Slab of dough'));
  assert.equal(slab.preparationRoutes[0].outputQuantity,2);
  assert.ok(slab.requirements.includes('Table'));
  assert.ok(slab.requirements.includes('Sharp tool'));
  const tree=core.preparationTree(hardtack.id,byId),names=[];
  function visit(n){names.push(byId.get(n.id)?.title);for(const g of n.groups)for(const o of g.options)if(o.node)visit(o.node);}
  visit(tree);
  for(const name of ['FlatDough','Dough','unfinished dough','Flour'])assert.ok(names.includes(name),name);
  assert.ok(core.search(core.indexTopics(data.topics),{section:'items',query:'slab of dough'}).some(t=>t.id===slab.id));
});

test('non-food recipes preserve smithing and sewing requirements',()=>{
  for(const method of ['Smithing','Crafting menu','Alchemical grinding']){
    const t=data.topics.find(t=>t.preparationRoutes?.some(r=>r.method===method));assert.ok(t,method);
    const route=t.preparationRoutes.find(r=>r.method===method);assert.ok(route.ingredients.length);assert.ok(route.requirements.length);assert.ok(route.source.includes('#L'));
  }
  const dwarf=routes.find(r=>r.steps?.length&&r.requirements.some(s=>/Dwarven Chef/.test(s)));
  assert.ok(dwarf);
});

test('wine values distinguish untapped keg, sealed bottle, and variable appraisal',()=>{
  const wine=data.topics.find(t=>t.title==='Wine-Raspberry').itemProperties;
  assert.equal(wine.brewing.recipeQuote,50);assert.equal(wine.brewing.barrelValue,65);assert.equal(wine.brewing.bottleValue,8);
  assert.match(wine.value.conditions,/tapping.*zero/i);assert.match(wine.value.conditions,/not guaranteed/);
  assert.match(data.topics.find(t=>t.title==='Dough').itemProperties.value.label,/No fixed base value/);
  for(const title of ['Aqua Vitae','Aqua Vitae-Pear','Rice Spirits'])assert.ok(data.topics.find(t=>t.title===title).itemProperties?.brewing,title);
});

test('shared display names cannot replace poisoned berries or raw/cooked ingredients',()=>{
  const ordinary=byId.get('sheet-7-r200'),poisoned=byId.get('sheet-7-r201');
  assert.notEqual(ordinary.sourceObjectType,poisoned.sourceObjectType);
  const poison=poisoned.potRecipes[0].inputs[0];
  assert.ok(poison.type.endsWith('/poison'));
  assert.equal(byId.get(poison.id).sourceObjectType,poison.type);
  assert.ok(!ordinary.potRecipes.some(r=>r.inputs.some(i=>i.type.endsWith('/poison'))));
  for(const t of data.topics)for(const r of t.potRecipes||[])for(const i of r.inputs)assert.equal(byId.get(i.id).sourceObjectType,i.type,t.title+' / '+i.name);
});

test('all items have a bundled fallback icon, including drinks outside the Drinks category',()=>{
  for(const t of data.topics.filter(t=>t.section==='items')){
    const icon=core.placeholderIcon(t);assert.match(icon,/^[a-z]+$/);
    assert.ok(fs.existsSync(path.join(__dirname,'../assets/icons',icon+'.svg')),t.title);
  }
  assert.equal(core.placeholderIcon({title:'Barrel',category:'Tools & stations'}),'barrel');
  assert.equal(core.liquidIcon({title:'Apple Cider',category:'Plants & crops',section:'items'}),'tankard');
  assert.equal(core.liquidIcon({title:'Roast Coffee Beans',category:'Prepared ingredients',section:'items'}),null);
});

test('actual article renderers show metadata, units and gaps while escaping source text',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  const prefix=app.slice(0,app.indexOf('  mainPanel=mount('));
  const context={GUIDE_DATA:data,GuideCore:core,window:{localStorage:{getItem:()=>null}},location:{href:'https://example.invalid/guide/'},URL};
  vm.runInNewContext(prefix+'globalThis.renderers={propertiesHTML,recipePanelHTML,image};})();',context);
  const html=context.renderers.propertiesHTML({section:'items',category:'Dishes',itemProperties:{shelfLife:{label:'<script>bad()</script>',conditions:'<b>unsafe</b>'},quality:{label:'Fine'},value:{label:'Variable'},sources:['javascript:alert(1)']}});
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|href="javascript:/);
  assert.match(context.renderers.propertiesHTML(data.topics.find(t=>t.title==='Wine-Raspberry')),/Finished untapped keg/);
  const rendered=context.renderers.recipePanelHTML({id:'test',title:'Test',steps:[],preparationRoutes:[{method:'Brewing',ingredients:[{amount:10,unit:'source units',name:'Water'}],requirements:[],steps:['Wait.'],source:'https://example.invalid/'}]});
  assert.match(rendered,/10 source units Water/);assert.doesNotMatch(rendered,/10 ×/);
  assert.match(context.renderers.image({title:'Unknown',category:'Materials'}),/material\.svg/);
});
