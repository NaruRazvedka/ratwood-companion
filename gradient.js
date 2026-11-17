/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function (root) {
  'use strict';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function gradient(text, from, to) {
    if (![from, to].every(color => /^[0-9a-f]{6}$/i.test(color))) throw new Error('Invalid gradient color');
    const rgb = color => [0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    const start = rgb(from), end = rgb(to);
    // Leave game delimiters intact; replace existing color spans rather than nesting them.
    const parts = text.split(/(\\(?:\\|\*\*|\*|__|_|\^|\(\(|\)\)|\||%)|-=.{6}|=-|^#{1,4} ?|^ *\* ?|-{3,}|\*\*|\*|_|\^|\||\(\(|\)\))/gm);
    const tokens = parts.flatMap((part, index) => {
      if (index % 2) {
        if (part.startsWith('-=') || part === '=-') return [];
        return [{ text: part, visible: part.startsWith('\\') }];
      }
      return [...segmenter.segment(part)].map(({ segment }) => ({ text: segment, visible: /\S/.test(segment) }));
    });
    const count = tokens.filter(token => token.visible).length;
    let position = 0;
    return tokens.map(token => {
      if (!token.visible) return token.text;
      const ratio = count > 1 ? position++ / (count - 1) : 0;
      const color = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio).toString(16).padStart(2, '0')).join('').toUpperCase();
      return `-=${color}${token.text}=-`;
    }).join('');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = gradient;
  else root.ratwoodGradient = gradient;
})(globalThis);
