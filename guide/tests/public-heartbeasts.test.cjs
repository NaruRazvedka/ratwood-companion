/* SPDX-License-Identifier: AGPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const records=require('../sources/current-heartbeasts.json');
const {apply}=require('../tools/heartbeast-content.cjs');
const core=require('../core.js');

test('current heartbeast references have unique typed identities and pinned evidence',()=>{
  assert.equal(new Set(records.topics.map(t=>t.sourceType)).size,records.topics.length);
  assert.equal(new Set(records.topics.map(t=>t.id)).size,records.topics.length);
  assert.equal(records.coverage.length,records.topics.length);
  for(const family of ['concept','trait','quirk','archetype'])assert.ok(records.topics.some(t=>t.family===family));
  for(const topic of records.topics){
    assert.ok(topic.facts.length&&topic.summary,topic.sourceType);
    assert.equal(topic.sourceRevision,records.revision);
    assert.match(topic.sources[0].url,new RegExp('/'+records.revision+'/.+#L\\d+$'));
    if(topic.requiredItem){assert.match(topic.requiredItem.type,/^\/obj\//);assert.ok(topic.facts.some(f=>f.label==='Canister ingredient'));assert.ok(topic.facts.some(f=>f.label==='Calibration advances required'));}
  }
});

test('question tables and answer keywords are present verbatim in the licensed concept definitions',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../sources/ratwood-current/code/modules/roguetown/roguemachine/heartbeast/heart_concepts.dm'),'utf8');
  for(const topic of records.topics.filter(t=>t.family==='concept')){
    const keywords=topic.facts.find(f=>f.label==='Accepted answer keywords');assert.ok(keywords?.value,topic.title);
    for(const keyword of keywords.value.split(', '))assert.ok(source.includes('"'+keyword+'"'),topic.title+' keyword');
    for(const tier of [1,2,3,4]){
      const questions=topic.facts.find(f=>f.label==='Tier '+tier+' questions');assert.ok(questions?.value,topic.title+' tier '+tier);
      for(const question of questions.value.split(' · '))assert.ok(source.includes('"'+question+'"'),topic.title+' question');
    }
  }
  const pain=records.topics.find(t=>t.sourceType==='/datum/flesh_concept/pain');
  assert.match(pain.facts.find(f=>f.label==='How answers are scored').value,/30 points.*20.*25.*2 keywords.*20 or more/);
});

test('heartbeast merge preserves old IDs, redirects duplicates and separates traits from quirks',()=>{
  const topics=[
    {id:'old-pain',title:'Pain',kind:'heartbeast',sources:[{title:'Heartbeast Guide'}],related:[]},
    {id:'duplicate-pain',title:'Pain',kind:'heartbeast',sources:[{title:'Heartbeast Guide'}],related:[]},
    {id:'old-curious-trait',title:'Curious',kind:'heartbeast',sources:[{title:'Heartbeast-traits'}],related:[]},
    {id:'old-curious-quirk',title:'Curious',kind:'heartbeast',sources:[{title:'Heartbeast-Quirks'}],related:[]},
    {id:'old-inquisitive',title:'Inqusitive',kind:'heartbeast',sources:[{title:'Heartbeast-Archetypes'}],related:[]},
    {id:'character-curious',title:'Curious',kind:'trait',category:'Traits',related:[],sources:[]},
    {id:'guide-heartbeasts',title:'Heartbeasts',kind:'guide',category:'Heartbeasts',related:['duplicate-pain'],sources:[]}
  ];
  const data=apply({topics,redirects:{},counts:{}},records),byId=new Map(data.topics.map(t=>[t.id,t]));
  assert.equal(data.redirects['duplicate-pain'],'old-pain');assert.equal(byId.has('duplicate-pain'),false);
  assert.equal(byId.get('old-pain').sourceType,'/datum/flesh_concept/pain');
  assert.equal(byId.get('old-curious-trait').sourceType,'/datum/flesh_trait/curious');
  assert.equal(byId.get('old-curious-quirk').sourceType,'/datum/flesh_quirk/curious');
  assert.equal(byId.get('character-curious').sourceType,undefined);
  assert.equal(byId.get('old-inquisitive').sourceType,'/datum/flesh_archetype/inquisitive');
  assert.ok(byId.get('old-inquisitive').aliases.includes('Inqusitive'));
  assert.ok(byId.get('guide-heartbeasts').related.includes('old-pain'));
});

test('public heartbeast details retain questions, calibration, cross-links and searchable answers',()=>{
  const data=apply(structuredClone(require('../data.js')),records);
  const clean=require('../tools/build-public.cjs').sanitize(data),byId=new Map(clean.topics.map(t=>[t.id,t]));
  const aspects=clean.topics.filter(t=>t.sourceType?.startsWith('/datum/flesh_'));
  assert.equal(aspects.length,records.topics.length);
  for(const topic of aspects){assert.ok(topic.facts.length,topic.id);for(const id of topic.related)assert.ok(byId.has(id),topic.id+' → '+id);}
  for(const row of clean.heartbeastCoverage)assert.ok(byId.has(row.topicId));
  const pain=aspects.find(t=>t.sourceType==='/datum/flesh_concept/pain');
  assert.ok(core.search(core.indexTopics(clean.topics),{query:'Hurt Oww'}).some(t=>t.id===pain.id));
  const curious=aspects.find(t=>t.sourceType==='/datum/flesh_trait/curious');
  assert.ok(curious.related.some(id=>byId.get(id)?.sourceType==='/datum/flesh_concept/truth'));
  assert.match(curious.steps.join(' '),/consumes the item.*aspect rack/);
  const again=apply(structuredClone(data),records);
  assert.equal(again.topics.length,data.topics.length,'Applying a source refresh twice must not duplicate entries.');
});
