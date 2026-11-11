class VideoNotes {
  #load = 0;
  #closed = false;
  #jump = 0;

  constructor(videoId) {
    this.videoId = videoId;
    this.panel = new NotesPanel({
      change: body => this.change(body),
      edit: note => this.edit(note),
      rebind: () => this.rebind(),
      save: body => this.save(body),
      cancel: () => this.closeEditor(),
      remove: note => this.remove(note),
      jump: note => this.jump(note),
      exportNotes: () => this.exportNotes(),
      importNotes: file => this.importNotes(file),
      layout: mode => changeLayout(mode),
    });
    const draft = this.#draft;
    if (draft) {
      this.panel.openEditor(draft.body, draft.anchor, false);
      this.panel.busy(Boolean(draft.saving));
      if (draft.error) this.report(draft.error);
    }
    this.reload();
  }

  get #draft() {
    return drafts.get(this.videoId);
  }

  async reload() {
    const request = ++this.#load;
    const prefix = notePrefix(this.videoId);
    try {
      const storage = await chrome.storage.local.get(null);
      if (this.#closed || request !== this.#load) return;
      const notes = Object.entries(storage).flatMap(([key, value]) => {
        if (!key.startsWith(prefix)) return [];
        const note = storedNote(key, value);
        return note ? [note] : [];
      });
      this.panel.setNotes(notes);
    } catch {
      if (!this.#closed && request === this.#load) this.report('读取笔记失败，请刷新页面重试。');
    }
  }

  mount(watch, slot, playerRoot, video) {
    const { host } = this.panel;
    if (this.watch && this.watch !== watch) this.watch.removeAttribute('data-ytn-dock');
    this.watch = watch;
    const dock = layout === 'left' || layout === 'right' ? layout : null;
    if (watch.getAttribute('data-ytn-dock') !== dock) {
      if (dock) watch.setAttribute('data-ytn-dock', dock);
      else watch.removeAttribute('data-ytn-dock');
      // YouTube updates the video and controls' inline sizes on window resize.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    const parent = layout === 'below' ? slot : document.body;
    let focused;
    if (host.parentNode !== parent) {
      focused = host.shadowRoot?.activeElement;
      parent.prepend(host);
    }
    this.panel.place(layout);
    focused?.focus({ preventScroll: true });
    host.toggleAttribute('dark', document.documentElement.hasAttribute('dark'));
    if (this.player?.video !== video || this.player?.root !== playerRoot) {
      this.player?.dispose();
      this.player = video && playerRoot
        ? new NotesPlayer(playerRoot, video, () => this.updatePlayer())
        : null;
    }
    this.player?.refresh();
    this.updatePlayer();
  }

  updatePlayer() {
    this.panel.updatePlayer(this.player);
    const draft = this.#draft;
    if (draft && !draft.anchor && draft.body.trim()) this.bindDraft(draft);
  }

  detach() {
    const draft = this.#draft;
    if (draft) draft.body = this.panel.input.value;
    this.player?.dispose();
    this.player = null;
    this.watch?.removeAttribute('data-ytn-dock');
    this.watch = null;
    this.panel.host.remove();
  }

  active() {
    return !this.#closed && !navigating && watchVideoId() === this.videoId && this.panel.host.isConnected;
  }

  report(message) {
    this.panel.status.textContent = message;
  }

  bindDraft(draft) {
    const anchor = this.active() && this.player?.capture();
    if (!anchor) return false;
    draft.anchor = anchor;
    this.#jump++;
    this.panel.showDraft(anchor, true);
    this.report('');
    return true;
  }

  change(body) {
    if (!this.active()) return;
    let draft = this.#draft;
    if (!draft && body.trim()) {
      draft = { id: crypto.randomUUID(), body };
      drafts.set(this.videoId, draft);
      this.report('');
    }
    if (!draft || draft.saving) return;
    draft.body = body;
    if (!draft.anchor && body.trim() && this.bindDraft(draft)) return;
    this.panel.showDraft(draft.anchor, true);
  }

  edit(note) {
    if (!this.active()) return;
    if (this.#draft) {
      this.panel.input.focus();
      this.report('请先保存或取消正在编辑的笔记。');
      return;
    }
    drafts.set(this.videoId, { id: note.id, revision: note.revision, anchor: note.anchor, body: note.body });
    this.panel.setActive(note.id);
    this.panel.openEditor(note.body, note.anchor);
    this.report('');
  }

  rebind() {
    const draft = this.#draft;
    if (!draft || draft.saving) return;
    if (!this.bindDraft(draft)) this.report('等待正片加载完成后再绑定时间。');
  }

  closeEditor() {
    if (this.#draft?.saving) return;
    drafts.delete(this.videoId);
    this.panel.resetEditor();
    this.report('');
  }

  async save(body) {
    const draft = this.#draft;
    if (!draft?.anchor || !this.active() || draft.saving) return;
    if (!body.trim()) {
      this.report('请输入笔记内容。');
      return;
    }
    draft.body = body;
    draft.saving = true;
    draft.error = undefined;
    this.panel.busy(true);
    const { id, revision, anchor } = draft;
    const response = await this.write({ id, revision, anchor, body });
    draft.saving = false;

    // A new panel for this video may have mounted while the write was in flight.
    const current = session?.videoId === this.videoId ? session : null;
    current?.panel.busy(false);
    if (response.ok) {
      drafts.delete(this.videoId);
      current?.closeEditor();
      current?.panel.setActive(id);
      current?.report('已保存。');
    } else {
      draft.error = response.error;
      current?.report(draft.error);
    }
  }

  async remove(note) {
    if (!this.active() || this.#draft?.saving) return;
    if (this.#draft?.id === note.id) {
      this.report('请先退出这条笔记的编辑。');
      return;
    }
    const response = await this.write({ id: note.id, revision: note.revision, remove: true });
    this.report(response.ok ? '已删除。' : response.error);
  }

  async write(change) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'write-video-note', videoId: this.videoId, ...change });
      return response ?? { error: '存储失败，请重试。' };
    } catch {
      return { error: '扩展暂时无法保存笔记，请重试。' };
    }
  }

  async exportNotes() {
    this.panel.backupBusy(true);
    try {
      const backup = backupFor(await chrome.storage.local.get(null));
      const file = new Blob([markdownBackup(backup)], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `youtube-video-notes-${new Date().toISOString().slice(0, 10)}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      this.report(`已开始导出 ${backup.notes.length} 条笔记。`);
    } catch {
      this.report('导出失败，请重试。');
    } finally {
      this.panel.backupBusy(false);
    }
  }

  async importNotes(file) {
    this.panel.backupBusy(true);
    this.report('正在导入…');
    try {
      let backup;
      try {
        backup = readBackup(await file.text());
      } catch {
        (session ?? this).report('无法读取备份，请选择导出的笔记文件。');
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'import-video-notes', backup });
      (session ?? this).report(response?.ok
        ? `已导入 ${response.imported} 条，跳过 ${response.skipped} 条已有笔记。`
        : response?.error || '导入失败，请重试。');
    } catch {
      (session ?? this).report('导入失败，请重试。');
    } finally {
      this.panel.backupBusy(false);
    }
  }

  async jump(note) {
    if (!this.active()) return;
    const request = ++this.#jump;
    const player = this.player;
    this.panel.setActive(note.id);
    this.report('正在定位…');
    const result = await player?.jump(note.anchor);
    if (!this.active() || request !== this.#jump) return;
    const messages = {
      time: '已定位到记录的时间点。',
      cancelled: '已取消定位。',
      outside: '这条笔记的位置超出当前视频时长。',
    };
    this.report(messages[result] || '暂时无法定位，请等待正片加载完成后重试。');
  }

  dispose() {
    this.#closed = true;
    this.detach();
    this.panel.dispose();
  }
}

const drafts = new Map();
let session;
let pending = false;
let navigating = false;
let layout = 'below';

function applyLayout(mode) {
  const next = Object.hasOwn(PANEL_LAYOUTS, mode) ? mode : 'below';
  if (layout === next) return;
  layout = next;
  reconcile();
}

function changeLayout(mode) {
  applyLayout(mode);
  chrome.storage.local.set({ [PANEL_LAYOUT_KEY]: layout }).catch(() => {
    session?.report('已切换布局，暂时无法保存布局偏好。');
  });
}

function reconcile() {
  pending = false;
  if (navigating) return;
  const id = watchVideoId();
  if (session && session.videoId !== id) {
    session.dispose();
    session = undefined;
  }
  if (!id) return;

  const watch = document.querySelector(`ytd-watch-flexy[video-id="${id}"]:not([hidden])`);
  const slot = watch?.querySelector('#below');
  if (!slot) {
    session?.detach();
    return;
  }
  const player = watch.querySelector('#movie_player');
  const video = player?.querySelector('video.html5-main-video');
  session ??= new VideoNotes(id);
  session.mount(watch, slot, player, video);
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(reconcile);
}

document.addEventListener('yt-navigate-start', () => {
  navigating = true;
  session?.detach();
});
document.addEventListener('yt-navigate-finish', () => {
  navigating = false;
  schedule();
});
window.addEventListener('popstate', schedule);
window.addEventListener('pageshow', schedule);

new MutationObserver(changes => {
  if (changes.some(change => change.type === 'childList' || change.target.id === 'movie_player' ||
      change.target.localName === 'ytd-watch-flexy' || change.target === document.documentElement)) schedule();
}).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['video-id', 'hidden', 'class', 'dark', 'is-live'],
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[PANEL_LAYOUT_KEY]) applyLayout(changes[PANEL_LAYOUT_KEY].newValue);
  if (session && Object.keys(changes).some(key => key.startsWith(notePrefix(session.videoId)))) {
    session.reload();
  }
});

reconcile();
chrome.storage.local.get(PANEL_LAYOUT_KEY).then(settings => applyLayout(settings[PANEL_LAYOUT_KEY]), () => {});
