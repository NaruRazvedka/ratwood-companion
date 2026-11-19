const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../core.js');
const recipe=(id,outputQuantity,ingredients)=>({id,title:id,recipeRoutes:[{id:'make',outputQuantity,ingredients,steps:['Prepare.']}]});
const input=(id,amount)=>({id,name:id,amount});
test('batch totals aggregate shared intermediates before rounding and expose surplus',()=>{
 const grain={id:'grain',title:'grain'},flour=recipe('flour',5,[input('grain',1)]),a=recipe('a',1,[input('flour',2)]),b=recipe('b',1,[input('flour',2)]),meal=recipe('meal',1,[input('a',1),input('b',1)]),byId=new Map([grain,flour,a,b,meal].map(t=>[t.id,t]));
 const result=core.materialTotals(meal,byId);assert.equal(result.complete,true);assert.deepEqual(result.materials,[{id:'grain',name:'grain',amount:1}]);assert.deepEqual(result.surplus,[{id:'flour',name:'flour',amount:1}]);
 assert.equal(core.materialTotals(meal,byId,new Map(),{target:3}).materials[0].amount,3);
 assert.equal(core.materialTotals(meal,byId,new Map(),{target:0.5}).complete,false);
 assert.equal(core.materialTotals(meal,byId,new Map(),{target:0}).complete,false);
 assert.equal(core.materialTotals(meal,byId,new Map(),{target:NaN}).complete,false);
});
test('chosen alternatives are explicit and partial totals retain known branches',()=>{
 const wheat={id:'wheat',title:'wheat'},oat={id:'oat',title:'oat'},salt={id:'salt',title:'salt'},bread=recipe('bread',1,[{label:'Choose grain',options:[input('wheat',2),input('oat',3)]},input('salt',1)]),map=new Map([wheat,oat,salt,bread].map(t=>[t.id,t]));
 const partial=core.materialTotals(bread,map);assert.equal(partial.complete,false);assert.equal(partial.materials[0].id,'salt');
 const result=core.materialTotals(bread,map,new Map(),{choices:new Map([['bread:make:0','oat']])});assert.equal(result.complete,true);assert.equal(result.materials.find(t=>t.id==='oat').amount,3);
});
test('tool and storage cross-listing retains canonical categories and IDs',()=>{
 const rows=core.indexTopics([{id:'shovel',title:'Shovel',section:'items',category:'Weapons',itemProperties:{useCases:[{id:'tool',facts:[]}]}},{id:'bag',title:'Bag',section:'items',category:'Materials',itemProperties:{useCases:[{id:'container',facts:[{property:'screen_max_rows',value:'5'}]}]}}]);
 assert.equal(core.search(rows,{category:'Tools & stations'})[0].id,'shovel');assert.equal(rows[0].category,'Weapons');assert.equal(core.search(rows,{category:'Carrying storage'})[0].id,'bag');
});
test('equipment links and relationship directions are generated without changing topic IDs',()=>{
 const helper=require('../tools/navigation-content.cjs'),data={topics:[{id:'sack',title:'Sack',section:'items',category:'Materials',preparationRoutes:[{outputQuantity:1,ingredients:[input('cloth',2)],toolTypes:[{type:'/obj/item/needle',name:'needle'}],steps:['Sew.']}]},{id:'cloth',title:'Cloth',section:'items',category:'Materials'}]};
 helper.apply(data,[{type:'/obj/item/needle',name:'needle'}]);const needle=data.topics.find(t=>t.sourceObjectType==='/obj/item/needle');assert.ok(needle);assert.equal(data.topics[0].id,'sack');assert.equal(data.topics[0].preparationRoutes[0].tools[0].id,needle.id);assert.deepEqual(data.topics[1].relationships.usedIn,['sack']);
});
