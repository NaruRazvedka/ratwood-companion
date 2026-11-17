/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function sameRevision(manifest,data,revision){return manifest.revision===revision&&data.currentSource?.revision===revision;}
function sourceChanges(text,known){
  const parts=text.split('\0'),changes=[];
  for(let i=0;i+1<parts.length;i+=2)if(parts[i])changes.push({state:parts[i],path:parts[i+1],inSnapshot:known.has(parts[i+1])});
  return changes;
}
async function main(){
  const ref=process.argv[2]||'main';
  if(ref==='--help'){console.log('node tools/refresh-guide.cjs [Ratwood revision or branch]\nDownloads a pinned source snapshot, rebuilds public content and records affected topics. Does not publish.');return;}
  if(!/^[\w./-]+$/.test(ref))throw Error('Invalid source revision.');
  const headers={Accept:'application/vnd.github+json'};
  if(process.env.GH_TOKEN)headers.Authorization='Bearer '+process.env.GH_TOKEN;
  const response=await fetch('https://api.github.com/repos/Rotwood-Vale/Ratwood-2.0/commits/'+encodeURIComponent(ref),{headers});
  if(!response.ok)throw Error('Cannot resolve upstream revision: HTTP '+response.status);
  const commit=await response.json(),revision=commit.sha;
  if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Upstream returned an invalid commit.');
  const file=path.join(root,'guide/sources/ratwood-current/manifest.json');
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const baseline=require(path.join(root,'guide/data.js'));
  if(sameRevision(previous,baseline,revision)){console.log('Guide already pins '+revision+'. No source changes.');return;}
  const run=(program,args)=>execFileSync(program,args,{cwd:root,stdio:'inherit'});
  run(process.execPath,['tools/content-diff.cjs','--capture']);
  run(process.env.PYTHON||'python',['guide/tools/refresh-source.py','--revision',revision]);
  const oldRevision=baseline.currentSource?.revision;
  if(/^[a-f0-9]{40}$/.test(oldRevision||'')){
    const local=path.join(root,'lab/Ratwood-2.0'),checkout=fs.existsSync(path.join(local,'.git'))?local:path.join(root,'.cache/ratwood-source');
    const git=args=>execFileSync('git',['-C',checkout,...args],{encoding:'utf8'});
    try{git(['cat-file','-e',oldRevision+'^{commit}']);}catch{git(['fetch','--depth=1','--no-tags','origin',oldRevision]);}
    const current=JSON.parse(fs.readFileSync(file,'utf8'));
    const known=new Set([...(previous.files||[]),...current.files].map(f=>f.path));
    const changes=sourceChanges(git(['diff','--name-status','--no-renames','-z',oldRevision,revision]),known);
    fs.writeFileSync(path.join(root,'guide/sources/public-upstream-changes.json'),JSON.stringify({from:oldRevision,to:revision,changes,outsideSnapshot:changes.filter(c=>!c.inSnapshot)},null,2)+'\n');
  }
  run(process.env.PYTHON||'python',['guide/tools/import-current-content.py']);
  run(process.env.PYTHON||'python',['guide/tools/import-heartbeasts.py']);
  run(process.execPath,['guide/tools/build-data.cjs','--public']);
  if(process.env.GITHUB_ACTIONS==='true')console.log('Existing reviewed artwork is retained. Review changed DMI paths and licenses before importing new sprites.');
  else{
    run(process.env.PYTHON||'python',['guide/tools/refresh-current-sprites.py','--fetch']);
    run(process.execPath,['guide/tools/build-data.cjs','--public']);
  }
  run(process.execPath,['tools/content-diff.cjs']);
  console.log('Content refreshed. Review guide/sources/public-change-report.json and run the checks before publishing.');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={sameRevision,sourceChanges};
