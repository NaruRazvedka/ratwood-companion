const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../core.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const prefix=source.slice(0,source.indexOf('  mainPanel=mount('));
function harness(rows){
  const historyLog=[],focus=[];
  class Element{
    constructor(name=''){this.name=name;this.listeners={};this.dataset={};this.value='';this.innerHTML='';this.classList={toggle(){},contains(){return false;}};}
    addEventListener(name,fn){this.listeners[name]=fn;}setAttribute(){}before(){}focus(){focus.push(this.name);}
    querySelector(selector){return new Element(selector);}querySelectorAll(){return [];}
  }
  const selectors=Object.fromEntries(['.menu-view','.category-list','.mobile-categories','.saved-nav','.saved-nav span','.app-notice','.search-status','[data-search-scope]','input'].map(k=>[k,new Element(k)]));
  const controls=['quality','method','skill','evidence'].map(id=>Object.assign(new Element(id),{dataset:{filter:id}}));
  const bar=new Element(),clear=new Element();bar.querySelectorAll=()=>controls;bar.querySelector=s=>s==='[data-filter]'?controls[0]:clear;
  const host=new Element();host.querySelector=s=>selectors[s]||new Element(s);
  const win={scrollY:37,scrollTo(value){this.scrollY=value.top;}};
  const doc={defaultView:win,createElement:()=>bar,addEventListener(){}};
  const context={GUIDE_DATA:{topics:rows,redirects:{}},GuideCore:core,window:{localStorage:{getItem:()=>null}},history:{replaceState(s){historyLog.push(['replace',structuredClone(s)]);},pushState(s){historyLog.push(['push',structuredClone(s)]);}},location:{href:'https://example.invalid/guide/',pathname:'/guide/',search:''},URL};
  vm.runInNewContext(prefix+'globalThis.ui={mount,articleHTML,recipePanelHTML,selectedRoutes};})();',context);
  return {ui:context.ui,panel:context.ui.mount(doc,host),host,selectors,historyLog,focus,win};
}
const item={id:'bread',title:'Bread',section:'items',category:'Dishes',aliases:['daily loaf'],recipeRoutes:[{id:'bake',name:'Baking',ingredients:[{id:'flour',name:'Flour',amount:2}],requirements:['Oven'],steps:['Bake.'],outputQuantity:1},{id:'buy',name:'Buy',ingredients:[{name:'Coins',amount:3}],requirements:['Seller'],steps:['Buy.'],outputQuantity:1}]};

test('recipe routes keep selected quantities, tools and steps together',()=>{
  const routes=core.recipeRoutes(item);assert.equal(routes.length,2);
  assert.deepEqual(core.routeSummary(item,routes[0]).ingredients,['2 Flour']);assert.deepEqual(core.routeSummary(item,routes[1]).ingredients,['3 Coins']);
  const h=harness([item,{id:'flour',title:'Flour',section:'items',category:'Ingredients'}]);
  let html=h.ui.recipePanelHTML(item);assert.match(html,/2 Flour/);assert.doesNotMatch(html,/3 Coins|<li>Buy\./);
  assert.match(html,/data-prerequisite="flour"/);assert.doesNotMatch(html,/<details[^>]+ open/);
  h.ui.selectedRoutes.set('bread','buy');html=h.ui.recipePanelHTML(item);assert.match(html,/3 Coins/);assert.match(html,/<li>Buy\./);assert.doesNotMatch(html,/2 Flour|<li>Bake\./);
});

test('legacy alternatives remain choose-one groups and incomplete yields remain unknown',()=>{
  const t={title:'Dough',recipe:true,ingredients:[{label:'Choose a grain',options:[{name:'Wheat'},{name:'Oat'}]}],steps:['Mix.']};
  const r=core.recipeRoutes(t)[0];assert.equal(r.groups.length,1);assert.equal(r.groups[0].options.length,2);assert.equal(core.routeSummary(t,r).yield,'Not stated');
  const mixed=core.recipeRoutes({...t,preparationRoutes:[{method:'Mix',ingredients:[{name:'Wheat'}],steps:['Use wheat.']},{method:'Mix',ingredients:[{name:'Oat'}],steps:['Use oat.']}]});
  assert.equal(mixed.length,2);assert.equal(mixed[0].groups[0].options[0].name,'Wheat');assert.equal(mixed[1].groups[0].options[0].name,'Oat');
});

