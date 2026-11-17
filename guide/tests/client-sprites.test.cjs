const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('personal client-pack matches retain provenance only in the private edition',t=>{
  const data=require('../data.js');
  if(data.publicEdition){assert.ok(data.topics.every(item=>!item.sprite?.includes('client-pack/')));t.skip('Unlicensed client-pack artwork is intentionally absent from public editions.');return;}
  if(!fs.existsSync(path.join(root,'sources/client-sprites.json'))){t.skip('Personal client-pack evidence is not distributed.');return;}
  const matches=require('../sources/client-sprites.json');
  assert.ok(matches.length>=90);
  for(const match of matches){
    assert.ok(match.names.length&&match.sheet.endsWith('.dmi')&&match.state);
    assert.equal(match.source,'https://rsc.ratwood.rip/roguetown-2026-02-20.rsc');
    assert.match(match.note,/not recipe availability/);
    assert.match(match.path,/^assets\/sprites\/client-pack\/[a-f0-9]+\.png$/);
    const bytes=fs.readFileSync(path.join(root,match.path));
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(bytes.readUInt32BE(16),32);assert.equal(bytes.readUInt32BE(20),32);
  }
  for(const title of ['Apple Cake','Rice and Beef Meal','Calendula']){
    const topic=data.topics.find(t=>t.title===title);
    assert.ok(/\/(client-pack|ratwood-2|current)\//.test(topic.sprite));assert.ok(topic.spriteEvidence);
    assert.notEqual(topic.status,'corroborated');
  }
});
