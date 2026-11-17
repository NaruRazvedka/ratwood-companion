const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const data=require('../data.js');
const byId=new Map(data.topics.map(t=>[t.id,t]));
const current=require('../sources/current-content.json');
const build=require('../tools/build-public.cjs');
test('a source update marks previously managed references absent from the new import',()=>{
  const record=(id,type)=>({id,title:id,kind:'skill',section:'reference',category:'Skills',sourceType:type,sourceRevision:'old',related:[],sources:[],gaps:[]});
  const sample={topics:[record('kept','/datum/skill/kept'),record('retired','/datum/skill/retired')],currentCoverage:[{topicId:'kept'},{topicId:'retired'}],counts:{}};
  require('../tools/current-content.cjs').apply(sample,{revision:'new',reviewed:'2026-11-17',topics:[record('new-id','/datum/skill/kept')],acquisition:[],coverage:[]});
  assert.equal(sample.topics.find(t=>t.id==='retired').status,'historical');
  assert.equal(sample.retiredReferences[0].id,'retired');assert.equal(sample.retiredReferences[0].previousRevision,'old');
  assert.ok(!sample.retiredReferences.some(row=>row.id==='kept'));
});

test('public corpus has unique identities, working links and no private workbook or cache payload',()=>{
  const clean=build.sanitize(data),text=JSON.stringify(clean);
  assert.equal(new Set(clean.topics.map(t=>t.id)).size,clean.topics.length);
  for(const t of clean.topics)for(const id of t.related||[])assert.ok(byId.has(id),`${t.id} -> ${id}`);
  for(const forbidden of ['"sourceRows"','"previousPreparation"','"mergedEntries"','client-pack/','"rows":'])assert.ok(!text.includes(forbidden),forbidden);
  assert.equal(clean.publicEdition,true);
});

test('unverified community ingredient paragraphs are excluded from public records',()=>{
  const clean=build.sanitize({topics:[{id:'community',title:'Example',kind:'recipe',section:'items',category:'Dishes',ingredients:[{label:'A long community procedure that has not been checked.',options:[{name:'Ingredient'}]}],requirements:['Unverified paragraph'],steps:['Unverified procedure'],facts:[{label:'Source column',value:'Copied prose'}],aliases:[],related:[],sources:[]}],counts:{}});
  assert.equal(clean.topics[0].ingredients,undefined);
  assert.deepEqual(clean.topics[0].steps,[]);
  assert.deepEqual(clean.topics[0].requirements,[]);
  assert.deepEqual(clean.topics[0].facts,[]);
});

test('long original workbook text only survives when independently present in licensed source descriptions',()=>{
  const files=['workbook.json','heartbeast-workbook.json'].map(f=>path.join(root,'sources',f));
  if(!files.every(f=>fs.existsSync(f)))return;
  const cells=files.flatMap(f=>JSON.parse(fs.readFileSync(f)).sheets.flatMap(s=>s.rows.flatMap(r=>r.cells.map(c=>c.text.trim()).filter(s=>s.length>100))));
  const records=require('../sources/ratwood2-item-text.json');
  const heartPath=path.join(root,'sources/current-heartbeasts.json');
  const heart=fs.existsSync(heartPath)?JSON.parse(fs.readFileSync(heartPath)).topics:[];
  const licensed=[...records.map(r=>r.description?.text),...current.topics.map(t=>t.summary),...current.topics.flatMap(t=>(t.facts||[]).map(f=>f.value)),...heart.map(t=>t.summary),...heart.flatMap(t=>(t.facts||[]).filter(f=>/^(Possible|Liked|Conflicting|Tier|Accepted)/.test(f.label)).map(f=>f.value))].filter(Boolean);
  function check(value,field){
    if(typeof value==='string'){for(const cell of cells)if(value.includes(cell))assert.ok(licensed.some(text=>text.includes(cell)),field);}
    else if(Array.isArray(value))value.forEach((v,i)=>check(v,field+'['+i+']'));
    else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value))check(v,field+'.'+key);
  }
  check(data.topics,'topics');
});

