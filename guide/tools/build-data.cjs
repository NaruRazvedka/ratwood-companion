/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if(process.argv.includes('--public')){require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'build-public.cjs')],{stdio:'inherit'});process.exit(0);}
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'sources/workbook.json'), 'utf8'));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const slug = text => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const meaningful = text => text && text.trim() && !/^[-–—]+$/.test(text.trim());
const topics = [], coverage = [];
const categories = ['Start here', 'Plants & gathering', 'Cooking & brewing', 'Alchemy', 'Crafts & equipment', 'Combat & armor', 'Medicine', 'Magic & faith', 'Heartbeasts', 'Sources'];
topics.push({id:'guide-about',title:'About this field guide',category:'Sources',kind:'source',status:'community',summary:'An offline companion built from the Lowtown Guidebook, its linked heartbeast reference, Ratwood documentation, and clearly identified historical source code.',facts:[
  {label:'Original guidebook',value:'Wicker (Casteroki), with Gretta (.Clocks), Ludwig (Lancashirelad), Rae (Obviousalias), Sasha Smoothscales (Gramorin), Tark (icey0525), Tori (dovahkitt3), and Fix-The-Thing (Altangy). Original notes and cell references are preserved in the source records.'},
  {label:'How to read the labels',value:'Community reference means player-written information. Cross-checked sources means sources agree; it does not mean a current-server test. Historical source refers to the public Ratwood revision from August 2025. Needs confirmation identifies an unresolved information gap.'},
  {label:'Floating guide',value:'Float guide requests a browser picture-in-picture window. Keep the main guide open. If that feature is unavailable, use the compact popup and pin it with your window manager, or use the compact view in this page. The website cannot guarantee pinning over an exclusive-fullscreen game.'},
  {label:'Local bookmarks',value:'Bookmarks stay in this browser when storage is available. Old guide bookmarks redirect to their merged system guide. Procedures are written instructions, without progress markings.'},
  {label:'Sprites',value:'Matched crops, dishes, ingredients, tools and equipment sprites are bundled from the historical Ratwood source. They are visual references. Runtime tinting and current-server sprites can differ. Unmatched items use a neutral marker rather than a substitute picture.'},
  {label:'Coverage and uncertainties',value:'Every nonempty source row has a retained destination, including section markers. A reference topic is not a claim that every acquisition route is known. Unknown locations, recipes, costs and conflicting procedures are explicitly identified.'}
],related:[],sources:[{title:'Lowtown Guidebook-Public',url:workbook.url,note:'Original workbook and contributor credits; imported 2026-11-12.'},{title:'Ratwood wiki guides',url:'https://wiki.ratwood.rip/index.php/Guides',note:'Documentation includes unfinished and historical material.'},{title:'Historical Ratwood Keep source',url:'https://github.com/Rotwood-Vale/Ratwood-Keep/tree/74f55d70294af6ac3650d7e2839ef70b3ce7db0d',note:'Pinned revision; not a mirror of the running server.'},{title:'Browser picture-in-picture documentation',url:'https://developer.chrome.com/docs/web-platform/document-picture-in-picture',note:'Always-on-top document windows where the browser supports them.'}],gaps:['Current-server mechanics and operation above a live BYOND game have not been playtested.']});
const sections = [
  ['Sources', 'source'], ['Crafts & equipment', 'training'], ['Alchemy', 'ingredient'], ['Alchemy', 'potion'],
  ['Alchemy', 'recipe'], ['Medicine', 'procedure'], ['Cooking & brewing', 'recipe'], ['Cooking & brewing', 'recipe'],
  ['Combat & armor', 'armor'], ['Magic & faith', 'spell'], ['Magic & faith', 'miracle'], ['Heartbeasts', 'heartbeast']
];
const compactPath=path.join(root,'research/compact-guides.json');
const compact=fs.existsSync(compactPath)?read('research/compact-guides.json'):[];
for (const filename of fs.readdirSync(path.join(root, 'research')).filter(name => name.endsWith('.json')).sort()) {
  for (const topic of read('research/' + filename)) {
    if(compact.length&&filename!=='compact-guides.json'&&(topic.kind||'guide')==='guide')continue;
    topics.push({ kind: 'guide', status: 'community', aliases: [], related: [], gaps: [], ...topic });
  }
}

