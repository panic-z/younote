importScripts('notes.js');

// Serialize writes so that a stale editor cannot overwrite another tab's edit or deletion.
let writes = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['write-video-note', 'import-video-notes'].includes(message?.type) || sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith('https://www.youtube.com/')) return;

  const write = writes.then(() => message.type === 'import-video-notes' ? importNotes(message.backup) : writeNote(message));
  writes = write.catch(() => {});
  write.then(respond, () => respond({ error: '存储失败，请重试。' }));
  return true;
});

async function writeNote({ videoId, id, body, anchor, revision, remove }) {
  if (!validNoteIds(videoId, id)) return { error: '笔记标识无效。' };

  const key = notePrefix(videoId) + id;
  const current = (await chrome.storage.local.get(key))[key];
  if (current?.revision !== revision) {
    return { error: '这条笔记已在另一个标签页修改或删除。请关闭编辑后重新打开。' };
  }

  if (remove && current) {
    await chrome.storage.local.remove(key);
    return { ok: true };
  }

  if (!validBody(body) || !validTime(anchor?.time)) {
    return { error: '请填写有效的笔记内容和播放位置。' };
  }

  const note = { id, videoId, body: body.trim(), anchor: { time: anchor.time }, revision: crypto.randomUUID() };
  await chrome.storage.local.set({ [key]: note });
  return { ok: true };
}

async function importNotes(backup) {
  if (!validBackup(backup)) return { error: '文件不是有效的 YouTube 视频笔记备份。' };
  const keys = backup.notes.map(note => notePrefix(note.videoId) + note.id);
  const existing = await chrome.storage.local.get(keys);
  const additions = {};
  let imported = 0;
  backup.notes.forEach(({ id, videoId, body, time }, index) => {
    const key = keys[index];
    if (Object.hasOwn(existing, key) || Object.hasOwn(additions, key)) return;
    additions[key] = { id, videoId, body, anchor: { time }, revision: crypto.randomUUID() };
    imported++;
  });
  if (imported) await chrome.storage.local.set(additions);
  return { ok: true, imported, skipped: keys.length - imported };
}
