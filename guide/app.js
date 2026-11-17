/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function(){
  'use strict';
  const data=GUIDE_DATA,core=GuideCore,esc=core.escapeHTML;
  const topics=core.indexTopics(data.topics),byId=new Map(topics.map(t=>[t.id,t]));
  const resolve=id=>data.redirects?.[id]||id;
  const modes={items:'Items',guides:'Guides',reference:'Reference',...(!data.publicEdition?{sources:'Sources'}:{})};
  const categoryOrder=['Dishes','Soups & stews','Drinks','Liquids','Potions','Prepared ingredients','Ingredients','Plants & crops','Alchemy ingredients','Alchemy products','Tools & stations','Materials','Weapons','Clothing & armor','Armor','Construction'];
  let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error();},setItem(){throw Error();}};}
  const saved=core.readBookmarks(storage,new Set(byId.keys()),data.redirects);
  const bookmarks=saved.bookmarks,panels=new Set();let storageAvailable=saved.available;
  const route=id=>'#topic='+encodeURIComponent(id);
  const link=(id,label)=>`<a href="${route(id)}" data-topic="${esc(id)}">${esc(label||byId.get(id)?.title||id)}</a>`;
  const iconNames={wine:'Wine',tankard:'Beer, cider or mead',bottle:'Spirits',teapot:'Tea, coffee or hot brew',drop:'Liquid',flask:'Alchemy or potion',bowl:'Soup, stew or porridge',cup:'Drink',food:'Food',ingredient:'Ingredient',plant:'Plant',tool:'Tool or station',material:'Material',armor:'Clothing or armor',weapon:'Weapon',construction:'Construction',barrel:'Barrel',item:'Item'};
  function image(t){
    const sprite=t.sprite&&/^assets\/[\w./-]+\.png$/.test(t.sprite);
    const icon=core.liquidIcon(t)||(!sprite&&core.placeholderIcon(t));
    if(icon)return `<img class="item-sprite liquid-icon" src="${esc(new URL('assets/icons/'+icon+'.svg',location.href).href)}" alt="${esc(iconNames[icon])} icon" title="${esc(iconNames[icon])} · guide icon" loading="lazy">`;
    return `<img class="item-sprite" src="${esc(new URL(t.sprite,location.href).href)}" alt="" loading="lazy" data-sprite-fallback="${esc(core.placeholderIcon(t))}">`;
  }
  const writtenSteps=steps=>steps?.length?`<ol class="written-steps">${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'';
  const factsHTML=facts=>facts?.length?`<dl class="compact-facts">${facts.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>`:'';
  const statusNames={community:'Community source',historical:'Historical source',corroborated:'Sources compared',unverified:'Incomplete source',source:'Ratwood 2.0 source'};
  function itemInfoHTML(t){
    if(t.section!=='items')return '';
    const info=t.itemInfo;
    const shared=m=>['/obj','/obj/item','/obj/item/reagent_containers','/obj/item/reagent_containers/food/snacks/rogue'].includes(m.owner);
    const hints=(info?.mechanics||[]).filter(m=>!shared(m)),common=(info?.mechanics||[]).filter(shared);
    const messages=entries=>`<ul class="mechanics-hints">${entries.map(m=>`<li>${esc(m.text)}</li>`).join('')}</ul>`;
    return `<section class="item-description"><h2>Description</h2><p>${info?.description?esc(info.description.text)||'No written description.':info?.descriptionDynamic?'The description changes in-game.':'No description recorded.'}</p>${hints.length?`<h3>Mechanics</h3>${messages(hints)}`:''}${common.length?`<details><summary>Shared food/item mechanics</summary>${messages(common)}</details>`:''}</section>`;
  }
  function propertiesHTML(t){
    if(t.section!=='items')return '';
    const p=t.itemProperties,food=p?.shelfLife||p?.quality||['Dishes','Prepared ingredients','Ingredients','Soups & stews'].includes(t.category);
    const facts=[];
    if(food)facts.push({label:'Shelf life',value:p?.shelfLife?.label||'Not traced for this exact item.'},{label:p?.brewing||p?.quality?.code?.startsWith('DRINK_')?'Drink quality':'Food quality',value:p?.quality?.label||'Not traced for this exact item.'});
    facts.push({label:'Base value',value:p?.value?.label||'No fixed value recorded.'});
    if(p?.shelfLife?.outcome){const o=p.shelfLife.outcome;facts.push({label:'After the timer',value:(o.name||'Source-defined replacement')+(o.shelfLife?.label?' · '+o.shelfLife.label:'')});}
    const fields=[p?.shelfLife,p?.quality,p?.value].filter(Boolean);
    const conditions=[...new Set(fields.flatMap(f=>[].concat(f.conditions||[])))];
    if(p?.brewing){const b=p.brewing;facts.push({label:'Finished untapped keg',value:b.barrelValue==null?'Not traced.':b.barrelValue+' mammons base value'},{label:'Sealed bottle',value:b.bottleValue==null?'Not traced.':b.bottleValue+' mammons base value'},{label:'Recipe quote',value:b.recipeQuote==null?'Not traced.':b.recipeQuote+' mammons; excludes the empty keg value'});conditions.push(...[].concat(b.conditions||[]));}
    const b=p?.brewing,brewing=b?`<details><summary>Brewing yield, timing & aging</summary>${factsHTML([{label:'Batch yield',value:b.bottles+' bottles; '+b.batchVolume+' source reagent units'},{label:'Brewing time',value:b.brewSeconds==null?'Not traced.':b.brewSeconds+' seconds before aging'}])}${(b.ageTimes||[]).map(a=>`<p>${esc(a.name||a.type)}: ${esc(a.seconds)} seconds after brewing.</p>`).join('')}</details>`:'';
    return `<section class="item-properties"><h2>${food?'Shelf life, quality & value':'Value'}</h2>${factsHTML(facts)}${brewing}${conditions.length?`<details><summary>Storage, serving & pricing conditions</summary>${[...new Set(conditions)].map(c=>`<p>${esc(c)}</p>`).join('')}</details>`:''}</section>`;
  }
  function sourceHTML(t){return `<details class="source-details"><summary>Sources, original text & version notes</summary><p>${esc(statusNames[t.status]||t.status)} · Reviewed ${esc(data.updated)}</p>${(t.gaps||[]).map(g=>`<p class="source-gap">${esc(g)}</p>`).join('')}<ul>${(t.sources||[]).map(s=>`<li><a href="${esc(core.safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.note||'')}</small></li>`).join('')}</ul>${(t.sourceRows||[]).map(r=>`<details><summary>${esc(r.sheet)} · row ${r.row}</summary>${factsHTML(r.cells.map(c=>({label:c.cell,value:c.text})))}</details>`).join('')}${t.rows?`<details><summary>Original rows (${t.rows.length})</summary>${t.rows.map(r=>`<details><summary>Row ${r.row} · ${esc(r.cells[0]?.text.slice(0,60))}</summary>${factsHTML(r.cells.map(c=>({label:c.cell,value:c.text})))}</details>`).join('')}</details>`:''}</details>`;}
  const selectedRoutes=new Map(),detailLoads=new Map();
  async function loadTopic(id) {
    id=resolve(id);const bundle=data.detailBundles?.[id];
    if(!bundle||byId.get(id)?.detailLoaded)return byId.get(id);
    if(!detailLoads.has(bundle))detailLoads.set(bundle,new Promise((yes,no)=>{
      const script=document.createElement('script');script.src=new URL(bundle,location.href).href;
      script.onload=()=>{for(const [key,value] of Object.entries(globalThis.GUIDE_TOPIC_DETAILS||{})){if(byId.get(key)?.detailLoaded)continue;const merged=core.indexTopics([{...byId.get(key),...value,detailLoaded:true}])[0];byId.set(key,merged);}yes();};
      script.onerror=()=>{detailLoads.delete(bundle);script.remove();no(Error('This entry could not be opened. Keep the details folder beside the guide and try again.'));};document.head.append(script);
    }));
    await detailLoads.get(bundle);return byId.get(id);
  }
  function ingredientCard(group) {
    return `<li class="diagram-group">${group.options.length>1?`<p class="diagram-label">${esc(group.label)} <span>choose one</span></p>`:''}<div class="diagram-options">${group.options.map(o=>{
      const t=byId.get(resolve(o.id));
      return t?`<details class="ingredient-card" data-prerequisite="${esc(t.id)}"><summary>${image(t)}<span>${esc(group.options.length===1?group.label:o.name||t.title)}</span><span class="disclosure-label">Preparation</span></summary><div class="prerequisite-content"><p>Opening preparation…</p></div></details>`:`<div class="ingredient-card unresolved">${esc(group.options.length===1?group.label:o.name||'Unresolved ingredient')}<small>Preparation not recorded.</small></div>`;
    }).join('')}</div></li>`;
  }
  function recipePanelHTML(t) {
    const routes=core.recipeRoutes(t),r=routes.find(r=>r.id===selectedRoutes.get(t.id))||routes[0];
    if(!r)return '';
    const s=core.routeSummary(t,r),facts=[{label:'Tools & requirements',value:s.tools.join(' · ')||'Not specified'},{label:'Yield',value:s.yield},{label:'Preparation time',value:s.time}];
    return `<section class="recipe-panel" data-recipe-panel="${esc(t.id)}"><div class="recipe-panel-heading"><h2>Preparation</h2>${routes.length>1?`<label>Recipe route<select data-recipe-route="${esc(t.id)}">${routes.map((v,i)=>`<option value="${esc(v.id)}" ${v.id===r.id?'selected':''}>${esc(v.name)}${routes.filter(x=>x.name===v.name).length>1?' '+(i+1):''}</option>`).join('')}</select></label>`:`<span>${esc(r.name)}</span>`}</div>${factsHTML(facts)}${r.groups.filter(g=>!g.tool).length?`<div class="recipe-diagram" aria-label="Ingredients and result"><ul class="diagram-inputs">${r.groups.filter(g=>!g.tool).map(ingredientCard).join('')}</ul><div class="diagram-result"><span class="diagram-arrow" aria-hidden="true">↓</span>${image(t)}<strong>${esc(t.title)}</strong></div></div>`:''}<div class="recipe-instructions"><h3>Steps</h3>${r.steps.length?writtenSteps(r.steps):'<p>Preparation steps are missing for this route.</p>'}</div><details class="reference-notes"><summary>Raw materials for one batch</summary><p>Includes whole intermediate batches. Alternatives and unconfirmed yields prevent an exact total.</p><button data-material-totals="${esc(t.id)}">Calculate known item totals</button><div data-material-result="${esc(t.id)}" role="status"></div></details>${r.gaps.map(g=>`<p class="preparation-gap">${esc(g)}</p>`).join('')}</section>`;
  }
  async function prepareMaterialTotals(id){
    const visited=new Set();
    async function visit(key){
      if(visited.has(key)||visited.size>=300)return;
      visited.add(key);const t=await loadTopic(key);if(!t)return;
      const routes=core.recipeRoutes(t),r=routes.find(r=>r.id===selectedRoutes.get(t.id))||routes[0];
      for(const g of r?.groups||[])if(!g.tool&&g.options.length===1&&g.options[0].id)await visit(g.options[0].id);
    }
    await visit(id);return core.materialTotals(byId.get(id),byId,selectedRoutes);
  }
  function articleHTML(t,compact){
    const related=(t.related||[]).filter(id=>byId.has(id)&&byId.get(id).section!=='sources');
    const reference=(t.facts||[]).filter(f=>!/^Process$|^Ingredient(?: \d+)?$/.test(f.label));
    const item=t.section==='items';
    return `<article class="entry ${compact&&item?'floating-recipe':''}" id="guide-content" tabindex="-1"><div class="entry-path"><button data-back>← Back to results</button><span>${esc(t.category)}</span>${t.status==='historical'?'<span class="historical-label">Historical</span>':''}</div><div class="entry-title">${item?image(t):''}<h1>${esc(t.title)}</h1><button class="bookmark" data-bookmark="${esc(t.id)}" aria-label="${bookmarks.has(t.id)?'Remove bookmark':'Bookmark topic'}" aria-pressed="${bookmarks.has(t.id)}">${bookmarks.has(t.id)?'★':'☆'}</button></div>${t.summary?`<p class="entry-summary">${esc(t.summary)}</p>`:''}
    ${t.availability?`<aside class="availability-note"><strong>${esc(t.availability.label)}</strong><p>${esc(t.availability.reason)}</p></aside>`:''}
    ${t.recipeAudit&&t.recipeAudit.state!=='source-procedure'?`<p class="preparation-gap">${esc(t.recipeAudit.note)}</p>`:''}
    ${item?itemInfoHTML(t)+recipePanelHTML(t):writtenSteps(t.steps)}
    ${item?`<details class="reference-notes"><summary>Storage, quality & value</summary>${propertiesHTML(t)}</details>`:''}
    ${(t.sections||[]).map(s=>`<section class="guide-section"><h2>${esc(s.title)}</h2>${s.text?`<p>${esc(s.text)}</p>`:''}${writtenSteps(s.steps)}${factsHTML(s.facts)}</section>`).join('')}
    ${reference.length?`<details class="reference-notes" ${t.section==='reference'?'open':''}><summary>${t.section==='reference'?'Reference':'Details'}</summary>${factsHTML(reference)}</details>`:''}
    ${t.pitfalls?.length?`<details class="reference-notes"><summary>Important notes</summary><ul>${t.pitfalls.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>`:''}
    ${(t.gaps||[]).length?`<details class="reference-notes"><summary>What is still uncertain</summary>${t.gaps.map(g=>`<p>${esc(g)}</p>`).join('')}</details>`:''}
    ${related.length?`<details class="related-topics"><summary>Related (${related.length})</summary><div>${related.map(id=>link(id)).join('')}</div></details>`:''}
    ${t.section==='sources'?sourceHTML(t):''}${!compact?`<button class="float-article" data-float="${esc(t.id)}">↗ Float this entry</button>`:''}</article>`;
  }
  function mount(doc,host,{compact=false,initial=''}={}){
    const first=byId.get(resolve(initial));
    const state={section:first?.section||'items',scope:'',category:first?'':'Dishes',query:'',quality:'',method:'',skill:'',evidence:'',bookmarksOnly:false,id:first?.id||initial,limit:96};
    let catalogue=null,request=0,pendingBookmarks=null;
    const win=doc.defaultView||window;
    host.innerHTML=`<div class="menu-shell ${compact?'compact':''}"><aside class="menu-sidebar"><p class="eyebrow">FIELD GUIDE</p><div class="mode-nav">${Object.entries(modes).map(([id,name])=>`<button data-mode="${id}">${name}</button>`).join('')}</div><div class="category-list"></div><button class="saved-nav" data-saved>☆ Bookmarks <span>${bookmarks.size}</span></button><div class="bookmark-tools"><button data-export-bookmarks>Export bookmarks</button><button data-import-bookmarks>Import bookmarks</button></div><a class="source-link" href="../credits.html">Credits & sources</a></aside><main class="menu-main"><div class="menu-search"><label><span aria-hidden="true">⌕</span><input type="search" aria-label="Search the whole guide"><kbd>/</kbd></label><button class="float-button" data-float>${compact?'↗ Full guide':'↗ Float guide'}</button></div><label class="search-scope">Search in <select data-search-scope aria-label="Search section"><option value="">Everything</option>${Object.entries(modes).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><div class="mobile-modes">${Object.entries(modes).map(([id,name])=>`<button data-mode="${id}">${name}</button>`).join('')}</div><div class="mobile-bookmarks"><button data-saved>☆ Bookmarks</button><button data-export-bookmarks>Export bookmarks</button><button data-import-bookmarks>Import bookmarks</button></div><div class="mobile-categories"></div><p class="app-notice" role="status"></p><p class="search-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="menu-view"></div></main></div>`;
    const q=s=>host.querySelector(s),view=q('.menu-view');
    const filterBar=doc.createElement('div');filterBar.className='recipe-filters';
    const filterLabels={quality:'Quality',method:'Preparation method',skill:'Required skill',evidence:'Procedure evidence'};
    const evidenceLabels={source:'Source-backed procedure',incomplete:'Procedure incomplete',conflict:'Conflicting source'};
    filterBar.innerHTML=Object.entries(filterLabels).map(([id,label])=>`<label>${label}<select data-filter="${id}" aria-label="${label}"></select></label>`).join('')+'<button data-clear-filters>Clear filters</button>';
    view.before(filterBar);
    function historyState(){return {ratwoodGuide:true,state:{...state},catalogue:catalogue&&{...catalogue,state:{...catalogue.state}},scroll:win.scrollY||0};}
    function saveHistory(push=false){if(compact)return;const h=historyState(),url=state.id?route(state.id):location.pathname+location.search;(push?history.pushState:history.replaceState)?.call(history,h,'',url);}
    function clearRoute(){saveHistory();}
    function tileHTML(t){return `<a class="item-tile" href="${route(t.id)}" data-topic="${esc(t.id)}" ${t.itemInfo?.description?.text?`title="${esc(t.itemInfo.description.text)}"`:''}>${image(t)}<span>${esc(t.title)}</span>${bookmarks.has(t.id)?'<small aria-label="Bookmarked">★</small>':''}</a>`;}
    function listHTML(rows,section){return section==='items'?`<div class="item-menu">${rows.map(tileHTML).join('')}</div>`:`<div class="guide-menu">${rows.map(t=>`<a href="${route(t.id)}" data-topic="${esc(t.id)}"><span><strong>${esc(t.title)}</strong>${t.summary?`<small>${esc(t.summary)}</small>`:''}</span><span aria-hidden="true">↗</span></a>`).join('')}</div>`;}
    function render(){
      const section=state.query?state.scope:state.bookmarksOnly?'':state.section;
      const pool=topics.filter(t=>t.section!=='sources'||section==='sources').map(t=>byId.get(t.id)||t);
      const context={...state,section,bookmarks};
      const unfiltered={...context,quality:'',method:'',skill:'',evidence:''};
      const available=core.filterOptions(pool,unfiltered);
      for(const field of Object.keys(filterLabels))if(state[field]&&!available[field].includes(state[field]))state[field]='';
      const currentFilters=()=>Object.fromEntries(Object.keys(filterLabels).map(k=>[k,state[k]]));
      if(!core.search(pool,{...context,...currentFilters()}).length)
        for(const field of Object.keys(filterLabels))state[field]='';
      const choices=core.filterOptions(pool,{...context,...currentFilters()});
      filterBar.hidden=Boolean(state.id)||(!state.query&&state.section!=='items')||(Boolean(state.query)&&Boolean(state.scope)&&state.scope!=='items')||(!Object.values(choices).some(values=>values.length>1)&&!Object.keys(filterLabels).some(k=>state[k]));
      filterBar.querySelectorAll('[data-filter]').forEach(select=>{
        const field=select.dataset.filter,values=choices[field];
        select.innerHTML='<option value="">Any</option>'+values.map(value=>`<option value="${esc(value)}">${esc(field==='evidence'?evidenceLabels[value]||value:value)}</option>`).join('');
        select.value=state[field];
        if(select.parentElement)select.parentElement.hidden=values.length<2&&!state[field];
      });
      filterBar.querySelector('[data-clear-filters]').disabled=!Object.keys(filterLabels).some(k=>state[k]);
      const cats=[...new Set(topics.filter(t=>t.section===state.section).map(t=>t.category))].sort((a,b)=>{const i=categoryOrder.indexOf(a),j=categoryOrder.indexOf(b);return(i<0?99:i)-(j<0?99:j)||a.localeCompare(b);});
      host.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.section);b.setAttribute('aria-pressed',String(b.dataset.mode===state.section));});
      q('.category-list').innerHTML=`<button data-category="" class="${!state.category?'active':''}">All ${esc(modes[state.section].toLowerCase())}<span>${topics.filter(t=>t.section===state.section).length}</span></button>${cats.map(c=>`<button data-category="${esc(c)}" class="${state.category===c?'active':''}">${esc(c)}<span>${topics.filter(t=>t.section===state.section&&t.category===c).length}</span></button>`).join('')}`;
      q('.mobile-categories').innerHTML=`<label>Category <select aria-label="Category" data-category-select><option value="">All ${esc(modes[state.section].toLowerCase())}</option>${cats.map(c=>`<option ${c===state.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`;
      q('.saved-nav span').textContent=bookmarks.size;q('.saved-nav').classList.toggle('active',state.bookmarksOnly);host.querySelectorAll('[data-saved]').forEach(b=>b.setAttribute('aria-pressed',String(state.bookmarksOnly)));
      q('input').placeholder='Search items, recipes, skills, spells…';q('input').value=state.query;
      q('[data-search-scope]').value=state.scope;
      if(!storageAvailable)q('.app-notice').textContent='Bookmarks will last for this session; browser storage is unavailable.';
      if(state.id){const t=byId.get(resolve(state.id));view.innerHTML=t?articleHTML(t,compact||Boolean(doc.body?.classList?.contains('compact-inline'))):'<p class="empty">Entry not found. Use search or choose a category.</p>';return;}
      const result=core.search(pool,{...state,section,bookmarks}),shown=result.slice(0,state.limit);
      q('.search-status').textContent=result.length+' '+(result.length===1?'result':'results')+(state.query?' for '+state.query:'');
      const grouped=Boolean(state.query)||state.bookmarksOnly;
      const groups=grouped?Object.entries(modes).filter(([id])=>shown.some(t=>t.section===id)).map(([id,name])=>`<section class="search-group"><h2>${esc(name)} <small>${result.filter(t=>t.section===id).length}</small></h2>${listHTML(shown.filter(t=>t.section===id),id)}</section>`).join(''):listHTML(shown,state.section);
      const hints=!result.length&&state.query?core.suggestions(pool,state.query):[];
      view.innerHTML=`<header class="catalogue-heading"><div><p class="eyebrow">${esc(grouped?'FIELD GUIDE':modes[state.section])}</p><h1>${esc(state.bookmarksOnly?'Bookmarks':state.query?'Search results':state.category||modes[state.section])}</h1></div><span>${result.length} entries</span></header><div id="guide-content" tabindex="-1">${groups}${!result.length?'<p class="empty">No matching entries. Try fewer words or clear the filters.</p>':''}${hints.length?`<p class="search-suggestions">Did you mean ${hints.map(t=>`<button data-suggestion="${esc(t.title)}">${esc(t.title)}</button>`).join(' ')}?</p>`:''}</div>${result.length>state.limit?'<button class="load-more" data-more>Show more</button>':''}`;
    }
    function activate(id,{push=true,focus=true}={}){const t=byId.get(resolve(id));state.id=resolve(id);if(t)state.section=t.section;render();if(push)saveHistory(true);win.scrollTo({top:0});if(focus)view.querySelector('.entry')?.focus({preventScroll:true});if(!compact)floating.update?.(state.id);}
    function navigate(id,options={}){
      id=resolve(id);const serial=++request;
      if(!state.id)catalogue={state:{...state},scroll:win.scrollY||0,focusId:id};
      if(options.push!==false)saveHistory();
      if(!data.detailBundles?.[id]||byId.get(id)?.detailLoaded){activate(id,options);return Promise.resolve();}
      q('.app-notice').textContent='Opening entry…';
      return loadTopic(id).then(()=>{if(serial!==request)return;q('.app-notice').textContent='';activate(id,options);}).catch(error=>{if(serial===request)q('.app-notice').textContent=error.message;});
    }
    function back(){request++;const saved=catalogue;Object.assign(state,saved?.state||{id:'',query:'',category:'',section:state.section});state.id='';render();saveHistory(true);win.scrollTo({top:saved?.scroll||0});if(saved?.focusId)view.querySelector(`[data-topic="${saved.focusId}"]`)?.focus({preventScroll:true});else view.querySelector('#guide-content')?.focus({preventScroll:true});}
    function home(){request++;state.id='';state.query='';state.category=state.section==='items'?'Dishes':'';state.bookmarksOnly=false;for(const key of ['quality','method','skill','evidence'])state[key]='';clearRoute();render();}
    function restore(snapshot){const serial=++request;if(!snapshot?.ratwoodGuide)return;Object.assign(state,snapshot.state);catalogue=snapshot.catalogue;const done=()=>{if(serial!==request)return;render();win.scrollTo({top:snapshot.scroll||0});const focus=state.id?'.entry':catalogue?.focusId?`[data-topic="${catalogue.focusId}"]`:'#guide-content';view.querySelector(focus)?.focus({preventScroll:true});};if(state.id&&data.detailBundles?.[state.id]&&!byId.get(state.id)?.detailLoaded)loadTopic(state.id).then(done).catch(e=>{q('.app-notice').textContent=e.message;});else done();}
    const panel={refresh:render,navigate,home,restore};panels.add(panel);
    host.addEventListener('error',event=>{const img=event.target,icon=img.dataset?.spriteFallback;if(!icon)return;delete img.dataset.spriteFallback;img.src=new URL('assets/icons/'+icon+'.svg',location.href).href;img.alt=(iconNames[icon]||'Item')+' guide icon';img.title='Game sprite unavailable · guide icon';img.classList.add('liquid-icon');},true);
    q('input').addEventListener('input',event=>{request++;state.query=event.target.value;state.id='';state.category='';state.limit=96;clearRoute();render();});
    host.addEventListener('toggle',event=>{const node=event.target;if(!node.open||!node.dataset?.prerequisite||node.dataset.loaded)return;node.dataset.loaded='true';let ancestor=node.parentElement?.closest('[data-recipe-panel]');while(ancestor){if(ancestor.dataset.recipePanel===node.dataset.prerequisite){node.querySelector('.prerequisite-content').innerHTML='<p>This ingredient refers back to an earlier recipe. Open its full entry to choose a different route.</p>';return;}ancestor=ancestor.parentElement?.closest('[data-recipe-panel]');}loadTopic(node.dataset.prerequisite).then(t=>{const body=node.querySelector('.prerequisite-content');if(!body)return;body.innerHTML=t?recipePanelHTML(t)||writtenSteps(t.steps)||'<p>No preparation is recorded for this input.</p>':'<p>Entry unavailable.</p>';if(t)body.insertAdjacentHTML('beforeend',`<p>${link(t.id,'Open full entry')}</p>`);}).catch(e=>{delete node.dataset.loaded;node.querySelector('.prerequisite-content').textContent=e.message;});},true);
    host.addEventListener('change',event=>{
      if(event.target.matches('[data-recipe-route]')){const id=event.target.dataset.recipeRoute;selectedRoutes.set(id,event.target.value);const old=event.target.closest('.recipe-panel'),parent=old.parentElement;old.outerHTML=recipePanelHTML(byId.get(id));parent.querySelector(`[data-recipe-route="${id}"]`)?.focus();panels.forEach(p=>{if(p!==panel)p.refresh();});}
      else if(event.target.matches('[data-search-scope]')){state.scope=event.target.value;state.id='';state.category='';state.limit=96;for(const key of ['quality','method','skill','evidence'])state[key]='';clearRoute();render();}
      else if(event.target.matches('[data-filter]')){state[event.target.dataset.filter]=event.target.value;state.id='';state.limit=96;clearRoute();render();}
      else if(event.target.matches('[data-category-select]')){state.category=event.target.value;state.scope=state.section;state.id='';state.limit=96;clearRoute();render();q('[data-category-select]')?.focus();}
    });
    host.addEventListener('click',event=>{
      const target=event.target.closest('button,a');if(!target)return;
      if(target.dataset.topic){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(target.dataset.topic);}
      else if(target.dataset.materialTotals){const id=target.dataset.materialTotals,result=host.querySelector(`[data-material-result="${id}"]`);target.disabled=true;result.textContent='Checking ingredient preparations…';prepareMaterialTotals(id).then(total=>{result.innerHTML=total.complete?`<ul>${total.materials.map(m=>`<li>${esc(m.amount)} × ${link(m.id,m.name)}</li>`).join('')}</ul>`:`<p>An exact total is unavailable.</p>${total.gaps.map(g=>`<p>${esc(g)}</p>`).join('')}`;}).catch(e=>{result.textContent=e.message;}).finally(()=>{target.disabled=false;});}
      else if(target.dataset.mode){state.section=target.dataset.mode;state.scope='';home();}
      else if(target.hasAttribute('data-category')){state.category=target.dataset.category;state.scope=state.section;state.id='';state.limit=96;clearRoute();render();[...host.querySelectorAll('[data-category]')].find(b=>b.dataset.category===state.category)?.focus();}
      else if(target.hasAttribute('data-back'))back();
      else if(target.hasAttribute('data-saved')){state.bookmarksOnly=!state.bookmarksOnly;state.id='';state.category='';clearRoute();render();}
      else if(target.dataset.bookmark){const id=target.dataset.bookmark;bookmarks.has(id)?bookmarks.delete(id):bookmarks.add(id);if(storageAvailable&&!core.writeBookmarks(storage,bookmarks))storageAvailable=false;panels.forEach(p=>p.refresh());host.querySelector('[data-bookmark]')?.focus({preventScroll:true});}
      else if(target.hasAttribute('data-more')){const previous=state.limit;state.limit+=96;render();const links=[...view.querySelectorAll('[data-topic]')];links[previous]?.focus({preventScroll:true});}
      else if(target.hasAttribute('data-clear-filters')){for(const key of ['quality','method','skill','evidence'])state[key]='';state.limit=96;render();filterBar.querySelector('[data-filter]')?.focus();}
      else if(target.hasAttribute('data-export-bookmarks')){
        const blob=new Blob([JSON.stringify({format:'ratwood-guide-bookmarks',version:1,bookmarks:[...bookmarks]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='ratwood-bookmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      else if(target.hasAttribute('data-import-bookmarks')){
        const input=doc.createElement('input');input.type='file';input.accept='.json,application/json';
        input.addEventListener('change',async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>1000000)throw Error('The bookmark file is too large.');const result=core.parseBookmarkBackup(await file.text(),new Set(byId.keys()),data.redirects);pendingBookmarks=result.ids;q('.app-notice').textContent=`Import ${result.ids.length} recognized bookmarks; ${result.unknown} unavailable entries will be skipped. Existing bookmarks will be kept. `;const button=doc.createElement('button');button.textContent='Add bookmarks';button.dataset.confirmBookmarks='';q('.app-notice').append(button);}catch(error){pendingBookmarks=null;q('.app-notice').textContent=error.message;}});input.click();
      }
      else if(target.hasAttribute('data-confirm-bookmarks')&&pendingBookmarks){
        for(const id of pendingBookmarks)bookmarks.add(id);pendingBookmarks=null;if(storageAvailable&&!core.writeBookmarks(storage,bookmarks))storageAvailable=false;panels.forEach(p=>p.refresh());q('.app-notice').textContent=storageAvailable?'Bookmarks imported.':'Bookmarks imported for this session; browser storage is unavailable.';
      }
      else if(target.dataset.suggestion){state.query=target.dataset.suggestion;state.id='';state.category='';state.limit=96;render();q('input').focus();}
      else if(target.hasAttribute('data-float')){if(compact){window.focus();if(state.id)mainPanel.navigate(state.id);}else floating.open(target.dataset.float||state.id);}
    });
    doc.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(doc.activeElement?.tagName)&&!doc.activeElement?.isContentEditable){event.preventDefault();q('input').focus();}});
    render();if(!compact&&!history.state?.ratwoodGuide)saveHistory();if(initial)navigate(initial,{push:false,focus:false});return panel;
  }
  let mainPanel;const floated=new WeakMap();
  function mountFloating(win,id,reused){if(reused&&floated.has(win)){if(id)floated.get(win).navigate(id);return;}const doc=win.document;doc.title='Ratwood · Reference';doc.documentElement.lang='en';const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('styles.css',location.href).href;doc.head.append(css);const host=doc.createElement('div');doc.body.replaceChildren(host);doc.body.className='floating-document';const panel=mount(doc,host,{compact:true,initial:id});floated.set(win,panel);win.addEventListener('pagehide',()=>panels.delete(panel),{once:true});}
  function notice(message){const el=document.querySelector('.app-notice');el.textContent=message;if(document.body.classList.contains('compact-inline')){const b=document.createElement('button');b.textContent='Return to full view';b.addEventListener('click',()=>{document.body.classList.remove('compact-inline');el.textContent='';mainPanel.refresh();});el.append(b);}}
  const floating=core.floatingController({pip:window.documentPictureInPicture,openPopup:()=>window.open('','ratwood-guide-reference','popup,width=460,height=720,resizable=yes,scrollbars=yes'),mount:mountFloating,status:notice,inline:id=>{document.body.classList.add('compact-inline');if(id)mainPanel.navigate(id);}});
  const hashId=()=>{try{return new URLSearchParams(location.hash.slice(1)).get('topic')||'';}catch{return '';}};
  mainPanel=mount(document,document.getElementById('app'),{initial:hashId()});
  const version=document.querySelector('.site-footer span');if(version&&data.currentSource)version.textContent=`Source ${data.currentSource.revision.slice(0,10)} · Reviewed ${data.currentSource.reviewed}`;
  document.querySelector('.skip')?.addEventListener('click',event=>{event.preventDefault();const content=document.getElementById('guide-content');content?.focus();content?.scrollIntoView({block:'start'});});
  window.addEventListener('popstate',event=>{if(event.state?.ratwoodGuide)mainPanel.restore(event.state);else{const id=hashId();if(id)mainPanel.navigate(id,{push:false});else mainPanel.home();}});
  window.addEventListener('hashchange',()=>{const id=hashId();if(history.state?.ratwoodGuide&&(history.state.state.id||'')===id)return;if(id)mainPanel.navigate(id,{push:false});else mainPanel.home();});
})();
