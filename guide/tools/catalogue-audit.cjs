/* SPDX-License-Identifier: AGPL-3.0-or-later */
const unique=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
const snapshot=t=>({id:t.id,title:t.title,steps:t.steps,requirements:t.requirements,facts:t.facts,sourceRows:t.sourceRows,sources:t.sources});
function recipeSignature(r){return JSON.stringify([r.base?.type,r.ingredients?.map(i=>[i.type,i.amount]),r.result,r.needsCooking,r.heatResults?.map(h=>[h.method,h.type])]);}
function dedupeRoutes(rows,signature){return [...new Map(rows.map(r=>[signature(r),r])).values()];}

function apply(topics,coverage,recipeCoverage,redirects,plan){
  const byId=new Map(topics.map(t=>[t.id,t])),removed=new Set(),report=[];
  function resolve(id){const seen=new Set();while(redirects[id]){if(seen.has(id))throw Error('Redirect cycle: '+id);seen.add(id);id=redirects[id];}return id;}
  for(const decision of plan.decisions.filter(d=>d.action==='merge')){
    const target=byId.get(resolve(decision.target)),other=byId.get(decision.id);
    if(!target)throw Error('Missing merge target: '+decision.target);
    if(other&&other.id!==target.id){
      target.mergedEntries=unique([...(target.mergedEntries||[]),snapshot(other),...(other.mergedEntries||[])]);
      const sourceRoute=t=>t.status==='source'&&t.steps?.length;
      if(sourceRoute(other)&&!sourceRoute(target)){
        target.mergedEntries=unique([...target.mergedEntries,snapshot(target)]);
        for(const field of ['steps','requirements','ingredients','station','kind','status','summary','recipe','facts'])if(other[field]!==undefined)target[field]=other[field];
      }
      for(const field of ['sourceObjectType','itemInfo','sprite','spriteEvidence'])target[field]??=other[field];
      target.aliases=[...new Set([...(target.aliases||[]),other.title,...(other.aliases||[])])].filter(n=>n!==target.title);
      target.related=[...new Set([...(target.related||[]),...(other.related||[])])];
      target.sources=unique([...(target.sources||[]),...(other.sources||[]),...(decision.sources||[])]);
      target.sourceRows=unique([...(target.sourceRows||[]),...(other.sourceRows||[])]);
      for(const field of ['sourceRecipeVariants','potRecipes','heatingRoutes','preparationRoutes'])if(other[field]?.length)target[field]=[...(target[field]||[]),...other[field]];
      target.gaps=[...new Set([...(target.gaps||[]),...(other.gaps||[])])];
      removed.add(other.id);
    }
    if(decision.title)target.aliases=[...new Set([...(target.aliases||[]),decision.title])].filter(n=>n!==target.title);
    target.sources=unique([...(target.sources||[]),...(decision.sources||[])]);
    redirects[decision.id]=target.id;
    report.push({...decision,result:other?'merged':'already resolved by type'});
  }
  topics=topics.filter(t=>!removed.has(t.id));
  for(const decision of plan.decisions.filter(d=>d.preparation)){
    const topic=byId.get(resolve(decision.id));if(!topic)throw Error('Missing recipe correction: '+decision.id);
    topic.previousPreparation??={steps:topic.steps,requirements:topic.requirements,facts:topic.facts};
    Object.assign(topic,decision.preparation,{status:'source',recipe:true});
    topic.sources=unique([...decision.sources,...topic.sources]);
    topic.gaps=['The audited source uses whole cabbage; the earlier shredded-cabbage instruction is retained for comparison. Live-server deployment has not been tested.'];
    report.push({...decision,action:'recipe-correction'});
  }
  for(const decision of plan.decisions.filter(d=>['archive','caveat'].includes(d.action))){
    const topic=byId.get(resolve(decision.id));if(!topic)throw Error('Missing audit target: '+decision.id);
    topic.availability={state:decision.action==='archive'?'historical-unconfirmed':'conflicting-route',label:decision.label,reason:decision.reason,sources:decision.sources};
    topic.sources=unique([...(decision.sources||[]),...topic.sources]);
    topic.gaps=[decision.reason,...topic.gaps];
    if(decision.action==='archive'){topic.section='sources';topic.category='Historical recipes';topic.summary='Historical recipe; no active route confirmed in the audited source.';}
    else{
      topic.previousPreparation??={steps:topic.steps,requirements:topic.requirements,facts:topic.facts};
      topic.steps=[];topic.ingredients=[];topic.requirements=[];topic.recipe=false;
      topic.heatingRoutes=[];
    }
    report.push(decision);
  }
  for(const id of Object.keys(redirects))redirects[id]=resolve(redirects[id]);
  const valid=new Set(topics.map(t=>t.id));
  const fix=input=>{if(input.id)input.id=resolve(input.id);};
  for(const t of topics){
    t.related=[...new Set((t.related||[]).map(resolve))].filter(id=>id!==t.id&&valid.has(id));
    for(const group of t.ingredients||[])for(const option of group.options)fix(option);
    for(const row of t.sourceRecipeVariants||[]){fix(row.base);for(const input of row.ingredients)fix(input);}
    for(const row of t.potRecipes||[])for(const input of row.inputs)fix(input);
    for(const row of t.heatingRoutes||[])fix(row);
    for(const row of t.preparationRoutes||[])for(const input of row.ingredients)fix(input);
    if(t.sourceRecipeVariants)t.sourceRecipeVariants=dedupeRoutes(t.sourceRecipeVariants,recipeSignature);
    if(t.potRecipes)t.potRecipes=dedupeRoutes(t.potRecipes,r=>JSON.stringify([r.output,r.seconds,r.inputs.map(i=>i.type)]));
    if(t.heatingRoutes)t.heatingRoutes=dedupeRoutes(t.heatingRoutes,r=>JSON.stringify([r.inputType,r.outputType,r.method]));
    if(t.preparationRoutes)t.preparationRoutes=dedupeRoutes(t.preparationRoutes,r=>r.id);
  }
  for(const row of [...coverage,...recipeCoverage])if(row.topicId)row.topicId=resolve(row.topicId);
  return {topics,report,mergedRecords:removed.size};
}
module.exports={apply,recipeSignature};
