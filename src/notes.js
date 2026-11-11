const NOTE_LIMIT = 10000;
const VIDEO_ID = /^[\w-]{11}$/;
const NOTE_ID = /^[\da-f-]{36}$/;
const BACKUP_FORMAT = 'youtube-video-notes';
const PANEL_LAYOUT_KEY = 'notes-panel-layout';
const PANEL_LAYOUTS = { below: '下方', left: '左侧', right: '右侧', floating: '浮窗' };

/** @typedef {{time: number}} NoteAnchor */
/** @typedef {{id: string, videoId: string, body: string, anchor: NoteAnchor, revision: string}} VideoNote */

function watchVideoId(url = location.href) {
  const page = new URL(url);
  const id = page.searchParams.get('v');
  return page.pathname === '/watch' && id && VIDEO_ID.test(id) ? id : null;
}

function notePrefix(videoId) {
  return `note:${videoId}:`;
}

function validTime(time) {
  return Number.isFinite(time) && time >= 0;
}

function validBody(body) {
  return typeof body === 'string' && body.length <= NOTE_LIMIT && Boolean(body.trim());
}

function validNoteIds(videoId, id) {
  return typeof videoId === 'string' && VIDEO_ID.test(videoId) && typeof id === 'string' && NOTE_ID.test(id);
}

function storedNote(key, note) {
  if (!validNoteIds(note?.videoId, note?.id) || key !== notePrefix(note.videoId) + note.id || !validBody(note.body)) {
    return null;
  }
  // Earlier versions used the frame timestamp as the visible marker position.
  const time = note.anchor?.frameTime ?? note.anchor?.time;
  return validTime(time) ? { ...note, anchor: { time } } : null;
}

function backupFor(storage) {
  const notes = [];
  for (const [key, value] of Object.entries(storage)) {
    const note = storedNote(key, value);
    if (note) notes.push({ id: note.id, videoId: note.videoId, body: note.body, time: note.anchor.time });
  }
  return { format: BACKUP_FORMAT, version: 1, notes };
}

function validBackup(backup) {
  return backup?.format === BACKUP_FORMAT && backup.version === 1 && Array.isArray(backup.notes) &&
    backup.notes.every(note => validNoteIds(note?.videoId, note?.id) && validBody(note.body) && validTime(note.time));
}

function formatTime(time, decimals = false) {
  const milliseconds = Math.floor(time * 1000 + 1e-7);
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  const fraction = String(milliseconds % 1000).padStart(3, '0');
  return `${hours ? `${hours}:` : ''}${minutes}:${remainder}${decimals ? `.${fraction}` : ''}`;
}
