function panelElement(tag, className, label) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label) element.textContent = label;
  return element;
}

function panelButton(label, action, className) {
  const button = panelElement('button', className, label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

class NotesPanel {
  static #floatingPosition;
  static #floatingSize;

  #notes = [];
  #active;
  #duration = 0;
  #width = 0;
  #resize;
  #canCapture = false;
  #preview;
  #anchor;
  #draft = false;
  #saving = false;
  #lifetime = new AbortController();
  #drag;
  #resizeDrag;

  constructor(actions) {
    this.actions = actions;
    this.host = panelElement('div');
    this.host.id = 'youtube-video-notes';
    this.host.lang = 'zh-CN';
    const shadow = this.host.attachShadow({ mode: 'open' });
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(notesStyles);
    shadow.adoptedStyleSheets = [stylesheet];

    const panel = panelElement('section', 'panel');
    panel.setAttribute('aria-labelledby', 'notes-heading');
    const header = panelElement('header');
    const heading = panelElement('h2', '', '视频笔记');
    heading.id = 'notes-heading';
    this.heading = heading;
    heading.addEventListener('pointerdown', event => this.#startDrag(event));
    heading.addEventListener('pointermove', event => {
      if (this.#drag?.id !== event.pointerId) return;
      this.#moveFloating(event.clientX - this.#drag.x, event.clientY - this.#drag.y);
    });
    heading.addEventListener('lostpointercapture', () => { this.#drag = undefined; });
    heading.addEventListener('keydown', event => this.#moveWithKeyboard(event));
    window.addEventListener('resize', () => {
      if (this.host.dataset.layout === 'floating') this.#moveFloating();
    }, { signal: this.#lifetime.signal });
    const buttons = panelElement('div', 'buttons');
    this.layoutSelect = panelElement('select');
    this.layoutSelect.setAttribute('aria-label', '笔记面板位置');
    this.layoutSelect.title = '切换笔记面板位置';
    for (const [value, label] of Object.entries(PANEL_LAYOUTS)) {
      const option = panelElement('option', '', label);
      option.value = value;
      this.layoutSelect.append(option);
    }
    this.layoutSelect.addEventListener('change', () => actions.layout(this.layoutSelect.value));
    const file = panelElement('input');
    file.type = 'file';
    file.accept = '.md,.markdown,text/markdown,.json,application/json';
    file.hidden = true;
    file.addEventListener('change', () => {
      const selected = file.files[0];
      file.value = '';
      if (selected) actions.importNotes(selected);
    });
    this.exportButton = panelButton('导出', actions.exportNotes);
    this.importButton = panelButton('导入', () => file.click());
    this.exportButton.title = '将所有视频的笔记导出为 Markdown';
    this.importButton.title = '从 Markdown 或旧版 JSON 备份导入笔记';
    const collapse = panelButton('收起', () => {
      this.content.hidden = !this.content.hidden;
      collapse.textContent = this.content.hidden ? '展开' : '收起';
      collapse.setAttribute('aria-expanded', String(!this.content.hidden));
      if (this.host.dataset.layout === 'floating') this.#moveFloating();
    });
    collapse.setAttribute('aria-expanded', 'true');
    collapse.setAttribute('aria-controls', 'notes-content');
    buttons.append(this.exportButton, this.importButton, collapse, this.layoutSelect, file);
    header.append(heading, buttons);

    this.content = panelElement('div', 'content');
    this.content.id = 'notes-content';
    this.timeline = panelElement('div', 'timeline');
    this.timeline.setAttribute('role', 'group');
    this.timeline.setAttribute('aria-label', '笔记时间线');
    this.marks = panelElement('div', 'marks');
    const rail = panelElement('div', 'rail');
    this.progress = panelElement('div', 'progress');
    rail.append(this.progress);
    this.marks.append(rail);
    const markWindow = panelElement('div', 'mark-window');
    markWindow.append(this.marks);
    const axis = panelElement('div', 'axis');
    this.endTime = panelElement('span');
    axis.append(panelElement('span', '', '00:00'), this.endTime);
    this.timeline.append(markWindow, axis);

    this.form = panelElement('form');
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      actions.save(this.input.value);
    });
    this.draftAnchor = panelElement('strong', 'anchor');
    this.draftAnchor.id = 'notes-position';
    this.input = panelElement('textarea');
    this.input.placeholder = '直接在这里写笔记…';
    this.input.setAttribute('aria-label', '笔记内容');
    this.input.setAttribute('aria-describedby', 'notes-position');
    this.input.required = true;
    this.input.maxLength = NOTE_LIMIT;
    this.input.addEventListener('input', () => actions.change(this.input.value));
    const binding = panelElement('div', 'buttons');
    this.bindTime = panelButton('绑定当前时间', actions.rebind, 'small');
    binding.append(this.draftAnchor, this.bindTime);
    const submit = panelElement('div', 'buttons');
    this.save = panelElement('button', 'primary', '保存');
    this.save.type = 'submit';
    this.cancel = panelButton('取消', actions.cancel);
    submit.append(this.save, this.cancel);
    this.form.append(binding, this.input, submit);

    // While editing, keep YouTube's global playback shortcuts away from the textarea.
    for (const event of ['keydown', 'keypress', 'keyup']) {
      shadow.addEventListener(event, keyboard => keyboard.stopPropagation());
    }
    this.status = panelElement('p', 'status');
    this.status.setAttribute('role', 'status');
    const saved = panelElement('details', 'saved-notes');
    saved.open = true;
    this.savedSummary = panelElement('summary');
    this.empty = panelElement('p', 'empty', '这个视频还没有笔记。');
    this.list = panelElement('ol');
    this.list.setAttribute('aria-label', '已保存笔记');
    saved.append(this.savedSummary, this.empty, this.list);
    this.content.append(this.timeline, this.status, this.form, saved);
    panel.append(header, this.content);
    shadow.append(panel, this.#resizeHandle('left', -1), this.#resizeHandle('right', 1));

    this.#resize = new ResizeObserver(() => {
      if (this.#width !== this.marks.clientWidth) this.#renderMarks();
    });
    this.#resize.observe(this.marks);
    this.updatePlayer(null);
    this.setNotes([]);
  }

  place(layout) {
    if (this.host.dataset.layout === layout) return;
    this.host.dataset.layout = layout;
    this.layoutSelect.value = layout;
    if (layout === 'floating') {
      this.heading.tabIndex = 0;
      this.heading.title = '拖动标题，或按方向键移动浮窗';
      if (NotesPanel.#floatingSize) this.#applyFloatingSize();
      this.#moveFloating();
    } else {
      this.heading.removeAttribute('tabindex');
      this.heading.removeAttribute('title');
      for (const property of ['--notes-left', '--notes-top', '--notes-width', '--notes-height']) {
        this.host.style.removeProperty(property);
      }
    }
  }

  #startDrag(event) {
    if (this.host.dataset.layout !== 'floating' || event.button !== 0 || this.#drag) return;
    const rect = this.host.getBoundingClientRect();
    this.#drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.heading.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  #moveWithKeyboard(event) {
    const offset = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
    if (!offset || this.host.dataset.layout !== 'floating') return;
    const { x, y } = NotesPanel.#floatingPosition;
    event.preventDefault();
    this.#moveFloating(x + offset[0], y + offset[1]);
  }

  #moveFloating(x = NotesPanel.#floatingPosition?.x, y = NotesPanel.#floatingPosition?.y) {
    const right = Math.max(8, window.innerWidth - this.host.getBoundingClientRect().width - 8);
    const height = this.content.hidden ? 92 : NotesPanel.#floatingSize?.height ?? 92;
    const bottom = Math.max(64, window.innerHeight - height - 8);
    const point = {
      x: Math.max(8, Math.min(x ?? right, right)),
      y: Math.max(64, Math.min(y ?? 80, bottom)),
    };
    NotesPanel.#floatingPosition = point;
    this.host.style.setProperty('--notes-left', `${point.x}px`);
    this.host.style.setProperty('--notes-top', `${point.y}px`);
  }

  #resizeHandle(edge, direction) {
    const handle = panelElement('button', 'resize-handle');
    handle.type = 'button';
    handle.dataset.edge = edge;
    handle.setAttribute('aria-label', `${edge === 'left' ? '左下角' : '右下角'}调整浮窗大小`);
    handle.title = '拖动或按方向键调整浮窗大小';
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.#resizeDrag) return;
      this.#resizeDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: this.host.getBoundingClientRect() };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      const drag = this.#resizeDrag;
      if (drag?.id !== event.pointerId) return;
      this.#resizeFloating(drag.rect, (event.clientX - drag.x) * direction, event.clientY - drag.y, direction);
    });
    handle.addEventListener('lostpointercapture', () => { this.#resizeDrag = undefined; });
    handle.addEventListener('keydown', event => {
      const offset = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
      if (!offset) return;
      event.preventDefault();
      this.#resizeFloating(this.host.getBoundingClientRect(), offset[0] * direction, offset[1], direction);
    });
    return handle;
  }

  #resizeFloating(rect, deltaWidth, deltaHeight, direction) {
    const maxWidth = Math.max(0, window.innerWidth - 16);
    const maxHeight = Math.max(0, window.innerHeight - 72);
    const width = Math.max(Math.min(280, maxWidth), Math.min(rect.width + deltaWidth, maxWidth));
    const height = Math.max(Math.min(180, maxHeight), Math.min(rect.height + deltaHeight, maxHeight));
    NotesPanel.#floatingSize = { width, height };
    this.#applyFloatingSize();
    this.#moveFloating(direction === -1 ? rect.right - width : rect.left, rect.top);
  }

  #applyFloatingSize() {
    const { width, height } = NotesPanel.#floatingSize;
    this.host.style.setProperty('--notes-width', `${width}px`);
    this.host.style.setProperty('--notes-height', `${height}px`);
  }

  updatePlayer(player) {
    const duration = player?.canJump ? player.video.duration : 0;
    this.#canCapture = Boolean(player?.canCapture);
    this.#preview = duration ? player.video.currentTime : undefined;
    this.#updateEditor();
    this.timeline.hidden = !duration;
    if (duration !== this.#duration) {
      this.#duration = duration;
      this.endTime.textContent = formatTime(duration);
      this.#renderMarks();
    }
    if (duration) this.progress.style.width = `${Math.min(100, 100 * player.video.currentTime / duration)}%`;
  }

  setNotes(notes) {
    this.#notes = [...notes].sort((a, b) => a.anchor.time - b.anchor.time || a.id.localeCompare(b.id));
    const label = `已保存笔记（${notes.length}）`;
    if (this.savedSummary.textContent !== label) this.savedSummary.textContent = label;
    this.empty.hidden = notes.length > 0;
    this.list.replaceChildren(...this.#notes.map(note => {
      const item = panelElement('li');
      item.dataset.noteId = note.id;
      const row = panelElement('div', 'row');
      const jump = panelButton(formatTime(note.anchor.time, true), () => this.actions.jump(note), 'anchor small');
      const controls = panelElement('div', 'buttons');
      controls.append(
        panelButton('编辑', () => this.actions.edit(note), 'small'),
        panelButton('删除', () => this.actions.remove(note), 'small'),
      );
      row.append(jump, controls);
      item.append(row, panelElement('p', 'body', note.body));
      return item;
    }));
    this.#renderMarks();
  }

  #renderMarks() {
    const width = this.#width = this.marks.clientWidth;
    for (const mark of this.marks.querySelectorAll('.mark')) mark.remove();
    if (!width || !this.#duration) return;

    const laneEnds = [];
    const marks = document.createDocumentFragment();
    for (const note of this.#notes) {
      const position = Math.min(1, note.anchor.time / this.#duration);
      const offset = position * width;
      let lane = laneEnds.findIndex(end => offset - end >= 20);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = offset;

      const mark = panelButton('', () => this.actions.jump(note), 'mark');
      mark.style.left = `${position * 100}%`;
      mark.style.top = `${1 + 19 * lane}px`;
      mark.dataset.noteId = note.id;
      mark.title = `${formatTime(note.anchor.time, true)} — ${note.body.slice(0, 70)}`;
      mark.setAttribute('aria-label', mark.title);
      marks.append(mark);
    }
    const height = `${19 * Math.max(1, laneEnds.length)}px`;
    if (this.marks.style.height !== height) this.marks.style.height = height;
    this.marks.append(marks);
    this.setActive(this.#active);
  }

  setActive(id) {
    this.#active = id;
    for (const item of this.host.shadowRoot.querySelectorAll('[data-note-id]')) {
      if (item.dataset.noteId === id) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    }
  }

  openEditor(body, anchor, focus = true) {
    this.content.hidden = false;
    const collapse = this.host.shadowRoot.querySelector('[aria-controls="notes-content"]');
    collapse.textContent = '收起';
    collapse.setAttribute('aria-expanded', 'true');
    this.input.value = body;
    this.showDraft(anchor, true);
    if (focus) this.input.focus();
  }

  resetEditor() {
    this.input.value = '';
    this.showDraft(undefined, false);
  }

  showDraft(anchor, draft) {
    this.#anchor = anchor;
    this.#draft = draft;
    this.#updateEditor();
  }

  #updateEditor() {
    let label = '等待视频加载';
    if (this.#anchor) label = `已绑定 ${formatTime(this.#anchor.time, true)}`;
    else if (this.#draft) label = '等待可记录的播放时间';
    else if (validTime(this.#preview)) label = `当前时间 ${formatTime(this.#preview)}`;
    if (this.draftAnchor.textContent !== label) this.draftAnchor.textContent = label;
    this.bindTime.hidden = this.cancel.hidden = !this.#draft;
    this.bindTime.disabled = !this.#canCapture || this.#saving;
    this.save.disabled = this.#saving || !this.#anchor || !this.input.value.trim();
  }

  busy(busy) {
    this.#saving = busy;
    this.cancel.disabled = this.input.disabled = busy;
    this.#updateEditor();
  }

  backupBusy(busy) {
    this.exportButton.disabled = this.importButton.disabled = busy;
  }

  dispose() {
    this.#lifetime.abort();
    this.#resize.disconnect();
    this.host.remove();
  }
}
