/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const countBy=(rows,key)=>rows.reduce((counts,row)=>{const value=row[key]||'unspecified';counts[value]=(counts[value]||0)+1;return counts;},{});
function report(data,preparations=[],sprites={}){
  const routes=new Set(data.topics.flatMap(t=>(t.preparationRoutes||[]).map(r=>r.type||r.id).filter(Boolean)));
  return {
    revision:data.currentSource?.revision,reviewed:data.currentSource?.reviewed,
    counts:{topics:data.topics.length,items:data.topics.filter(t=>t.section==='items').length,topicsWithSprites:data.topics.filter(t=>t.sprite).length,byKind:countBy(data.topics,'kind'),byStatus:countBy(data.topics,'status')},
    definitions:{states:countBy(data.currentCoverage||[],'state'),entries:data.currentCoverage||[]},
    cookbook:{states:countBy(data.cookbookCoverage||[],'state'),entries:data.cookbookCoverage||[]},
    retiredReferences:data.retiredReferences||[],
    preparationDeclarations:{states:countBy(preparations,'evidence'),entries:preparations.map(r=>({type:r.type||r.id,output:r.outputType,state:routes.has(r.type||r.id)?'linked':r.evidence==='source'?'review-output-link':'needs-review',source:r.source}))},
    itemsNeedingResearch:data.topics.filter(t=>t.section==='items'&&!t.preparationRoutes?.length&&!t.recipeRoutes?.length&&!t.sourceRecipeVariants?.length&&!t.potRecipes?.length&&!t.heatingRoutes?.length).map(t=>({id:t.id,title:t.title,gaps:t.gaps||['Acquisition or preparation remains unconfirmed.']})),
    sprites:{matched:sprites.matched,gaps:sprites.gaps||[]},
    limits:['Source coverage does not establish the version deployed by the live server.','An unlinked declaration can be abstract, unavailable, or awaiting identity review; it is not proof of a removed recipe.','Native parser checks do not simulate a full live game round.']
  };
}
function write(){
  const data=require(path.join(root,'guide/data.js'));
  const read=name=>{const file=path.join(root,'guide/sources',name);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;};
  const output=report(data,read('ratwood2-preparation-routes.json')||[],read('current-sprite-gaps.json')||{});
  fs.writeFileSync(path.join(root,'guide/coverage-report.json'),JSON.stringify(output,null,2)+'\n');return output;
}
if(require.main===module){const value=write();console.log(JSON.stringify(value.counts));}
module.exports={report,write};
