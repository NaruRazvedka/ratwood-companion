/* SPDX-License-Identifier: AGPL-3.0-or-later */
const {createHash}=require('node:crypto');
const {key}=require('./catalogue.cjs');
const unique=values=>[...new Set(values)];
const uid=type=>'prep-'+createHash('sha256').update(type).digest('hex').slice(0,12);
const inputLabel=i=>(i.amount!=null?(i.unit?i.amount+' '+i.unit+' of ':i.amount+' × '):'')+(i.name||'Unresolved source input');

function applyPreparation(topics,routes){
  const byType=new Map();
  for(const t of topics.filter(t=>t.section==='items'&&t.sourceObjectType))if(!byType.has(t.sourceObjectType))byType.set(t.sourceObjectType,t);
  const byName=new Map();
  for(const t of topics.filter(t=>t.section==='items'))if(!byName.has(key(t.title)))byName.set(key(t.title),t);
  for(const t of topics.filter(t=>t.section==='items'))for(const name of t.aliases||[])if(!byName.has(key(name)))byName.set(key(name),t);
  const outputs=new Map();
  for(const r of routes.filter(r=>r.evidence==='source'&&r.steps?.length&&r.outputType)){
    if(!outputs.has(r.outputType))outputs.set(r.outputType,[]);
    outputs.get(r.outputType).push(r);
  }
  for(const rows of outputs.values())rows.sort((a,b)=>(a.priority??10)-(b.priority??10));
  const match=(type,name)=>byType.get(type)||((!byName.get(key(name))?.sourceObjectType||byName.get(key(name))?.sourceObjectType===type)?byName.get(key(name)):null);
  function ensure(type,name,create=false){
    if(byType.has(type))return byType.get(type);
    if(!type||!name)return null;
    let t=match(type,name);
    if(!t&&create){
      if(byName.has(key(name)))name=`${name} (${type.split('/').slice(-2).join(' / ')})`;
      const category=type.startsWith('/turf/')||type.startsWith('/obj/structure/')||type.startsWith('/obj/machinery/')?'Construction':/\/clothing\//.test(type)?'Armor':/\/rogueweapon\//.test(type)?'Weapons':/\/grown\//.test(type)?'Plants & crops':/\/food\/|\/powder\//.test(type)?'Prepared ingredients':'Materials';
      t={id:uid(type),title:name,sourceObjectType:type,kind:'item',section:'items',category,status:'unverified',summary:'',steps:[],requirements:[],ingredients:[],facts:[],related:[],sources:[],gaps:['The source names this input; its acquisition has not yet been traced.'],aliases:[]};
      topics.push(t);byName.set(key(name),t);
    }
    if(t){t.sourceObjectType??=type;byType.set(type,t);}
    return t;
  }
  // Concrete source outputs belong in the catalogue even when the workbook omitted them.
  const queue=[];
  for(const [type,rows] of outputs){
    if(!byType.has(type))for(const alias of rows.flatMap(r=>r.outputAliases||[])){const t=byName.get(key(alias));if(t&&(!t.sourceObjectType||t.sourceObjectType===type)){t.sourceObjectType=type;byType.set(type,t);break;}}
    const t=ensure(type,rows[0].outputName,true);if(t)queue.push(t);
  }
  const visited=new Set();
  while(queue.length){
    const t=queue.shift();if(visited.has(t.id))continue;visited.add(t.id);
    const rows=outputs.get(t.sourceObjectType)||[];if(!rows.length)continue;
    t.aliases=unique([...(t.aliases||[]),...rows.flatMap(r=>r.outputAliases||[])]);
    t.preparationRoutes=rows.map(row=>{
      const ingredients=(row.ingredients||[]).map(i=>{
        const input=ensure(i.type,i.name,true);if(input){if(!input.sources.length)input.sources.push(...(row.sources||[{title:'Ratwood 2.0 · ingredient',url:row.source}]));if(!visited.has(input.id))queue.push(input);}
        return {...i,id:input?.id||null};
      });
      return {...row,ingredients};
    });
    for(const row of rows)t.sources.push(...(row.sources||[{title:'Ratwood 2.0 · '+row.method,url:row.source}]));
    t.related=unique([...t.related,...t.preparationRoutes.flatMap(r=>r.ingredients.map(i=>i.id).filter(Boolean))]).filter(id=>id!==t.id);
    if(t.sourceRecipeVariants||t.potRecipes||t.availability)continue;
    const isRecycling=r=>r.ingredients.some(i=>(outputs.get(i.type)||[]).some(back=>(back.ingredients||[]).some(b=>b.type===r.outputType)));
    const candidates=t.preparationRoutes.filter(r=>!isRecycling(r));
    const primary=candidates[0]||t.preparationRoutes[0];
    if(t.steps?.length)t.previousPreparation??={steps:t.steps,requirements:t.requirements,facts:t.facts};
    t.steps=primary.steps;t.requirements=[...primary.ingredients.map(inputLabel),...(primary.requirements||[])];
    t.ingredients=primary.ingredients.map(i=>({label:inputLabel(i),tool:false,options:[{name:i.name||'Unresolved source input',id:i.id}]}));
    if(candidates.length>1&&candidates.every(r=>r.method===primary.method&&r.ingredients.length===1)){
      const options=[...new Map(candidates.flatMap(r=>r.ingredients.map(i=>({name:i.name,id:i.id}))).map(i=>[i.id||i.name,i])).values()];
      t.ingredients=[{label:'Choose one source preparation input',tool:false,options}];
      t.steps=primary.method==='Milling'?[`Place one of the listed inputs in a millstone and process it to obtain ${t.title}.`,'These inputs are alternatives; exact batch yields are listed only where established by the source.']:['Choose one of the source preparation routes below. Inputs are alternatives; use the quantity and tools shown for that route.'];
    }
    t.station=(primary.requirements||[]).join(' · ');t.recipe=true;t.status='source';
    t.gaps=primary.gaps||[];
  }
  return routes.map(r=>({id:r.id,recipeType:r.recipeType,source:r.source,evidence:r.evidence,topicId:byType.get(r.outputType)?.id||null,reason:r.evidence==='source'?'Source procedure indexed; output may lie outside the current catalogue.':(r.gaps||[]).join(' ')}));
}

