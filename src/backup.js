const BACKUP_HEADING = '# YouTube 视频笔记';
const MARKDOWN_VERSION = '<!-- youtube-video-notes:v1 -->';
const VIDEO_HEADING = /^## \[视频 ([\w-]{11})\]\(https:\/\/www\.youtube\.com\/watch\?v=\1\)$/;
const TIME_HEADING = /^### ((?:\d+:)?[0-5]\d:[0-5]\d(?:\.\d{1,3})?)$/;
const NOTE_METADATA = /^<!-- note: ([\da-f-]{36}) time: (\S+) -->$/;
const LINE_BREAK = /\r\n|\n|\r/;

function markdownBackup(backup) {
  const lines = [BACKUP_HEADING, MARKDOWN_VERSION, ''];
  const notes = [...backup.notes].sort((a, b) =>
    a.videoId.localeCompare(b.videoId) || a.time - b.time || a.id.localeCompare(b.id));
  let videoId;
  for (const note of notes) {
    if (note.videoId !== videoId) {
      videoId = note.videoId;
      lines.push(`## [视频 ${videoId}](https://www.youtube.com/watch?v=${videoId})`, '');
    }
    lines.push(`### ${formatTime(note.time, true)}`, `<!-- note: ${note.id} time: ${note.time} -->`);
    for (const line of note.body.split(LINE_BREAK)) lines.push(`> ${line}`);
    lines.push('');
  }
  return lines.join('\n');
}

function parseMarkdownBackup(text) {
  const lines = text.split(LINE_BREAK);
  if (lines[0].trim() !== BACKUP_HEADING || lines[1]?.trim() !== MARKDOWN_VERSION) return null;

  let videoId;
  const notes = [];
  for (let index = 2; index < lines.length;) {
    const line = lines[index++].trim();
    if (!line) continue;

    const video = VIDEO_HEADING.exec(line);
    if (video) {
      videoId = video[1];
      continue;
    }

    const heading = TIME_HEADING.exec(line);
    if (!videoId || !heading) return null;
    const metadata = NOTE_METADATA.exec(lines[index++]?.trim());
    if (!metadata) return null;
    const [, id, original] = metadata;
    const exactTime = Number(original);
    if (!validTime(exactTime)) return null;
    const label = heading[1];
    // Keep the original precision unless the visible timestamp was edited.
    const time = label === formatTime(exactTime, true)
      ? exactTime
      : label.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);

    const body = [];
    while (lines[index] === '>' || lines[index]?.startsWith('> ')) {
      body.push(lines[index++].slice(2));
    }
    notes.push({ id, videoId, time, body: body.join('\n') });
  }
  return { format: BACKUP_FORMAT, version: 1, notes };
}

function readBackup(text) {
  const content = text.trimStart();
  return content.startsWith('{') ? JSON.parse(content) : parseMarkdownBackup(content);
}
