/* SPDX-License-Identifier: AGPL-3.0-or-later */
const canonical = text => String(text).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]/g,'');
const aliases = {
  butterdough:'butterdough', buttereddough:'butterdough', smallbuttereddough:'smallbutterdough',
  mincedfish:'fishmince', fishminced:'fishmince', mincemeat:'mincedmeat', mincedmeat:'mincedmeat',
  roastedcoffeebeans:'roastcoffeebeans', driedrosepetal:'driedrosapetals', driedrosapetal:'driedrosapetals',
  rasins:'raisins', copiette:'coppiette', rollingpin:'rollingpin'
  ,jacksberry:'jacksberries',jackberry:'jacksberries',jackberries:'jacksberries',raspberries:'raspberry',strawberries:'strawberry',blackberries:'blackberry',apples:'apple',pears:'pear',potatoes:'potato',lemons:'lemon'
};
const key=text=>aliases[canonical(text)]||canonical(text);
const stripQuantity=text=>text.replace(/^\s*\d+(?:\.\d+)?\+?\s*(?:oz|drams?|x\b)?\s*/i,'').trim();
const tools=/^(?:knife|cleaver|rolling\s?pin|spoon|fork|frypan|pan|bucket|table|oven|hearth|campfire|drying rack|millstone|barrel|distillery|cauldron|alchemy table|heat source|cooking pot)$/i;
const plant=/\b(?:seed|wheat|oats?|rice|grain|berry|berries|apple|pear|plum|lemon|lime|tangerine|sugarcane|carrot|potato|cabbage|onion|turnip|tomato|garlic|garlick|pumpkin|aubergine|cucumber|flower|fyritius|swampweed|westleach|manabloom)\b/i;

function organize(topics,coverage,compact=[]) {
  const redirects={};
  for(const guide of compact)for(const old of guide.replaces||[])redirects[old]=guide.id;
  topics=topics.filter(t=>!redirects[t.id]);
  for(const t of topics) {
    t.related=[...new Set((t.related||[]).map(id=>redirects[id]||id))].filter(id=>id!==t.id);
    t.steps=(t.steps||[]).map(step=>step.replace('Cook in an oven until golden brown.Cook in an oven until golden brown.','Cook in an oven until golden brown.'));
    if(t.kind==='guide') {t.section='guides';t.category=t.category||'Systems';continue;}
    if(t.kind==='source'||t.kind==='training'||/^Notes ·|^\*|^-$/.test(t.title)) {t.section='sources';t.category='Source records';continue;}
    if(['spell','miracle','heartbeast','procedure'].includes(t.kind)) {t.section='reference';t.category=({spell:'Spells',miracle:'Miracles',heartbeast:'Heartbeasts',procedure:'Surgery'})[t.kind];continue;}
    t.section='items';
    if(t.kind==='armor')t.category='Armor';
    else if(t.kind==='potion'||/potion|elixir|venom/i.test(t.title))t.category='Potions';
    else if(t.id.startsWith('sheet-8-'))t.category='Drinks';
    else if(t.id.startsWith('sheet-7-')) {
      const row=t.sourceRows[0].row;
      t.category=row>=186&&row<204?'Soups & stews':row<=35||[68,69,70,71,72,75].includes(row)?'Prepared ingredients':'Dishes';
    }
    else if(t.id.startsWith('recipe-'))t.category='Dishes';
    else if(t.kind==='ingredient')t.category='Alchemy ingredients';
    else if(t.id.startsWith('sheet-5-'))t.category=/table|cauldron|mortar|pestle|bottle/i.test(t.title)?'Tools & stations':'Alchemy products';
    else if(tools.test(t.title)||/anvil|tongs|mortar|pestle|bottle/i.test(t.title))t.category='Tools & stations';
    else if(plant.test(t.title))t.category='Plants & crops';
    else if(/milk|water|broth|honey|oil|ale|wine/i.test(t.title))t.category='Liquids';
    else if(/meat|mince|fish|egg|salt|butter|cheese|sugar|flour|fat|bacon|chocolate|shellfish|shrimp|crab/i.test(t.title))t.category='Ingredients';
    else t.category='Materials';
    t.summary=t.summary.replace(/^Community recipe for .*?\.$/,'').replace(/^.*? is named as an ingredient or tool in the community workbook\. Follow the preparation recipes and gathering guides below\.$/,'');
    if(t.id.startsWith('item-'))t.gaps=['Acquisition for this exact item is not documented in the supplied table.'];
  }
  const butter=topics.find(t=>t.title==='Butter');
  if(butter&&!topics.some(t=>t.id==='prep-butter-slice'))topics.push({id:'prep-butter-slice',title:'Butter Slice',kind:'recipe',category:'Prepared ingredients',section:'items',status:'historical',summary:'Slice prepared butter for dough and toppings.',requirements:['Butter','Knife or cleaver'],steps:['Slice the butter with a knife or cleaver.'],facts:[],related:[butter.id],sources:[{title:'Guide to Cooking · revision 503',url:'https://wiki.ratwood.rip/index.php?title=Guide_to_Cooking&oldid=503',note:'Basic Ingredients: butter preparation and slicing.'}],gaps:['The historical guide specifies slicing but does not establish current slice yield.']});
  const byName=new Map();
  const items=topics.filter(t=>t.section==='items').sort((a,b)=>Number(a.id.startsWith('item-'))-Number(b.id.startsWith('item-')));
  for(const t of items)if(!byName.has(key(t.title)))byName.set(key(t.title),t.id);
  for(const t of items) {
    for(const name of t.aliases||[])if(!byName.has(key(name)))byName.set(key(name),t.id);
    const drink=t.title.match(/^(Cider|Wine|Beer|Ale)\s*-\s*(.+)$/i);
    if(drink)byName.set(key(drink[2]+' '+drink[1]),t.id);
  }
  for(const t of topics) {
    if(t.section!=='items')continue;
    const ingredientFacts=(t.facts||[]).filter(f=>/^Ingredient(?: \d+)?$/.test(f.label));
    const inputs=ingredientFacts.length?ingredientFacts.map(f=>f.value):(t.requirements||[]).filter(x=>!tools.test(stripQuantity(x)));
    t.ingredients=inputs.filter(Boolean).map(label=>{
      const text=stripQuantity(label);
      // Only explicit alternatives are split; quantities and original labels remain visible.
      const parts=text.split(/\s*\/\s*|\s+or\s+/i);
      const options=parts.map(name=>{const clean=stripQuantity(name);return {name:clean,id:byName.get(key(clean))||null};});
      return {label,tool:options.every(x=>tools.test(x.name)),options};
    });
    for(const g of t.ingredients)for(const opt of g.options)if(opt.id&&opt.id!==t.id&&!t.related.includes(opt.id))t.related.unshift(opt.id);
    t.recipe=Boolean(t.ingredients.length&&(t.kind==='recipe'||t.kind==='potion'||t.id.startsWith('sheet-8-')));
    t.station=(t.facts||[]).filter(f=>/Work table|Tool\/ Work table/.test(f.label)).map(f=>f.value).filter(x=>x&&x!=='-').join(' · ');
  }
  const valid=new Set(topics.map(t=>t.id));
  for(const t of topics)t.related=(t.related||[]).filter(id=>valid.has(id)&&id!==t.id);
  for(const entry of coverage)entry.topicId=redirects[entry.topicId]||entry.topicId;
  return {topics,redirects};
}
module.exports={organize,canonical,key,stripQuantity};