function addWorkbook(book, extra = false) {
  for (let index = 0; index < book.sheets.length; index++) {
    const sheet = book.sheets[index];
    const [category, kind] = extra ? ['Heartbeasts', 'heartbeast'] : sections[index];
    const prefix = extra ? 'heartbook' : 'sheet';
    const overviewId = `${prefix}-${index + 1}`;
    const overview = { id: overviewId, title: sheet.name, category: 'Sources', kind: 'source', summary: 'Original community reference, with its notes and cell references preserved.', status: 'community', sources: [{ title: book.title + ' · ' + sheet.name, url: book.url, note: 'Imported ' + book.imported }], facts: [], rows: sheet.rows, related: [], gaps: [] };
    topics.push(overview);
    const initialHeader = Object.fromEntries(sheet.rows[0].cells.map(c => [c.cell.replace(/\d/g, ''), c.text.trim()]));
    let context = '', family = '';
    let lastId = overviewId;
    for (const row of sheet.rows) {
      const cells = Object.fromEntries(row.cells.map(c => [c.cell.replace(/\d/g, ''), c.text.trim()]));
      const first = row.cells.find(c => meaningful(c.text));
      const primary = cells.B || first?.text || '';
      let reason = 'entry', id = lastId;
      const isHeading = row === sheet.rows[0] || (!extra && index === 0) || /^\d+(\.\d+)?$/.test(primary);
      if (cells.A && !/^\d/.test(cells.A)) context = cells.A;
      if (isHeading) reason = row === sheet.rows[0] ? 'header' : 'context';
      else if (!extra && index === 10 && row.cells.length === 1 && primary.length < 60) { context = primary; reason = 'context'; }
      else if (!extra && index === 6 && row.row === 186) { reason = 'context'; family = 'soups'; }
      else {
        let title = primary.replace(/:$/, '').trim();
        let facts = row.cells.filter(c => c !== first && c.cell.replace(/\d/g, '') !== 'A').map(c => ({ label: initialHeader[c.cell.replace(/\d/g, '')] || 'Source note', value: c.text.trim(), cell: c.cell })).filter(f => meaningful(f.value));
        let steps = [], requirements = [], summary = '', gaps = [];
        if (!extra && index === 6 && family === 'soups' && row.row < 204) {
          title = `${cells.C} ${cells.D === 'Veggie' ? 'soup' : (cells.D || '').toLowerCase()}`;
          if (cells.C === cells.D) title = cells.C;
          facts = [{ label: 'Family', value: cells.D, cell: `D${row.row}` }, { label: 'Ingredient', value: cells.E, cell: `E${row.row}` }, { label: 'Water (sheet)', value: '30 drams per ingredient', cell: 'F186' }];
          requirements = [cells.E, 'Water', 'Cooking pot', 'Heat source'];
          summary = `A ${cells.D.toLowerCase()} made with ${cells.E.toLowerCase()}, listed in the community soup table.`;
          steps = ['Use 30 drams of water per ingredient, as specified by the soup table.'];
          gaps.push('The sheet provides the ingredient and water ratio, but does not specify a current-server cooking duration or complete pot interaction sequence. Older wiki batch sizes differ; see the soup guide.');
        } else if (index === 1 && !extra) {
          summary = `Community training advice for ${title.toLowerCase()}.`;
          steps = [cells.C || ''];
        } else if (index === 2 && !extra) {
          summary = `Alchemical ingredient: ${title}. Scent strengths and source are retained from the workbook.`;
          if (meaningful(cells.F)) facts.unshift({ label: 'How to obtain (sheet)', value: cells.F, cell: `F${row.row}` });
        } else if ([3,4,6,7].includes(index) && !extra) {
          summary = index === 3 ? `Potion recipe alternatives for ${title}. Choose one alternative rather than combining every column.` : `Community recipe for ${title}.`;
          requirements = facts.filter(f => /Ingredient|Always needed|Work table|Recipe \d|Tool/.test(f.label)).map(f => f.value);
          const process = index === 6 ? cells.H : '';
          if (process) steps = process.split(/\n+/).map(x => x.trim()).filter(Boolean);
          else gaps.push('The sheet lists inputs but omits the full interaction sequence. Use the linked beginner guide and current in-game crafting menu; no missing order or duration is assumed here.');
        } else if (index === 5 && !extra) {
          summary = `Community procedure for ${title.toLowerCase()}. Read the whole sequence and the medicine guide before starting.`;
          steps = (cells.C || '').split(/\n+/).map(x => x.trim().replace(/,$/, '')).filter(Boolean);
        } else if (index === 8 && !extra) {
          summary = `${title}: coverage, weight, protection grades and crafting information from Tark's catalogue.`;
          requirements = meaningful(cells.M) ? [cells.M] : [];
        } else if ([9,10].includes(index) && !extra) {
          if (index === 10 && context) title = `${primary} · ${context}`;
          summary = index === 10 ? `Miracle reference${context ? ' for ' + context : ''}. The table retains costs, cooldowns, and casting instructions where given.` : 'Arcane spell reference with the community-reported cost, cooldown and effect.';
          if (context && index === 10) facts.unshift({ label: 'Patron / section', value: context });
          const instructions = index === 9 ? cells.F : cells.E;
          if (instructions) facts.push({ label: 'Casting and effects', value: instructions });
        } else if (extra || index === 11) {
          summary = 'Heartbeast community reference. Answers and associations are shown openly.';
        }
        if (title.length > 110) { summary = title; title = 'Notes · ' + sheet.name + ' · row ' + row.row; }
        id = `${prefix}-${index + 1}-r${row.row}`;
        const range = row.cells[0].cell + ':' + row.cells.at(-1).cell;
        const source = { title: book.title + ' · ' + sheet.name, url: book.url, note: `${sheet.name}!${range} · imported ${book.imported}` };
        topics.push({ id, title, category, kind, status: 'community', summary, requirements, steps, facts, gaps, aliases: [primary], related: [overviewId], sources: [source], sourceRows: [{ book: book.title, sheet: sheet.name, row: row.row, cells: row.cells }], imported: true });
        lastId = id;
      }
      coverage.push({ book: book.title, sheet: sheet.name, row: row.row, topicId: id, reason });
    }
  }
}
addWorkbook(workbook);
const extraPath = path.join(root, 'sources/heartbeast-workbook.json');
if (fs.existsSync(extraPath)) addWorkbook(read('sources/heartbeast-workbook.json'), true);

