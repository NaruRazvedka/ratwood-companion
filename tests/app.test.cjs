const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Ratwood = require('../parser.js');

class Element {
  constructor() { this.value = ''; this.style = {}; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.selectionStart = this.selectionEnd = 0; this.textContent = ''; this.classes = new Set(); this.classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) }; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  async fire(name, options = {}) { const event = { preventDefault() {}, ...options }; for (const fn of this.listeners[name] || []) await fn(event); }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() {}
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); }
  select() { this.setSelectionRange(0, this.value.length); }
}
function setup({ stored = null, records = new Map(), storageError = false, writeError = false, clipboard = true, download = false } = {}) {
  const ids = {};
  const get = id => ids[id] ||= new Element();
  const tabs = ['sfw', 'nsfw', 'ooc', 'nsfw_ooc'].map(tab => { const e = get('tab-' + tab); e.dataset.tab = tab; return e; });
  const formats = ['bold', 'italic', 'heading', 'center', 'large', 'small', 'list', 'rule'].map(format => { const e = new Element(); e.dataset.format = format; return e; });
  get('hex-color').value = 'D7A85D';
  get('gradient-hex').value = 'B76ED4';
  const key = 'ratwood-flavor-workshop-v1';
  if (stored !== null) records.set(key, stored);
  const lifecycle = new Element(), frames = [];
  let copied, downloadBlob, downloadName;
  const context = {
    document: { getElementById: get, querySelectorAll: selector => selector === '[data-tab]' ? tabs : formats },
    localStorage: { getItem: key => { if (storageError) throw Error(); return records.get(key) ?? null; }, setItem: (key, value) => { if (writeError) throw Error(); records.set(key, value); } },
    window: { addEventListener: (name, fn) => lifecycle.addEventListener(name, fn), requestAnimationFrame: fn => frames.push(fn) },
    navigator: { clipboard: clipboard === false ? undefined : { writeText: async value => { if (clipboard === 'denied') throw Error(); copied = value; } } },
    Ratwood, ratwoodGradient: require('../gradient.js'), Date, console
  };
  if (download) {
    context.Blob = Blob;
    context.URL = { createObjectURL: blob => { downloadBlob = blob; return 'blob:backup'; }, revokeObjectURL() {} };
    context.document.body = { append() {} };
    context.document.createElement = () => ({ click() { downloadName = this.download; }, remove() {} });
    context.window.setTimeout = fn => fn();
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), context);
  const editor = get('editor');
  return {
    get, tabs, formats, editor, saved: () => records.get(key) ?? null, records, copied: () => copied, downloaded: async () => ({ name: downloadName, text: await downloadBlob?.text() }),
    pageshow: () => lifecycle.fire('pageshow'), flushFrames: () => { while (frames.length) frames.shift()(); },
    type: async text => { await editor.fire('beforeinput', { inputType: 'insertFromPaste' }); editor.value = text; editor.setSelectionRange(text.length, text.length); await editor.fire('input', { inputType: 'insertFromPaste' }); },
    select: async (start, end) => { editor.setSelectionRange(start, end); await editor.fire('select'); },
    format: name => formats.find(e => e.dataset.format === name).fire('click'),
    tab: name => tabs.find(e => e.dataset.tab === name).fire('click'),
  };
}