test('all current player definitions have a destination or an explicit exclusion',()=>{
  for(const row of data.currentCoverage){
    assert.ok(['mapped','needs-review','excluded'].includes(row.state));
    if(row.state==='excluded')assert.ok(row.reason);
    else assert.ok(byId.has(row.topicId),row.type);
  }
  for(const kind of ['role','trait','skill','spell'])assert.ok(data.topics.some(t=>t.kind===kind&&t.sourceRevision===current.revision),kind);
  const role=data.topics.find(t=>t.title==='Servant (role)');
  assert.ok(role.related.some(id=>byId.get(id)?.title==='Servant (specialty)'));
});

test('character choices, role grants and effects have separate source-backed classifications',()=>{
  const find=type=>data.topics.find(t=>t.sourceType===type);
  const chef=find('/datum/quirk/dwarvenchef');
  assert.equal(chef.traitClass,'Character creation');assert.equal(chef.choiceType,'Quirk');
  assert.ok(chef.facts.some(f=>f.label==='Quirk-point cost'&&f.value==='1'));
  assert.ok(chef.facts.some(f=>f.label==='Warning'&&/already a dwarf/.test(f.value)));
  const flaw=find('/datum/charflaw/lawless');assert.equal(flaw.choiceType,'Vice / flaw');
  assert.ok(flaw.facts.some(f=>f.label==='Creation-time configuration'&&f.value==='Available'));
  const servant=find('/datum/advclass/servant/servant'),household=find('TRAIT_ROYALSERVANT');
  assert.ok(household.traitClasses.includes('Role granted'));assert.equal(household.category,'Role traits');
  assert.ok(servant.related.includes(household.id));assert.ok(household.related.includes(servant.id));
  const drunk=find('/datum/status_effect/buff/drunk');assert.equal(drunk.title,'Drunk');assert.equal(drunk.kind,'effect');
  assert.ok(drunk.facts.some(f=>f.label==='Listed duration'&&f.value==='5 minutes'));
  assert.ok(data.topics.some(t=>t.traitClasses?.includes('Effect granted')));
  assert.ok(!data.topics.some(t=>t.traitClass==='Temporary trait'));
});

test('empty historical spell references migrate to source abilities or the merged guide',()=>{
  assert.ok(data.referenceMigrations.length>=300);
  for(const row of data.referenceMigrations){assert.ok(!byId.has(row.id));assert.ok(byId.has(row.target));assert.equal(data.redirects[row.id],row.target);assert.ok(byId.get(row.target).aliases.includes(row.title));}
  for(const [id,target]of Object.entries(data.redirects)){assert.ok(byId.has(target),id);assert.equal(data.redirects[target],undefined,id);}
  assert.ok(!data.topics.some(t=>!t.publicContent&&['spell','miracle'].includes(t.kind)&&!t.facts?.length&&!t.steps?.length&&!t.itemInfo?.description?.text));
  const migration=require('../tools/reference-migrations.cjs');
  const fixture={topics:[{id:'guide-magic',title:'Magic',aliases:[],related:[]},{id:'actual',title:'Light',kind:'spell',publicContent:true,aliases:[],related:[]},{id:'old',title:'Light · Noc',kind:'miracle',facts:[],steps:[],related:[]}],redirects:{alias:'old',cycleA:'cycleB',cycleB:'cycleA',sourceAlias:'excluded-source-page'},counts:{}};
  migration.apply(fixture);
  assert.equal(fixture.redirects.alias,'actual');assert.equal(fixture.redirects.old,'actual');
  assert.equal(fixture.redirects.cycleA,undefined);assert.equal(fixture.redirects.sourceAlias,undefined);
});

test('all cookbook entries are reconciled without copied preparation prose',()=>{
  assert.equal(data.cookbookCoverage.length,114);
  for(const row of data.cookbookCoverage){assert.ok(byId.has(row.topicId));assert.ok(row.recordHash);assert.ok(row.cells.length);assert.ok(row.state);assert.equal(row.method,undefined);assert.equal(row.ingredients,undefined);}
});