// Give named dependencies a destination even when their current acquisition route is undocumented.
const materialUses = new Map();
const key = text => slug(text).replace(/ies$/,'y').replace(/s$/,'');
for (const topic of topics.filter(t => t.imported)) {
  const fields = (topic.facts || []).filter(f => /^(Ingredient(?: \d+)?|Always needed|Needed Tool\/ Work table|Needed Tool\/Work table|Work table|Ingredients)$/.test(f.label));
  for (const field of fields) {
    for (const part of field.value.split(/,|\/|\s+and\s+|\s+or\s+/i)) {
      const name = part.replace(/\([^)]*\)/g,'').replace(/^\s*(?:\d+(?:\.\d+)?\+?\s*(?:oz|drams?|handfuls?|x)?\s*)+/i,'').trim();
      if (name.length < 3 || name.length > 38 || /\d|[?!:()]|^(?:any|the|of|this|with|requires|raw materials|work table|none|use )/i.test(name)) continue;
      const id = key(name);
      if (!materialUses.has(id)) materialUses.set(id,{name,uses:[],source:topic.sources[0]});
      materialUses.get(id).uses.push(topic.id);
    }
  }
}
const materialRoutes = [
  [/water/i,['learn-survival','learn-faith-orison','learn-potions']],
  [/flour|dough/i,['plant-grains','learn-cooking']],
  [/wheat|oat|rice|grain|seed/i,['plant-grains','learn-farming']],
  [/apple|pear|fruit|tangerine|plum|lemon|lime|cherry/i,['plant-apples','learn-farming']],
  [/berr/i,['plant-berries','learn-farming']],
  [/potato|tato|cabbage|onion|carrot|turnip|pumpkin|aubergine|cucumber|garlic/i,['plant-vegetables','learn-farming']],
  [/herb|artemisia|calendula|valeriana|urtica|hypericum|mentha|taraxacum|symphytum|benedictus|rosa|manabloom/i,['plant-herbs','learn-alchemy']],
  [/fish|crab|shrimp|lobster|clam|eel|shellfish/i,['tool-fishing','learn-cooking']],
  [/meat|mince|bird|cabbit|bacon|salo|sausage|sinew|viscera|bone|fat|tallow/i,['learn-butchery','learn-cooking']],
  [/hide|leather|fur/i,['tool-drying-rack','learn-butchery']],
  [/cloth|fiber|silk|needle/i,['tool-needle','learn-materials']],
  [/small log|stick|wood|timber|bucket|barrel/i,['tool-lumber','tool-carpentry']],
  [/stone|rock|clay|dirt|pot|millstone/i,['tool-masonry','tool-mining']],
  [/iron|steel|copper|tin|ore|gold|silver|ingot|bar\b|tongs|anvil/i,['tool-smithing','tool-mining']],
  [/pestle|mortar|dust|essentia|bottle|alchem/i,['learn-alchemy','learn-potions']],
  [/dough|flour|sugar|egg|butter|cheese|milk|honey|chocolate/i,['learn-cooking','learn-farming']]
];
for (const [nameKey,material] of materialUses) {
  const existing = topics.find(t => t.kind !== 'guide' && t.kind !== 'source' && key(t.title) === nameKey);
  const routes = materialRoutes.filter(([pattern])=>pattern.test(material.name)).flatMap(([,ids])=>ids);
  if (existing) { existing.related=[...new Set([...(existing.related||[]),...routes,...material.uses.filter(id=>id!==existing.id)])]; continue; }
  topics.push({id:'item-'+slug(material.name),title:material.name,category:/seed|herb|wheat|oat|berry|flower|leaf/.test(material.name.toLowerCase())?'Plants & gathering':'Crafts & equipment',kind:'item',status:'unverified',summary:`${material.name} is named as an ingredient or tool in the community workbook. Follow the preparation recipes and gathering guides below.`,requirements:[],steps:[],facts:[{label:'Used in',value:material.uses.map(id=>topics.find(t=>t.id===id)?.title).filter(Boolean).join('; ')}],related:[...new Set([...routes,...material.uses])],aliases:[],sources:[material.source],gaps:['The workbook names this dependency but does not establish a current-server acquisition route for this exact item. Related guides explain the relevant gathering or processing system; no spawn location or vendor is assumed.']});
}