test('color tools retain selection, wrap markup, and undo/redo', async () => {
  const app = setup();
  await app.type('golden eyes');
  await app.select(0, 6);
  app.get('hex-color').value = 'FFAA00';
  await app.get('hex-color').fire('input');
  await app.get('apply-color').fire('click');
  assert.equal(app.editor.value, '-=FFAA00golden=- eyes');
  assert.equal(app.editor.value.slice(app.editor.selectionStart, app.editor.selectionEnd), 'golden');
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true });
  assert.equal(app.editor.value, 'golden eyes');
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
  assert.equal(app.editor.value, '-=FFAA00golden=- eyes');
});
test('color insertion with no selection positions caret inside wrapper', async () => {
  const app = setup();
  await app.get('apply-color').fire('click');
  assert.equal(app.editor.value, '-=D7A85D=-');
  assert.equal(app.editor.selectionStart, 8);
  assert.equal(app.editor.selectionEnd, 8);
});
test('invalid hex cannot change the draft', async () => {
  const app = setup(); await app.type('unchanged');
  app.get('hex-color').value = 'XYZ'; await app.get('apply-color').fire('click');
  assert.equal(app.editor.value, 'unchanged');
  assert.equal(app.get('hex-color').attributes['aria-invalid'], 'true');
});
test('all toolbar actions insert the expected game markup', async () => {
  for (const [format, expected] of Object.entries({ bold: '**text**', italic: '*text*', center: '|text|', large: '^text^', small: '((text))', heading: '# text', list: '* text', rule: '---\ntext' })) {
    const app = setup(); await app.type('text'); await app.select(0, 4); await app.format(format);
    assert.equal(app.editor.value, expected);
  }
});
test('heading and list format whole selected lines', async () => {
  const app = setup(); await app.type('one\ntwo\nthree'); await app.select(1, 6); await app.format('list');
  assert.equal(app.editor.value, '* one\n* two\nthree');
});
test('tabs isolate drafts, selection, history, byte counts, and reload recovery', async () => {
  const app = setup(); await app.type('SFW draft'); await app.select(0, 3); await app.format('bold');
  await app.tab('nsfw'); assert.equal(app.editor.value, ''); await app.type('NSFW draft');
  await app.tab('ooc'); await app.type('OOC draft'); assert.equal(app.get('count').textContent, '9 bytes');
  await app.tab('sfw'); assert.equal(app.editor.value, '**SFW** draft');
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true }); assert.equal(app.editor.value, 'SFW draft');
  const reloaded = setup({ stored: app.saved() });
  assert.equal(reloaded.editor.value, 'SFW draft');
  await reloaded.tab('nsfw'); assert.equal(reloaded.editor.value, 'NSFW draft');
  await reloaded.tab('ooc'); assert.equal(reloaded.editor.value, 'OOC draft');
});
test('failed storage reads/writes and corrupt drafts preserve editing', async () => {
  for (const options of [{ storageError: true }, { writeError: true }, { stored: '{broken' }, { stored: '{"sfw":7}' }]) {
    const app = setup(options); await app.type('still editable');
    assert.equal(app.editor.value, 'still editable'); assert.match(app.get('save-status').textContent, /unavailable/);
  }
});

test('legacy drafts migrate without moving OOC notes into either appearance field', async () => {
  const stored = JSON.stringify({ sfw:'appearance', nsfw:'unclothed', ooc:'existing OOC notes' });
  const app = setup({ stored });
  assert.equal(app.editor.value,'appearance');
  await app.tab('ooc');assert.equal(app.editor.value,'existing OOC notes');
  await app.tab('nsfw_ooc');assert.equal(app.editor.value,'');
  await app.type('separate NSFW notes');
  const saved=JSON.parse(app.saved());
  assert.equal(saved.sfw,'appearance');assert.equal(saved.nsfw,'unclothed');
  assert.equal(saved.ooc,'existing OOC notes');assert.equal(saved.nsfw_ooc,'separate NSFW notes');
  const backups=JSON.parse(app.records.get('ratwood-flavor-workshop-v1-backups'));
  assert.equal(backups[0],stored);
  const reloaded=setup({records:app.records});
  assert.equal(reloaded.editor.value,'separate NSFW notes');
  assert.equal(reloaded.get('tab-nsfw_ooc').attributes['aria-selected'],'true');
});

