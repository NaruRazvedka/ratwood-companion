/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function substantive(value){
  if(Array.isArray(value))return value.map(substantive);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!['source','sources','sourceRows','sourceRevision','reviewed','spriteEvidence'].includes(k)).map(k=>[k,substantive(value[k])]));
  return value;
}
function snapshot(data){return Object.fromEntries(data.topics.map(t=>[t.id,{title:t.title,hash:createHash('sha256').update(JSON.stringify(substantive(t))).digest('hex'),sprite:t.sprite||null}]));}
function compare(before,after){
  const ids=new Set([...Object.keys(before),...Object.keys(after)]),report={added:[],removed:[],changed:[],renamed:[],sprites:[]};
  for(const id of ids){const a=before[id],b=after[id];if(!a)report.added.push({id,title:b.title});else if(!b)report.removed.push({id,title:a.title});else{
    if(a.hash!==b.hash)report.changed.push({id,title:b.title});
    if(a.title!==b.title)report.renamed.push({id,from:a.title,to:b.title});
    if(a.sprite!==b.sprite)report.sprites.push({id,title:b.title});
  }}return report;
}
if(require.main===module){
  const at=process.argv.indexOf('--capture'),cache=path.join(root,'.cache/content-before.json');
  const data=require(path.join(root,'guide/data.js'));
  if(at>=0){fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,JSON.stringify(snapshot(data)));}
  else{const report=compare(JSON.parse(fs.readFileSync(cache)),snapshot(data));fs.writeFileSync(path.join(root,'guide/sources/public-change-report.json'),JSON.stringify(report,null,2)+'\n');console.log(Object.fromEntries(Object.entries(report).map(([key,rows])=>[key,rows.length])));}
}
module.exports={substantive,snapshot,compare};
