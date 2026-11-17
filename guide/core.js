/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function(root) {
  'use strict';
  const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
  function recipeRoutes(topic) {
    const groups=inputs=>(inputs||[]).map(g=>g.options?{...g,options:g.options.map(o=>({...o}))}:{label:[g.amount!=null?g.amount:'',g.unit||'',g.name||'Unresolved ingredient'].filter(v=>v!=='').join(' '),tool:Boolean(g.tool),options:[{...g}]});
    const legacy=groups(topic.ingredients);
    let routes=(topic.recipeRoutes||[]).map(r=>({...r,groups:groups(r.ingredients||r.groups||legacy)}));
    {
      routes.push(...(topic.preparationRoutes||[]).map(r=>({...r,name:r.name||r.method,groups:groups(r.ingredients)})));
      routes.push(...(topic.sourceRecipeVariants||[]).map(r=>({...r,name:r.name||'Table assembly',method:'Table assembly',groups:groups([r.base,...(r.ingredients||[])].filter(Boolean).map(i=>({...i,amount:i.amount??1}))),outputQuantity:1,requirements:['Table'],secondsPerStep:r.baseSecondsPerStep})));
      routes.push(...(topic.potRecipes||[]).map(r=>({...r,name:r.name||'Boiling pot',method:'Boiling pot',groups:[{label:'Water: 30 drams per ingredient',options:[{name:'Water',id:'item-water'}]},{label:'Choose one pot ingredient',options:r.inputs||[]}],requirements:['Cooking pot','Lit hearth'],timeLabel:r.seconds+' seconds per ingredient'})));
      routes.push(...(topic.heatingRoutes||[]).map(r=>({...r,id:null,name:r.method||r.mode||'Heating',method:r.method||r.mode||'Heating',groups:groups(r.ingredients||r.inputs||[{id:r.id,name:r.inputName}]),steps:r.steps||[`${r.method||'Heat'} ${r.inputName||'the listed input'} to produce ${r.outputName||topic.title}.`],requirements:r.requirements||[r.method==='Bake'?'Lit oven':r.method==='Fry'?'Heated frying pan':'Suitable heat source']})));
    }
    if(!routes.length&&(topic.recipe||legacy.length||topic.steps?.length))routes=[{name:'Preparation',groups:legacy,steps:topic.steps||[],requirements:topic.requirements||[],station:topic.station}];
    const seen=new Set();
    const normalized=routes.filter(r=>{const key=JSON.stringify([r.groups,r.steps]);if(seen.has(key))return false;seen.add(key);return true;}).map((r,i)=>({...r,id:String(r.id||'route-'+i),name:r.name||r.method||'Preparation '+(i+1),groups:r.groups||legacy,steps:r.steps||[],requirements:r.requirements||[],gaps:r.gaps||[]}));
    const names=new Map();for(const r of normalized)names.set(r.name,(names.get(r.name)||0)+1);
    return normalized.map(r=>names.get(r.name)>1?{...r,name:r.name+' · '+r.groups.filter(g=>!g.tool).slice(0,2).map(g=>g.label).join(' + ')}:r);
  }
  function materialTotals(topic,byId,selections=new Map()) {
    const totals=new Map(),gaps=new Set();
    function visit(t,amount,trail){
      if(trail.includes(t.id)){gaps.add('A preparation cycle needs a different route.');return;}
      const routes=recipeRoutes(t),r=routes.find(r=>r.id===selections.get(t.id))||routes[0];
      if(!r){const old=totals.get(t.id);totals.set(t.id,{id:t.id,name:t.title,amount:(old?.amount||0)+amount});return;}
      if(r.outputType?.startsWith('/datum/reagent/')){gaps.add('Liquid yields need compatible measured units; they are not converted into item counts.');return;}
      if(!Number.isFinite(r.outputQuantity)||r.outputQuantity<=0){gaps.add('A preparation yield is not known.');return;}
      const batches=Math.ceil(amount/r.outputQuantity);
      for(const group of r.groups.filter(g=>!g.tool)){
        if(group.options.length!==1){gaps.add('An ingredient has alternatives; choose it in the written recipe.');continue;}
        const input=group.options[0],child=byId.get(input.id);
        if(!child||child.detailLoaded===false){gaps.add('Expand the ingredient preparations before calculating their raw materials.');continue;}
        if(input.unit||!Number.isFinite(input.amount)||input.amount<=0){gaps.add('An ingredient amount or unit is not suitable for an item-count total.');continue;}
        visit(child,input.amount*batches,[...trail,t.id]);
      }
    }
    const routes=recipeRoutes(topic),rootRoute=routes.find(r=>r.id===selections.get(topic.id))||routes[0];
    if(rootRoute)visit(topic,rootRoute.outputQuantity||1,[]);
    return {complete:gaps.size===0,materials:[...totals.values()].sort((a,b)=>a.name.localeCompare(b.name)),gaps:[...gaps]};
  }
  function routeSummary(topic, selected) {
    const r=selected||recipeRoutes(topic)[0],s=recipeSummary(topic);
    if(!r)return s;
    const readable=value=>String(value).replace(/^\/datum\/skill\/[^/]+\//,'').replace(/SKILL_LEVEL_([A-Z_]+)/g,(_,v)=>v.toLowerCase().replaceAll('_',' '));
    return {...s,ingredients:r.groups.filter(g=>!g.tool).map(g=>g.label),tools:[...new Set([r.station,...r.requirements,...r.groups.filter(g=>g.tool).map(g=>g.label),r.skill].filter(Boolean).map(readable))],yield:r.outputLabel||(r.outputQuantity!=null?r.outputQuantity+' '+(r.outputType?.startsWith('/datum/reagent/')?'source reagent units':'item(s)'):s.yield),time:r.timeLabel||(r.secondsPerStep!=null?r.secondsPerStep+' seconds per added ingredient before skill modifiers; heating extra':r.seconds!=null?r.seconds+' seconds':s.time)};
  }
  function recipeProfile(topic){
    const methods=new Set(),skills=new Set(),methodSkills={};
    const methodNames={Bake:'Baking',Fry:'Frying',Cutting:'Cutting','Direct food preparation':'Direct preparation','Reviewed preparation':'Direct preparation'};
    const skillName=value=>!value||value==='null'?null:({'/datum/skill/craft/cooking':'Cooking','/datum/skill/craft/masonry':'Masonry','/datum/skill/craft/tanning':'Skincraft'}[value]||String(value).replace(/^\/datum\/skill\/[^/]+\//,'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));
    const add=(method,skill)=>{if(!method)return;methods.add(method);methodSkills[method]??=[];const name=skillName(skill);if(name){skills.add(name);if(!methodSkills[method].includes(name))methodSkills[method].push(name);}};
    for(const r of topic.preparationRoutes||[])add(methodNames[r.method]||r.method,r.skill);
    for(const r of topic.recipeRoutes||[])add(methodNames[r.method]||r.method,r.skill);
    if(topic.sourceRecipeVariants?.length)add('Table assembly','Cooking');
    if(topic.potRecipes?.length)add('Boiling pot','Cooking');
    for(const r of topic.heatingRoutes||[])add(methodNames[r.method]||r.method,'Cooking');
    const traced=topic.preparationRoutes?.some(r=>r.evidence==='source'&&r.steps?.length)||topic.sourceRecipeVariants?.some(r=>r.steps?.length)||topic.potRecipes?.length||topic.heatingRoutes?.length||topic.recipeRoutes?.some(r=>r.steps?.length&&!r.gaps?.length);
    const evidence=topic.availability?.state==='conflicting-route'?'conflict':topic.recipeAudit?.state==='source-procedure'||traced?'source':'incomplete';
    return {methods:[...methods].filter(Boolean).sort(),skills:[...skills].sort(),methodSkills,quality:topic.itemProperties?.quality?.label||'Not specified',evidence};
  }
  function recipeSummary(topic){
    const p=topic.itemProperties,b=p?.brewing,routes=topic.preparationRoutes||[];
    const primary=routes.find(r=>JSON.stringify(r.steps)===JSON.stringify(topic.steps))||routes[0];
    const yields=[...new Set(routes.map(r=>r.outputQuantity).filter(v=>v!=null))];
    const yieldText=b?`${b.bottles} bottles per batch`:yields.length===1&&routes.every(r=>r.outputQuantity!=null)?`${yields[0]} ${primary?.outputType?.startsWith('/datum/reagent/')?'source reagent units':'item(s)'}`:yields.length>1?'Varies by route':topic.sourceRecipeVariants?.length?'1 result per assembly':'Not stated';
    const times=[...new Set((topic.potRecipes||[]).map(r=>r.seconds))];
    const stepTimes=[...new Set((topic.sourceRecipeVariants||[]).map(r=>r.baseSecondsPerStep).filter(s=>s!=null))];
    const timeText=b?.brewSeconds!=null?`${b.brewSeconds} seconds brewing; aging is separate`:times.length?`${times.join(' / ')} seconds per pot ingredient`:stepTimes.length?`${stepTimes.join(' / ')} seconds per added ingredient before skill modifiers; heating extra`:primary?.seconds!=null?`${primary.seconds} seconds`:'Not fixed; see steps and skill requirements';
    const readable=value=>String(value).replace(/SKILL_LEVEL_([A-Z_]+)/g,(_,word)=>word.toLowerCase().replaceAll('_',' '));
    const tools=[...new Set([...(topic.station||'').split(' · '),...(primary?.requirements||[]),...(topic.ingredients||[]).filter(g=>g.tool).map(g=>g.label)].filter(Boolean).map(readable))];
    const ingredients=(topic.ingredients||[]).filter(g=>!g.tool).map(g=>g.options?.length>1?g.options.map(o=>o.name).join(' / ')+' (choose one)':g.label);
    if(topic.potRecipes?.length)ingredients.unshift('Water — 30 drams per pot ingredient');
    return {ingredients,tools,yield:yieldText,time:timeText,shelfLife:p?.shelfLife?.label||'Not stated',quality:p?.quality?.label||'Not specified',value:p?.value?.label||'No verified fixed value',alternative:routes.length>1||topic.sourceRecipeVariants?.length>1||topic.potRecipes?.length>1||topic.heatingRoutes?.length>1};
  }
  function filterOptions(topics,options={}){
    const items=topics.filter(t=>t.section==='items');
    const values={quality:p=>[p.quality],method:p=>p.methods.filter(method=>!options.skill||p.methodSkills[method]?.includes(options.skill)),skill:p=>options.method?p.methodSkills[options.method]||[]:p.skills,evidence:p=>[p.evidence]};
    return Object.fromEntries(Object.entries(values).map(([field,read])=>[field,[...new Set(search(items,{...options,[field]:''}).flatMap(t=>read(t.recipeProfile||recipeProfile(t))))].sort()]));
  }
  function indexTopics(topics) {
    return topics.map(topic => ({ ...topic, recipeProfile:topic.recipeProfile||recipeProfile(topic),titleKey: normalize(topic.title),aliasKeys:(topic.aliases||[]).map(normalize), searchKey: topic.searchKey||normalize([topic.title, ...(topic.aliases || []), topic.summary, topic.itemInfo?.description?.text, ...(topic.itemInfo?.mechanics||[]).map(m=>m.text), topic.itemProperties?.shelfLife?.label,topic.itemProperties?.quality?.label,topic.itemProperties?.value?.label,...recipeRoutes(topic).flatMap(r=>[r.name,...r.steps,...r.requirements,...r.groups.map(g=>g.label)]),...(topic.requirements || []), ...(topic.steps || []), ...(topic.sections||[]).map(s=>[s.title,s.text,...(s.steps||[]),...(s.facts||[]).map(f=>f.label+' '+f.value)].join(' ')), ...(topic.facts || []).map(f => f.label + ' ' + f.value)].join(' ')) }));
  }
  function search(topics, {query='', category='', kind='', section='',quality='',method='',skill='',evidence='', bookmarksOnly=false, bookmarks=new Set()} = {}) {
    const words=normalize(query).split(' ').filter(Boolean);
    const filler=new Set(['how','where','what','which','can','could','do','does','i','you','one','is','are','the','a','an','to','of','for','get','obtain','make']);
    const useful=words.length>1&&/^(how|where|what|which|can|could)\b/.test(normalize(query))?words.filter(word=>!filler.has(word)):words;
    const terms=useful.length?useful:words;
    const needle=terms.join(' ');
    return topics.filter(topic => {const p=topic.recipeProfile||recipeProfile(topic);return (!section||topic.section===section) && (!category || topic.category === category) && (!kind || topic.kind === kind) && (!quality||p.quality===quality)&&(!method||p.methods.includes(method))&&(!skill||p.skills.includes(skill))&&(!method||!skill||p.methodSkills[method]?.includes(skill))&&(!evidence||p.evidence===evidence)&&(!bookmarksOnly || bookmarks.has(topic.id)) && terms.every(term => topic.searchKey.includes(term));})
      .sort((a,b) => {
        const score = t => (t.titleKey===normalize(query)||t.titleKey===needle?100:t.aliasKeys?.includes(normalize(query))||t.aliasKeys?.includes(needle)?90:0)+terms.reduce((n,term)=>n+(t.titleKey.includes(term)?10:t.aliasKeys?.some(a=>a.includes(term))?8:0),0)+(t.kind==='guide'?2:0);
        return score(b)-score(a) || a.title.localeCompare(b.title);
      });
  }
  function suggestions(topics,query,limit=3) {
    const q=normalize(query);if(q.length<3||q.length>80)return [];
    const distance=(a,b)=>{let row=Array.from({length:b.length+1},(_,i)=>i),before;for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++){next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));if(i&&j&&a[i]===b[j-1]&&a[i-1]===b[j])next[j+1]=Math.min(next[j+1],before[j-1]+1);}before=row;row=next;}return row[b.length];};
    return topics.filter(t=>t.section!=='sources').map(t=>({topic:t,distance:Math.min(...[t.titleKey,...(t.aliasKeys||[])].filter(s=>Math.abs(s.length-q.length)<=2).map(s=>distance(q,s)))})).filter(r=>r.distance>0&&r.distance<=(q.length>7?2:1)).sort((a,b)=>a.distance-b.distance||a.topic.title.localeCompare(b.topic.title)).filter((r,i,a)=>a.findIndex(x=>x.topic.title===r.topic.title)===i).slice(0,limit).map(r=>r.topic);
  }
  function readBookmarks(storage, ids, redirects={}) {
    try {
      const saved = JSON.parse(storage.getItem('ratwood-guide-bookmarks') || '[]');
      if (!Array.isArray(saved) || saved.some(id => typeof id !== 'string')) throw Error('Invalid bookmarks');
      return { bookmarks:new Set(saved.map(id=>redirects[id]||id).filter(id => ids.has(id))), available:true };
    } catch { return { bookmarks:new Set(), available:false }; }
  }
  function writeBookmarks(storage, bookmarks) {
    try { storage.setItem('ratwood-guide-bookmarks', JSON.stringify([...bookmarks])); return true; } catch { return false; }
  }
  function parseBookmarkBackup(text,ids,redirects={}) {
    let saved;try{saved=JSON.parse(text);}catch{throw Error('This file is not valid JSON.');}
    const values=Array.isArray(saved)?saved:saved?.format==='ratwood-guide-bookmarks'&&saved.version===1?saved.bookmarks:null;
    if(!Array.isArray(values)||values.length>10000||values.some(v=>typeof v!=='string'))throw Error('Choose a Ratwood bookmark export.');
    const unique=[...new Set(values.map(id=>redirects[id]||id))];return {ids:unique.filter(id=>ids.has(id)),unknown:unique.filter(id=>!ids.has(id)).length};
  }
  function floatingController({pip,openPopup,mount,status,inline}) {
    let current, pending;
    async function open(topicId) {
      if (current && !current.closed) { current.focus(); mount(current,topicId,true); return 'reused'; }
      if (pending) return pending;
      pending = (async () => {
        let win;
        if (pip && typeof pip.requestWindow === 'function') {
          try { win = await pip.requestWindow({width:440,height:680}); } catch { status('Floating mode was unavailable. Trying a compact popup.'); }
        }
        if (win) { current=win; mount(win,topicId,false); status('Floating guide opened. Keep this page open while you play.'); return 'pip'; }
        try { win=openPopup(); } catch { win=null; }
        if (win) { current=win; mount(win,topicId,false); status('Compact popup opened. This popup needs manual pinning to stay above the game.'); return 'popup'; }
        inline(topicId); status('The browser blocked the popup. Compact view is open here; allow popups to open a separate window.'); return 'inline';
      })();
      try { return await pending; } finally { pending=null; }
    }
    return {open,update(topicId){if(current&&!current.closed)mount(current,topicId,true);}};
  }
  function preparationTree(id,byId,trail=[]) {
    const topic=byId.get(id);
    if(!topic)return {id,missing:true,groups:[]};
    if(trail.includes(id))return {id,cycle:true,groups:[]};
    return {id,groups:(topic.ingredients||[]).filter(g=>!g.tool).map(group=>({label:group.label,options:group.options.map(option=>option.id?{...option,node:preparationTree(option.id,byId,[...trail,id])}:{...option,node:null})}))};
  }
  function liquidIcon(topic) {
    const name=normalize(topic.title);
    if(!['Drinks','Liquids','Potions','Soups & stews'].includes(topic.category)&&!(topic.section==='items'&&!/\b(?:beans?|petals?|grains?|seeds?|cake|bread|dough)\b/.test(name)&&/\b(?:wine|cider|beer|mead|brandy|cognac|voddena|rum|limoncello|coffee|tea)\b/.test(name)))return null;
    if(topic.category==='Potions')return 'flask';
    if(topic.category==='Liquids'||/\bjuice\b|\bmolasses\b/.test(name))return 'drop';
    if(topic.category==='Soups & stews')return 'bowl';
    if(/\btea\b|\bcoffee\b|\bchocolate\b/.test(name))return 'teapot';
    if(/\bwine\b|\bumeshu\b/.test(name))return 'wine';
    if(/\bbeer\b|\bale\b|\bcider\b|\bmead\b/.test(name))return 'tankard';
    if(/\bbrandy\b|\bcognac\b|\bvoddena\b|\baqua vitae\b|\brum\b|\blimoncello\b|\bgin\b|\bspirits?\b/.test(name))return 'bottle';
    return 'cup';
  }
  function placeholderIcon(topic) {
    if(/\bbarrel\b/.test(normalize(topic.title)))return 'barrel';
    return liquidIcon(topic)||({'Dishes':'food','Prepared ingredients':'ingredient','Ingredients':'ingredient','Plants & crops':'plant','Alchemy ingredients':'flask','Alchemy products':'flask','Tools & stations':'tool','Materials':'material','Armor':'armor','Clothing & armor':'armor','Weapons':'weapon','Construction':'construction'}[topic.category]||'item');
  }
  const api={normalize,escapeHTML,safeURL,indexTopics,search,suggestions,recipeRoutes,materialTotals,routeSummary,parseBookmarkBackup,readBookmarks,writeBookmarks,floatingController,preparationTree,liquidIcon,placeholderIcon,recipeProfile,recipeSummary,filterOptions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GuideCore=api;
})(globalThis);
