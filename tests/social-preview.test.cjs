const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {permitted}=require('../tools/package-site.cjs');
test('both shared pages advertise distributable large PNG previews and creator credits',()=>{
  for(const [file,image] of [['index.html','workshop'],['guide/index.html','guide']]){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.match(html,/property="og:title"/);assert.match(html,/property="og:description"/);
    assert.match(html,/name="twitter:card" content="summary_large_image"/);
    const asset='guide/assets/social/'+image+'.png';
    assert.ok(html.includes('https://narurazvedka.github.io/ratwood-companion/'+asset));
    assert.ok(permitted(asset));const png=fs.readFileSync(path.join(__dirname,'..',asset));
    assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  }
  const credits=fs.readFileSync(path.join(__dirname,'../credits.html'),'utf8');
  assert.match(credits,/NaruRazvedka \(Pushinka\)/);assert.match(credits,/ChatGPT/);
});