test('global search crosses sections, prioritizes aliases, and suggests a close spelling',()=>{
  const topics=core.indexTopics([item,{id:'farmer',title:'Farming',section:'guides',summary:'How to make your daily loaf.'}]);
  assert.equal(core.search(topics,{query:'daily loaf'})[0].id,'bread');assert.equal(core.search(topics,{query:'daily loaf'}).length,2);
  assert.deepEqual(core.suggestions(topics,'braed').map(t=>t.id),['bread']);
  assert.deepEqual(core.suggestions(topics,'brea').map(t=>t.id),['bread']);
  const h=harness(topics);h.selectors.input.listeners.input({target:{value:'daily loaf'}});assert.match(h.selectors['.menu-view'].innerHTML,/Farming/);assert.match(h.selectors['.menu-view'].innerHTML,/Bread/);assert.match(h.selectors['.search-status'].textContent,/2 results/);
});

test('navigation retains catalogue filters and records restorable browser history',async()=>{
  const h=harness([item]);h.selectors.input.listeners.input({target:{value:'daily loaf'}});h.win.scrollY=125;
  await h.panel.navigate('bread');assert.match(h.selectors['.menu-view'].innerHTML,/recipe-panel/);
  const snapshot=h.historyLog.filter(x=>x[0]==='replace').at(-1)[1];assert.equal(snapshot.state.query,'daily loaf');assert.equal(snapshot.catalogue.scroll,125);
  h.host.listeners.click({target:{closest(){return this;},dataset:{},hasAttribute:s=>s==='data-back'}});
  assert.equal(h.selectors.input.value,'daily loaf');assert.equal(h.win.scrollY,125);assert.ok(h.focus.includes('[data-topic="bread"]'));
  h.panel.restore(snapshot);assert.equal(h.selectors.input.value,'daily loaf');assert.match(h.selectors['.menu-view'].innerHTML,/Bread/);
});

test('bookmark backup validation preserves recognized IDs, redirects and rejects malformed imports',()=>{
  const ids=new Set(['bread','flour']);const result=core.parseBookmarkBackup(JSON.stringify({format:'ratwood-guide-bookmarks',version:1,bookmarks:['old','bread','unknown']}),ids,{old:'bread'});
  assert.deepEqual(result,{ids:['bread'],unknown:1});assert.throws(()=>core.parseBookmarkBackup('{',ids),/valid JSON/);assert.throws(()=>core.parseBookmarkBackup('[1]',ids),/bookmark export/);assert.throws(()=>core.parseBookmarkBackup('{"format":"other","bookmarks":[]}',ids),/bookmark export/);
});


test('offline detail scripts load once, merge details, and permit retry after a missing file',async()=>{
  const scripts=[];
  const context={GUIDE_DATA:{topics:[{...item,recipeRoutes:undefined,detailLoaded:false}],detailBundles:{bread:'details/b.js'}},GuideCore:core,window:{localStorage:{getItem:()=>null}},location:{href:'file:///guide/index.html'},URL,document:{createElement(){return {remove(){}};},head:{append(script){scripts.push(script);}}}};
  vm.runInNewContext(prefix+'globalThis.ui={loadTopic};})();',context);
  const first=context.ui.loadTopic('bread'),second=context.ui.loadTopic('bread');assert.equal(scripts.length,1);assert.equal(scripts[0].src,'file:///guide/details/b.js');
  context.GUIDE_TOPIC_DETAILS={bread:item};scripts[0].onload();const [a,b]=await Promise.all([first,second]);assert.equal(a.detailLoaded,true);assert.equal(a.recipeRoutes.length,2);assert.equal(b.id,'bread');await context.ui.loadTopic('bread');assert.equal(scripts.length,1);
  const retryContext={...context,GUIDE_DATA:{topics:[{...item,recipeRoutes:undefined,detailLoaded:false}],detailBundles:{bread:'details/missing.js'}}};
  vm.runInNewContext(prefix+'globalThis.ui={loadTopic};})();',retryContext);
  const failed=retryContext.ui.loadTopic('bread');scripts.at(-1).onerror();await assert.rejects(failed,/could not be opened/);
  const retry=retryContext.ui.loadTopic('bread');scripts.at(-1).onload();assert.equal((await retry).id,'bread');assert.equal(scripts.length,3);
});
