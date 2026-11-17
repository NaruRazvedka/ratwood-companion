/* SPDX-License-Identifier: AGPL-3.0-or-later */
const {createHash}=require('node:crypto');
const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const uid=type=>'current-'+createHash('sha256').update(type).digest('hex').slice(0,14);
function apply(data,current){
  const previousManaged=new Set((data.currentCoverage||[]).map(row=>row.topicId).filter(Boolean));
  const topics=data.topics,byType=new Map(topics.filter(t=>t.sourceObjectType||t.sourceType).map(t=>[t.sourceObjectType||t.sourceType,t]));
  const byName=new Map(topics.filter(t=>t.kind!=='source').map(t=>[key(t.title),t]));
  const mapped=new Map();
  for(const entry of current.topics){
    const type=entry.sourceObjectType||entry.sourceType;
    let t=topics.find(t=>t.id===entry.id)||byType.get(type);
    if(!t&&entry.kind==='potion')t=byName.get(key(entry.title))||entry.aliases.map(a=>byName.get(key(a))).find(Boolean);
    if(t){const id=t.id;Object.assign(t,structuredClone(entry),{id});}
    else {t=structuredClone(entry);topics.push(t);}
    if(type)byType.set(type,t);byName.set(key(t.title),t);mapped.set(entry.id,t.id);
  }
  const confirmed=new Set(mapped.values());
  data.retiredReferences??=[];
  for(const t of topics)if(previousManaged.has(t.id)&&!confirmed.has(t.id)){
    t.status='historical';t.section='reference';t.category='Previous references';
    t.gaps=['This entry was not confirmed by the current source import. Its details belong to the previous recorded revision.'];
    if(!data.retiredReferences.some(row=>row.id===t.id))data.retiredReferences.push({id:t.id,title:t.title,previousRevision:t.sourceRevision,currentRevision:current.revision});
  }
  function ensure(type,name){
    if(byType.has(type))return byType.get(type);
    let t=byName.get(key(name));
    if(t?.sourceObjectType&&t.sourceObjectType!==type)t=null;
    if(!t){const title=byName.has(key(name))?`${name} (${type.split('/').slice(-2).join(' / ')})`:name;t={id:uid(type),title,kind:type.startsWith('/mob/')?'creature':'item',section:type.startsWith('/mob/')?'reference':'items',category:type.startsWith('/mob/')?'Creatures':type.includes('/alch/')?'Alchemy ingredients':'Materials',summary:'',aliases:[],requirements:[],steps:[],facts:[],related:[],sources:[{title:'Ratwood source snapshot',url:'https://github.com/Rotwood-Vale/Ratwood-2.0/tree/'+current.revision}],gaps:['Acquisition or further processing is not yet confirmed for this exact type.'],status:'unverified',sourceObjectType:type};topics.push(t);}
    t.sourceObjectType??=type;byType.set(type,t);byName.set(key(name),t);return t;
  }
  for(const row of current.acquisition){
    const t=ensure(row.outputType,row.outputName),animal=ensure(row.animalType,row.animalName);
    const route=structuredClone(row);route.ingredients[0].id=animal.id;
    t.recipeRoutes??=[];if(!t.recipeRoutes.some(r=>r.id===route.id))t.recipeRoutes.push(route);
    t.sources.push(...row.sources);t.sourceRevision=current.revision;t.status='source';
    t.related=[...new Set([...t.related,animal.id])];
    t.gaps=t.gaps.filter(g=>!/^Acquisition or|^The source names|^Named by the source/.test(g));
    if(!t.gaps.length)t.gaps.push('Source-backed butchery yields; live-server deployment has not been checked.');
  }
  for(const t of topics){
    for(const r of t.recipeRoutes||[])for(const ingredient of r.ingredients||[]){
      const input=ingredient.type&&ensure(ingredient.type,ingredient.name);
      if(input){ingredient.id=input.id;t.related=[...new Set([...(t.related||[]),input.id])].filter(id=>id!==t.id);}
    }
  }
  data.currentSource={revision:current.revision,reviewed:current.reviewed};
  data.currentCoverage=current.coverage.map(row=>({...row,topicId:mapped.get(row.topicId)||row.topicId}));
  data.categories=[...new Set(topics.map(t=>t.category))];data.counts.topics=topics.length;
  return data;
}
module.exports={apply};
