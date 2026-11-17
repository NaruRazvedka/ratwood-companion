/* SPDX-License-Identifier: AGPL-3.0-or-later */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor');
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const storageKey = 'ratwood-flavor-workshop-v1';
  const drafts = { sfw: '', nsfw: '', ooc: '', nsfw_ooc: '' };
  const labels = { sfw: 'SFW Appearance', nsfw: 'NSFW Appearance', ooc: 'SFW OOC Notes', nsfw_ooc: 'NSFW OOC Notes' };
  const histories = {};
  let active = 'sfw';
  let selection = [0, 0];
  let storageAvailable = true;
  let lastTyping = 0;
  let lastInputType = '';
  let startupSnapshot = null;
  let backedUp = false;
  function readSaved(text) {
    const saved = JSON.parse(text);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('Invalid draft data');
    for (const tab of ['sfw', 'nsfw', 'ooc']) if (typeof saved[tab] !== 'string') throw Error('Invalid draft data');
    if ('nsfw_ooc' in saved && typeof saved.nsfw_ooc !== 'string') throw Error('Invalid draft data');
    return saved;
  }
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const saved = readSaved(stored);
      for (const tab of Object.keys(drafts)) drafts[tab] = saved[tab] || '';
      if (Object.hasOwn(drafts, saved.activeTab)) active = saved.activeTab;
      startupSnapshot = stored;
    }
  } catch {
    storageAvailable = false;
    $('save-status').textContent = 'Autosave unavailable. Copy drafts before closing.';
  }
  for (const tab of Object.keys(drafts)) histories[tab] = { entries: [{ value: drafts[tab], start: 0, end: 0 }], index: 0 };
  editor.value = drafts[active];

  function rememberSelection() {
    selection = [editor.selectionStart, editor.selectionEnd];
    const history = histories[active];
    const entry = history.entries[history.index];
    if (entry.value === editor.value) [entry.start, entry.end] = selection;
  }
  function save(writeDraft = true) {
    if (!storageAvailable) return;
    try {
      const stored = localStorage.getItem(storageKey);
      const saved = stored === null ? { ...drafts } : readSaved(stored);
      if (writeDraft && !backedUp && startupSnapshot !== null) {
        // Keep the saved state from before this editing session for recovery.
        const backupKey = storageKey + '-backups';
        const backups = JSON.parse(localStorage.getItem(backupKey) || '[]');
        if (!Array.isArray(backups)) throw Error('Invalid backups');
        if (backups.at(-1) !== startupSnapshot) backups.push(startupSnapshot);
        localStorage.setItem(backupKey, JSON.stringify(backups.slice(-10)));
        backedUp = true;
      }
      if (writeDraft) saved[active] = drafts[active];
      saved.nsfw_ooc ??= '';
      saved.activeTab = active;
      localStorage.setItem(storageKey, JSON.stringify(saved));
      $('save-status').textContent = 'All drafts saved on this browser';
    } catch {
      storageAvailable = false;
      $('save-status').textContent = 'Autosave unavailable. Copy drafts before closing.';
    }
  }
  function render() {
    const text = drafts[active];
    const count = Ratwood.byteLength(text);
    $('preview').innerHTML = Ratwood.parse(text);
    $('empty-preview').hidden = text.length !== 0;
    $('count').textContent = `${count} bytes`;
    $('preview-tab').textContent = labels[active];
  }
  function commit(inputType = '') {
    const history = histories[active];
    if (history.entries[history.index].value !== editor.value) {
      const now = Date.now();
      const typing = inputType === 'insertText' || inputType === 'deleteContentBackward';
      const merge = typing && lastInputType === inputType && now - lastTyping < 750 && history.index > 0 && history.index === history.entries.length - 1;
      history.entries.splice(history.index + 1);
      const entry = { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
      if (merge) history.entries[history.index] = entry;
      else { history.entries.push(entry); history.index++; }
      lastTyping = now;
      lastInputType = inputType;
    }
    drafts[active] = editor.value;
    selection = [editor.selectionStart, editor.selectionEnd];
    $('copy-status').textContent = 'Copies the original markup, ready to paste into character preferences.';
    save();
    render();
  }
  function undo(redo = false) {
    const history = histories[active];
    const index = history.index + (redo ? 1 : -1);
    if (index < 0 || index >= history.entries.length) return;
    history.index = index;
    const entry = history.entries[index];
    editor.value = entry.value;
    editor.setSelectionRange(entry.start, entry.end);
    drafts[active] = editor.value;
    selection = [entry.start, entry.end];
    lastInputType = '';
    save();
    render();
  }
  editor.addEventListener('beforeinput', event => {
    if (editor.value !== drafts[active]) showActiveDraft();
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      undo(event.inputType === 'historyRedo');
    } else rememberSelection();
  });
  editor.addEventListener('input', event => commit(event.inputType));
  editor.addEventListener('select', rememberSelection);
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('pointerup', rememberSelection);
  editor.addEventListener('blur', rememberSelection);
  editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      undo(event.key.toLowerCase() === 'y' || event.shiftKey);
    }
  });

  function insert(before, after = '', line = false) {
    let [start, end] = selection;
    if (line) {
      start = editor.value.lastIndexOf('\n', start - 1) + 1;
      const next = editor.value.indexOf('\n', end);
      end = next === -1 ? editor.value.length : next;
    }
    const selected = editor.value.slice(start, end);
    const replacement = line ? selected.split('\n').map(text => before + text).join('\n') : before + selected + after;
    editor.focus();
    editor.setSelectionRange(start, end);
    rememberSelection();
    editor.setRangeText(replacement, start, end, 'end');
    const innerStart = start + before.length;
    editor.setSelectionRange(innerStart, line ? start + replacement.length : innerStart + selected.length);
    commit();
  }
  const formats = {
    bold: ['**', '**'], italic: ['*', '*'], center: ['|', '|'],
    large: ['^', '^'], small: ['((', '))'], heading: ['# ', '', true], list: ['* ', '', true]
  };
  for (const button of document.querySelectorAll('[data-format]')) {
    button.addEventListener('click', () => {
      if (button.dataset.format === 'rule') {
        const [start] = selection;
        insert((start > 0 && editor.value[start - 1] !== '\n' ? '\n' : '') + '---\n');
        // Put the caret after the rule; selected content remains available below it.
        editor.setSelectionRange(editor.selectionEnd, editor.selectionEnd);
        rememberSelection();
      } else insert(...formats[button.dataset.format]);
    });
  }
  function validColor(id = 'hex-color', status = 'color-error') {
    const valid = /^[0-9a-f]{6}$/i.test($(id).value);
    $(id).setAttribute('aria-invalid', String(!valid));
    $(status).textContent = valid ? '' : 'Enter six hex digits (0–9, A–F).';
    return valid;
  }
  function updateGradientSwatch() {
    if (['hex-color', 'gradient-hex'].every(id => /^[0-9a-f]{6}$/i.test($(id).value))) {
      $('gradient-swatch').style.background = `linear-gradient(to right, #${$('hex-color').value}, #${$('gradient-hex').value})`;
    }
  }
  for (const [picker, hex, status] of [['color-picker', 'hex-color', 'color-error'], ['gradient-picker', 'gradient-hex', 'gradient-status']]) {
    $(picker).addEventListener('input', () => {
      $(hex).value = $(picker).value.slice(1).toUpperCase();
      validColor(hex, status);
      updateGradientSwatch();
    });
    $(hex).addEventListener('input', () => {
      if (validColor(hex, status)) $(picker).value = '#' + $(hex).value;
      updateGradientSwatch();
    });
  }
  $('apply-color').addEventListener('click', () => {
    if (!validColor()) { $('hex-color').focus(); return; }
    insert('-=' + $('hex-color').value.toUpperCase(), '=-');
  });
  $('apply-gradient').addEventListener('click', () => {
    if (!validColor()) { $('hex-color').focus(); return; }
    if (!validColor('gradient-hex', 'gradient-status')) { $('gradient-hex').focus(); return; }
    const [start, end] = selection;
    const text = editor.value.slice(start, end);
    if (!text.trim()) { $('gradient-status').textContent = 'Select the text you want to color first.'; return; }
    const replacement = ratwoodGradient(text, $('hex-color').value, $('gradient-hex').value);
    editor.focus();
    editor.setSelectionRange(start, end);
    rememberSelection();
    editor.setRangeText(replacement, start, end, 'end');
    editor.setSelectionRange(start, start + replacement.length);
    commit();
    $('gradient-status').textContent = 'Gradient applied. Ctrl+Z undoes this change.';
  });
  function showActiveDraft() {
    const history = histories[active];
    const entry = history.entries[history.index];
    editor.value = drafts[active];
    editor.setSelectionRange(entry.start, entry.end);
    selection = [entry.start, entry.end];
    lastInputType = '';
    for (const button of tabs) {
      const selected = button.dataset.tab === active;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    $('draft-panel').setAttribute('aria-labelledby', 'tab-' + active);
    editor.setAttribute('aria-label', labels[active] + ' source');
    $('copy-status').textContent = 'Copies the original markup, ready to paste into character preferences.';
    render();
  }
  function switchTab(tab) {
    rememberSelection();
    active = tab;
    showActiveDraft();
    save(false);
  }
  window.addEventListener('pageshow', () => {
    showActiveDraft();
    // Session-history form restoration can run after pageshow.
    window.requestAnimationFrame(showActiveDraft);
  });
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); tabs[next].focus(); switchTab(tabs[next].dataset.tab); }
    });
  });
  $('copy').addEventListener('click', async () => {
    const text = drafts[active];
    const tab = active;
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      $('copy-status').textContent = `${labels[tab]} markup copied. Paste it into the matching game field.`;
    } catch {
      if (active !== tab) switchTab(tab);
      editor.focus();
      editor.select();
      rememberSelection();
      $('copy-status').textContent = 'Automatic copy unavailable. Your source is selected — press Ctrl+C (⌘C on Mac).';
    }
  });
  const backupKey = storageKey + '-backups';
  const sessionSnapshots = [];
  let snapshotChoices = [], incoming = null;
  function currentDrafts() {
    let saved = {};
    if (storageAvailable) {
      try { const text = localStorage.getItem(storageKey); if (text !== null) saved = readSaved(text); }
      catch { storageAvailable = false; }
    }
    return { ...drafts, ...saved, [active]: drafts[active], activeTab: active };
  }
  function readImport(text) {
    const value = JSON.parse(text);
    if (value?.format !== undefined) {
      if (value.format !== 'ratwood-flavor-workshop' || value.version !== 1) throw Error('Unsupported backup format');
      return readSaved(JSON.stringify(value.drafts));
    }
    return readSaved(text);
  }
  function refreshSnapshots() {
    let persisted = [];
    try {
      const value = JSON.parse(localStorage.getItem(backupKey) || '[]');
      if (!Array.isArray(value)) throw Error();
      persisted = value.filter(text => { try { readSaved(text); return true; } catch { return false; } });
    } catch { /* Keep session recovery available when browser storage cannot be read. */ }
    snapshotChoices = [...new Set([...persisted, ...sessionSnapshots])].reverse();
    $('snapshot-list').innerHTML = '<option value="">Choose a snapshot</option>' + snapshotChoices.map((text, index) => `<option value="${index}">Snapshot ${snapshotChoices.length - index} · ${Ratwood.byteLength(text)} bytes${sessionSnapshots.includes(text) ? ' · this session' : ''}</option>`).join('');
  }
  function previewImport(text) {
    incoming = null;
    $('import-preview').hidden = true;
    try {
      const saved = readImport(text);
      incoming = Object.fromEntries(Object.keys(drafts).map(tab => [tab, saved[tab] || '']));
      for (const tab of Object.keys(drafts)) {
        $('preview-' + tab).value = incoming[tab];
        $('import-' + tab).checked = false;
      }
      $('import-preview').hidden = false;
      $('backup-status').textContent = 'Preview ready. Select only the drafts you want to replace, then choose Replace selected drafts.';
    } catch {
      $('backup-status').textContent = 'This is not a supported draft backup. No drafts were changed.';
    }
  }
  $('export-drafts').addEventListener('click', () => {
    const saved = currentDrafts();
    const text = JSON.stringify({ format: 'ratwood-flavor-workshop', version: 1, exportedAt: new Date().toISOString(), drafts: Object.fromEntries(Object.keys(drafts).map(tab => [tab, saved[tab]])) }, null, 2);
    $('import-text').value = text;
    incoming = null;
    $('import-preview').hidden = true;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'ratwood-drafts-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('backup-status').textContent = 'Backup download requested. Check that the file saved; the same JSON is available above for manual copying.';
    } catch {
      $('import-text').focus(); $('import-text').select();
      $('backup-status').textContent = 'Download unavailable. Copy the selected backup JSON and save it in a private text file.';
    }
  });
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    incoming = null; $('import-preview').hidden = true;
    try { $('import-text').value = await file.text(); previewImport($('import-text').value); }
    catch { $('backup-status').textContent = 'The file could not be read. No drafts were changed.'; }
    event.target.value = '';
  });
  $('import-text').addEventListener('input', () => { incoming = null; $('import-preview').hidden = true; });
  $('preview-import').addEventListener('click', () => previewImport($('import-text').value));
  $('draft-backups').addEventListener('toggle', refreshSnapshots);
  $('preview-snapshot').addEventListener('click', () => {
    const index = $('snapshot-list').value;
    if (index === '' || !snapshotChoices[Number(index)]) { $('backup-status').textContent = 'Choose a snapshot first.'; return; }
    previewImport(snapshotChoices[Number(index)]);
  });
  $('apply-import').addEventListener('click', () => {
    const chosen = Object.keys(drafts).filter(tab => $('import-' + tab).checked);
    if (!incoming || !chosen.length) { $('backup-status').textContent = 'Preview a backup and select at least one draft first.'; return; }
    const previous = currentDrafts();
    const snapshot = JSON.stringify(previous);
    sessionSnapshots.push(snapshot);
    if (storageAvailable) {
      try {
        const backups = JSON.parse(localStorage.getItem(backupKey) || '[]');
        if (!Array.isArray(backups)) throw Error();
        if (backups.at(-1) !== snapshot) backups.push(snapshot);
        localStorage.setItem(backupKey, JSON.stringify(backups.slice(-10)));
        const next = { ...previous };
        for (const tab of chosen) next[tab] = incoming[tab];
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        storageAvailable = false;
        $('save-status').textContent = 'Autosave unavailable. Export drafts before closing.';
      }
    }
    for (const tab of chosen) {
      drafts[tab] = incoming[tab];
      const history = histories[tab];
      history.entries.splice(history.index + 1);
      history.entries.push({ value: incoming[tab], start: 0, end: 0 });
      history.index++;
    }
    backedUp = true;
    showActiveDraft(); refreshSnapshots();
    incoming = null; $('import-preview').hidden = true;
    $('backup-status').textContent = `${chosen.length} draft(s) replaced. ${storageAvailable ? 'Saved; a safety snapshot is available below.' : 'Session only: export your drafts before closing. A safety snapshot remains available in this session.'}`;
  });
  refreshSnapshots();
  updateGradientSwatch();
  showActiveDraft();
})();
