/* SPDX-License-Identifier: AGPL-3.0-or-later */
const {createHash}=require('node:crypto');
const revision='2d61e02c69520dacb0f4edc1d269395713cbeafb';
const base=`https://github.com/Rotwood-Vale/Ratwood-2.0/blob/${revision}/`;
const source=(file,line)=>({title:'Ratwood 2.0 handler',url:base+file+'#L'+line});
const farming='code/modules/farming/',jobs='code/modules/roguetown/roguejobs/';
const uid=value=>'handler-'+createHash('sha256').update(value).digest('hex').slice(0,14);
function apply(data){
  if(data.currentSource?.revision&&data.currentSource.revision!==revision){data.handlerContentHeld={revision,reason:'Handler content requires a review against the new source revision.'};return data;}
  const byType=new Map(data.topics.filter(t=>t.sourceObjectType||t.sourceType).map(t=>[t.sourceObjectType||t.sourceType,t]));
  function ensure(type,name){
    if(byType.has(type))return byType.get(type);
    const t={id:uid(type),title:name,kind:'item',section:'items',category:'Materials',sourceObjectType:type,aliases:[],related:[],sources:[],requirements:[],steps:[],facts:[],gaps:['Acquisition is not yet confirmed for this exact source type.'],status:'unverified'};
    data.topics.push(t);byType.set(type,t);return t;
  }
  const item=(type,name,amount=1)=>({type,id:ensure(type,name).id,name:ensure(type,name).title,amount});
  const tool=(type,name,role='tool')=>({...item(type,name),role,consumed:false});
  function route(outputType,outputName,r){
    const t=ensure(outputType,outputName);
    r={evidence:'source',sourceRevision:revision,outputType,outputName:t.title,requirements:[],steps:[],tools:[],coProducts:[],...r};
    if(r.method==='Millstone')t.preparationRoutes=(t.preparationRoutes||[]).filter(old=>!(old.method==='Milling'&&JSON.stringify((old.ingredients||[]).map(i=>[i.type,i.amount]))===JSON.stringify(r.ingredients.map(i=>[i.type,i.amount]))));
    t.recipeRoutes=[r,...(t.recipeRoutes||[]).filter(old=>old.id!==r.id)];
    t.related=[...new Set([...(t.related||[]),...r.ingredients.map(i=>i.id),...r.tools.map(i=>i.id),...r.coProducts.map(i=>i.id)].filter(id=>id&&id!==t.id))];
    t.sources=[...new Map([...(t.sources||[]),...(r.sources||[])].map(s=>[s.url,s])).values()];
    t.status='source';t.sourceRevision=revision;
    t.gaps=(t.gaps||[]).filter(g=>!/^Acquisition|^A complete source-backed/.test(g));
    return t;
  }
  function use(type,name,text,sources,equipment=[]){
    const t=ensure(type,name);t.publicContent=true;t.status='source';t.sourceRevision=revision;
    t.category='Tools & stations';
    t.sections=[{title:'Use',text},...(t.sections||[]).filter(s=>s.title!=='Use')];
    t.sources=[...new Map([...(t.sources||[]),...sources].map(s=>[s.url,s])).values()];
    t.related=[...new Set([...(t.related||[]),...equipment.map(e=>e.id)])];
    t.stationTools=equipment;
    t.summary ||= text.split('. ')[0]+'.';
    return t;
  }
  const fibers='/obj/item/natural/fibers',grown='/obj/item/reagent_containers/food/snacks/grown/';
  const club=tool('/obj/item/rogueweapon/mace/woodclub','wooden club');
  for(const crop of ['wheat','oat','rice']){
    const stalk='/obj/item/natural/chaff/'+crop,grain=grown+crop;
    for(const method of ['Shucking','Threshing']){
      const r={id:uid(stalk+method),name:method+' '+crop+' stalks',method,outputQuantity:1,ingredients:[item(stalk,crop+' stalks')],coProducts:[item(fibers,'fibers')],tools:method==='Threshing'?[club]:[],requirements:method==='Shucking'?['Empty active hand']:['Wooden club'],steps:method==='Shucking'?['Right-click the stalks with an empty active hand; finish the four-second shucking action.','Collect one grain item and one fiber item. The stalk item is consumed.']:['Strike the stalks with a wooden club. The targeted stalk is processed directly.','Other stalks on the tile are each processed with clamp(3 × Strength + 5 × Farming level, 20, 100)% chance.','Collect one grain item and one fiber item per processed stalk.'],sources:[source(farming+'chaff.dm',method==='Shucking'?10:48)],destructive:true};
      route(grain,crop+' grain',r);
      route(fibers,'fibers',{...structuredClone(r),id:uid(stalk+method+'fibers'),outputQuantity:1,coProducts:[item(grain,crop+' grain')]});
    }
    use(stalk,crop+' stalks','Shuck with an empty active hand (right-click), or strike with a wooden club to thresh. Each processed stalk gives one grain item and one fiber item; stalks are consumed. Nearby stalks have a skill- and Strength-dependent chance of being threshed.',[source(farming+'chaff.dm',10),source(farming+'chaff.dm',48)],[club]);
  }
  const wheatSeed=ensure('/obj/item/seeds/wheat','wheat seeds');
  route('/obj/item/natural/chaff/wheat','wheat stalks',{id:uid('wheat harvest'),name:'Grow and harvest wheat',method:'Farming',ingredients:[item(wheatSeed.sourceObjectType,wheatSeed.title)],outputQuantity:null,requirements:['Planted wheat in watered, nourished soil','Ripe produce'],tools:[tool('/obj/item/rogueweapon/sickle','sickle')],steps:['Plant wheat seed in prepared soil; maintain water, nourishment and plant health.','Harvest the ripe crop with a sickle. Base wheat harvest is 3–5 stalk items; Farming skill, world conditions and harvest failure can change the result.'],sources:[source(farming+'plant_def.dm',65),source(farming+'soil.dm',61)],gaps:['Base harvest settings are not a guaranteed yield or fixed completion time.']});
  const mill=tool('/obj/item/millstone','millstone','station');
  for(const [crop,line]of [['wheat',94],['oat',109],['rice',124]])route('/obj/item/reagent_containers/powder/flour','flour',{id:uid(grown+crop+'mill'),name:'Mill '+crop+' grain',method:'Millstone',ingredients:[item(grown+crop,crop+' grain')],outputQuantity:1,tools:[mill],steps:['Use the grain on a millstone and finish the grinding action. The base one-second action is shortened by Cooking skill.','Collect one flour item; the grain item is consumed.'],sources:[source(farming+'produce.dm',line),source(jobs+'cook/tools/grinding.dm',14)]});
  const furnace='/obj/machinery/light/rogue/smelter',smeltSource=source(jobs+'blacksmith/smelter.dm',204);
  const tongs=tool('/obj/item/rogueweapon/tongs','tongs');
  // Snapshot the list: ensuring outputs below may add topics without imported properties.
  for(const t of [...data.topics]){
    const type=t.sourceObjectType||t.sourceType;
    const facts=(t.itemProperties?.useCases||[]).flatMap(g=>g.facts||[]);
    const seed=facts.find(f=>f.property==='seed'&&f.type);
    if(type?.startsWith(grown)&&seed){
      const seedName=facts.find(f=>f.property==='seed_identity')?.value||t.title+' seeds';
      route(seed.type,seedName,{id:uid(type+'seed extraction'),name:'Extract seeds from '+t.title,method:'Seed extraction',ingredients:[item(type,t.title)],outputQuantity:null,destructive:true,requirements:['Produce on the ground','Blunt attack intent with noaa disabled'],steps:['Put the produce on the ground and strike it using a blunt attack intent.','The produce is destroyed even on the 5% failure chance. Success gives one seed item plus independent 90%, 23% and 6% chances for another (1–4 seed items on success).'],sources:[source(farming+'produce.dm',26)],gaps:['Fallible, variable seed yield; never count this as a guaranteed seed return.']});
    }
    const milled=facts.find(f=>f.property==='mill_result'&&f.type);
    if(milled)route(milled.type,milled.value,{id:uid(type+'mill'),name:'Mill '+t.title,method:'Millstone',ingredients:[item(type,t.title)],outputQuantity:1,tools:[mill],steps:['Use the input on the millstone and finish the grinding action. Cooking skill changes the one-second base work time.','Collect the resulting item; the input is consumed.'],sources:[{title:'Input milling declaration',url:milled.source},source(jobs+'cook/tools/grinding.dm',14)]});
    const smelt=facts.find(f=>f.property==='smeltresult'&&f.type);
    if(smelt&&smelt.type!==type)route(smelt.type,smelt.value,{id:uid(type+'smelt'),name:'Smelt '+t.title,method:'Stone furnace',ingredients:[item(type,t.title)],outputQuantity:1,tools:[tool(furnace,'stone furnace','station'),tongs],requirements:['Lit, fueled furnace'],steps:['Insert the item into a lit furnace. Right-click inserts for smelting instead of using a fuel item as fuel.','Wait for smelting to finish, then retrieve the output with empty tongs. One input produces one result; declared smelt_bar_num does not increase yield because multi-bar smelting is disabled.','Smelting skill determines the quality roll when inserting the item.'],sources:[{title:'Input smelting declaration',url:smelt.source},smeltSource],gaps:[]});
  }
  const rack=tool('/obj/machinery/tanningrack','drying rack','station');
  route('/obj/item/natural/hide/cured','cured leather',{id:uid('rack hide'),name:'Scrape hide on a drying rack',method:'Drying rack',ingredients:[item('/obj/item/natural/hide','hide')],outputQuantity:null,tools:[rack],requirements:['Anchored rack','Dagger, sword or axe cutting intent'],steps:['Place an uncured hide on an empty drying rack.','Anchor the rack with a wooden stake if needed. Work the hide using dagger, sword or axe cut intent.','Finish scraping and collect 1 to min(Skincraft level + 1, 6) leather pieces. The hide is consumed; work time is 12 − 1.5 × skill level seconds.'],sources:[source(jobs+'tailor/tanning.dm',32)],coProducts:[{...item('/obj/item/natural/cured/essence','Dendor essence'),amount:null,note:'Chance per leather piece depends on Skincraft and luck; not guaranteed.'}],gaps:['Leather quantity is random, not a fixed output.']});
  use('/obj/machinery/tanningrack','drying rack','Place uncured hide on an empty rack. Anchor it using a wooden stake, then use dagger, sword or axe cut intent to scrape leather. Skincraft reduces work time and increases the random leather range; each piece may also grant essence. Completed work grants Skincraft sleep experience equal to 2 × Intelligence. Empty-hand interaction removes the loaded hide; the stake toggles anchoring. Construction recipes below build the rack; they do not tan hide.',[source(jobs+'tailor/tanning.dm',32),source(jobs+'tailor/tanning.dm',86)],[tool('/obj/item/grown/log/tree/stake','wooden stake')]);
  use('/obj/item/millstone','millstone','Use an item with a milling result on the millstone, then finish the grinding action. It consumes one input and creates one output. The base one-second action is shortened by the Cooking time divisor.',[source(jobs+'cook/tools/grinding.dm',14)]);
  const furnaceUse='Keep the furnace lit and fueled. Left-click inserts a smeltable item; fuel items offer a fuel/smelt choice. Right-click inserts for smelting only. Retrieve finished output with empty tongs; retrieval is blocked during active smelting, unless the fire is doused. A normal furnace holds one item and uses 20 process ticks. One input becomes one smeltresult; smelt_bar_num is a declared value, not the live yield. Smelting skill rolls output quality at insertion (Legendary guarantees quality tier 6). Eligible non-ore smelted output retrieval with tongs grants 2 × Intelligence sleep experience; ash does not.';
  use(furnace,'stone furnace',furnaceUse,[source(jobs+'blacksmith/smelter.dm',44),smeltSource],[tongs]);
  use(furnace+'/great','great furnace',furnaceUse+' The great furnace holds four inputs and uses 30 process ticks. It tests alloys by the inputs’ smeltresult types: 1 coal/charcoal + 3 iron → 4 steel; 3 copper + 1 tin → 4 bronze; 3 aaslag + 1 gold → 4 gilbranze; 3 steel + 1 silver → 2 blacksteel. Failed alloy combinations fall back to one ordinary result per input. Alloy quality uses the handler’s rounded-down combined quality calculation.',[source(jobs+'blacksmith/smelter.dm',230)],[tongs]);
  for(const [out,inputs,count]of [['steel',[['/obj/item/rogueore/coal',1],['/obj/item/rogueore/iron',3]],4],['bronze',[['/obj/item/rogueore/copper',3],['/obj/item/rogueore/tin',1]],4]]){
    route('/obj/item/ingot/'+out,out+' bar',{id:uid('great alloy '+out),name:'Great furnace: '+out,method:'Great furnace alloy',outputQuantity:count,ingredients:inputs.map(([type,n])=>item(type,type.split('/').pop(),n)),tools:[tool(furnace+'/great','great furnace','station'),tongs],requirements:['Lit furnace','Insert coal as a smelting input, not fuel'],steps:['Insert the exact four-item combination and allow the furnace to finish.','Retrieve the alloy with tongs. Quality is derived from the inserted inputs.'],sources:[source(jobs+'blacksmith/smelter.dm',246)]});
  }
  use('/obj/machinery/light/rogue/oven','oven','Light and fuel the oven. Click its upper part to insert up to five items; click the upper part with an empty hand to retrieve the last item. While lit it advances each item’s cooking handler, with the last user’s Cooking skill changing speed. Remove finished food before it burns; fragile fired pottery can crack if left in prolonged heat.',[source(jobs+'cook/tools/oven.dm',23)]);
  use('/obj/machinery/light/rogue/hearth','hearth','Light and fuel the hearth. Attach a pan for frying, a pot for boiling/stew or a crucible for its supported processing. Add suitable ingredients to the attachment. Right-click to fan the flame repeatedly and speed cooking; Cooking skill changes this action. Tallow rendering requires a pot without water; deep-frying requires sufficient tallow and no water.',[source('code/game/objects/lighting/rogue_fires.dm',563)],[tool('/obj/item/cooking/pan','pan'),tool('/obj/item/reagent_containers/glass/bucket/pot','pot')]);
  use('/obj/item/reagent_containers/glass/mortar','alchemical mortar','Load an item. Left-click with a pestle to use its alchemical grinding recipe; middle-click with a pestle instead juices (preferred) or grinds into reagents. These actions consume the input. Right-click removes an unprocessed item. Valid alchemical recipe grinding grants Alchemy experience equal to Intelligence; recipes may have chance-based bonus outputs.',[source('code/modules/roguetown/roguecrafting/alchemy/mortarpestle.dm',61)],[tool('/obj/item/pestle','pestle')]);
  use('/obj/machinery/light/rogue/cauldron','cauldron','Keep the cauldron lit with at least 90 units of water and up to four alchemical ingredients. Heating accumulates 20 brewing process ticks; ingredient affinities select a result only at a score of at least five. The last user must meet the recipe’s Alchemy skill requirement. A skill failure consumes the ingredients and water into yuck; successful brewing consumes them into the recipe output. Check the specific potion route for its ingredients and skill gate.',[source('code/modules/roguetown/roguecrafting/alchemy/cauldron.dm',55)]);
  const distill=use('/obj/structure/fermentation_keg/distiller','copper distiller','Right-click an idle empty distiller to select a recipe. Supply its exact crops, items and liquids, then left-click to begin. Coal or logs heat the distiller; heat-requiring recipes advance only above their required heat. Brewing removes existing reagents, so check the selected recipe before starting. When ready, use a bottle kit to bottle, or middle-click to tap and use a container with Fill intent. Tapping removes its sale value; unsealing a brewer’s bottle removes that bottle’s sale value.',[source(farming+'fermentation_keg.dm',86),source(farming+'fermentation_keg.dm',582)],[tool('/obj/item/bottle_kit','bottle kit')]);
  const oldDistill=data.topics.find(t=>t.id==='item-distillery');
  if(oldDistill)oldDistill.related=[...new Set([distill.id,...(oldDistill.related||[])])];
  const sinew=byType.get('/obj/item/alch/sinew');
  if(sinew?.recipeRoutes?.some(r=>r.method==='Butchery')){
    sinew.publicContent=true;sinew.summary='Obtained by butchering animals; choose a source-backed carcass and quality route below. Yields depend on the animal and butchering result.';
    sinew.steps=['Choose one of the exact animal butchery routes below, obtain its carcass and use a suitable butchering tool.'];
  }
  const qualityId='reference-craftsmanship-prices';
  if(!data.topics.some(t=>t.id===qualityId))data.topics.push({id:qualityId,title:'Craftsmanship and prices',section:'reference',kind:'guide',category:'Crafting & materials',publicContent:true,status:'source',sourceRevision:revision,summary:'Equipment craftsmanship, food fare and drink ratings are different systems. A base value is not a guaranteed buyer payout.',aliases:['masterwork','flawless','scavenged quality','craft quality','appraisal','sale price'],requirements:[],steps:[],related:['guide-crafting','guide-smithing'],gaps:['Individual recipes, material quality, special items and buyers can use additional rules. Live-server markets are not tracked.'],sources:[source('code/game/objects/items.dm',1924),source('code/__DEFINES/item_quality.dm',1),source('code/modules/roguetown/roguestock/_roguestock.dm',56)],facts:[{label:'Generic quality roll',value:'The apply_quality handler uses the crafter’s relevant skill or a forced tier. Journeyman produces Standard in this handler; specific crafting systems can use different quality calculations.'},{label:'What the generic handler changes',value:'It stores the craftsmanship tier, adds a name prefix and adjusts positive sellprice. Do not multiply all combat statistics by the sale-price factor.'},{label:'Price factors',value:'Scavenged ×0.25; Ruined ×0.20; Awful ×0.35; Crude ×0.65; Rough ×0.85; Standard ×1; Fine ×1.15; Flawless ×1.30; Masterwork ×1.50.'},{label:'Stockpile buyers',value:'Quality settlement starts from the stockpile’s payout baseline and applies its own seller/crown settlement rules. It is a separate calculation from an item’s displayed base value.'}],sections:[{title:'Read the appropriate system',text:'A Fine food fare is not the same thing as Fine craftsmanship. Drink quality has its own ratings. Smelted ingot quality also follows the furnace handler and feeds later forging calculations.'},{title:'Compare quotes carefully',text:'Use the quoted buyer price for your round. Market demand, derived recipe prices, item state and quality can change values. The guide’s base appraisal and keg/bottle figures are reference values.'}]});
  data.categories=[...new Set(data.topics.map(t=>t.category))];
  if(data.counts)data.counts.topics=data.topics.length;
  data.scenarioData={...(data.scenarioData||{}),...require('./scenario-data.cjs').extract()};
  return data;
}
module.exports={apply,revision};
