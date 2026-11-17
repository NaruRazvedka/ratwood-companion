/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Adapted from Ratwood-2.0 code/__HELPERS/text.dm.
 * Upstream revision: 2d61e02c69520dacb0f4edc1d269395713cbeafb. See LICENSE and NOTICE.md.
 */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const escapes = [['\\\\', '$1'], ['\\**', '$2'], ['\\*', '$3'], ['\\__', '$4'], ['\\_', '$5'], ['\\^', '$6'], ['\\((', '$7'], ['\\))', '$8'], ['\\|', '$9'], ['\\%', '$0']];
  const literal = (text, from, to) => text.split(from).join(to);
  function htmlEncode(text) {
    return text.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&#34;', "'":'&#39;'}[c]));
  }
  function byteLength(text) { return encoder.encode(text).length; }
  function parse(text) {
    let t = htmlEncode(text);
    t = literal(t, '$', '$-');
    for (const [from, to] of escapes) t = literal(t, from, to);
    t = literal(t, '!', '$a');
    t = t.replace(/-=([A-Za-z0-9]{6})([\S\s\n]+?)=-/g, "<font color='$1'>$2</font>");
    t = literal(literal(t, '((', '<font size="1">'), '))', '</font>');
    t = t.replace(/-{3,}/gm, '<hr>');
    t = t.replace(/^\((-){3,}\)$/gm, '$1');
    let level = -1;
    let singleSpace = -1;
    let orderedOpen = false;
    t = t.split('\n').map(line => {
      const stars = (line.match(/\*/g) || []).length;
      if (stars % 2 === 1 && /^\s*\*/.test(line)) {
        if (orderedOpen) { line = '</ol>' + line; orderedOpen = false; }
        const indentation = line.match(/^( *)\*.*$/);
        let spaces = indentation ? indentation[1].length : byteLength(line);
        line = line.replace(/^ *(\*.*)$/, '$1');
        if (singleSpace === -1 && spaces === 2) singleSpace = level === 0 ? 0 : 1;
        if (singleSpace === 0) spaces = spaces % 2 ? Math.floor(spaces / 2 + .25) : spaces / 2;
        line = line.replace('*', '<li>');
        while (level < spaces) { line = '<ul>' + line; level++; }
        while (level > spaces) { line = '</ul>' + line; level--; }
      } else if (/^\s*\d+\.\s/.test(line)) {
        // Match upstream's ordering, including prefixes added before stripping N.
        while (level >= 0) { line = '</ul>' + line; level--; }
        line = line.replace(/^\s*\d+\.\s*/, '');
        if (!orderedOpen) { line = '<ol><li>' + line + '</li>'; orderedOpen = true; }
        else line = '<li>' + line + '</li>';
      } else {
        if (orderedOpen) { line = '</ol>' + line; orderedOpen = false; }
        while (level >= 0) { line = '</ul>' + line; level--; }
      }
      return line;
    }).join('\n');
    while (level >= 0) { t += '</ul>'; level--; }
    if (orderedOpen) t += '</ol>';
    t = t.replace(/^#(?!#) ?(.+)$/gm, '<h2>$1</h2>')
      .replace(/^##(?!#) ?(.+)$/gm, '<h3>$1</h3>')
      .replace(/^###(?!#) ?(.+)$/gm, '<h4>$1</h4>')
      .replace(/^#### ?(.+)$/gm, '<h5>$1</h5>')
      .replace(/\*([^*]*)\*/g, '<i>$1</i>')
      .replace(/_([^_]*)_/g, '<i>$1</i>');
    t = literal(literal(t, '<i></i>', '!'), '</i><i>', '!');
    t = t.replace(/!([^!]+)!/g, '<b>$1</b>')
      .replace(/\^([^\^]+)\^/g, '<font size="4">$1</font>')
      .replace(/\|([^|]+)\|/g, '<center>$1</center>');
    t = literal(t, '!', '</i><i>');
    t = literal(t, '$a', '!');
    for (const [from, to] of escapes) t = literal(t, to, from.slice(1));
    t = literal(t, '$-', '$');
    return t.replace(/\n/g, '<BR>');
  }
  const api = { parse, byteLength };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Ratwood = api;
})(globalThis);