test('public audit reports cover every displayed item after all imports',()=>{
  const items=data.topics.filter(t=>t.section==='items');
  for(const filename of ['item-text-coverage.json','recipe-guidance-audit.json']){
    const report=JSON.parse(fs.readFileSync(path.join(root,'sources',filename)));
    const rows=Array.isArray(report)?report:report.items;
    assert.equal(rows.length,items.length,filename);
    assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(items.map(t=>t.id)),filename);
  }
  assert.equal(data.updated,data.currentSource.reviewed);
});

test('alchemy combinations include fixed yields, Apprentice health, and no tied wine route',()=>{
  const wine=data.topics.find(t=>t.title==='Emberwine'),health=data.topics.find(t=>t.title==='Elixir of Health'),strong=data.topics.find(t=>t.title==='Elixir of Health (Strong)');
  assert.ok(wine.recipeRoutes.some(r=>r.ingredients.some(i=>/sinew/i.test(i.name))));
  assert.ok(wine.recipeRoutes.every(r=>r.outputQuantity===60&&r.ingredients.some(i=>i.name==='Water'&&i.amount===30)));
  assert.ok(!wine.recipeRoutes.some(r=>['euphrasia','rosa','urtica'].every(n=>r.ingredients.some(i=>i.name.toLowerCase()===n))));
  assert.ok(health.recipeRoutes.every(r=>r.requirements.includes('Apprentice Alchemy')));
  assert.ok(strong.recipeRoutes.every(r=>r.requirements.includes('Expert Alchemy')));
  for(const t of [wine,health,strong])for(const r of t.recipeRoutes)for(const i of r.ingredients)assert.ok(byId.has(i.id));
});

test('acquisition and ordinary barrel wine are actionable and remain distinct from cauldron brewing',()=>{
  const sinew=data.topics.find(t=>t.title==='Sinew'),wine=data.topics.find(t=>t.title==='Wine-Raspberry');
  assert.ok(sinew.recipeRoutes.some(r=>r.method==='Butchery'&&r.animalName==='cow'&&r.quality==='normal'&&r.outputQuantity===3));
  assert.ok(sinew.recipeRoutes.every(r=>r.name&&r.steps.length));
  assert.ok(wine.preparationRoutes.some(r=>r.method==='Brewing'&&r.ingredients.some(i=>i.type==='/datum/reagent/water'&&i.amount===198)));
  assert.match(data.topics.find(t=>t.id==='reference-alchemy-training').steps.join(' '),/250.*Intelligence/);
});

test('equipment, machines and construction recipes use actual source identities',()=>{
  for(const type of ['/obj/item/ammo_casing/caseless/rogue/arrow/blacksteel','/obj/item/rotation_contraption/shaft','/obj/structure/autosmither','/turf/closed/wall/mineral/rogue/brick']){
    const t=data.topics.find(t=>t.sourceObjectType===type);
    assert.ok(t,type);assert.ok(t.preparationRoutes?.length,type);assert.ok(t.title&&!t.title.startsWith('/'),type);
  }
  const stones=data.topics.find(t=>t.sourceObjectType==='/obj/item/natural/stone/sending');
  assert.ok(stones.preparationRoutes.some(r=>r.spawnedBy==='/obj/item/sendingstonesummoner'&&r.outputQuantity===2));
  const declarations=require('../sources/ratwood2-preparation-routes.json').filter(r=>r.evidence==='source');
  assert.ok(declarations.filter(r=>!r.outputName).length<25,'A missing source subtree must not silently hide hundreds of craftable outputs.');
});

test('classic-script detail bundles reproduce the public topics without runtime fetch',()=>{
  const index=require('../search.js'),context={};
  vm.createContext(context);
  for(const file of new Set(Object.values(index.detailBundles)))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  assert.equal(Object.keys(context.GUIDE_TOPIC_DETAILS).length,index.topics.length);
  for(const t of index.topics){assert.ok(t.searchKey);assert.ok(t.recipeProfile);assert.equal(context.GUIDE_TOPIC_DETAILS[t.id].title,t.title);}
  assert.ok(fs.statSync(path.join(root,'search.js')).size<fs.statSync(path.join(root,'data.js')).size);
});
