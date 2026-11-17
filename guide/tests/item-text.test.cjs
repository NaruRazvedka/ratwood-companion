const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const data=require('../data.js');
const core=require('../core.js');

test('item descriptions and mechanics retain pinned source provenance',()=>{
  const items=data.topics.filter(t=>t.section==='items');
  const coverageFile=path.join(__dirname,'../sources/item-text-coverage.json');
  if(fs.existsSync(coverageFile)){
    const coverage=JSON.parse(fs.readFileSync(coverageFile,'utf8'));
    assert.equal(coverage.length,items.length);
    for(const item of items)assert.ok(coverage.some(row=>row.id===item.id));
  }
  assert.ok(items.filter(t=>t.itemInfo?.description?.text).length>550);
  for(const t of items){
    const info=t.itemInfo;if(!info)continue;
    if(info.description)assert.match(info.description.source,/Ratwood-2\.0\/blob\/[a-f0-9]{40}\/.+#L\d+$/);
    for(const hint of info.mechanics){assert.ok(hint.owner.startsWith('/obj'));assert.ok(hint.text);assert.match(hint.source,/#L\d+$/);}
  }
  const records=require('../sources/ratwood2-item-text.json');
  for(const type of Object.values(require('../sources/item-text-aliases.json')))assert.ok(records.some(r=>r.type===type),type);
});

test('food and tool examine hints include actionable preparation details',()=>{
  const find=title=>data.topics.find(t=>t.title===title);
  assert.match(find('Dough').itemInfo.description.text,/butter.*rolling pin/);
  assert.match(find('Fresh Cheese').itemInfo.mechanics.map(m=>m.text).join(' '),/four clumps of fresh cheese/);
  assert.ok(data.topics.some(t=>t.itemInfo?.mechanics.some(m=>m.text.includes('further flatten it out'))));
  const indexed=core.indexTopics(data.topics);
  assert.ok(core.search(indexed,{section:'items',query:'cocooned'}).some(t=>t.title==='Fresh Cheese'));
});

test('description renderer escapes source text and makes missing descriptions explicit',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  const prefix=app.slice(0,app.indexOf('  mainPanel=mount('));
  const context={GUIDE_DATA:data,GuideCore:core,window:{localStorage:{getItem:()=>null}},location:{href:'https://example.invalid/guide/'},URL};
  vm.runInNewContext(prefix+'globalThis.renderDescription=itemInfoHTML;})();',context);
  const html=context.renderDescription({section:'items',itemInfo:{description:{text:'<img src=x onerror="bad()">'},mechanics:[{owner:'/obj/tool',text:'<script>bad()</script>'}]}});
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);
  assert.match(context.renderDescription({section:'items'}),/No description/i);
  assert.match(context.renderDescription({section:'items',itemInfo:{description:{text:''}}}),/No written description/i);
});