function applyProperties(topics,records){
  const byType=new Map(records.map(r=>[r.type,r]));
  const topicByType=new Map(topics.filter(t=>t.sourceObjectType||t.sourceType).map(t=>[t.sourceObjectType||t.sourceType,t]));
  const byName=new Map();
  for(const r of records)for(const name of [r.name,...(r.aliases||[])].filter(Boolean)){
    const k=key(name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(r);
  }
  for(const t of topics.filter(t=>t.section==='items'||t.kind==='spell')){
    const type=t.sourceObjectType||t.sourceType||t.itemInfo?.type||t.potRecipes?.[0].output;
    let record=byType.get(type);
    const matches=unique([t.title,...(t.aliases||[])].flatMap(n=>byName.get(key(n))||[]));
    const brews=matches.filter(r=>r.brewing);
    if(!type?.startsWith('/obj/')&&brews.length===1)record=brews[0];
    if(!record){
      if(matches.length===1)record=matches[0];
      else if(matches.length&&matches.every(r=>JSON.stringify([r.shelfLife,r.quality,r.value,r.brewing,r.useCases])===JSON.stringify([matches[0].shelfLife,matches[0].quality,matches[0].value,matches[0].brewing,matches[0].useCases])))record=matches[0];
    }
    if(record){
      t.itemProperties=structuredClone(record);
      if(type&&record.type!==type)delete t.itemProperties.useCases;
      for(const group of t.itemProperties.useCases||[]){
        if(topicByType.has(group.type))group.topicId=topicByType.get(group.type).id;
        for(const fact of group.facts)if(topicByType.has(fact.type))fact.topicId=topicByType.get(fact.type).id;
      }
    }
  }
}

function audit(topics){
  return topics.filter(t=>t.section==='items').map(t=>{
    const count=(t.preparationRoutes?.length||0)+(t.sourceRecipeVariants?.length||0)+(t.potRecipes?.length||0)+(t.heatingRoutes?.length||0)+(t.recipeRoutes?.length||0);
    const state=t.availability?.state||(count?'source-procedure':t.steps?.length?'community-procedure':t.itemInfo?.mechanics?.length?'mechanics-only':'acquisition-gap');
    const notes={
      'source-procedure':'A source procedure is attached. Review alternative routes, tool requirements and yields below; deployment is unverified.',
      'community-procedure':'Written preparation is retained from community material. A complete matching procedure was not traced in the audited source.',
      'mechanics-only':'Source examine hints are available, but a complete acquisition or preparation procedure has not been matched.',
      'acquisition-gap':'No complete preparation or acquisition procedure was matched. This does not mean the item is unavailable.',
      'historical-unconfirmed':'Historical preparation retained; no active source route was confirmed.',
      'conflicting-route':'The source preparation is conflicting; follow the warning rather than treating it as a working recipe.'
    };
    t.recipeAudit={state,procedures:count,note:notes[state]||notes['acquisition-gap']};
    return {id:t.id,title:t.title,type:t.sourceObjectType||t.itemInfo?.type||null,...t.recipeAudit};
  });
}
module.exports={applyPreparation,applyProperties,audit};
