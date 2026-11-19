/* SPDX-License-Identifier: AGPL-3.0-or-later */
const {createHash}=require('node:crypto');
const core=require('../core.js');
function apply(data,records=[],properties=[]){
  const byType=new Map(data.topics.filter(t=>t.sourceObjectType||t.sourceType).map(t=>[t.sourceObjectType||t.sourceType,t]));
  const textByType=new Map(records.map(r=>[r.type,r])),propertyByType=new Map(properties.map(r=>[r.type,r]));
  for(const t of data.topics){const type=t.sourceObjectType||t.sourceType;if(type){t.itemInfo??=textByType.get(type);t.itemProperties??=propertyByType.get(type);if(!t.sources?.length)t.sources=(t.itemProperties?.sources||[]).map(url=>({title:'Pinned item definition',url}));}}
  const seenNames=new Set();
  for(const t of data.topics.filter(t=>t.section==='items')){
    const key=t.title.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(seenNames.has(key)&&t.id.startsWith('handler-'))t.title+=' ('+(t.sourceObjectType?.split('/').pop()==='poison'?'poison':'base variant')+')';
    seenNames.add(t.title.toLowerCase().replace(/[^a-z0-9]/g,''));
  }
  for(const t of [...data.topics])for(const field of ['recipeRoutes','preparationRoutes','sourceRecipeVariants','potRecipes','heatingRoutes'])for(const r of t[field]||[]){
    const tools=[...(r.tools||[]),...(r.toolTypes||[])];
    r.tools=[...new Map(tools.filter(x=>x.type||x.id).map(tool=>{
      let target=byType.get(tool.type),record=textByType.get(tool.type);
      if(!target&&record?.name){
        target={id:'equipment-'+createHash('sha256').update(tool.type).digest('hex').slice(0,14),title:record.name,kind:'item',section:'items',category:'Tools & stations',sourceObjectType:tool.type,itemInfo:record,itemProperties:propertyByType.get(tool.type),status:'unverified',aliases:[],sources:[],related:[],steps:[],requirements:[],facts:[],gaps:['This required equipment is source-identified; its acquisition remains unconfirmed.']};
        if(/template|^Container$/i.test(record.name))Object.assign(target,{section:'reference',category:'Equipment requirements',publicContent:true,summary:'A tool-family requirement: use a compatible subtype. Source presence does not establish an obtainable item.',facts:[{label:'Requirement',value:'Compatible '+record.name.replace(/template /i,'')}]});
        target.sources=(target.itemProperties?.sources||[]).map(url=>({title:'Pinned equipment definition',url}));
        if(!target.sources.length)target.sources=r.sources||t.sources||[];
        data.topics.push(target);byType.set(tool.type,target);
      }
      return [tool.type||tool.id,{...tool,id:target?.id||tool.id,name:target?.title||tool.name,consumed:false}];
    })).values()];
  }
  const ids=new Set(data.topics.map(t=>t.id)),usedIn=new Map();
  for(const t of data.topics)for(const r of core.recipeRoutes(t))for(const group of r.groups)for(const input of group.options)if(input.id&&input.id!==t.id){
    if(!usedIn.has(input.id))usedIn.set(input.id,new Set());usedIn.get(input.id).add(t.id);
  }
  for(const t of data.topics){
    if(t.section!=='items')continue;
    const routes=core.recipeRoutes(t),obtained=[],equipment=[];
    for(const r of routes){for(const g of r.groups)if(!g.tool)for(const i of g.options)if(ids.has(i.id)&&i.id!==t.id)obtained.push(i.id);for(const tool of r.tools||[])if(ids.has(tool.id))equipment.push(tool.id);}
    const groupIds=new Set((t.itemProperties?.useCases||[]).map(g=>g.id));
    const system=t.category==='Weapons'||groupIds.has('armor')?'guide-combat':groupIds.has('plant')?'guide-plants':t.category==='Potions'||t.category==='Alchemy ingredients'?'guide-alchemy':t.itemProperties?.brewing?'guide-brewing':groupIds.has('food')?'guide-cooking':groupIds.has('tool')?'guide-crafting':null;
    t.relationships={obtainedFrom:[...new Set(obtained)],equipment:[...new Set(equipment)],usedIn:[...(usedIn.get(t.id)||[])],system:[system,...((t.itemProperties?.useCases||[]).some(g=>g.facts.some(f=>f.property==='has_item_quality'&&f.value==='Yes'))?['reference-craftsmanship-prices']:[])].filter(id=>id&&ids.has(id))};
    t.browseTags=core.itemTags(t);
  }
  for(const record of data.scenarioData?.cauldron?.recipes||[]){
    const topic=data.topics.find(t=>t.sourceType===record.type),route=topic?.recipeRoutes?.find(r=>r.method==='Alchemy cauldron');
    if(topic){record.topicId=topic.id;record.name=topic.title;}
    if(route){record.outputQuantity=route.outputQuantity;record.outputUnit=route.outputType?.startsWith('/datum/reagent/')?'source reagent units':'item(s)';}
  }
  return data;
}
module.exports={apply};