// Resolve meaningful references by title, keeping original quantities and spelling visible.
const normalize = text => text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const identities = topics.filter(t => t.title.length > 2 && t.title.length < 65).map(t => ({ id:t.id, words:normalize(t.title) })).sort((a,b) => b.words.length - a.words.length);
const systems = {
  'training': ['Crafts & equipment', 'Start here'], 'ingredient': ['Alchemy', 'Plants & gathering'],
  'recipe': ['Cooking & brewing', 'Crafts & equipment'], 'potion': ['Alchemy'], 'procedure': ['Medicine'],
  'spell': ['Magic & faith'], 'miracle': ['Magic & faith'], 'armor': ['Combat & armor'], 'heartbeast': ['Heartbeasts']
};
for (const topic of topics) {
  const searchable = normalize([topic.title, topic.summary, ...(topic.requirements || []), ...(topic.steps || []), ...(topic.facts || []).map(f => f.value)].join(' '));
  const links = identities.filter(x => x.id !== topic.id && x.words.length >= 3 && (' ' + searchable + ' ').includes(' ' + x.words + ' ')).map(x => x.id);
  const guideCategories = [...new Set([topic.category,...(systems[topic.kind]||[])])];
  const guides = topic.imported ? topics.filter(t => t.kind === 'guide' && guideCategories.includes(t.category)).sort((a,b)=>Number(b.category===topic.category)-Number(a.category===topic.category)).slice(0,5).map(t => t.id) : [];
  const acquisition = topic.imported ? materialRoutes.filter(([pattern])=>pattern.test(topic.title+' '+(topic.requirements||[]).join(' '))).flatMap(([,ids])=>ids) : [];
  topic.related = [...new Set([...acquisition,...(topic.related || []), ...links, ...guides])].filter(id => id!==topic.id&&(topics.some(t => t.id === id)||compact.some(t=>(t.replaces||[]).includes(id)))).slice(0,36);
}
const organized=require('./catalogue.cjs').organize(topics,coverage,compact);
let finalTopics=organized.topics;
const auditPlan=read('sources/catalogue-decisions.json');
const currentSprites=fs.existsSync(path.join(root,'sources/ratwood2-sprites.json'))?read('sources/ratwood2-sprites.json'):[];
for(const topic of finalTopics){const asset=currentSprites.find(a=>a.names.some(n=>normalize(n)===normalize(topic.title)));if(asset)topic.sourceObjectType=asset.type;}
for(const decision of auditPlan.decisions.filter(d=>d.action==='identify')){
  const topic=finalTopics.find(t=>t.id===decision.id);if(!topic)throw Error('Missing identity target: '+decision.id);
  topic.sourceObjectType=decision.type;topic.sources.unshift(...decision.sources);
}
for(const file of ['ratwood2-production-updates.json','ratwood2-system-updates.json','ratwood2-cooking-updates.json'])if(fs.existsSync(path.join(root,'research',file)))for(const update of read('research/'+file)){
  const topic=finalTopics.find(t=>t.id===update.id);
  if(!topic)throw Error('Missing guide update target: '+update.id);
  Object.assign(topic,{sections:update.sections,sources:update.sources,gaps:update.gaps,sourceRevision:'80907df21ed15bde91106da41ce82e6ac6c40069'});
}
const sourceRecipesPath=path.join(root,'sources/ratwood2-food-recipes.json');
const tableRecipes=fs.existsSync(sourceRecipesPath)?read('sources/ratwood2-food-recipes.json'):[];
if(fs.existsSync(path.join(root,'sources/ratwood2-native-recipes.json'))){
  const native=read('sources/ratwood2-native-recipes.json');
  if(native.revision!==read('sources/ratwood-2/index.json').revision||native.passed!==native.total)throw Error('Native recipe evidence does not match the guide revision or contains failures.');
  const records=new Map(native.recipes.map(r=>[r.type,r]));
  for(const row of tableRecipes){if(!row.source.includes('/blob/'+native.revision+'/'))continue;const r=records.get(row.type);if(!r)continue;if(r.base!==row.base||r.result!==row.result)throw Error('Native recipe identity mismatch: '+row.type);row.baseSecondsPerStep=r.ticksPerStep/10;}
}
const sourceRecipeCoverage=tableRecipes.length?require('./ratwood2-content.cjs').apply(finalTopics,tableRecipes):[];
if(fs.existsSync(path.join(root,'sources/ratwood2-stew-recipes.json')))sourceRecipeCoverage.push(...require('./ratwood2-content.cjs').applyStews(finalTopics,read('sources/ratwood2-stew-recipes.json')));
if(fs.existsSync(path.join(root,'sources/ratwood2-heating.json')))require('./ratwood2-content.cjs').applyHeating(finalTopics,read('sources/ratwood2-heating.json'));
const recipeAudit=require('./recipe-audit.cjs');
const processingCoverage=fs.existsSync(path.join(root,'sources/ratwood2-preparation-routes.json'))?recipeAudit.applyPreparation(finalTopics,read('sources/ratwood2-preparation-routes.json')):[];
const about=finalTopics.find(t=>t.id==='guide-about');
about.summary='An offline reference combining the Lowtown Guidebook with pinned Ratwood 2.0 code, community documentation and retained historical records.';
about.sources.unshift({title:'Ratwood 2.0 · pinned primary source',url:'https://github.com/Rotwood-Vale/Ratwood-2.0/tree/80907df21ed15bde91106da41ce82e6ac6c40069',note:'Revision from 2026-11-12. Recipe, sprite and system checks use this source; live deployment is unverified.'});
about.facts.find(f=>f.label==='How to read the labels').value='Ratwood 2.0 source means a rule or recipe traced to the pinned November 2026 code. Community source remains player documentation. Sources compared identifies mixed evidence; Historical source refers to older code. Incomplete source marks unresolved information. None of these labels means a live-server playtest.';
about.facts.find(f=>f.label==='Sprites').value='Matched object definitions and sprite sheets from Ratwood 2.0 take precedence. Older repository and client-pack artwork remains as fallback, with its original provenance. First frames omit runtime tints and overlays. Missing matches and failed sprite loads use category guide icons.';
about.facts.push({label:'Recipe coverage',value:`${sourceRecipeCoverage.filter(r=>r.topicId).length} source recipe definitions mapped; ${sourceRecipeCoverage.filter(r=>!r.topicId).length} definitions retain unresolved type names in the research ledger. Older community-only entries are retained, not assumed removed from the game.`});
if(fs.existsSync(path.join(root,'sources/ratwood2-native-recipes.json'))){const native=read('sources/ratwood2-native-recipes.json');about.facts.push({label:'Native recipe checks',value:`BYOND ${native.byondVersion}: ${native.passed}/${native.total} fixture checks passed; ${native.recipes.length} table recipes exported at the pinned revision. Base step times exclude skill modifiers and heating. Surrounding item/reagent infrastructure is stubbed; this does not verify full-game or live-server behavior. See the local lab README for scope and commands.`});}
const assetPath = path.join(root, 'sources/sprites.json');
if (fs.existsSync(assetPath)) {
  const assets = [...(fs.existsSync(path.join(root,'sources/ratwood2-sprites.json'))?read('sources/ratwood2-sprites.json'):[]),...read('sources/sprites.json'), ...(fs.existsSync(path.join(root,'sources/client-sprites.json'))?read('sources/client-sprites.json'):[])];
  for (const topic of finalTopics) {
    if(topic.sourceObjectType?.startsWith('/datum/'))continue;
    const name = normalize(topic.title);
    const match = (topic.sourceObjectType&&assets.find(asset=>asset.type===topic.sourceObjectType))||assets.find(asset => asset.names.some(alias => normalize(alias) === name));
    if (match) { topic.sprite = match.path; if(match.sheet) topic.spriteEvidence={source:match.source,sheet:match.sheet,state:match.state,note:match.note}; }
  }
}
const data = { title: 'Ratwood field guide', updated: '2026-11-12', categories:[...new Set(finalTopics.map(t=>t.category))], redirects:organized.redirects,topics:finalTopics, coverage, source: {title:workbook.title,url:workbook.url}, counts: {tabs: workbook.sheets.length,rows:coverage.length,topics:finalTopics.length,guides:finalTopics.filter(t => t.kind==='guide').length} };
if(fs.existsSync(path.join(root,'sources/ratwood2-item-text.json'))){
  const records=read('sources/ratwood2-item-text.json'),byType=new Map(records.map(r=>[r.type,r]));
  const byName=new Map();
  const itemKey=require('./catalogue.cjs').key;
  for(const record of records)for(const name of [record.name,...(record.aliases||[])].filter(Boolean)){const k=itemKey(name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(record);}
  const aliases=read('sources/item-text-aliases.json');
  for(const topic of finalTopics.filter(t=>t.section==='items')){
    const type=topic.potRecipes?.[0].output||topic.sourceObjectType;
    const matches=byName.get(itemKey(topic.title))||[];
    const sameText=r=>JSON.stringify([r.description?.text,r.mechanics.map(m=>m.text),r.contextualMechanics,r.descriptionDynamic]);
    const record=byType.get(type)||byType.get(aliases[topic.title])||(matches.length&&matches.every(r=>sameText(r)===sameText(matches[0]))?matches[0]:null);
    if(record)topic.itemInfo=record;
  }
}
const audited=require('./catalogue-audit.cjs').apply(finalTopics,coverage,sourceRecipeCoverage,organized.redirects,auditPlan);
finalTopics=audited.topics;data.topics=finalTopics;data.categories=[...new Set(finalTopics.map(t=>t.category))];data.counts.topics=finalTopics.length;
if(fs.existsSync(path.join(root,'sources/ratwood2-item-properties.json')))recipeAudit.applyProperties(finalTopics,read('sources/ratwood2-item-properties.json'));
if(fs.existsSync(path.join(root,'sources/current-content.json')))require('./current-content.cjs').apply(data,read('sources/current-content.json'));
if(fs.existsSync(path.join(root,'sources/cookbook-ledger.json')))require('./cookbook-content.cjs').apply(data,read('sources/cookbook-ledger.json'));
const preparationAudit=recipeAudit.audit(finalTopics);
for(const row of processingCoverage)if(row.topicId)row.topicId=organized.redirects[row.topicId]||row.topicId;
fs.writeFileSync(path.join(root,'sources/recipe-guidance-audit.json'),JSON.stringify({reviewed:'2026-11-15',items:preparationAudit,processingCoverage},null,2)+'\n');
data.catalogueAudit={reviewed:auditPlan.reviewed,revision:auditPlan.revision,headChecked:auditPlan.headChecked,merged:audited.report.filter(r=>r.action==='merge').length,mergedRecords:audited.mergedRecords,archived:audited.report.filter(r=>r.action==='archive').length,conflicting:audited.report.filter(r=>r.action==='caveat').length,items:finalTopics.filter(t=>t.section==='items').length,sprites:finalTopics.filter(t=>t.section==='items'&&t.sprite).length};
fs.writeFileSync(path.join(root,'sources/catalogue-audit-report.json'),JSON.stringify({summary:data.catalogueAudit,decisions:audited.report,remainingRecipes:finalTopics.filter(t=>t.section==='items'&&t.kind==='recipe'&&!t.sourceRecipeVariants&&!t.potRecipes&&!t.heatingRoutes).map(t=>({id:t.id,title:t.title,hasSprite:!!t.sprite,availability:t.availability?.state||'community-route'}))},null,2)+'\n');
fs.writeFileSync(path.join(root,'sources/item-text-coverage.json'),JSON.stringify(finalTopics.filter(t=>t.section==='items').map(t=>({id:t.id,title:t.title,type:t.itemInfo?.type||null,status:t.itemInfo?.description?.text?'description':t.itemInfo?.description?'empty':t.itemInfo?.descriptionDynamic?'context-dependent':'unmatched',mechanics:t.itemInfo?.mechanics.length||0})),null,2)+'\n');
data.updated='2026-11-17';
const publicBuild=require('./build-public.cjs');
const publicData=publicBuild.sanitize(data);
fs.writeFileSync(path.join(root,'sources/public-seed.json'),JSON.stringify(publicData)+'\n');
publicBuild.writeBundles(publicData);
fs.writeFileSync(path.join(root, 'data.js'), `/* Generated by tools/build-data.cjs; source files are in sources/ and research/. */\n(function(root){const data=${JSON.stringify(data)};if(typeof module!=='undefined'&&module.exports)module.exports=data;else root.GUIDE_DATA=data;})(globalThis);\n`);
fs.writeFileSync(path.join(root, 'sources/coverage.json'), JSON.stringify(coverage,null,2)+'\n');
fs.writeFileSync(path.join(root,'sources/ratwood2-recipe-coverage.json'),JSON.stringify(sourceRecipeCoverage,null,2)+'\n');
console.log(data.counts);
