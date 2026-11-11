class NotesPlayer {
  #lifetime = new AbortController();
  #source;
  #seek;

  constructor(root, video, changed) {
    this.root = root;
    this.video = video;
    this.#source = this.source;
    const options = { signal: this.#lifetime.signal };
    for (const event of ['durationchange', 'loadedmetadata', 'loadeddata', 'timeupdate', 'seeking', 'seeked', 'emptied']) {
      video.addEventListener(event, () => {
        this.refresh();
        changed();
      }, options);
    }
  }

  get canCapture() {
    return this.canJump && !this.video.seeking && validTime(this.video.currentTime);
  }

  get canJump() {
    return this.supported && this.video.readyState >= HTMLMediaElement.HAVE_METADATA;
  }

  get supported() {
    return !this.root.closest('ytd-watch-flexy')?.hasAttribute('is-live') &&
      !this.root.matches('.ad-showing, .ad-interrupting, .ytp-live') &&
      Number.isFinite(this.video.duration) && this.video.duration > 0;
  }

  get source() {
    const ad = this.root.matches('.ad-showing, .ad-interrupting');
    return `${ad}:${this.video.currentSrc}`;
  }

  refresh() {
    const source = this.source;
    if (source !== this.#source) {
      this.#source = source;
      this.#seek?.abort();
    }
  }

  capture() {
    this.refresh();
    if (!this.canCapture) return null;

    this.#seek?.abort();
    this.video.pause();
    return { time: this.video.currentTime };
  }

  async jump({ time: target }) {
    this.refresh();
    this.#seek?.abort();
    if (!this.canJump) return 'unavailable';

    if (target > this.video.duration) return 'outside';
    this.video.pause();

    const controller = new AbortController();
    this.#seek = controller;
    const { signal } = controller;
    const atTarget = () => Math.abs(this.video.currentTime - target) < 0.05;
    this.video.addEventListener('seeking', () => {
      if (!atTarget()) controller.abort();
    }, { signal });
    this.video.addEventListener('play', () => {
      if (!this.video.paused) controller.abort();
    }, { signal });

    try {
      this.video.currentTime = target;
      const deadline = performance.now() + 3000;
      while (!signal.aborted && this.supported) {
        if (!this.video.seeking && atTarget()) return 'time';
        if (performance.now() >= deadline) return 'unavailable';
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return signal.aborted ? 'cancelled' : 'unavailable';
    } finally {
      controller.abort();
      if (this.#seek === controller) this.#seek = undefined;
    }
  }

  dispose() {
    this.#lifetime.abort();
    this.#seek?.abort();
  }
}