test('browser session form restoration cannot file OOC contents under SFW', async () => {
  const stored=JSON.stringify({sfw:'appearance',nsfw:'',ooc:'OOC notes'});
  const app=setup({stored});
  app.editor.value='OOC notes';
  await app.pageshow();assert.equal(app.editor.value,'appearance');
  app.editor.value='OOC notes'; // Some browsers restore persisted forms after pageshow.
  app.flushFrames();assert.equal(app.editor.value,'appearance');
  assert.equal(app.saved(),stored);
  app.editor.value='OOC notes';
  await app.editor.fire('beforeinput',{inputType:'insertText'});
  assert.equal(app.editor.value,'appearance');
  app.editor.value+='!';await app.editor.fire('input',{inputType:'insertText'});
  assert.equal(JSON.parse(app.saved()).sfw,'appearance!');
  assert.equal(JSON.parse(app.saved()).ooc,'OOC notes');
});

test('saving one tab preserves other drafts saved by another open window', async () => {
  const records=new Map();const first=setup({records}),second=setup({records});
  await first.type('SFW from first window');
  await second.tab('ooc');await second.type('OOC from second window');
  assert.equal(JSON.parse(first.saved()).sfw,'SFW from first window');
  await first.type('SFW changed');
  assert.equal(JSON.parse(first.saved()).ooc,'OOC from second window');
});
test('long Unicode drafts preview, copy, and reload in full across all tabs', async () => {
  const app = setup();
  const text = 'é猫😀'.repeat(150) + ' THE END';
  for (const tab of ['sfw', 'nsfw', 'ooc', 'nsfw_ooc']) {
    await app.tab(tab); await app.type(text);
    assert.equal(app.get('preview').innerHTML, Ratwood.parse(text));
    assert.equal(app.get('count').textContent, `${Ratwood.byteLength(text)} bytes`);
    await app.get('copy').fire('click'); assert.equal(app.copied(), text);
  }
  const reloaded = setup({ stored: app.saved() });
  for (const tab of ['sfw', 'nsfw', 'ooc', 'nsfw_ooc']) {
    await reloaded.tab(tab);
    assert.equal(reloaded.get('preview').innerHTML, Ratwood.parse(text));
  }
});
test('clipboard denial or missing API selects source for manual copy', async () => {
  for (const clipboard of [false, 'denied']) {
    const app = setup({ clipboard }); await app.type('**source**'); await app.get('copy').fire('click');
    assert.equal(app.editor.selectionStart, 0); assert.equal(app.editor.selectionEnd, 10);
    assert.match(app.get('copy-status').textContent, /Ctrl\+C/);
    assert.equal(app.copied(), undefined);
  }
});
test('tab keyboard navigation updates active tab and label', async () => {
  const app = setup(); await app.tabs[0].fire('keydown', { key: 'End' });
  assert.equal(app.get('tab-nsfw_ooc').attributes['aria-selected'], 'true');
  assert.equal(app.get('draft-panel').attributes['aria-labelledby'], 'tab-nsfw_ooc');
  assert.equal(app.get('tab-sfw').tabIndex, -1);
});

