/* SPDX-License-Identifier: AGPL-3.0-or-later */
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function flattenRedirects(data){
  const original={...(data.redirects||{})},ids=new Set(data.topics.map(t=>t.id)),redirects={},issues=[];
  for(const id of Object.keys(original)){
    let target=id;const visited=new Set();
    while(original[target]&&!visited.has(target)){visited.add(target);target=original[target];}
    if(visited.has(target)){issues.push({id,state:'cycle'});continue;}
    if(ids.has(target)&&id!==target)redirects[id]=target;
    else if(!ids.has(target))issues.push({id,state:'excluded-destination'});
  }
  data.redirects=redirects;data.redirectIssues=issues;
  return redirects;
}
function apply(data){
  const current=data.topics.filter(t=>t.publicContent&&t.kind==='spell'),guide=data.topics.find(t=>t.id==='guide-magic');
  if(!guide)throw Error('The merged magic guide is required for reference migrations.');
  const migrations=new Map((data.referenceMigrations||[]).map(r=>[r.id,r]));
  const removed=new Set();data.redirects??={};
  for(const t of data.topics){
    if(t.publicContent||!['spell','miracle'].includes(t.kind)||t.facts?.length||t.steps?.length||t.sections?.length||t.itemInfo?.description?.text)continue;
    const name=t.title.split(' · ')[0].replace(/\s+miracle$/i,'').trim(),normalized=key(name);
    const matches=current.filter(s=>[s.title,...(s.aliases||[])].some(n=>key(n)===normalized));
    const destination=matches.length===1?matches[0]:guide;
    destination.aliases=[...new Set([...(destination.aliases||[]),t.title,name])];
    data.redirects[t.id]=destination.id;removed.add(t.id);
    migrations.set(t.id,{id:t.id,title:t.title,target:destination.id,reason:matches.length===1?'Matching current source ability':'No unique current ability match; retained as an alias of the magic guide.'});
  }
  data.topics=data.topics.filter(t=>!removed.has(t.id));data.referenceMigrations=[...migrations.values()];
  const redirects=flattenRedirects(data),ids=new Set(data.topics.map(t=>t.id));
  for(const t of data.topics)t.related=[...new Set((t.related||[]).map(id=>redirects[id]||id))].filter(id=>ids.has(id)&&id!==t.id);
  data.categories=[...new Set(data.topics.map(t=>t.category))];data.counts.topics=data.topics.length;
  return data;
}
module.exports={apply,flattenRedirects};
