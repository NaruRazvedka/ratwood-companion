const test=require('node:test'),assert=require('node:assert/strict'),core=require('../core.js');
const raw={id:'grain',title:'Grain'};
const flour={id:'flour',title:'Flour',recipeRoutes:[{outputQuantity:2,ingredients:[{id:'grain',name:'Grain',amount:3}],steps:['Mill.']}]};
test('ordinary question wording can find an ingredient or mechanic',()=>{
  const indexed=core.indexTopics([{id:'sinew',title:'Sinew',category:'Materials',section:'items'}]);
  assert.equal(core.search(indexed,{query:'How do I get sinew?'})[0].id,'sinew');
  assert.equal(core.search(indexed,{query:'Where can one obtain sinew?'})[0].id,'sinew');
});
test('source-backed recipe filters do not depend on private audit payloads',()=>{
  const topic={id:'cake',title:'Cake',section:'items',sourceRecipeVariants:[{steps:['Assemble on a table.']}]};
  assert.equal(core.recipeProfile(topic).evidence,'source');
  assert.equal(core.search(core.indexTopics([topic]),{evidence:'source'}).length,1);
});
test('table assembly counts its single base and each listed added item',()=>{
  const route=core.recipeRoutes({sourceRecipeVariants:[{base:{id:'base',name:'Base'},ingredients:[{id:'fruit',name:'Fruit'}],steps:['Assemble.']} ]})[0];
  assert.deepEqual(route.groups.map(g=>g.options[0].amount),[1,1]);
});
test('an existing floating window follows the selected topic without creating another window',async()=>{
  const mounts=[],win={closed:false,focus(){}},controller=core.floatingController({openPopup:()=>win,mount:(_win,id)=>mounts.push(id),status(){},inline(){}});
  controller.update('before-open');assert.equal(mounts.length,0);
  await controller.open('bread');controller.update('wine');assert.deepEqual(mounts,['bread','wine']);
  win.closed=true;controller.update('closed');assert.equal(mounts.length,2);
});
test('raw totals account for intermediate yields and whole preparation batches',()=>{
  const bread={id:'bread',title:'Bread',recipeRoutes:[{outputQuantity:1,ingredients:[{id:'flour',name:'Flour',amount:3}],steps:['Bake.']}]};
  const result=core.materialTotals(bread,new Map([raw,flour,bread].map(t=>[t.id,t])));
  assert.equal(result.complete,true);assert.deepEqual(result.materials,[{id:'grain',name:'Grain',amount:6}]);
});
test('ambiguous ingredients and unknown yields do not create a false total',()=>{
  const topic={id:'x',title:'Food',recipeRoutes:[{outputQuantity:1,ingredients:[{label:'Choose grain',options:[{id:'grain',amount:1},{id:'oat',amount:1}]}],steps:['Cook.']}]};
  assert.equal(core.materialTotals(topic,new Map([[raw.id,raw]])).complete,false);
  const unknown={...flour,recipeRoutes:[{...flour.recipeRoutes[0],outputQuantity:null}]};
  assert.equal(core.materialTotals(unknown,new Map([[raw.id,raw]])).complete,false);
});
test('raw totals stop cycles and avoid converting liquid volumes into item counts',()=>{
  const cycle={id:'x',title:'Loop',recipeRoutes:[{outputQuantity:1,ingredients:[{id:'x',name:'Loop',amount:1}]}]};
  assert.equal(core.materialTotals(cycle,new Map([['x',cycle]])).complete,false);
  const liquid={...cycle,recipeRoutes:[{...cycle.recipeRoutes[0],outputType:'/datum/reagent/water'}]};
  assert.equal(core.materialTotals(liquid,new Map()).complete,false);
});
