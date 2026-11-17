/* SPDX-License-Identifier: AGPL-3.0-or-later */
const key=s=>String(s||'').toLowerCase().replace(/\b(?:raw|uncooked|cooked)\b/g,'').replace(/[^a-z0-9]/g,'');
function apply(data,book){
  const food='/obj/item/reagent_containers/food/snacks/rogue/';
  const identities={'butterdough piece':food+'butterdoughslice','salted milk':'/datum/reagent/consumable/milk/salted','stick of butter':'/obj/item/reagent_containers/food/snacks/butter','wheel of cheese':food+'cheddar','wedge of cheese':food+'cheddarwedge','slice of cheese':food+'cheddarslice','toast crumbs':food+'toastcrumbs','tomatoplate':food+'tomatoplate','psycrossbun':food+'psycrossbun','crossbun':food+'crossbun','raisin loaf':food+'raisinbread','zybantine cake':food+'hcake'};
  for(const [name,type] of Object.entries({fished:'fish',onioned:'onion',pearacotta:'pear',sausaged:'meat',truffled:'truffle'}))identities[name+' tomatoplate']=food+type+'tomatoplate';
  for(const fruit of ['blackberry','raspberry','lemon','tangerine','pear','plum'])identities[fruit+' bookbread']=food+fruit+'bookbread';
  identities['jacksberried bookbread']=food+'jackberrybookbread';
  for(const fruit of ['apple','blackberry','pear','plum','raspberry','strawberry','tangerine'])identities[fruit+' dot tart']=food+'dot_tart/'+fruit;
  const names=new Map();
  for(const t of data.topics.filter(t=>t.section==='items'))for(const name of [t.title,...t.aliases||[]]){const k=key(name);if(!names.has(k))names.set(k,[]);if(!names.get(k).some(x=>x.id===t.id))names.get(k).push(t);}
  const ledger=[];
  for(const row of book.entries){
    const identity=identities[row.title.toLowerCase()];
    let matches=identity?data.topics.filter(t=>t.sourceObjectType===identity):names.get(key(row.title))||[];
    if(matches.length===1){matches[0].aliases=[...new Set([...(matches[0].aliases||[]),row.title])];const orphan=data.topics.find(t=>t.id===row.id);if(orphan&&orphan!==matches[0]){data.redirects??={};data.redirects[orphan.id]=matches[0].id;data.topics.splice(data.topics.indexOf(orphan),1);}}
    if(matches.length>1){const exact=matches.filter(t=>t.title.toLowerCase()===row.title.toLowerCase());if(exact.length===1)matches=exact;}
    let t=matches.length===1?matches[0]:null;
    if(!t){t=data.topics.find(t=>t.id===row.id);if(!t){t={id:row.id,title:row.title,kind:'recipe',section:'items',category:row.sheet==='Dairy'?'Ingredients':row.sheet==='Dough'?'Prepared ingredients':'Dishes',summary:'A community cookbook entry whose exact source recipe still needs confirmation.',aliases:[],requirements:[],steps:[],facts:[],related:[],sources:[{title:book.title,url:book.url}],status:'unverified',gaps:['The workbook lists this item. Its exact current preparation has not been matched; no unverified sequence is supplied.']};data.topics.push(t);}}
    t.cookbookReferences??=[];
    const reference={sheet:row.sheet,row:row.row,cells:row.cells};
    if(!t.cookbookReferences.some(r=>r.sheet===row.sheet&&r.row===row.row))t.cookbookReferences.push(reference);
    const traced=!!(t.preparationRoutes?.length||t.sourceRecipeVariants?.length||t.potRecipes?.length||t.heatingRoutes?.length||t.recipeRoutes?.length);
    ledger.push({...row,topicId:t.id,state:matches.length===1?(traced?'source-recipe-linked':'item-linked-procedure-gap'):matches.length>1?'ambiguous-name':'unmatched-source',candidateIds:matches.map(t=>t.id)});
  }
  data.cookbookCoverage=ledger;data.categories=[...new Set(data.topics.map(t=>t.category))];data.counts.topics=data.topics.length;
  return ledger;
}
module.exports={apply};
