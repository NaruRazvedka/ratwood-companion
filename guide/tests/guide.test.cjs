const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const data=require('../data.js');
const topics=core.indexTopics(data.topics);
const byId=new Map(topics.map(t=>[t.id,t]));

test('private workbook rows preserve their original destination when the private edition is built',t=>{
  if(data.publicEdition){t.skip('Public editions deliberately exclude original workbook rows and prose.');return;}
  if(!['workbook.json','heartbeast-workbook.json'].every(file=>fs.existsSync(path.join(__dirname,'../sources',file)))){t.skip('Private workbook exports are not included in the public repository.');return;}
  for(const file of ['workbook.json','heartbeast-workbook.json']) {
    const source=require('../sources/'+file);
    for(const sheet of source.sheets)for(const row of sheet.rows){
      const coverage=data.coverage.find(x=>x.book===source.title&&x.sheet===sheet.name&&x.row===row.row);
      assert.ok(coverage,`${sheet.name} row ${row.row}`);assert.ok(byId.has(coverage.topicId));
      const overview=data.topics.find(t=>t.kind==='source'&&t.title===sheet.name&&t.sources[0].title.startsWith(source.title+' ·'));
      assert.deepEqual(overview.rows.find(r=>r.row===row.row),row);
    }
  }
});
test('topic IDs, categories, related links and provenance are valid',()=>{
  assert.equal(byId.size,topics.length);
  for(const topic of topics){
    assert.match(topic.id,/^[a-z0-9-]+$/);assert.ok(topic.title);assert.ok(data.categories.includes(topic.category),topic.title);
    assert.ok(['community','historical','corroborated','unverified','source'].includes(topic.status),topic.id);
    assert.ok(topic.sources.length,topic.id);
    for(const id of topic.related||[])assert.ok(byId.has(id),`${topic.id} -> ${id}`);
    for(const s of topic.sources)assert.match(s.url,/^https:\/\//,topic.id);
    if(topic.kind==='guide')assert.ok(topic.sections.length>=2,topic.id);
    if(topic.kind==='recipe'||topic.kind==='potion')assert.ok(topic.steps.length||topic.gaps.length,topic.id);
  }
});
test('every requested beginner system is represented',()=>{
  const corpus=topics.filter(t=>t.kind==='guide').map(t=>t.searchKey).join(' ');
  for(const term of ['crafting','carpentry','masonry','smithing','mining','medicine','farming','cooking','sewing','skincraft','butchery','fishing','reading','alchemy','stamina','armor','devotion','spellbook','heartbeast','wood'])assert.ok(corpus.includes(term),term);
  assert.ok(topics.some(t=>t.title==='Fish stew'));
  assert.ok(topics.some(t=>t.title==='Poisoned Berry stew'));
  const flour=topics.find(t=>t.title==='Flour');assert.ok(flour.steps.length);assert.ok(flour.related.includes('guide-plants'));
});
test('search uses aliases, all query words and filters with useful ordering',()=>{
  const synthetic=core.indexTopics([{id:'a',title:'Porridge',category:'Cooking',kind:'recipe',aliases:['oat meal'],summary:'Grain and water'},{id:'b',title:'Water',category:'Alchemy',kind:'ingredient',summary:'water'}]);
  assert.equal(core.search(synthetic,{query:'oat meal'})[0].id,'a');
  assert.equal(core.search(synthetic,{query:'grain water',category:'Cooking'})[0].id,'a');
  assert.equal(core.search(synthetic,{query:'water',kind:'ingredient'})[0].id,'b');
  assert.equal(core.search(synthetic,{bookmarksOnly:true,bookmarks:new Set(['b'])})[0].id,'b');
  assert.deepEqual(core.search(synthetic,{query:'absent'}),[]);
  assert.equal(core.normalize("Tark’s Équipement"),'tarks equipement');
  assert.ok(core.search(topics,{query:'soup'}).length>5);
});
test('bookmarks survive reload and invalid storage fails without preventing reading',()=>{
  let value='["learn-start","unknown"]';const store={getItem:()=>value,setItem:(_,v)=>value=v};
  assert.deepEqual([...core.readBookmarks(store,new Set(byId.keys()),data.redirects).bookmarks],['guide-controls']);
  assert.equal(core.writeBookmarks(store,new Set(['guide-plants'])),true);
  assert.deepEqual([...core.readBookmarks(store,new Set(byId.keys())).bookmarks],['guide-plants']);
  for(const bad of ['{}','[3]','bad json']){value=bad;assert.equal(core.readBookmarks(store,new Set()).available,false);}
  assert.equal(core.readBookmarks({getItem(){throw Error();}},new Set()).available,false);
  assert.equal(core.writeBookmarks({setItem(){throw Error();}},new Set()),false);
});

test('item catalogue separates dishes, drinks, ingredients and guides',()=>{
  assert.equal(topics.find(t=>t.title==='Bread').category,'Dishes');
  assert.equal(topics.find(t=>t.title==='Coffee').category,'Drinks');
  assert.equal(topics.find(t=>t.title==='Butter Dough').category,'Prepared ingredients');
  assert.equal(core.search(topics,{section:'items'}).some(t=>t.kind==='guide'),false);
  assert.ok(core.search(topics,{section:'guides'}).length>=12);
  assert.ok(Object.keys(data.redirects).length>=62);
  for(const id of Object.values(data.redirects))assert.ok(byId.has(id));
});
test('a handpie preparation chain reaches grain, dough, butter and milk',()=>{
  const root=core.preparationTree('sheet-7-r44',byId);
  const ids=[];
  function walk(node){ids.push(node.id);for(const g of node.groups)for(const o of g.options)if(o.node)walk(o.node);}
  walk(root);
  for(const title of ['Pie Dough','Small Butter Dough','Butter Dough','Dough','Flour','Butter Slice','Butter','Milk'])assert.ok(ids.some(id=>byId.get(id)?.title===title),title);
  const grain=core.preparationTree('sheet-7-r2',byId);
  assert.match(grain.groups[0].label,/Choose one/);
  assert.deepEqual(new Set(grain.groups[0].options.map(o=>o.name)),new Set(['wheat grain','oat grain','rice grain',"baker's root"]));
  assert.ok(grain.groups[0].options.every(o=>o.id));
  const dough=byId.get('sheet-7-r7');
  assert.ok(dough.ingredients.some(g=>g.options.some(o=>o.name==='unfinished dough')));
  assert.ok(dough.ingredients.some(g=>g.options.some(o=>o.name==='flour')));
});
test('preparation recursion stops on cycles and leaves unknown inputs explicit',()=>{
  const map=new Map([['a',{ingredients:[{label:'b',options:[{name:'b',id:'b'}]}]}],['b',{ingredients:[{label:'a',options:[{name:'a',id:'a'}]},{label:'unknown',options:[{name:'unknown',id:null}]}]}]]);
  const tree=core.preparationTree('a',map);
  assert.equal(tree.groups[0].options[0].node.groups[0].options[0].node.cycle,true);
  assert.equal(tree.groups[0].options[0].node.groups[1].options[0].node,null);
});
test('procedures render as written steps without checklist controls',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
  assert.doesNotMatch(app,/type=["']checkbox|data-step|data-reset|Reset steps/);
  assert.match(app,/written-steps/);
});
test('untrusted source text and source URLs are escaped',()=>{
  assert.equal(core.escapeHTML('<img onerror="alert(1)"> &'), '&lt;img onerror=&quot;alert(1)&quot;&gt; &amp;');
  for(const url of ['javascript:alert(1)','data:text/html,<svg>','file:///C:/secret','not a URL'])assert.equal(core.safeURL(url),'#');
  assert.equal(core.safeURL('https://wiki.ratwood.rip/'),'https://wiki.ratwood.rip/');
});
test('floating guide opens on request, reuses one window and reopens after closure',async()=>{
  let calls=0;const wins=[];const mounted=[];
  const controller=core.floatingController({pip:{async requestWindow(){calls++;const win={closed:false,focus(){}};wins.push(win);return win;}},openPopup(){throw Error('unexpected');},mount:(...x)=>mounted.push(x),status(){},inline(){throw Error('unexpected');}});
  assert.equal(await controller.open('learn-start'),'pip');
  assert.equal(await controller.open('learn-farming'),'reused');assert.equal(calls,1);assert.equal(mounted[1][1],'learn-farming');
  wins[0].closed=true;assert.equal(await controller.open('learn-start'),'pip');assert.equal(calls,2);
});
test('concurrent floating requests cannot open duplicate windows',async()=>{
  let resolve,calls=0;const delayed=new Promise(r=>resolve=r);
  const controller=core.floatingController({pip:{requestWindow(){calls++;return delayed;}},mount(){},status(){},inline(){},openPopup(){}});
  const first=controller.open('a'),second=controller.open('b');resolve({closed:false});await Promise.all([first,second]);assert.equal(calls,1);
});
test('unsupported or rejected PiP falls back to popup, then inline on blocking',async()=>{
  for(const pip of [undefined,{async requestWindow(){throw Error('denied');}}]){
    let mounted=0,inline=0;const messages=[];
    const popup=core.floatingController({pip,openPopup:()=>({closed:false}),mount(){mounted++;},status:x=>messages.push(x),inline(){inline++;}});
    assert.equal(await popup.open('a'),'popup');assert.equal(mounted,1);assert.match(messages.at(-1),/manual pinning/);
    const blocked=core.floatingController({pip,openPopup:()=>null,mount(){},status(){},inline(){inline++;}});
    assert.equal(await blocked.open('a'),'inline');assert.equal(inline,1);
  }
});
test('offline scripts and sprite assets are bundled locally',()=>{
  const root=path.resolve(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,src]of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)){assert.doesNotMatch(src,/^https?:/);assert.ok(fs.existsSync(path.join(root,src)));}
  for(const topic of topics)if(topic.sprite)assert.ok(fs.existsSync(path.join(root,topic.sprite)),topic.sprite);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'app.js'),'utf8'),/\bfetch\s*\(/);
});
