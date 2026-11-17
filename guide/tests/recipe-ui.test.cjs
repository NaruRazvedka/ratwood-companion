const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../core.js');
const data=require('../data.js');
const topics=core.indexTopics(data.topics);
function renderers(){
  const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
  const prefix=app.slice(0,app.indexOf('  mainPanel=mount('));
  const context={GUIDE_DATA:data,GuideCore:core,window:{localStorage:{getItem:()=>null}},location:{href:'https://example.invalid/guide/',pathname:'/guide/',search:''},history:{replaceState(){}},URL};
  vm.runInNewContext(prefix+'globalThis.renderers={articleHTML,recipePanelHTML,mount};})();',context);
  return context.renderers;
}

test('recipe summary retains source units, unknowns and route differences',()=>{
  const slab=topics.find(t=>t.aliases?.includes('Slab of dough'));
  assert.equal(core.recipeSummary(slab).yield,'2 item(s)');
  assert.ok(core.recipeSummary(slab).tools.includes('Sharp tool'));
  const wine=core.recipeSummary(topics.find(t=>t.title==='Wine-Raspberry'));
  assert.equal(wine.yield,'6 bottles per batch');assert.match(wine.time,/300 seconds brewing/);assert.match(wine.value,/65 mammons/);
  const cake=topics.find(t=>t.title==='Apple Cake');
  const timed=(cake.sourceRecipeVariants||[]).map(r=>r.baseSecondsPerStep).filter(v=>v!=null);
  if(timed.length)assert.ok(timed.every(v=>core.recipeSummary(cake).time.includes(String(v))));
  else assert.match(core.recipeSummary(cake).time,/Not fixed/,'Historical timing evidence must not be carried into a newer source revision.');
  assert.equal(cake.recipeProfile.evidence,'source');
  const unknown=core.recipeSummary({});assert.equal(unknown.yield,'Not stated');assert.match(unknown.time,/Not fixed/);
  const varied=core.recipeSummary({preparationRoutes:[{outputQuantity:2},{outputQuantity:4}]});assert.equal(varied.yield,'Varies by route');assert.equal(varied.alternative,true);
});

test('filters combine method and skill on the same route and preserve evidence uncertainty',()=>{
  const rows=core.indexTopics([{id:'a',title:'Example',section:'items',category:'Dishes',status:'source',recipeAudit:{state:'source-procedure'},itemProperties:{quality:{label:'Fine'}},preparationRoutes:[{method:'Smithing',skill:'Armorsmithing',steps:[]},{method:'Cutting',skill:'Cooking',steps:[]}]},{id:'b',title:'Unknown',section:'items',category:'Dishes',status:'source'},{id:'c',title:'Conflict',section:'items',availability:{state:'conflicting-route'}}]);
  assert.equal(core.search(rows,{quality:'Fine',method:'Smithing',skill:'Armorsmithing',evidence:'source'})[0].id,'a');
  assert.deepEqual(core.search(rows,{method:'Smithing',skill:'Cooking'}),[]);
  assert.equal(core.search(rows,{evidence:'incomplete'})[0].id,'b');assert.equal(core.search(rows,{evidence:'conflict'})[0].id,'c');
  const options=core.filterOptions(topics);assert.ok(options.method.includes('Baking'));assert.ok(options.skill.includes('Sewing'));assert.ok(!options.skill.some(s=>s==='null'||s.startsWith('/')));
});

test('articles use one compact recipe panel with collapsed prerequisites and footer provenance',()=>{
  const ui=renderers(),t=topics.find(t=>t.title==='Hardtack');
  for(const compact of [false,true]){
    const html=ui.articleHTML(t,compact);
    assert.ok(html.indexOf('<h2>Description</h2>')<html.indexOf('recipe-panel'));
    for(const label of ['Tools & requirements','Yield','Preparation time'])assert.ok(html.includes('<dt>'+core.escapeHTML(label)+'</dt>'),label);
    assert.match(html,/recipe-diagram/);assert.match(html,/data-prerequisite=/);
    assert.doesNotMatch(html,/<details class="ingredient-card"[^>]* open/);
    assert.doesNotMatch(html,/source-details|Other preparation routes|Source preparation routes/);
  }
  const conflict=ui.articleHTML(topics.find(t=>t.availability?.state==='conflicting-route'),true);
  assert.match(conflict,/availability-note/);if(conflict.includes('recipe-panel'))assert.ok(conflict.indexOf('availability-note')<conflict.indexOf('recipe-panel'));
  const hostile=ui.recipePanelHTML({id:'unsafe',title:'<img src=x>',section:'items',recipeRoutes:[{ingredients:[{name:'<script>bad()</script>'}],steps:['<b>unsafe</b>']}]});
  assert.match(hostile,/&lt;script&gt;/);assert.doesNotMatch(hostile,/<script>|<img src=x>/);
});

test('filter controls update actual catalogue results, reset, and hide on an article',()=>{
  class Element{
    constructor(){this.listeners={};this.dataset={};this.value='';this.classList={toggle(){},add(){}};this.innerHTML='';}
    addEventListener(name,fn){this.listeners[name]=fn;}
    setAttribute(){} focus(){} before(other){this.beforeElement=other;}
    querySelector(){return new Element();}querySelectorAll(){return [];}
  }
  const selectors=Object.fromEntries(['.menu-view','.category-list','.mobile-categories','.saved-nav','.saved-nav span','.app-notice','input'].map(k=>[k,new Element()]));
  const controls=['quality','method','skill','evidence'].map(id=>Object.assign(new Element(),{dataset:{filter:id},matches:s=>s==='[data-filter]'}));
  const clear=new Element(),bar=new Element();bar.querySelectorAll=()=>controls;bar.querySelector=()=>clear;
  const host=new Element();host.querySelector=s=>selectors[s]||new Element();
  const doc={createElement:()=>bar,addEventListener(){},defaultView:{scrollTo(){}}};
  const panel=renderers().mount(doc,host),view=selectors['.menu-view'];
  for(const [name,value] of [['quality','Fine'],['method','Baking']]){const control=controls.find(c=>c.dataset.filter===name);control.value=value;host.listeners.change({target:control});}
  const ids=html=>[...html.matchAll(/class="item-tile"[^>]*data-topic="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids(view.innerHTML),core.search(topics,{section:'items',category:'Dishes',quality:'Fine',method:'Baking'}).slice(0,96).map(t=>t.id));
  assert.equal(bar.hidden,false);assert.equal(clear.disabled,false);
  const button={dataset:{},closest(){return this;},hasAttribute:name=>name==='data-clear-filters'};
  host.listeners.click({target:button});assert.ok(controls.every(c=>c.value===''));assert.equal(clear.disabled,true);
  panel.navigate('sheet-7-r38');assert.equal(bar.hidden,true);assert.match(view.innerHTML,/recipe-panel/);
  const back={dataset:{},closest(){return this;},hasAttribute:name=>name==='data-back'};
  host.listeners.click({target:back});assert.equal(bar.hidden,false);
});
