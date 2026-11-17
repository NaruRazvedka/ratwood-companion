/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const lab=path.resolve(root,'../lab/recipe-tests');
const manifest=JSON.parse(fs.readFileSync(path.join(lab,'manifest.json'),'utf8'));
const results=JSON.parse(fs.readFileSync(path.join(lab,'results.json'),'utf8'));
const expected=JSON.parse(fs.readFileSync(path.join(root,'sources/ratwood-2/index.json'),'utf8')).revision;
if(manifest.revision!==expected)throw Error('Lab revision differs from the guide source snapshot.');
if(!results.total||results.passed!==results.total||results.checks.some(c=>!c.passed))throw Error('Native lab checks must pass before importing timing data.');
for(const file of manifest.sourceFiles){
  const upstream=path.resolve(root,'../lab/Ratwood-2.0');
  const source=path.resolve(upstream,file.path),relative=path.relative(upstream,source);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Lab source path leaves the checkout.');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if(hash!==file.sha256)throw Error('Lab source changed: '+file.path);
}
const recipes=results.recipes;
if(new Set(recipes.map(r=>r.type)).size!==recipes.length)throw Error('Duplicate native recipe types.');
for(const row of recipes)if(!row.type.startsWith('/datum/food_recipe/')||!Number.isFinite(row.ticksPerStep)||row.ticksPerStep<0)throw Error('Invalid native recipe timing.');
const indexed=JSON.parse(fs.readFileSync(path.join(root,'sources/ratwood2-food-recipes.json'),'utf8'));
const byType=new Map(recipes.map(r=>[r.type,r]));
for(const row of indexed){
  const native=byType.get(row.type);
  const inputs=entries=>entries.map(i=>[i.type,i.amount==null?null:Number(i.amount)]);
  if(!native||native.base!==row.base||native.result!==row.result||Boolean(native.needsCooking)!==Boolean(row.needsCooking)||JSON.stringify(inputs(native.ingredients))!==JSON.stringify(inputs(row.ingredients)))throw Error('Native recipe disagrees with the retained source index: '+row.type);
}
const output={revision:expected,byondVersion:results.byondVersion,passed:results.passed,total:results.total,scope:results.scope,sourceFiles:manifest.sourceFiles,recipes};
fs.writeFileSync(path.join(root,'sources/ratwood2-native-recipes.json'),JSON.stringify(output,null,2)+'\n');
console.log(`Imported ${recipes.length} native recipe records; scope: ${results.scope}`);
