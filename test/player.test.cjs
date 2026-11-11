const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../src/player.js'), 'utf8');

function setup() {
  let clock = 0;
  const ticks = [];
  const NotesPlayer = runInNewContext(`${source}\nNotesPlayer;`, {
    AbortController,
    HTMLMediaElement: { HAVE_METADATA: 1 },
    validTime: time => Number.isFinite(time) && time >= 0,
    performance: { now: () => clock },
    setTimeout: resolve => ticks.push(resolve),
  });

  const video = Object.assign(new EventTarget(), {
    currentTime: 0,
    currentSrc: 'test',
    duration: 30,
    readyState: 4,
    seeking: false,
    paused: true,
    pause() { this.paused = true; },
  });
  const root = { closest: () => null, matches: () => false };
  const player = new NotesPlayer(root, video, () => {});
  return {
    player,
    video,
    async tick(ms) {
      clock += ms;
      ticks.shift()();
      await Promise.resolve();
    },
  };
}

test('capture pauses playback and records the current playhead', () => {
  const { player, video } = setup();
  video.currentTime = 12.345;
  video.paused = false;

  assert.equal(player.capture().time, 12.345);
  assert.equal(video.paused, true);
});

test('capture waits until a seek has completed', () => {
  const { player, video } = setup();
  video.seeking = true;
  assert.equal(player.capture(), null);
});

test('a seek that does not finish returns unavailable', async () => {
  const { player, video, tick } = setup();
  video.seeking = true;
  const jump = player.jump({ time: 12 });
  await tick(3000);
  assert.equal(await jump, 'unavailable');
});

test('a second marker can replace a seek while the video buffers', async () => {
  const { player, video, tick } = setup();
  video.seeking = true;
  const first = player.jump({ time: 12 });

  video.readyState = 1;
  const second = player.jump({ time: 18 });
  assert.equal(video.currentTime, 18);
  video.seeking = false;
  await tick(40);
  await tick(40);

  assert.equal(await first, 'cancelled');
  assert.equal(await second, 'time');
});

test('scrubbing in the player cancels a pending note jump', async () => {
  const { player, video, tick } = setup();
  video.seeking = true;
  const jump = player.jump({ time: 12 });

  video.currentTime = 18;
  video.dispatchEvent(new Event('seeking'));
  video.seeking = false;
  await tick(40);

  assert.equal(await jump, 'cancelled');
});

test('resuming playback cancels a pending note jump', async () => {
  const { player, video, tick } = setup();
  video.seeking = true;
  const jump = player.jump({ time: 12 });

  video.paused = false;
  video.dispatchEvent(new Event('play'));
  await tick(3000);

  assert.equal(await jump, 'cancelled');
});

test('a note beyond the current duration is not reported as reached', async () => {
  const { player, video } = setup();
  assert.equal(await player.jump({ time: 31 }), 'outside');
  assert.equal(video.currentTime, 0);
});
