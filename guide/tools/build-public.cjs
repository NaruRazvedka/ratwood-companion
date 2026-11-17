/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function sanitize(data){
  const clone=structuredClone(data);
  clone.publicEdition=true;
  clone.topics=clone.topics.filter(t=>t.section!=='sources'&&t.kind!=='source');
    const sourceFields=['id','title','kind','section','category','aliases','related','sources','status','sourceRevision','sourceType','sourceObjectType','sprite','spriteEvidence','itemInfo','itemProperties','preparationRoutes','sourceRecipeVariants','potRecipes','heatingRoutes','recipeRoutes','ingredients','availability','station','recipe','publicContent','traitClass','traitClasses','choiceType'];
  clone.topics=clone.topics.map(t=>{
    const out=Object.fromEntries(sourceFields.filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));
    if(out.category==='Armor')out.category='Clothing & armor';
    const current=t.publicContent;
    const traced=t.recipeRoutes?.length||t.preparationRoutes?.length||t.sourceRecipeVariants?.length||t.potRecipes?.length||t.heatingRoutes?.length;
    out.summary=current||t.kind==='guide'?t.summary:'';
    out.requirements=current?t.requirements:traced?t.requirements||[]:[];
    out.steps=current?t.steps:traced?t.steps||[]:[];
    out.facts=current?t.facts:[];
    out.sections=t.kind==='guide'?t.sections:undefined;
    out.gaps=current?t.gaps:traced?[]:['A complete source-backed procedure is not yet attached.'];
    if(!traced){delete out.ingredients;delete out.station;}
    else if(t.recipeRoutes?.length)out.ingredients=t.recipeRoutes[0].ingredients.map(i=>({label:(i.amount!=null?i.amount+' '+(i.unit||'×')+' ':'')+i.name,tool:false,options:[{id:i.id,name:i.name}]}));
    if(out.sprite?.includes('client-pack')){delete out.sprite;delete out.spriteEvidence;}
    return out;
  });
  const ids=new Set(clone.topics.map(t=>t.id));
  clone.categories=[...new Set(clone.topics.map(t=>t.category))];
  for(const t of clone.topics)t.related=(t.related||[]).filter(id=>ids.has(id));
  delete clone.coverage;delete clone.source;delete clone.catalogueAudit;
  clone.counts={topics:clone.topics.length,guides:clone.topics.filter(t=>t.section==='guides').length};
  return clone;
}
function writeBundles(data){
  const core=require('../core.js'),buckets=new Map(),summary=structuredClone(data);
  summary.detailBundles={};
  summary.topics=data.topics.map(t=>{
    const bucket=t.id.replace(/[^a-z0-9]/gi,'').slice(-1).toLowerCase()||'0';
    const filename='details/'+bucket+'.js';
    if(!buckets.has(filename))buckets.set(filename,{});
    buckets.get(filename)[t.id]=t;summary.detailBundles[t.id]=filename;
    const out={};for(const field of ['id','title','kind','section','category','summary','aliases','sprite','status','availability'])if(t[field]!==undefined)out[field]=t[field];
    out.searchKey=[...new Set(core.indexTopics([t])[0].searchKey.split(' '))].join(' ');
    out.recipeProfile=core.recipeProfile(t);out.detailLoaded=false;
    if(t.itemInfo?.description)out.itemInfo={description:t.itemInfo.description};
    return out;
  });
  const dir=path.join(root,'details');fs.mkdirSync(dir,{recursive:true});
  for(const [file,topics] of buckets)fs.writeFileSync(path.join(root,file),`/* Generated public topic details. */\nObject.assign(globalThis.GUIDE_TOPIC_DETAILS||(globalThis.GUIDE_TOPIC_DETAILS={}),${JSON.stringify(topics)});\n`);
  fs.writeFileSync(path.join(root,'search.js'),`/* Generated public search index. */\n(function(root){const data=${JSON.stringify(summary)};if(typeof module!=='undefined'&&module.exports)module.exports=data;root.GUIDE_DATA=data;})(globalThis);\n`);
  return {topics:data.topics.length,bundles:buckets.size,searchBytes:fs.statSync(path.join(root,'search.js')).size};
}
function main(){
  const seed=path.join(root,'sources/public-seed.json');
  const data=JSON.parse(fs.readFileSync(seed));
  const load=name=>JSON.parse(fs.readFileSync(path.join(root,'sources',name)));
  const fresh=path.join(root,'sources/ratwood-current/manifest.json');
  if(fs.existsSync(fresh)){
    const revision=JSON.parse(fs.readFileSync(fresh)).revision;
    const routes=load('ratwood2-preparation-routes.json');
    if(routes.some(r=>r.source?.includes('/blob/'+revision+'/'))){
      const prior=new Set();
      for(const t of data.topics){
        if(t.preparationRoutes?.length||t.sourceRecipeVariants?.length||t.potRecipes?.length||t.heatingRoutes?.length){prior.add(t.id);for(const field of ['preparationRoutes','sourceRecipeVariants','potRecipes','heatingRoutes'])delete t[field];t.steps=[];t.requirements=[];t.ingredients=[];}
        if(t.recipeRoutes)t.recipeRoutes=t.recipeRoutes.filter(r=>!['Alchemy cauldron','Butchery'].includes(r.method));
      }
      const content=require('./ratwood2-content.cjs');
      const recipeCoverage=[...content.apply(data.topics,load('ratwood2-food-recipes.json')),...content.applyStews(data.topics,load('ratwood2-stew-recipes.json'))];
      fs.writeFileSync(path.join(root,'sources/ratwood2-recipe-coverage.json'),JSON.stringify(recipeCoverage,null,2)+'\n');
      content.applyHeating(data.topics,load('ratwood2-heating.json'));
      require('./recipe-audit.cjs').applyPreparation(data.topics,routes);
      for(const t of data.topics)if(prior.has(t.id)&&!t.preparationRoutes?.length&&!t.sourceRecipeVariants?.length&&!t.potRecipes?.length&&!t.heatingRoutes?.length){t.status='unverified';t.gaps=['A preparation route from the previous revision was not confirmed by the current import. Check its historical source before relying on it.'];t.availability={state:'needs-review',note:t.gaps[0]};}
    }
  }
  const current=path.join(root,'sources/current-content.json');
  if(fs.existsSync(current))require('./current-content.cjs').apply(data,JSON.parse(fs.readFileSync(current)));
  const heartbeasts=path.join(root,'sources/current-heartbeasts.json');
  if(fs.existsSync(heartbeasts))require('./heartbeast-content.cjs').apply(data,JSON.parse(fs.readFileSync(heartbeasts)));
  const cookbook=path.join(root,'sources/cookbook-ledger.json');
  if(fs.existsSync(cookbook))require('./cookbook-content.cjs').apply(data,JSON.parse(fs.readFileSync(cookbook)));
  const textPath=path.join(root,'sources/ratwood2-item-text.json');
  if(fs.existsSync(textPath)){
    const records=JSON.parse(fs.readFileSync(textPath)),types=new Map(records.map(r=>[r.type,r]));
    for(const t of data.topics){const record=types.get(t.sourceObjectType||t.sourceType);if(record)t.itemInfo=record;}
  }
  const properties=path.join(root,'sources/ratwood2-item-properties.json');
  if(fs.existsSync(properties))require('./recipe-audit.cjs').applyProperties(data.topics,JSON.parse(fs.readFileSync(properties)));
  const sprites=path.join(root,'sources/current-sprites.json');
  if(fs.existsSync(sprites)){
    const byType=new Map(JSON.parse(fs.readFileSync(sprites)).map(r=>[r.type,r]));
    for(const t of data.topics){const sprite=byType.get(t.sourceObjectType||t.sourceType);if(sprite){t.sprite=sprite.path;t.spriteEvidence={source:sprite.source,sheet:sprite.sheet,state:sprite.state,note:sprite.note,definition:sprite.definition,revision:sprite.revision,sha:sprite.sha};}}
  }
  require('./reference-migrations.cjs').apply(data);
  const clean=sanitize(data);
  clean.updated=clean.currentSource?.reviewed||clean.updated;
  const audit=require('./recipe-audit.cjs');
  const declarations=fs.existsSync(path.join(root,'sources/ratwood2-preparation-routes.json'))?load('ratwood2-preparation-routes.json'):[];
  const byType=new Map(clean.topics.filter(t=>t.sourceObjectType).map(t=>[t.sourceObjectType,t]));
  const processingCoverage=declarations.map(r=>({id:r.id,recipeType:r.recipeType,source:r.source,evidence:r.evidence,topicId:byType.get(r.outputType)?.id||null,reason:r.evidence==='source'?'Source procedure indexed; unmatched outputs retain an identity gap.':(r.gaps||[]).join(' ')}));
  fs.writeFileSync(path.join(root,'sources/recipe-guidance-audit.json'),JSON.stringify({reviewed:clean.updated,items:audit.audit(clean.topics),processingCoverage},null,2)+'\n');
  fs.writeFileSync(path.join(root,'sources/item-text-coverage.json'),JSON.stringify(clean.topics.filter(t=>t.section==='items').map(t=>({id:t.id,title:t.title,type:t.itemInfo?.type||null,status:t.itemInfo?.description?.text?'description':t.itemInfo?.description?'empty':t.itemInfo?.descriptionDynamic?'context-dependent':'unmatched',mechanics:t.itemInfo?.mechanics?.length||0})),null,2)+'\n');
  fs.writeFileSync(path.join(root,'data.js'),`/* Generated public field guide. */\n(function(root){const data=${JSON.stringify(clean)};if(typeof module!=='undefined'&&module.exports)module.exports=data;root.GUIDE_DATA=data;})(globalThis);\n`);
  console.log(JSON.stringify(writeBundles(clean)));
}
if(require.main===module)main();
module.exports={sanitize,writeBundles};
