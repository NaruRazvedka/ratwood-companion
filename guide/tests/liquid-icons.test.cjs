const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {liquidIcon}=require('../core.js');
const data=require('../data.js');

test('drink and liquid families have distinct reference icons',()=>{
  const expected={
    'Wine-Raspberry':'wine','Wine-Umeshu(Plum)':'wine','Cider-Apple':'tankard',
    'Beer- Wheat':'tankard','Mead':'tankard','Apple Brandy':'bottle','Aqua Vitae':'bottle',
    'Golden Calendula Tea':'teapot','Coffee':'teapot','spiced chocolate':'teapot',
    'Water':'drop','Dirty Water':'drop','Milk':'drop','Molasses':'drop',
    'Elixir of Health':'flask','Fish stew':'bowl','Fireleaf':'cup'
  };
  for(const [title,icon]of Object.entries(expected)){
    const item=data.topics.find(t=>t.title===title);assert.ok(item,title);
    assert.equal(liquidIcon(item),icon,title);
  }
  assert.equal(liquidIcon({title:'juice of apple',category:'Soups & stews'}),'drop');
  for(const title of ['Roast Coffee Beans','Dried Rosa Petals','Alecod','Apple Cake'])assert.equal(liquidIcon(data.topics.find(t=>t.title===title)),null,title);
});

test('every liquid entry has a local icon, with distinct offline artwork',()=>{
  const files=new Set();
  for(const item of data.topics.filter(t=>['Drinks','Liquids','Potions','Soups & stews'].includes(t.category))){
    const icon=liquidIcon(item);assert.match(icon,/^(wine|tankard|bottle|teapot|drop|flask|bowl|cup)$/);
    files.add(path.join(__dirname,'../assets/icons',icon+'.svg'));
  }
  const images=[...files].map(file=>fs.readFileSync(file,'utf8'));
  assert.equal(images.length,8);assert.equal(new Set(images).size,8);
  for(const svg of images){assert.match(svg,/viewBox="0 0 32 32"/);assert.doesNotMatch(svg,/<script|<foreignObject|\bhref=|\bonload=/i);}
});