test('gradient preserves selection, autosaves, previews, copies, and undoes as one edit', async () => {
  const app = setup(); await app.type('abc eyes'); await app.select(0, 3);
  app.get('hex-color').value = '000000'; app.get('gradient-hex').value = 'FFFFFF';
  await app.get('gradient-hex').fire('input');
  assert.match(app.get('gradient-swatch').style.background, /#000000, #FFFFFF/);
  await app.get('apply-gradient').fire('click');
  const expected = '-=000000a=--=808080b=--=FFFFFFc=- eyes';
  assert.equal(app.editor.value, expected);
  assert.equal(app.editor.selectionStart, 0);
  assert.equal(app.editor.selectionEnd, expected.length - 5);
  assert.equal(JSON.parse(app.saved()).sfw, expected);
  assert.equal(app.get('preview').innerHTML, Ratwood.parse(expected));
  await app.get('copy').fire('click'); assert.equal(app.copied(), expected);
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true }); assert.equal(app.editor.value, 'abc eyes');
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true, shiftKey: true }); assert.equal(app.editor.value, expected);
});
test('gradient requires a selection and valid colors without modifying drafts', async () => {
  const app = setup(); await app.type('unchanged');
  await app.get('apply-gradient').fire('click'); assert.match(app.get('gradient-status').textContent, /Select/);
  assert.equal(app.editor.value, 'unchanged');
  await app.select(0, 4); app.get('gradient-hex').value = 'invalid';
  await app.get('apply-gradient').fire('click');
  assert.equal(app.get('gradient-hex').attributes['aria-invalid'], 'true');
  assert.equal(app.editor.value, 'unchanged');
});
test('gradient preview shows the full text beyond the former limit', async () => {
  const app = setup(); await app.type('a'.repeat(1000) + 'Z'); await app.select(0, 1001);
  await app.get('apply-gradient').fire('click');
  assert.equal(Ratwood.byteLength(app.editor.value), 11011);
  assert.equal(app.get('count').textContent, '11011 bytes');
  assert.equal(app.get('preview').innerHTML, Ratwood.parse(app.editor.value));
  assert.ok(app.get('preview').innerHTML.endsWith("<font color='B76ED4'>Z</font>"));
  await app.get('copy').fire('click'); assert.equal(app.copied(), app.editor.value);
});

const draftData = (extra = {}) => ({ sfw: 'appearance', nsfw: 'unclothed', ooc: 'notes', nsfw_ooc: 'private notes', ...extra });
async function previewBackup(app, value) {
  app.get('import-text').value = typeof value === 'string' ? value : JSON.stringify(value);
  await app.get('preview-import').fire('click');
}

test('export preserves all Unicode drafts and supports a JSON import round trip', async () => {
  const original = draftData({ sfw: '**猫😀**', nsfw_ooc: '-=FFFFFFnotes=-' });
  const app = setup({ stored: JSON.stringify(original) });
  await app.get('export-drafts').fire('click');
  const exported = JSON.parse(app.get('import-text').value);
  assert.equal(exported.format, 'ratwood-flavor-workshop');
  assert.equal(exported.version, 1);
  assert.deepEqual(exported.drafts, original);
  const destination = setup();
  await previewBackup(destination, exported);
  for (const tab of Object.keys(original)) destination.get('import-' + tab).checked = true;
  await destination.get('apply-import').fire('click');
  for (const tab of Object.keys(original)) { await destination.tab(tab); assert.equal(destination.editor.value, original[tab]); }
});

test('export requests a private JSON download when browser file APIs are available', async () => {
  const app = setup({ stored: JSON.stringify(draftData()), download: true });
  await app.get('export-drafts').fire('click');
  const file = await app.downloaded();
  assert.match(file.name, /^ratwood-drafts-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(JSON.parse(file.text).drafts, draftData());
  assert.match(app.get('backup-status').textContent, /download requested/);
});

test('import preview is inert and replaces only explicitly selected drafts with undo and safety snapshot', async () => {
  const previous = draftData();
  const app = setup({ stored: JSON.stringify(previous) });
  const next = draftData({ sfw: 'new appearance', ooc: 'new notes' });
  await previewBackup(app, next);
  assert.equal(app.editor.value, previous.sfw);
  assert.deepEqual(JSON.parse(app.saved()), previous);
  assert.equal(app.get('import-preview').hidden, false);
  await app.get('apply-import').fire('click');
  assert.match(app.get('backup-status').textContent, /select at least one/);
  app.get('import-sfw').checked = true;
  await app.get('apply-import').fire('click');
  assert.equal(app.editor.value, next.sfw);
  const saved = JSON.parse(app.saved());
  for (const tab of ['nsfw', 'ooc', 'nsfw_ooc']) assert.equal(saved[tab], previous[tab]);
  const snapshots = JSON.parse(app.records.get('ratwood-flavor-workshop-v1-backups'));
  assert.equal(JSON.parse(snapshots.at(-1)).sfw, previous.sfw);
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true });
  assert.equal(app.editor.value, previous.sfw);
  await app.editor.fire('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
  assert.equal(app.editor.value, next.sfw);
});

