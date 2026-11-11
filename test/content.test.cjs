const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['notes.js', 'content.js']
  .map(file => readFileSync(join(__dirname, '../src', file), 'utf8')).join('\n');
const first = 'fixture0001';
const second = 'fixture0002';

function setup() {
  const location = { href: 'https://www.youtube.com/' };
  const writes = [];
  const video = { time: 1 };
  const player = { querySelector: () => video };
  const slot = { prepend(host) { host.parentNode = this; host.isConnected = true; } };
  const watch = {
    querySelector: selector => selector === '#below' ? slot : player,
    getAttribute: () => null,
    removeAttribute() {},
  };

  class Panel {
    host = { toggleAttribute() {}, remove() { this.isConnected = false; this.parentNode = null; } };
    input = { value: '' };
    draft = false;
    status = {};
    busy(saving) { this.input.disabled = saving; }
    showDraft(anchor, draft) { this.anchor = anchor; this.draft = draft; }
    resetEditor() { this.input.value = ''; this.showDraft(undefined, false); }
    openEditor(body, anchor) { this.input.value = body; this.showDraft(anchor, true); }
    setNotes() {}
    setActive() {}
    updatePlayer() {}
    place() {}
    dispose() {}
  }

  const open = runInNewContext(`${source}\n(id => {
    location.href = 'https://www.youtube.com/watch?v=' + id;
    reconcile();
    return session;
  });`, {
    URL,
    location,
    crypto: { randomUUID },
    document: {
      querySelector: () => watch,
      documentElement: { hasAttribute: () => false },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
    NotesPanel: Panel,
    NotesPlayer: class {
      constructor(root, video) { this.root = root; this.video = video; }
      capture() { return this.video.time === null ? null : { time: this.video.time }; }
      refresh() {}
      dispose() {}
    },
    chrome: {
      storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
      runtime: { sendMessage: message => new Promise(resolve => writes.push({ message, resolve })) },
    },
  });
  return { open, writes, video };
}

test('a pending save follows the draft when the user switches away and back', async () => {
  const { open, writes } = setup();
  const original = open(first);
  original.panel.input.value = '保存时切页';
  original.change(original.panel.input.value);
  const saving = original.save(original.panel.input.value);

  assert.equal(open(second).panel.draft, false);
  const restored = open(first);
  assert.equal(restored.panel.input.value, '保存时切页');
  assert.equal(restored.panel.input.disabled, true);
  await restored.save(restored.panel.input.value);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.videoId, first);

  writes[0].resolve({ ok: true });
  await saving;
  assert.equal(restored.panel.draft, false);
  assert.equal(restored.panel.status.textContent, '已保存。');
});

test('a write failure while away restores the editable draft and its error', async () => {
  const { open, writes } = setup();
  const original = open(first);
  original.panel.input.value = '保留草稿';
  original.change(original.panel.input.value);
  const saving = original.save(original.panel.input.value);
  open(second);

  writes[0].resolve({ error: '存储失败' });
  await saving;
  const restored = open(first);
  assert.equal(restored.panel.draft, true);
  assert.equal(restored.panel.input.value, '保留草稿');
  assert.equal(restored.panel.input.disabled, false);
  assert.equal(restored.panel.status.textContent, '存储失败');
});

test('typing locks the first available timestamp until explicitly rebound', () => {
  const { open, video } = setup();
  const page = open(first);
  video.time = null;
  page.change('正在加载');
  assert.equal(page.panel.anchor, undefined);

  video.time = 3.125;
  page.updatePlayer();
  assert.equal(page.panel.anchor.time, 3.125);
  video.time = 9;
  page.change('继续写');
  assert.equal(page.panel.anchor.time, 3.125);

  page.rebind();
  assert.equal(page.panel.anchor.time, 9);
});
