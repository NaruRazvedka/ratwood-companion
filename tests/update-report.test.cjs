const test=require('node:test');const assert=require('node:assert/strict');const {report}=require('../tools/propose-update.cjs');
const {snapshot,compare}=require('../tools/content-diff.cjs');
const fs=require('node:fs'),vm=require('node:vm');
const {sameRevision,sourceChanges}=require('../tools/refresh-guide.cjs');
test('update report accounts for source changes without claiming live verification',()=>{
  const text=report({revision:'abc',changes:{added:['one.dm'],changed:['two.dm'],removed:['old.dm']}});
  for(const value of ['abc','Added source files: 1','Changed source files: 1','Removed source files: 1','old.dm','does not verify'])assert.ok(text.includes(value),value);
});
test('a partially refreshed source snapshot does not suppress a content rebuild',()=>{
  assert.equal(sameRevision({revision:'new'},{currentSource:{revision:'old'}},'new'),false);
  assert.equal(sameRevision({revision:'new'},{currentSource:{revision:'new'}},'new'),true);
  assert.deepEqual(sourceChanges('M\0recipe.dm\0A\0new-system.dm\0',new Set(['recipe.dm'])),[{state:'M',path:'recipe.dm',inSnapshot:true},{state:'A',path:'new-system.dm',inSnapshot:false}]);
});
test('restricted GitHub policy keeps the prepared branch and returns a manual review link',async()=>{
  const source=fs.readFileSync(require.resolve('../tools/propose-update.cjs'),'utf8'),messages=[],calls=[];
  const module={exports:{}};
  const fakeFS={readFileSync(){return JSON.stringify({revision:'a'.repeat(40),changes:{added:[],changed:['recipe.dm'],removed:[]}});},existsSync(){return false;},appendFileSync(_file,text){messages.push(text);}};
  const context={module,require:name=>name==='node:fs'?fakeFS:{execFileSync(_cmd,args){calls.push(args);return args[0]==='status'?' M guide/data.js':'';}},process:{env:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Owner/guide',GH_TOKEN:'test-only',GITHUB_STEP_SUMMARY:'summary'}},console:{log:text=>messages.push(text)}};
  context.fetch=async(url,options)=>({ok:!url.endsWith('/pulls')||options.method!=='POST',status:403,json:async()=>url.includes('matching-refs')||url.includes('/pulls?')?[]:{message:'GitHub Actions is not permitted to create or approve pull requests.'}});
  vm.runInNewContext(source,context);await module.exports.propose();
  assert.ok(calls.some(args=>args[0]==='push'));
  assert.ok(messages.some(text=>text.includes('compare/main...codex/ratwood-source-update')));
  assert.ok(messages.some(text=>text.includes('permissions were not changed')));
});
test('topic diff detects recipe changes and ignores citation-only revision changes',()=>{
  const before=snapshot({topics:[{id:'a',title:'Wine',steps:['Brew'],sources:[{url:'old'}],sprite:'a.png'}]});
  const unchanged=snapshot({topics:[{id:'a',title:'Wine',steps:['Brew'],sources:[{url:'new'}],sprite:'a.png'}]});
  assert.equal(compare(before,unchanged).changed.length,0);
  const after=snapshot({topics:[{id:'a',title:'New wine',steps:['Distill'],sprite:'b.png'},{id:'b',title:'Potion'}]});
  const diff=compare(before,after);assert.equal(diff.changed.length,1);assert.equal(diff.renamed.length,1);assert.equal(diff.sprites.length,1);assert.equal(diff.added.length,1);
});
