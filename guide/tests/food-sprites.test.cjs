const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data.js');
const assets=require('../sources/ratwood2-sprites.json');
const fs=require('node:fs'),path=require('node:path'),core=require('../core.js');
const treeFile=path.join(__dirname,'../sources/ratwood-2/icon-tree.json');
const tree=fs.existsSync(treeFile)?require(treeFile):null;

test('current dishes have a game sprite or explicit local category fallback',()=>{
  const dishes=data.topics.filter(t=>t.section==='items'&&t.category==='Dishes');
  assert.ok(dishes.length>100);
  for(const topic of dishes){
    const asset=topic.sprite||'assets/icons/'+core.placeholderIcon(topic)+'.svg';
    assert.ok(fs.existsSync(path.join(__dirname,'..',asset)),topic.title);
    if(topic.sprite)assert.ok(topic.spriteEvidence?.source,topic.title);
  }
  for(const alias of require('../sources/ratwood2-sprite-aliases.json')){
    const topic=data.topics.find(t=>t.id===(data.redirects[alias.id]||alias.id));
    assert.ok(topic?.sprite,alias.title);
    assert.equal(topic.sourceObjectType,alias.type,alias.title);
  }
});

test('fish use actual common-rarity frames and canonical Git resource paths',()=>{
  for(const name of ['Crab','Eel','oyster','shrimp']){
    const asset=assets.find(a=>a.names.includes(name));
    assert.ok(asset,name);
    assert.equal(asset.sheet,'modular/Neu_Food/icons/raw/raw_fish.dmi');
    assert.equal(asset.state,asset.initialState+'com');
    assert.match(asset.note,/fish\/Initialize/);
    const topic=data.topics.find(t=>t.sourceObjectType===asset.type);
    assert.ok(topic?.sprite,name);assert.equal(topic.spriteEvidence.sheet,asset.sheet);assert.equal(topic.spriteEvidence.state,asset.state);
  }
  const trail=assets.find(a=>a.names.includes('Trail-Mix'));
  assert.equal(trail.sheet,'modular/Neu_Food/icons/cookware/ration.dmi');
  assert.equal(trail.state,'ration_large');
  for(const asset of assets){assert.ok(asset.source&&asset.definition,asset.path);if(tree)assert.ok(tree[asset.sheet],asset.sheet);}
});

test('historical NeuFood sheet checks retain their recorded Git identities',t=>{
  if(!tree||!fs.existsSync(path.join(__dirname,'../sources/ratwood2-sprite-recheck.json'))){t.skip('Historical sheet comparison metadata is not in this public package.');return;}
  const check=require('../sources/ratwood2-sprite-recheck.json');
  assert.equal(check.sheets.length,45);
  for(const sheet of check.sheets)assert.equal(tree[sheet.path],sheet.sha,sheet.path);
  const gaps=require('../sources/ratwood2-sprite-gaps.json');
  for(const title of ['Meat','split tomato'])assert.ok(gaps.some(g=>g.title===title));
  for(const gap of gaps)assert.ok(gap.reason&&gap.type&&gap.sheet);
});
