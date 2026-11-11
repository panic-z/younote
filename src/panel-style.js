const notesStyles = `
  :host {
    display: block;
    margin: 14px 0;
    --surface: #faf9f5;
    --field: #fffefa;
    --text: #222a27;
    --muted: #52605a;
    --line: #d8ded6;
    --accent: #225d4c;
    --on-accent: #fff;
    --tint: #e8f0ea;
    color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  :host([dark]) {
    color-scheme: dark;
    --surface: #202422;
    --field: #191c1a;
    --text: #f0f1ea;
    --muted: #b1bcb3;
    --line: #424b44;
    --accent: #a6dbbe;
    --on-accent: #182820;
    --tint: #303d34;
  }
  :host(:is([data-layout="left"], [data-layout="right"], [data-layout="floating"])) {
    position: fixed;
    z-index: 2019;
    top: var(--notes-top, 64px);
    width: min(calc(var(--youtube-notes-dock-width, 360px) - 16px), calc(100vw - 16px));
    margin: 0;
  }
  :host([data-layout="left"]) { left: 8px; }
  :host([data-layout="right"]) { right: 8px; }
  :host([data-layout="floating"]) {
    left: var(--notes-left, 8px);
    width: min(var(--notes-width, 400px), calc(100vw - 16px));
  }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
  :host(:is([data-layout="left"], [data-layout="right"], [data-layout="floating"])) .panel {
    max-height: calc(100dvh - var(--notes-top, 64px) - 8px);
    overflow: auto;
    overscroll-behavior: contain;
    box-shadow: 0 6px 22px #0002;
  }
  :host(:is([data-layout="left"], [data-layout="right"], [data-layout="floating"])) header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
  }
  :host([data-layout="floating"]) h2 {
    flex-grow: 1;
    cursor: move;
    touch-action: none;
    user-select: none;
  }
  :host([data-layout="floating"]) h2::before {
    content: '⠿';
    margin-right: 4px;
    color: var(--muted);
  }
  :host([data-layout="floating"]) .panel:not(:has(.content[hidden])) {
    height: var(--notes-height, auto);
  }
  :host([data-layout="floating"]) .content { padding-bottom: 24px; }
  .resize-handle { display: none; }
  :host([data-layout="floating"]) .panel:not(:has(.content[hidden])) ~ .resize-handle {
    position: absolute;
    z-index: 2;
    display: grid;
    place-items: center;
    bottom: 0;
    right: 0;
    width: 24px;
    min-height: 0;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: nwse-resize;
    touch-action: none;
  }
  :host([data-layout="floating"]) .panel:not(:has(.content[hidden])) ~ .resize-handle[data-edge="left"] {
    right: auto;
    left: 0;
    cursor: nesw-resize;
  }
  .resize-handle::before {
    width: 11px;
    height: 11px;
    background: linear-gradient(135deg, transparent 49%, currentColor 50% 56%, transparent 57% 72%, currentColor 73% 79%, transparent 80%);
    content: '';
  }
  .resize-handle[data-edge="left"]::before { transform: scaleX(-1); }
  header, .buttons { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  header { justify-content: space-between; padding: 14px 16px; }
  h2 { margin: 0; font-size: 16px; font-weight: 700; }
  button, select, textarea { font: inherit; color: inherit; }
  button, select {
    border: 1px solid var(--line);
    background: var(--field);
    border-radius: 7px;
    min-height: 32px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button:hover:enabled { background: var(--tint); }
  :is(button, select, textarea, summary, h2):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: default; }
  .primary, .primary:hover:enabled { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .primary:hover:enabled { filter: brightness(.9); }
  .content { padding: 0 16px 14px; }
  .timeline { padding-top: 6px; }
  .mark-window { max-height: 80px; padding-inline: 9px; overflow: auto; overscroll-behavior: contain; }
  .marks { position: relative; height: 18px; }
  .rail {
    position: sticky;
    top: 8px;
    height: 2px;
    border-radius: 2px;
    background: var(--line);
    pointer-events: none;
  }
  .progress { height: 100%; width: 0; border-radius: inherit; background: var(--accent); }
  .mark {
    position: absolute;
    top: 1px;
    transform: translateX(-50%);
    min-height: 16px;
    width: 16px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--accent);
  }
  .mark::before { width: 9px; height: 9px; border-radius: 50%; background: currentColor; content: ""; }
  .mark[aria-current] { outline: 2px solid currentColor; outline-offset: 1px; }
  .axis { display: flex; justify-content: space-between; margin: 3px 0 8px; }
  .axis, .status, .empty { font-size: 12px; color: var(--muted); }
  .axis, .anchor { font-variant-numeric: tabular-nums; }
  .status { margin: 8px 0 0; }
  .status:empty { margin: 0; }
  .empty { margin: 6px 0 0; }
  form { display: grid; gap: 9px; margin: 10px 0; padding: 12px; border: 1px solid var(--line); border-radius: 9px; }
  textarea { width: 100%; min-height: 74px; resize: vertical; border: 1px solid var(--line); border-radius: 7px; background: var(--field); padding: 9px; }
  .saved-notes > summary { padding: 6px 2px; cursor: pointer; font-weight: 650; }
  .saved-notes > summary:hover { color: var(--accent); }
  ol { list-style: none; margin: 0; padding: 0; max-height: 290px; overflow: auto; }
  li { padding: 7px 0; border-top: 1px solid var(--line); }
  li[aria-current] { background: var(--tint); }
  .row { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: 5px; }
  .row .buttons { gap: 4px; }
  .row button { min-height: 24px; padding: 2px 6px; border-radius: 5px; font-size: 11px; }
  .anchor { color: var(--accent); font-size: 12px; font-weight: 650; }
  .small { min-height: 28px; font-size: 12px; }
  .body { margin: 4px 2px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
`;
