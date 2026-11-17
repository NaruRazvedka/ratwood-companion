const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data.js');
const core=require('../core.js');
const audit=require('../tools/catalogue-audit.cjs');
const topics=core.indexTopics(data.topics),byId=new Map(topics.map(t=>[t.id,t]));

test('reviewed duplicates redirect without losing bookmarks, sources or preparation',()=>{
  for(const decision of require('../sources/catalogue-decisions.json').decisions.filter(d=>d.action==='merge')){
    assert.equal(byId.has(decision.id),false,decision.id);
    const target=data.redirects[decision.id];assert.ok(byId.has(target));
    assert.deepEqual([...core.readBookmarks({getItem:()=>JSON.stringify([decision.id])},new Set(byId.keys()),data.redirects).bookmarks],[target]);
  }
  const bread=byId.get('sheet-7-r39');assert.ok(bread.heatingRoutes.length);assert.ok(bread.aliases.includes('bread loaf'));
  const dogroll=byId.get('sheet-7-r100');assert.ok(dogroll.aliases.includes('Dogroll'));
  assert.ok(dogroll.sources.some(s=>s.url.includes('wiki.ratwood.rip')));
  assert.ok(dogroll.sources.some(s=>s.url.includes('Ratwood-2.0')));
  assert.equal(byId.get('sheet-7-r121').sourceRecipeVariants.length,4);
});

test('the main catalogue contains no duplicate normalized names or verified object types',()=>{
  const items=topics.filter(t=>t.section==='items');
  const names=items.map(t=>require('../tools/catalogue.cjs').canonical(t.title));assert.equal(new Set(names).size,names.length);
  const types=items.map(t=>t.sourceObjectType).filter(Boolean);assert.equal(new Set(types).size,types.length);
  const ids=new Set(items.map(t=>t.id));
  for(const id of ['sheet-7-r44','sheet-7-r46','sheet-7-r48','sheet-7-r49','sheet-7-r50','sheet-7-r51','sheet-7-r60','sheet-7-r163'])assert.ok(ids.has(id)&&byId.get(id).sprite,id);
  assert.notEqual(byId.get('sheet-9-r85').sourceObjectType,byId.get('sheet-9-r90').sourceObjectType);
  assert.equal(data.redirects['item-minced-meat'],'sheet-7-r18');
  assert.equal(byId.get('sheet-7-r18').sourceObjectType,'/obj/item/reagent_containers/food/snacks/rogue/meat/mince/beef');
});

test('historical preparation stays out of the public menu and conflicts remain explicit',()=>{
  const archived=topics.filter(t=>t.availability?.state==='historical-unconfirmed');
  if(data.publicEdition){assert.equal(archived.length,0);assert.ok(topics.every(t=>t.section!=='sources'));}
  else{assert.equal(archived.length,8);assert.ok(archived.every(t=>t.section==='sources'&&t.sources.length&&t.steps.length));assert.ok(core.search(topics,{section:'sources',query:'pancake'}).length);}
  for(const id of ['sheet-7-r45','sheet-7-r170']){
    const item=byId.get(id);assert.equal(item.availability.state,'conflicting-route');
    if(data.publicEdition){
      assert.equal(item.previousPreparation,undefined);
      // A verified final heating step does not establish how to obtain its poisonous raw precursor.
      for(const route of item.heatingRoutes||[]){assert.equal(route.outputType,item.sourceObjectType);assert.match(route.inputType,/poison/);}
      assert.ok(item.availability.reason);
    }else{assert.equal(item.recipe,false);assert.equal(item.steps.length,0);assert.ok(item.previousPreparation.steps.length);}
  }
  const cabbage=byId.get('sheet-7-r51'),chain=[];
  function visit(node){chain.push(node.id);for(const group of node.groups)for(const option of group.options)if(option.node&&!option.node.cycle)visit(option.node);}
  visit(core.preparationTree(cabbage.id,byId));
  assert.ok(chain.includes('item-cabbage'));
  assert.doesNotMatch(cabbage.steps.join(' '),/shredded/i);
});

test('recipe equality includes result, order, quantities and cooking stage',()=>{
  const row={base:{type:'/obj/base'},ingredients:[{type:'/obj/a',amount:'1'},{type:'/obj/b',amount:'2'}],result:'/obj/result',needsCooking:false};
  const signature=audit.recipeSignature(row);
  assert.equal(signature,audit.recipeSignature({...row,source:'another source'}));
  for(const changed of [{...row,result:'/obj/other'},{...row,ingredients:[...row.ingredients].reverse()},{...row,ingredients:[{type:'/obj/a',amount:'2'},row.ingredients[1]]},{...row,needsCooking:true}])assert.notEqual(signature,audit.recipeSignature(changed));
});

test('merge validation rejects missing targets and retains all original source rows',()=>{
  const make=(id,extra={})=>({id,title:id,kind:'recipe',status:'community',steps:['Original '+id],requirements:[],facts:[],sources:[{title:id,url:'https://example.com/'+id}],sourceRows:[{row:id}],aliases:[],related:[],...extra});
  const rows=[make('a'),make('b',{ingredients:[{options:[{name:'a',id:'a'}]}]})],coverage=[{topicId:'a'}],recipeCoverage=[{topicId:'a'}],redirects={};
  const result=audit.apply(rows,coverage,recipeCoverage,redirects,{decisions:[{action:'merge',id:'a',target:'b',sources:[]}]});
  assert.equal(result.topics.length,1);assert.equal(coverage[0].topicId,'b');assert.equal(recipeCoverage[0].topicId,'b');assert.equal(redirects.a,'b');
  assert.equal(result.topics[0].sourceRows.length,2);assert.equal(result.topics[0].mergedEntries[0].steps[0],'Original a');
  assert.throws(()=>audit.apply([make('a')],[],[],{}, {decisions:[{action:'merge',id:'a',target:'missing'}]}),/Missing merge target/);
});