test('invalid backups cannot overwrite drafts and preview treats HTML as plain text', async () => {
  const app = setup({ stored: JSON.stringify(draftData()) });
  for (const value of ['{broken', 'null', '[]', JSON.stringify({ sfw: 123 }), JSON.stringify({ format: 'other', version: 1, drafts: draftData() }), JSON.stringify({ format: 'ratwood-flavor-workshop', version: 2, drafts: draftData() })]) {
    await previewBackup(app, value);
    app.get('import-sfw').checked = true;
    await app.get('apply-import').fire('click');
    assert.equal(app.editor.value, 'appearance');
    assert.equal(app.get('import-preview').hidden, true);
  }
  const text = '<img src=x onerror="alert(1)"><script>evil()</script>';
  await previewBackup(app, draftData({ sfw: text }));
  assert.equal(app.get('preview-sfw').value, text);
  assert.equal(app.get('preview-sfw').innerHTML, undefined);
  app.get('import-text').value = 'changed after preview';
  await app.get('import-text').fire('input');
  app.get('import-sfw').checked = true;
  await app.get('apply-import').fire('click');
  assert.equal(app.editor.value, 'appearance');
});

test('saved snapshots preview and recover only the chosen field', async () => {
  const records = new Map([['ratwood-flavor-workshop-v1-backups', JSON.stringify([JSON.stringify(draftData({ sfw: 'old appearance' }))])]]);
  const app = setup({ records, stored: JSON.stringify(draftData()) });
  app.get('snapshot-list').value = '0';
  await app.get('preview-snapshot').fire('click');
  assert.equal(app.get('preview-sfw').value, 'old appearance');
  assert.equal(app.editor.value, 'appearance');
  app.get('import-sfw').checked = true;
  await app.get('apply-import').fire('click');
  assert.equal(app.editor.value, 'old appearance');
  assert.equal(JSON.parse(app.saved()).ooc, 'notes');
});

test('storage-denied imports remain editable with session recovery and a clear warning', async () => {
  const app = setup({ storageError: true });
  await app.type('session original');
  await previewBackup(app, draftData());
  app.get('import-sfw').checked = true;
  await app.get('apply-import').fire('click');
  assert.equal(app.editor.value, 'appearance');
  assert.match(app.get('backup-status').textContent, /Session only/);
  app.get('snapshot-list').value = '0';
  await app.get('preview-snapshot').fire('click');
  assert.equal(app.get('preview-sfw').value, 'session original');
  await app.type('still editable');
  assert.equal(app.editor.value, 'still editable');
});

test('import preserves unrelated drafts saved concurrently in another window', async () => {
  const records = new Map(); const first = setup({ records }), second = setup({ records });
  await first.type('first window');
  await second.tab('ooc'); await second.type('second window notes');
  await previewBackup(first, draftData({ sfw: 'imported appearance' }));
  first.get('import-sfw').checked = true;
  await first.get('apply-import').fire('click');
  assert.equal(JSON.parse(first.saved()).ooc, 'second window notes');
  assert.equal(JSON.parse(first.saved()).sfw, 'imported appearance');
});

test('file import reads JSON for preview without changing current drafts', async () => {
  const app = setup({ stored: JSON.stringify(draftData()) });
  const target = app.get('import-file'); target.files = [{ text: async () => JSON.stringify(draftData({ sfw: 'from file' })) }];
  await target.fire('change', { target });
  assert.equal(app.get('preview-sfw').value, 'from file');
  assert.equal(app.editor.value, 'appearance');
});
