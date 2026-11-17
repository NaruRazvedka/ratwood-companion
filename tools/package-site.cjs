/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const runtimeRoot=new Set(['index.html','app.js','parser.js','gradient.js','styles.css','credits.html','LICENSE','NOTICE.md','README.md','CHANGELOG.md']);
const runtimeGuide=new Set(['index.html','app.js','core.js','recipe-ui.js','styles.css','data.js','search.js','README.md','NOTICE.md','coverage-report.json']);
function permitted(name,repository=false){
  if(name.split('/').some(p=>p.startsWith('.')||p==='node_modules'||p==='__pycache__'))return repository&&(['.gitignore','.gitattributes'].includes(name)||/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(name));
  if(/(?:^|\/)(?:client-pack|licensed-infraredbaron)(?:\/|$)/i.test(name)||/pterra\.ttf$/i.test(name))return false;
  if(runtimeRoot.has(name))return true;
  if(name.startsWith('guide/')&&runtimeGuide.has(name.slice(6)))return true;
  if(/^guide\/details\/[\w.-]+\.js$/.test(name))return true;
  if(/^guide\/assets\/(?:icons|sprites)\//.test(name))return /\.(?:png|svg|dmi|md|txt|json|dm)$/i.test(name);
  if(!repository)return false;
  if(/^(?:tools|tests|guide\/tools|guide\/tests)\//.test(name))return /\.(?:cjs|js|py|json)$/i.test(name);
  if(/^guide\/sources\/ratwood-(?:current|2(?:-[\w-]+)?)\//.test(name))return /\.(?:dm|dme|json|md|txt|ya?ml)$/i.test(name)||/\/(?:LICENSE|README)$/.test(name);
  return /^guide\/sources\/(?:ratwood2-|public-|current-|cookbook-ledger|catalogue-decisions|item-text-(?:aliases|coverage)|recipe-guidance-audit|source-manifest|coverage)[\w.-]*\.json$/.test(name);
}
function files(dir=root,prefix=''){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;
    const name=prefix+entry.name;
    if(entry.isDirectory()){
      if(entry.name.startsWith('.')&&name!=='.github'||['lab','share','dist','release','node_modules','__pycache__'].includes(entry.name)||name==='assets')continue;
      out.push(...files(path.join(dir,entry.name),name+'/'));
    }else out.push(name);
  }
  return out;
}
function stage(output,{repository=false}={}){
  const target=path.resolve(root,output),relative=path.relative(root,target);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Output must be a new directory inside this project.');
  if(fs.existsSync(target)&&fs.readdirSync(target).length)throw Error('Output is not empty; choose a new staging directory.');
  const dataPath=path.join(root,'guide/data.js');
  delete require.cache[require.resolve(dataPath)];
  const data=require(dataPath);
  if(!data.publicEdition)throw Error('Build the public edition before packaging; private guide data must not be published.');
  require('./coverage-report.cjs').write();
  const referenced=new Set(data.topics.filter(t=>t.sprite).map(t=>'guide/'+t.sprite));
  const selected=files().filter(name=>permitted(name,repository)).filter(name=>{
    if(!name.startsWith('guide/assets/sprites/'))return true;
    if(/\.png$/i.test(name))return referenced.has(name);
    return /\.(?:md|txt)$/i.test(name);
  });
  for(const name of selected){
    const destination=path.join(target,name);fs.mkdirSync(path.dirname(destination),{recursive:true});
    if(name==='styles.css'){
      const css=fs.readFileSync(path.join(root,name),'utf8').replace(/@font-face\s*\{[^}]*Pterra[^}]*\}/gi,'').replace(/\bPterra\s*,?/g,'');
      fs.writeFileSync(destination,css);
    }else fs.copyFileSync(path.join(root,name),destination);
  }
  fs.writeFileSync(path.join(target,'.nojekyll'),'');
  const provenance=data.topics.filter(t=>t.sprite).map(t=>({id:t.id,path:t.sprite,...t.spriteEvidence}));
  fs.mkdirSync(path.join(target,'guide/assets/sprites'),{recursive:true});
  fs.writeFileSync(path.join(target,'guide/assets/sprites/provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  fs.writeFileSync(path.join(target,'package-manifest.json'),JSON.stringify({publicEdition:true,repository,files:selected.sort()},null,2)+'\n');
  console.log(JSON.stringify({output:target,files:selected.length,repository}));return selected;
}
if(require.main===module){const args=process.argv.slice(2);const at=args.indexOf('--output');stage(at<0?'dist':args[at+1],{repository:args.includes('--repository')});}
module.exports={permitted,stage};
