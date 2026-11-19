/* SPDX-License-Identifier: AGPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const s=require('../scenario-tools.js'),{extract}=require('../tools/scenario-data.cjs');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('source extraction preserves exact potion and ingredient identities and skill defaults',()=>{
  const d=extract();assert.equal(d.revision,s.revision);assert.equal(d.held,undefined);
  const c=d.cauldron;assert.ok(c.ingredients.length>30);assert.ok(c.recipes.length>20);
  assert.equal(c.ingredients.find(i=>i.type==='/obj/item/alch/coaldust').major,'/datum/alch_cauldron_recipe/antidote');
  assert.equal(c.recipes.find(i=>i.type==='/datum/alch_cauldron_recipe/antidote').skillRequired,2);
  assert.equal(c.recipes.find(i=>i.type==='/datum/alch_cauldron_recipe/berrypoison').skillRequired,3);
  assert.ok(c.ingredients.every(i=>i.source.includes(s.revision)));
  assert.equal(d.brewing.find(r=>r.type==='/datum/brewing_recipe/brandy/pear').minimumHeatKelvin,360);
  assert.equal(d.brewing.find(r=>r.type==='/datum/brewing_recipe/liquor/ricespirit').heatRequired,true);
  assert.equal(d.brewing.find(r=>r.type==='/datum/brewing_recipe/raspberry_wine').heatRequired,false);
});
test('cauldron accepts exactly five competing points and gates fire, water, skill and ties',()=>{
  const records=extract().cauldron,inputs=['/obj/item/alch/coaldust','/obj/item/alch/silverdust'];
  const r=s.cauldron(inputs,records);assert.equal(r.state,'ready');assert.equal(r.winner.score,5);assert.equal(r.winner.name,'Antidote');
  assert.equal(s.cauldron(inputs,records,{water:89}).state,'water');assert.equal(s.cauldron(inputs,records,{lit:false}).state,'unlit');
  assert.equal(s.cauldron(inputs,records,{skill:1}).state,'skill-failure');assert.equal(s.cauldron(inputs,records,{water:180}).winner.type,r.winner.type);
  assert.equal(s.cauldron(['/obj/item/alch/coaldust'],records).state,'insufficient');
  const tied={ingredients:[{type:'x',major:'a',medium:'b'},{type:'y',major:'b',medium:'a'}],recipes:[{type:'a',skillRequired:0},{type:'b',skillRequired:0}]};
  assert.equal(s.cauldron(['x','y'],tied).state,'tie');assert.equal(s.cauldron(['x','y'],tied).winner,null);
  assert.throws(()=>s.cauldron([inputs[0],inputs[0]],records),/duplicate/);
  assert.equal(s.cauldron(inputs,records,{portable:true,water:60}).state,'ready');
  assert.equal(s.cauldron(inputs,records,{portable:true,water:59}).state,'water');
  assert.throws(()=>s.cauldron(Array(5).fill(inputs[0]),records));assert.throws(()=>s.cauldron(['unconfirmed'],records));
});
test('normal furnace is one-for-one; great furnace uses actual smeltresult predicates',()=>{
  const iron='/obj/item/ingot/iron',coal='/obj/item/rogueore/coal';
  assert.equal(s.smelting([iron]).quantity,1);assert.throws(()=>s.smelting([iron,iron]));
  assert.deepEqual(s.smelting([coal,iron,iron,iron],{great:true}).outputs,[{type:'/obj/item/ingot/steel',amount:4}]);
  assert.equal(s.smelting([coal+'/charcoal',iron,iron,iron],{great:true}).alloy,'steel');
  assert.equal(s.smelting(['/obj/item/ingot/tin',...Array(3).fill('/obj/item/ingot/copper')],{great:true}).alloy,'bronze');
  assert.equal(s.smelting(['/obj/item/ingot/gold',...Array(3).fill('/obj/item/ingot/aaslag')],{great:true}).quantity,4);
  assert.equal(s.smelting(['/obj/item/ingot/silver',...Array(3).fill('/obj/item/ingot/steel')],{great:true}).quantity,2);
  assert.equal(s.smelting([iron,iron],{great:true}).alloy,null);
  close(s.smelting([iron],{skill:0}).quality[1],15/21);assert.equal(s.smelting([iron],{skill:1}).quality[2],1);
  assert.deepEqual(s.smelting([iron],{skill:6}).quality,{6:1});
  for(let skill=0;skill<=6;skill++)close(Object.values(s.smelting([iron],{skill}).quality).reduce((a,b)=>a+b,0),1);
});
test('farming stages share exact bounded conditions, thresholds and explicit stalls',()=>{
  const wheat={maturation:300,production:120};let r=s.farming(wheat);assert.equal(r.totalSeconds,420);
  close(s.farming({...wheat,tilled:true,fertilized:true,pollinated:true}).multiplier,5.6);
  close(s.farming({...wheat,blessed:true,livingLight:true,rune:true}).multiplier,1.35);
  close(s.farming({...wheat,weeds:60,health:30}).multiplier,.75**4);
  assert.equal(s.farming({...wheat,weeds:29.99,health:60.01}).multiplier,1);
  assert.equal(s.farming({...wheat,water:false}).totalSeconds,null);
  assert.equal(s.farming({...wheat,nutrition:false}).multiplier,0);
  assert.equal(s.farming({...wheat,underground:true}).stalls.length,1);
  assert.equal(s.farming({...wheat,underground:true,canUnderground:true}).stalls.length,0);
  assert.throws(()=>s.farming({...wheat,health:101}));assert.throws(()=>s.farming({production:120}));
});
test('brewing uses post-brew strict aging thresholds and conditional heated progress',()=>{
  const record={brewSeconds:300,ageTimes:[{seconds:600,name:'Aged'},{seconds:1200,name:'Delectable'}]};
  assert.equal(s.brewing(record,{elapsed:900}).stage,'Base recipe');assert.equal(s.brewing(record,{elapsed:901}).stage,'Aged');
  assert.equal(s.brewing(record,{heated:true}).brewSeconds,150);
  assert.equal(s.brewing(record,{heatRequired:true}).blocked,true);
  assert.equal(s.brewing(record,{heated:true,heatRequired:true}).brewSeconds,300);
  assert.equal(s.brewing(record,{elapsed:1500}).stage,'Aged');assert.equal(s.brewing(record,{elapsed:1501}).stage,'Delectable');
  assert.throws(()=>s.brewing({}));
});
test('weapon comparison respects zero wield override and rejects missing force or factors',()=>{
  const topic={itemProperties:{useCases:[{facts:[{property:'force',value:'20'},{property:'force_wielded',value:'0'}]}]}},attack={name:'cut',facts:[{label:'Damage multiplier',value:'1.2'},{label:'Armor damage channel',value:'slash'}]};
  assert.equal(s.weaponAttack(topic,attack,{wielded:true}).baseAttack,24);
  topic.itemProperties.useCases[0].facts[1].value='30';assert.equal(s.weaponAttack(topic,attack,{wielded:true}).baseAttack,36);
  assert.throws(()=>s.weaponAttack({},attack));assert.throws(()=>s.weaponAttack(topic,{facts:[]}));
});
test('armor matches native actual run_armor_check branches, including projectile asymmetry',()=>{
  const hit={damage:100,tier:3};
  assert.equal(s.armor({...hit,channel:'blunt'}).blocked,100);
  for(const channel of ['fire','acid','bullet'])close(s.armor({...hit,channel}).blocked,37.5);
  assert.equal(s.armor({...hit,channel:'slash',penetration:2}).blocked,1000);
  close(s.armor({...hit,channel:'slash',penetration:3}).blocked,30);close(s.armor({...hit,channel:'stab',penetration:4}).blocked,20);
  for(const penetration of [3,4])assert.equal(s.armor({...hit,channel:'piercing',penetration}).blocked,80);
  assert.equal(s.armor({...hit,channel:'piercing',penetration:2}).passed,0);
  assert.equal(s.armor({...hit,channel:'slash',penetration:4,chunked:true}).blocked,1000);
  assert.equal(s.armor({...hit,tier:0,channel:'blunt'}).passed,100);
  assert.throws(()=>s.armor({...hit,damage:NaN}));assert.throws(()=>s.armor({...hit,channel:'made-up'}));
});
test('revision mismatch holds authored handlers and tools use safe local bundle paths',()=>{
  const data={currentSource:{revision:'new-revision'},topics:[]};require('../tools/handler-content.cjs').apply(data);
  assert.equal(data.topics.length,0);assert.equal(data.handlerContentHeld.revision,s.revision);
  const ui=fs.readFileSync(path.join(__dirname,'../tools-ui.js'),'utf8');
  assert.match(ui,/details\\\//);assert.doesNotMatch(ui,/fetch\(/);assert.match(ui,/esc\(err\.message\)/);
});
