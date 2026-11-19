/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs'),path=require('node:path');
const revision='2d61e02c69520dacb0f4edc1d269395713cbeafb';
const dir=path.join(__dirname,'../sources/ratwood-current');
const base=`https://github.com/Rotwood-Vale/Ratwood-2.0/blob/${revision}/`;
const skills=['NONE','NOVICE','APPRENTICE','JOURNEYMAN','EXPERT','MASTER','LEGENDARY'];
// Only direct literal declarations from these retained source files are accepted.
function declarations(file,prefix){
  const records=new Map();let current;
  for(const [index,line]of fs.readFileSync(path.join(dir,file),'utf8').split(/\r?\n/).entries()){
    if(line.startsWith('/')){const type=line.split(/\s/)[0];current=type.startsWith(prefix)&&!type.includes('(')?{type,source:base+file+'#L'+(index+1)}:null;if(current)records.set(type,current);}
    if(!current)continue;
    const match=line.match(/^\t(?:var\/)?(name|major_pot|med_pot|minor_pot|skill_required|heat_required)\s*=\s*("[^"\r\n]*"|\/[\w/]+|SKILL_LEVEL_\w+|null|\d+(?:\.\d+)?)/);
    if(match)current[match[1]]=match[2].startsWith('"')?match[2].slice(1,-1):match[2]==='null'?null:match[2];
  }
  function resolve(type,seen=new Set()){
    if(seen.has(type))throw Error('Cyclic source inheritance: '+type);
    seen.add(type);const r=records.get(type);if(!r)return {};
    return {...resolve(type.slice(0,type.lastIndexOf('/')),seen),...r};
  }
  return [...records.keys()].map(t=>resolve(t));
}
function extract(){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  if(manifest.revision!==revision)return {revision,held:true};
  const file='code/modules/roguetown/roguecrafting/alchemy/';
  const ingredients=declarations(file+'ingredients.dm','/obj/item/alch/').filter(r=>r.major_pot||r.med_pot||r.minor_pot).map(r=>({type:r.type,name:r.name||r.type.split('/').pop(),major:r.major_pot,medium:r.med_pot,minor:r.minor_pot,source:r.source}));
  const recipes=declarations(file+'alch_cauldron_recipes.dm','/datum/alch_cauldron_recipe/').map(r=>({type:r.type,name:r.name||r.type.split('/').pop(),skillRequired:r.skill_required?skills.indexOf(r.skill_required.replace('SKILL_LEVEL_','')):2,source:r.source}));
  const brewDir='code/datums/brewing_recipes/';
  const brewing=fs.readdirSync(path.join(dir,brewDir)).filter(f=>f.endsWith('.dm')).flatMap(f=>declarations(brewDir+f,'/datum/brewing_recipe/')).map(r=>({type:r.type,heatRequired:Boolean(Number(r.heat_required)),minimumHeatKelvin:Number(r.heat_required)||null,source:r.source}));
  return {revision,cauldron:{ingredients,recipes},brewing};
}
module.exports={extract,declarations};
