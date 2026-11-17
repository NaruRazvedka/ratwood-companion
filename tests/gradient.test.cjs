const { test } = require('node:test');
const assert = require('node:assert/strict');
const gradient = require('../gradient.js');
const { parse } = require('../parser.js');

test('gradient interpolates RGB with exact endpoints and rounded midpoint', () => {
  assert.equal(gradient('abc', '000000', 'FFFFFF'), '-=000000a=--=808080b=--=FFFFFFc=-');
  assert.equal(gradient('a', 'aabbcc', 'FFFFFF'), '-=AABBCCa=-');
  assert.equal(gradient('', '000000', 'FFFFFF'), '');
});
test('whitespace stays intact and does not consume a gradient step', () => {
  assert.equal(gradient('a \nb', '000000', 'FFFFFF'), '-=000000a=- \n-=FFFFFFb=-');
  assert.equal(gradient(' \n', '000000', 'FFFFFF'), ' \n');
});
test('Unicode graphemes stay together', () => {
  assert.equal(gradient('e\u0301👩‍💻', '000000', 'FFFFFF'), '-=000000e\u0301=--=FFFFFF👩‍💻=-');
});
test('preserves markup, list prefixes, headers, and escaped characters', () => {
  const colorA = "<font color='000000'>a</font>";
  const colorB = "<font color='FFFFFF'>b</font>";
  for (const [source, expected] of [
    ['**ab**', `<b>${colorA}${colorB}</b>`],
    ['*ab*', `<i>${colorA}${colorB}</i>`],
    ['|ab|', `<center>${colorA}${colorB}</center>`],
    ['((ab))', `<font size="1">${colorA}${colorB}</font>`],
    ['# ab', `<h2>${colorA}${colorB}</h2>`],
    ['* ab', `<ul><li> ${colorA}${colorB}</ul>`],
    ['\\*a', `<font color='000000'>*</font><font color='FFFFFF'>a</font>`],
  ]) assert.equal(parse(gradient(source, '000000', 'FFFFFF')), expected);
  assert.equal(gradient('---', '000000', 'FFFFFF'), '---');
});
test('recoloring replaces existing spans instead of nesting', () => {
  assert.equal(gradient('-=FF0000ab=-', '000000', 'FFFFFF'), gradient('ab', '000000', 'FFFFFF'));
  const initial = gradient('abc', '000000', 'FFFFFF');
  assert.equal(gradient(initial, 'FF0000', '00FF00'), gradient('abc', 'FF0000', '00FF00'));
});
test('rejects invalid color values', () => {
  for (const [from, to] of [['fff', 'FFFFFF'], ['000000', '<bad>!'], ['#000000', 'FFFFFF']]) assert.throws(() => gradient('text', from, to));
});
