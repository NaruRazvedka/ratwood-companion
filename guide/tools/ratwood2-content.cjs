/* SPDX-License-Identifier: AGPL-3.0-or-later */
const {createHash}=require('node:crypto');
const {key}=require('./catalogue.cjs');
const uid=type=>'r2-food-'+createHash('sha256').update(type).digest('hex').slice(0,12);

function apply(topics,recipes){
  const names=new Map(topics.filter(t=>t.section==='items').map(t=>[key(t.title),t]));
  const existingTypes=new Map(topics.filter(t=>t.sourceObjectType).map(t=>[t.sourceObjectType,t]));
  const byType=new Map(existingTypes),used=new Set(),groups=new Map(),ledger=[];
  const source=r=>({title:'Ratwood 2.0 · '+r.name,url:r.source,note:'Pinned source recipe; source presence does not establish live deployment.'});
  for(const row of recipes){if(row.unresolved.length){ledger.push({type:row.type,source:row.source,unresolved:row.unresolved});continue;}if(!groups.has(row.result))groups.set(row.result,[]);groups.get(row.result).push(row);}
  for(const [type,rows] of groups){
    const row=rows[0];const alias={poisonberrycake:'berrypoisoncake',riceandbirdmeal:'riceandfrybirdmeal'};
    let t=existingTypes.get(type)||names.get(alias[key(row.name)]||key(row.name))||names.get(key(row.resultName));
    if(t&&used.has(t.id))t=null;
    if(!t){const title=names.has(key(row.resultName))?row.name:row.resultName;t={id:uid(type),title,kind:'recipe',category:/raw|uncooked|dough|base/i.test(row.resultName)?'Prepared ingredients':'Dishes',section:'items',summary:'',requirements:[],steps:[],facts:[],related:[],sources:[],gaps:[],aliases:[row.name]};topics.push(t);names.set(key(t.title),t);}
    used.add(t.id);byType.set(type,t);t.sourceObjectType=type;t.sourceRecipeVariants=rows;
  }
  function input(item,row){
    let t=byType.get(item.type)||names.get(key(item.name));
    if(!t){t={id:uid(item.type),title:item.name,kind:'item',category:item.type.includes('/grown/')?'Plants & crops':'Ingredients',section:'items',status:'unverified',summary:'',requirements:[],steps:[],facts:[],related:[],sources:[source(row)],gaps:['Named by the source recipe. Acquisition or preparation for this exact input has not yet been traced.'],aliases:[],sourceObjectType:item.type};topics.push(t);byType.set(item.type,t);names.set(key(t.title),t);}
    return {...item,id:t.id};
  }
  for(const [type,rows] of groups){
    const t=byType.get(type);t.previousPreparation={steps:t.steps,requirements:t.requirements,facts:t.facts};
    const variants=rows.map(row=>{
      const base=input({type:row.base,name:row.baseName,amount:null},row);
      const ingredients=row.ingredients.map(i=>input(i,row));
      const steps=[`Place ${base.name} on a table.`,...ingredients.map(i=>`Use ${i.amount?i.amount+' units of ':''}${i.name} on it${ingredients.length>1?' next':''}; wait for the preparation action to finish.`)];
      if(row.needsCooking)steps.push(`The assembled base is now ready to cook; it has not yet become ${row.resultName}. Cook it in a pan over a lit hearth or bake it in an oven to produce ${row.resultName}.`);
      else {steps.push(`This assembly produces ${row.resultName}.`);for(const heat of row.heatResults||[])if(heat.name)steps.push(`Optional next preparation: ${heat.method.toLowerCase()} the assembled item produces ${heat.name}.`);}
      return {...row,base,ingredients,steps};
    });
    t.sourceRecipeVariants=variants;t.status='source';t.summary='Table assembly from Ratwood 2.0. Follow the ingredient order shown.';
    t.steps=variants[0].steps;t.requirements=[variants[0].base.name,...variants[0].ingredients.map(i=>(i.amount?i.amount+' units ':'')+i.name),'Table'];
    t.ingredients=[variants[0].base,...variants[0].ingredients].map(i=>({label:(i.amount?i.amount+' units ':'')+i.name,tool:false,options:[{name:i.name,id:i.id}]}));
    t.station='Table';t.recipe=true;t.facts=[];t.gaps=['Recipe definitions are verified in the pinned repository; deployment on the live server has not been checked.'];
    t.sources=[...rows.map(source),...t.sources];
    t.related=[...new Set([...t.ingredients.flatMap(g=>g.options.map(o=>o.id)),...t.related])].filter(id=>id!==t.id);
    for(const row of rows)ledger.push({type:row.type,source:row.source,topicId:t.id,unresolved:[]});
  }
  return ledger;
}
function applyStews(topics,rows){
  const names=new Map(topics.filter(t=>t.section==='items').map(t=>[key(t.title),t]));
  const types=new Map(topics.filter(t=>t.sourceObjectType).sort((a,b)=>a.steps.length-b.steps.length).map(t=>[t.sourceObjectType,t]));
  const ledger=[];
  const renamed={oatmeal:'oatmeal porridge',congee:'congee porridge'};
  for(const row of rows){
    if(row.unresolved.length){ledger.push({type:row.type,source:row.source,unresolved:row.unresolved});continue;}
    let t=types.get(row.output)||names.get(key(renamed[row.name]||row.name));
    if(t?.sourceObjectType&&t.sourceObjectType!==row.output)t=null;
    if(!t){t={id:uid(row.output),title:row.name,kind:'recipe',section:'items',summary:'',requirements:[],steps:[],facts:[],related:[],sources:[],gaps:[],aliases:[]};topics.push(t);names.set(key(row.name),t);}
    t.sourceObjectType=row.output;types.set(row.output,t);
    if(!t.potRecipes){t.previousPreparation={steps:t.steps,requirements:t.requirements,facts:t.facts};t.potRecipes=[];t.ingredients=[];t.steps=[];t.sources=[...t.sources];}
    const inputs=row.inputs.map(i=>{
      let target=types.get(i.type)||names.get(key(i.name));
      if(target?.sourceObjectType&&target.sourceObjectType!==i.type)target=null;
      if(!target){
        const title=!names.has(key(i.name))?i.name:i.type.endsWith('/slice')?i.name+' slice':i.type.includes('/meat/nitzel/')?i.name+' (deep-fried)':i.name+' (solid ingredient)';
        target=names.get(key(title));
        if(!target){target={id:uid(i.type),title,kind:'item',section:'items',category:i.type.includes('/grown/')?'Plants & crops':'Ingredients',status:'unverified',summary:'',requirements:[],steps:[],facts:[],related:[],sources:[{title:'Ratwood 2.0 · '+row.name,url:row.source}],gaps:['The source names this input; its acquisition has not yet been traced.'],aliases:[i.name],sourceObjectType:i.type};topics.push(target);names.set(key(title),target);}
      }
      target.sourceObjectType??=i.type;
      types.set(i.type,target);
      return {...i,name:target.title,id:target.id};
    });
    const steps=['Fill a cooking pot with water; allow 30 drams for each ingredient you plan to convert.','Place the pot on a lit hearth and let it come to a boil. Right-click the hearthbound pot to fan the flames if needed.',`Left-click the boiling pot with one of the listed inputs. This variant simmers for about ${row.seconds} seconds per ingredient.`,`Serve the resulting ${row.name} into a bowl or suitable container.`];
    t.potRecipes.push({...row,inputs,steps});
    t.status='source';t.category=/\/caffeine\/|\/water\/|\/consumable\/(?:spiced_chocolate|chocolate|poppy_milk)$/.test(row.output)?'Drinks':'Soups & stews';
    t.summary='Boiling-pot recipe from Ratwood 2.0. Listed food inputs are alternatives.';
    t.requirements=['Water','Cooking pot','Lit hearth',...inputs.map(i=>i.name)];
    t.steps=t.potRecipes[0].steps;t.recipe=true;t.station='Boiling pot on a lit hearth';t.facts=[];
    t.ingredients.push({label:'Choose one: '+inputs.map(i=>i.name).join(' / '),tool:false,options:inputs.map(i=>({id:i.id,name:i.name}))});
    t.related=[...new Set([...t.related,'guide-cooking',...inputs.map(i=>i.id)])].filter(id=>id!==t.id);
    t.sources.unshift({title:'Ratwood 2.0 · '+row.name,url:row.source,note:'Exact accepted input types and simmer time. Earlier specific recipes take priority over generic recipes.'});
    t.gaps=['Source-confirmed at the pinned revision; live deployment and mixed-batch outcomes have not been tested.'];
    ledger.push({type:row.type,source:row.source,topicId:t.id,unresolved:[]});
  }
  for(const t of topics.filter(t=>t.potRecipes?.length)){
    const inputs=[...new Map(t.potRecipes.flatMap(r=>r.inputs).map(i=>[i.type,i])).values()];
    t.ingredients=[{label:'Pot ingredient — choose one source variant',tool:false,options:inputs.map(i=>({id:i.id,name:i.name}))}];
  }
  return ledger;
}
function applyHeating(topics,routes){
  const byType=new Map(topics.filter(t=>t.sourceObjectType).sort((a,b)=>a.steps.length-b.steps.length).map(t=>[t.sourceObjectType,t]));
  const byName=new Map(topics.filter(t=>t.section==='items').map(t=>[key(t.title),t]));
  for(const t of [...topics]){
    if(t.section!=='items'||t.sourceRecipeVariants||t.potRecipes||!t.sourceObjectType)continue;
    const possible=routes.filter(r=>r.outputType===t.sourceObjectType);
    if(!possible.length)continue;
    const inputs=[];
    for(const row of possible){
      let raw=byType.get(row.inputType)||byName.get(key(row.inputName));
      if(raw?.id===t.id)continue;
      if(!raw){raw={id:uid(row.inputType),title:row.inputName,kind:'item',section:'items',category:/raw|dough|base/i.test(row.inputName)?'Prepared ingredients':'Ingredients',status:'unverified',summary:'',requirements:[],steps:[],facts:[],related:[],sources:[{title:'Ratwood 2.0 · heating input',url:row.source}],gaps:['The raw input is source-defined; its preceding preparation has not yet been traced.'],aliases:[],sourceObjectType:row.inputType};topics.push(raw);byType.set(row.inputType,raw);byName.set(key(raw.title),raw);}
      if(!inputs.some(i=>i.id===raw.id&&i.method===row.method))inputs.push({...row,id:raw.id});
    }
    if(!inputs.length)continue;
    if(t.steps.length)t.previousPreparation??={steps:t.steps,requirements:t.requirements,facts:t.facts};
    t.status='source';t.kind='recipe';t.recipe=true;t.heatingRoutes=inputs;
    t.summary='Choose one of the listed heating routes; they are alternatives.';
    t.ingredients=[{label:'Raw input — choose one heating route',tool:false,options:inputs.map(i=>({name:i.inputName,id:i.id}))}];
    t.steps=[...new Set(inputs.map(i=>`${i.method} ${i.inputName}${i.method==='Bake'?' in a lit oven':' in a pan over a lit hearth'} to produce ${i.outputName}.`))];
    t.requirements=inputs.map(i=>i.inputName);t.gaps=['Heating transformations are source-defined; cooking times, fuel requirements and live deployment have not been checked for each item.'];
    t.sources=[...inputs.map(i=>({title:'Ratwood 2.0 · '+i.method+' '+i.inputName,url:i.source})),...t.sources];
    t.related=[...new Set([...t.related,...inputs.map(i=>i.id)])];
  }
}
module.exports={apply,applyStews,applyHeating};
