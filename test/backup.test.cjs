const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['notes.js', 'backup.js', 'background.js']
  .map(file => readFileSync(join(__dirname, '../src', file), 'utf8')).join('\n');

function setup(storage = {}) {
  let writes = 0;
  const api = runInNewContext(`${source}\n({ importNotes, backupFor, markdownBackup, readBackup });`, {
    importScripts() {},
    crypto: { randomUUID },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { local: {
        get: async keys => Object.fromEntries(keys.filter(key => key in storage).map(key => [key, storage[key]])),
        set: async additions => { Object.assign(storage, additions); writes++; },
      } },
    },
  });
  return { ...api, storage, writes: () => writes };
}

const old = { id: randomUUID(), videoId: 'fixture0001', body: '旧笔记' };
const next = { id: randomUUID(), videoId: 'fixture0002', body: '另一条', time: 25.125 };
const key = note => `note:${note.videoId}:${note.id}`;
const backup = (...notes) => ({ format: 'youtube-video-notes', version: 1, notes });

test('export preserves the former marker position of a legacy note', () => {
  const api = setup({ [key(old)]: { ...old, anchor: { time: 10.020, frameTime: 10 }, revision: randomUUID() } });
  const exported = api.backupFor(api.storage);
  assert.equal(exported.notes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), backup({ ...old, time: 10 }));
});

test('import preserves existing changes and skips duplicates in one write', async () => {
  const api = setup({ [key(old)]: { ...old, body: '本地修改', anchor: { time: 11 }, revision: randomUUID() } });
  const file = backup({ ...old, time: 10 }, next, next);
  const result = await api.importNotes(file);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 2);
  assert.equal(api.storage[key(old)].body, '本地修改');
  assert.equal(api.storage[key(next)].anchor.time, next.time);
  assert.equal(api.writes(), 1);
  assert.equal((await api.importNotes(file)).imported, 0);
  assert.equal(api.writes(), 1);
});

test('an invalid record prevents the entire import', async () => {
  const api = setup();
  const result = await api.importNotes(backup(next, { ...old, time: -1 }));
  assert.match(result.error, /有效/);
  assert.deepEqual(api.storage, {});
  assert.equal(api.writes(), 0);
});

test('Markdown groups by video and round trips exact times and multiline notes', () => {
  const api = setup();
  const markdownNote = {
    ...old,
    time: 10.123456,
    body: '# 标题\n\n> 引用\n<!-- note: 看起来像元数据 -->\n```js\nconsole.log(1)\n```',
  };
  const text = api.markdownBackup(backup(next, markdownNote));
  assert.match(text, /^# YouTube 视频笔记/m);
  assert.ok(text.indexOf('watch?v=fixture0001') < text.indexOf('watch?v=fixture0002'));
  assert.match(text, /^### 00:10\.123$/m);
  assert.match(text, /^> # 标题$/m);
  const parsed = api.readBackup('\uFEFF' + text.replaceAll('\n', '\r\n'));
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), backup(markdownNote, next));
});

test('changing a Markdown timestamp uses the edited time and keeps the note ID', () => {
  const api = setup();
  const text = api.markdownBackup(backup(next)).replace('### 00:25.125', '### 01:02.5');
  assert.deepEqual(JSON.parse(JSON.stringify(api.readBackup(text))), backup({ ...next, time: 62.5 }));
});

test('malformed Markdown is rejected and a legacy JSON file still imports', async () => {
  const api = setup();
  const malformed = api.markdownBackup(backup(next)).replace('### 00:25.125', '### 未知时间');
  assert.ok((await api.importNotes(api.readBackup(malformed))).error);
  assert.equal(api.writes(), 0);
  assert.equal((await api.importNotes(api.readBackup(JSON.stringify(backup(next))))).imported, 1);
});
