const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=require('../data.js'),core=require('../core.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const context={GUIDE_DATA:data,GuideCore:core,window:{localStorage:{getItem:()=>null}}};
vm.runInNewContext(source.slice(0,source.indexOf('  mainPanel=mount('))+'globalThis.specificationsHTML=specificationsHTML;})();',context);
test('equipment statistics are visible, searchable and linked to exact definitions',()=>{
  const sword=data.topics.find(t=>t.sourceObjectType==='/obj/item/rogueweapon/sword');
  const armor=data.topics.find(t=>t.sourceObjectType==='/obj/item/clothing/suit/roguetown/armor/plate');
  assert.ok(sword);assert.ok(armor);
  const html=context.specificationsHTML(sword);
  assert.match(html,/Weapon &amp; shield<\/summary>/);assert.match(html,/Base melee force/);assert.match(html,/>22</);assert.match(html,/Attacks — standard grip/);
  assert.match(context.specificationsHTML(armor),/Chest, Groin, Vitals/);
  const indexed=core.indexTopics([sword]);assert.equal(core.search(indexed,{query:'parry defense'}).length,1);
  for(const t of data.topics)for(const g of t.itemProperties?.useCases||[]){
    if(g.topicId)assert.ok(data.topics.some(t=>t.id===g.topicId));
    for(const f of g.facts)if(f.topicId)assert.ok(data.topics.some(t=>t.id===f.topicId));
  }
});
test('specification rendering escapes source strings and retains incomplete matches',()=>{
  const html=context.specificationsHTML({section:'items',category:'Weapons',itemProperties:{useCases:[{id:'weapon',title:'<script>bad()</script>',facts:[{label:'<img src=x>',value:'<svg onload=bad()>'}],attacks:[{name:'<b>Attack</b>',facts:[],gap:'missing'}]}]}});
  assert.doesNotMatch(html,/<script>|<img src=x>|<svg onload/);assert.match(html,/&lt;script&gt;/);assert.match(html,/not resolved/);
  assert.match(context.specificationsHTML({section:'items',category:'Weapons'}),/not been matched/);
});
test('named spell and potion entries include their relevant specifications',()=>{
  const spell=data.topics.find(t=>t.kind==='spell'&&t.itemProperties?.useCases?.some(g=>g.id==='spell'));
  assert.ok(spell);assert.match(context.specificationsHTML(spell),/Casting &amp; requirements/);
  const potion=data.topics.find(t=>t.sourceObjectType==='/datum/reagent/medicine/healthpot');
  assert.match(context.specificationsHTML(potion),/Metabolism per processing cycle/);
});
