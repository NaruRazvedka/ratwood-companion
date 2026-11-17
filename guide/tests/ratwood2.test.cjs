const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const data=require('../data.js');
const root=path.join(__dirname,'..');
test('every indexed Ratwood 2 recipe maps to a topic or an explicit type-name gap',()=>{
  const definitions=[...require('../sources/ratwood2-food-recipes.json'),...require('../sources/ratwood2-stew-recipes.json')];
  const coverage=require('../sources/ratwood2-recipe-coverage.json');
  assert.equal(coverage.length,definitions.length);
  assert.equal(new Set(coverage.map(r=>r.type)).size,coverage.length);
  for(const row of definitions){const record=coverage.find(r=>r.type===row.type);assert.ok(record);assert.equal(record.source,row.source);if(record.topicId)assert.ok(data.topics.some(t=>t.id===record.topicId));else assert.ok(record.unresolved.length);}
});
test('current recipes retain ordered preparation and separate public/private historical notes',()=>{
  const cake=data.topics.find(t=>t.title==='Apple Cake');
  assert.equal(cake.status,'source');
  assert.deepEqual(cake.sourceRecipeVariants[0].ingredients.map(i=>i.name),['apple']);
  assert.match(cake.steps[0],/frosted cake.*table/);
  if(data.publicEdition)assert.equal(cake.previousPreparation,undefined);else assert.ok(cake.previousPreparation.steps.length);
  const rice=data.topics.find(t=>t.title==='Rice and Beef Meal');
  assert.equal(rice.sourceRecipeVariants[0].base.name,'rice and beef');
  assert.equal(rice.sourceRecipeVariants[0].ingredients[0].name,'baked carrot');
  assert.ok(data.topics.some(t=>t.sourceRecipeVariants?.length>1));
  const fish=data.topics.find(t=>t.title==='Fish stew');
  assert.equal(fish.category,'Soups & stews');assert.equal(fish.potRecipes[0].seconds,60);
  assert.match(fish.steps.join(' '),/30 drams/);
  assert.equal(data.topics.find(t=>t.title==='Coffee').potRecipes[0].seconds,15);
  const byId=new Map(data.topics.map(t=>[t.id,t]));
  const chain=require('../core.js').preparationTree(cake.id,byId),seen=[];
  function visit(node){seen.push(byId.get(node.id)?.title);for(const g of node.groups)for(const o of g.options)if(o.node&&!o.node.cycle)visit(o.node);}
  visit(chain);
  for(const title of ['Cake Base','Butter Dough','Flour','Egg'])assert.ok(seen.includes(title),title);
  assert.ok(!seen.includes('Egg stew'),'A soup alias must not replace the raw egg ingredient');
});
test('guide corrections cover source-confirmed changes without upgrading all evidence',()=>{
  const text=id=>JSON.stringify(data.topics.find(t=>t.id===id).sections);
  assert.match(text('guide-magic'),/aspect menu/);assert.match(text('guide-magic'),/Clean, Spark, Light and Sense/);
  assert.match(text('guide-alchemy'),/at least 5/);assert.match(text('guide-alchemy'),/Duplicate ingredient types/);
  assert.match(text('guide-heartbeasts'),/Twenty points passes/);
  for(const t of data.topics.filter(t=>t.sourceRevision)){assert.match(t.sourceRevision,/^[a-f0-9]{40}$/);assert.ok(t.sources.some(s=>s.url.includes('Ratwood-2.0')),t.id);assert.ok(Array.isArray(t.gaps),t.id);}
  assert.ok(data.currentSource?.revision);
  assert.ok(data.topics.some(t=>t.status==='unverified'&&t.gaps.length),'Unresolved information must remain explicit.');
});
test('bundled historical sprites retain pinned object definitions and original sheet hashes',()=>{
  const assets=require('../sources/ratwood2-sprites.json');
  const tree=require('../sources/ratwood-2/icon-tree.json');
  assert.ok(assets.length>300);
  const sheets=new Set();
  const referenced=new Set(data.topics.map(t=>t.sprite).filter(Boolean));
  for(const a of assets){
    assert.match(a.path,/^assets\/sprites\/ratwood-2\/[a-f0-9]+\.png$/);
    assert.match(a.definition,/\/80907df21ed15bde91106da41ce82e6ac6c40069\/.+#L\d+$/);
    const file=path.join(root,a.path);
    if(!fs.existsSync(file)){assert.ok(data.publicEdition&&!referenced.has(a.path),'A displayed sprite must be bundled: '+a.path);continue;}
    const png=fs.readFileSync(file);assert.equal(png.readUInt32BE(16),32);assert.equal(png.readUInt32BE(20),32);
    sheets.add(a.sheet);
  }
  for(const sheet of sheets){const file=path.join(root,'assets/sprites/ratwood-2',tree[sheet]+'.dmi');if(!fs.existsSync(file)){assert.ok(data.publicEdition,'Personal source sheets must not silently disappear.');continue;}const bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),tree[sheet]);}
});
