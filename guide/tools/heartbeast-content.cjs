/* SPDX-License-Identifier: AGPL-3.0-or-later */
const key=value=>{const normalized=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return normalized==='inqusitive'?'inquisitive':normalized;};
function oldFamily(topic){
  if(topic.sourceType?.startsWith('/datum/flesh_'))return topic.sourceType.split('/')[2].slice(6);
  const source=(topic.sources||[]).map(s=>s.title).join(' ');
  if(/quirk/i.test(source))return 'quirk';
  if(/traits/i.test(source))return 'trait';
  if(/archetype/i.test(source))return 'archetype';
  return 'concept';
}
function apply(data,records){
  data.redirects??={};
  const topics=data.topics,byType=new Map(topics.filter(t=>t.sourceType||t.sourceObjectType).map(t=>[t.sourceType||t.sourceObjectType,t]));
  const mapped=new Map(),removed=new Set();
  for(const record of records.topics){
    const matches=topics.filter(t=>t.kind==='heartbeast'&&oldFamily(t)===record.family&&(t.sourceType===record.sourceType||key(t.title.replace(/ \(heartbeast [^)]+\)$/,''))===key(record.baseTitle)));
    let target=byType.get(record.sourceType)||matches[0];
    if(!target){target={...structuredClone(record)};topics.push(target);}
    else{const id=target.id,aliases=matches.map(t=>t.title);Object.assign(target,structuredClone(record),{id});target.aliases=[...new Set([...target.aliases,...aliases])];}
    for(const duplicate of matches)if(duplicate.id!==target.id){data.redirects[duplicate.id]=target.id;removed.add(duplicate.id);}
    byType.set(record.sourceType,target);mapped.set(record.id,target.id);
  }
  data.topics=topics.filter(t=>!removed.has(t.id));
  const ids=new Set(data.topics.map(t=>t.id));
  const resolve=id=>{const seen=new Set();while(data.redirects[id]&&!seen.has(id)){seen.add(id);id=data.redirects[id];}return id;};
  for(const [id,target]of Object.entries(data.redirects))data.redirects[id]=resolve(target);
  for(const record of records.topics){
    const target=byType.get(record.sourceType);
    const reverse=records.topics.filter(other=>other.relatedTypes.includes(record.sourceType)).map(other=>byType.get(other.sourceType)?.id);
    target.related=[...new Set(['guide-heartbeasts',...record.relatedTypes.map(type=>byType.get(type)?.id),...reverse].filter(id=>id&&id!==target.id&&ids.has(id)))];
    if(record.requiredItem&&!byType.has(record.requiredItem.type))target.gaps.push('No item page is linked for the exact canister ingredient type '+record.requiredItem.type+'.');
  }
  for(const topic of data.topics){
    topic.related=[...new Set((topic.related||[]).map(resolve))].filter(id=>id!==topic.id&&ids.has(id));
    if(topic.kind==='heartbeast'&&!topic.sourceType?.startsWith('/datum/flesh_')){
      topic.summary='Historical heartbeast name; no matching current aspect definition was confirmed.';
      topic.gaps=['This historical name has not been matched to a current source definition.'];
      topic.status='unverified';
    }
  }
  data.heartbeastCoverage=records.coverage.map(row=>({...row,topicId:mapped.get(row.topicId)||row.topicId}));
  data.categories=[...new Set(data.topics.map(t=>t.category))];
  data.counts.topics=data.topics.length;
  return data;
}
module.exports={apply};
