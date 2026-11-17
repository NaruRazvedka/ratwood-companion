const test=require('node:test');const assert=require('node:assert/strict');
const {permitted}=require('../tools/package-site.cjs');
const {report}=require('../tools/coverage-report.cjs');
test('public packaging excludes private source material and personal caches',()=>{
  for(const name of ['.validation/byond-chat-backups/chat.json','lab/private.json','share/old.zip','guide/sources/workbook.json','guide/sources/heartbeast-workbook.json','guide/assets/sprites/client-pack/art.png','assets/pterra.ttf','guide/research/original-notes.json']){
    assert.equal(permitted(name),false,name);assert.equal(permitted(name,true),false,name);
  }
});
test('coverage reports preserve unresolved entries instead of claiming completeness',()=>{
  const value=report({topics:[{id:'a',title:'Ingredient',section:'items',kind:'item',status:'unverified'}],currentCoverage:[{state:'needs-review',type:'/a'}],cookbookCoverage:[{state:'unmatched-source',title:'Dish'}]},[{type:'/recipe',evidence:'source',outputType:'/a'}]);
  assert.equal(value.definitions.states['needs-review'],1);assert.equal(value.itemsNeedingResearch[0].id,'a');assert.equal(value.preparationDeclarations.entries[0].state,'review-output-link');
});
test('runtime and repository packaging use separate explicit allowlists',()=>{
  for(const name of ['index.html','guide/app.js','guide/search.js','guide/details/items.js','guide/assets/icons/wine.svg','guide/assets/sprites/ratwood-2/food.png'])assert.ok(permitted(name),name);
  for(const name of ['tools/package-site.cjs','guide/tools/refresh-source.py','guide/sources/ratwood-current/code/items.dm','.github/workflows/pages.yml']){
    assert.ok(permitted(name,true),name);assert.equal(permitted(name),false,name);
  }
});
