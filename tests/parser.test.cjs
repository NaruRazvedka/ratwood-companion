const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, byteLength } = require('../parser.js');

const examples = [
  ['', ''],
  ['**bold**', '<b>bold</b>'], ['*italic*', '<i>italic</i>'], ['_italic_', '<i>italic</i>'],
  ['|center|', '<center>center</center>'], ['^large^', '<font size="4">large</font>'],
  ['((small))', '<font size="1">small</font>'],
  ['# Head\n## Head\n### Head\n#### Head', '<h2>Head</h2><BR><h3>Head</h3><BR><h4>Head</h4><BR><h5>Head</h5>'],
  ['* item\n* next', '<ul><li> item<BR><li> next</ul>'],
  ['before---after', 'before<hr>after'],
  ['-=FFAA00gold=-', "<font color='FFAA00'>gold</font>"],
  ['-=ggggggblack=-', "<font color='gggggg'>black</font>"],
  ['-=FFAA00=-', '-=FFAA00=-'],
  ['-=A1b2C3line one\nline two=-', "<font color='A1b2C3'>line one<BR>line two</font>"],
  ['-=FFAA00unclosed', '-=FFAA00unclosed'],
  ['**-=FFAA00bold gold=-**', "<b><font color='FFAA00'>bold gold</font></b>"],
  ['1. First\n2. Second', '<ol><li>First</li><BR><li>Second</li></ol>'],
  ['1. First\nplain', '<ol><li>First</li><BR></ol>plain'],
  ['1.No space', '1.No space'],
  ['\\**literal\\**', '**literal**'], ['\\*literal\\*', '*literal*'],
  ['\\_literal\\_', '_literal_'], ['\\^literal\\^', '^literal^'],
  ['\\((literal\\))', '((literal))'], ['\\|literal\\|', '|literal|'],
  ['\\\\ \\% $1 !', '\\ % $1 !'],
  ['<img src=x onerror="alert(1)"> & <script>alert(1)</script>', '&lt;img src=x onerror=&#34;alert(1)&#34;&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;'],
];
for (const [source, expected] of examples) test(`parse ${JSON.stringify(source)}`, () => assert.equal(parse(source), expected));

test('informational byte counts include Unicode and markup without cutting text', () => {
  const text = 'é'.repeat(1000) + '猫';
  assert.equal(byteLength(text), 2003);
  assert.equal(parse(text), text);
  assert.equal(byteLength('😀'), 4);
  assert.equal(parse('\uFEFFtext'), '\uFEFFtext');
  assert.equal(byteLength('-=FFAA00a=-'), 11);
});

test('source cannot create executable tags or attributes', () => {
  for (const text of ['<svg/onload=alert(1)>', '-=\'\"<>xxbad=-', '&lt;script&gt;alert(1)&lt;/script&gt;']) {
    assert.doesNotMatch(parse(text), /<(?:script|svg|img)/);
  }
});

test('matches current-source output recorded from BYOND', () => {
  for (const { source, html } of require('./upstream-fixtures.json')) assert.equal(parse(source), html, JSON.stringify(source));
});
