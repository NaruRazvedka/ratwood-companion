/* SPDX-License-Identifier: AGPL-3.0-or-later */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const normalize=text=>text.replace(/\s+/g,' ').trim();

function paragraphs(workbook){
  return (workbook.sheets||[]).flatMap(sheet=>(sheet.rows||[]).flatMap(row=>(row.cells||[]).flatMap(cell=>String(cell.text||'').split(/\n\s*\n/).map(normalize).filter(text=>text.length>=150&&!/^https?:\/\/\S+$/.test(text)).map(text=>({text,sheet:sheet.name,row:row.row,cell:cell.cell})))));
}
function strings(value,location=''){
  if(typeof value==='string')return [{text:normalize(value),location}];
  if(!value||typeof value!=='object')return [];
  return Object.entries(value).flatMap(([key,child])=>strings(child,location?location+'.'+key:key));
}
function matches(topics,originals,licensed){
  return topics.flatMap(topic=>strings(topic).flatMap(field=>originals.filter(original=>field.text.includes(original.text)&&!licensed.has(original.text)).map(original=>({topic:topic.title,id:topic.id,location:field.location,sheet:original.sheet,row:original.row,cell:original.cell}))));
}
function licensedDescriptions(){
  const result=new Set();
  function visit(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())visit(file);
      else if(entry.name.endsWith('.dm')){
        const source=fs.readFileSync(file,'utf8');
        const pattern=/(?:^|\n)\s*(?:var\/)?(?:desc|description|greet_text|tutorial)\s*=\s*\{?\s*"((?:\\.|[^"\\])*)"/g;
        for(const match of source.matchAll(pattern)){
          const text=normalize(match[1].replace(/\\n/g,' ').replace(/\\"/g,'"').replace(/\\\\/g,'\\').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;|&#34;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
          if(text.length>=150)result.add(text);
        }
      }
    }
  }
  for(const entry of fs.readdirSync(path.join(root,'sources'),{withFileTypes:true}))if(entry.isDirectory()&&/^ratwood-(?:current|2(?:-|$))/.test(entry.name))visit(path.join(root,'sources',entry.name));
  // These are independently extracted type-name lists and game questions, not workbook prose.
  const heart=path.join(root,'sources/current-heartbeasts.json');
  if(fs.existsSync(heart))for(const topic of JSON.parse(fs.readFileSync(heart,'utf8')).topics)for(const fact of topic.facts||[])if(/^(Possible|Liked|Conflicting|Tier|Accepted)/.test(fact.label))result.add(normalize(fact.value));
  return result;
}

test('prose scan catches nested copied paragraphs while allowing licensed game descriptions',()=>{
  const text='A deliberately long community preparation paragraph. '.repeat(4).trim();
  const originals=paragraphs({sheets:[{name:'Recipes',rows:[{row:4,cells:[{cell:'C4',text}]}]}]});
  const topics=[{id:'example',title:'Example',ingredients:[{label:text}]}];
  assert.equal(matches(topics,originals,new Set()).length,1);
  assert.equal(matches(topics,originals,new Set([text])).length,0);
});

test('public content contains no long original workbook paragraphs outside licensed descriptions',t=>{
  const files=['workbook.json','heartbeast-workbook.json','cookbook-workbook.json'].map(name=>path.join(root,'sources',name)).filter(file=>fs.existsSync(file));
  if(!files.length){t.skip('Private workbook exports are intentionally absent from the public repository.');return;}
  const originals=files.flatMap(file=>paragraphs(JSON.parse(fs.readFileSync(file,'utf8'))));
  const data=require('../tools/build-public.cjs').sanitize(require('../data.js'));
  const found=matches(data.topics,originals,licensedDescriptions());
  assert.deepEqual(found,[],'Original workbook prose remains at these topic/field locations: '+JSON.stringify(found));
});
