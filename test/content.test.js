// Tests for the content-script acquisition ladder.
//
// Content scripts cannot be imported as modules, so they are loaded into a vm
// context with a minimal fake page. Only the decision under test runs for real:
// the page access around it is stubbed.
//
// The bug these exist for: an empty caption track list was treated as proof the
// video has no captions, when it equally means the player response could not be
// read. That shipped, and it made the add-on refuse videos that do have
// captions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = [
  'selectors.js',
  'bridge.js',
  'playerResponse.js',
  'videoMeta.js',
  'transcriptPanel.js',
  'acquire.js',
];

/** Load the content scripts into a fake page and return their namespace. */
function loadContentScripts({ href = 'https://www.youtube.com/watch?v=5kDU67RVIhY' } = {}) {
  const listeners = [];
  const sandbox = {
    setTimeout,
    clearTimeout,
    console,
    navigator: { language: 'en-US' },
    location: { href },
    document: {
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      documentElement: { innerHTML: '' },
      body: { click() {} },
      // Always present in a real browser, and the title fallback reads it.
      title: 'A Video - YouTube',
    },
    URL,
    Promise,
    Date,
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = (type, fn) => listeners.push([type, fn]);
  sandbox.window.postMessage = () => {};
  sandbox.window.location = sandbox.location;

  const context = vm.createContext(sandbox);
  for (const name of SCRIPTS) {
    const code = readFileSync(join(here, '..', 'src', 'content', name), 'utf8');
    vm.runInContext(code, context, { filename: name });
  }
  return context.YTCMD;
}

/** Stub everything that touches the page, leaving the ladder's logic real. */
function stub(YTCMD, { player, tracks, panelPayload = null, panelThrows = null }) {
  YTCMD.playerResponse.read = async () => ({ player, initialData: null });
  YTCMD.playerResponse.captionTracks = () => tracks;
  YTCMD.playerResponse.fetchTrack = async () => null; // always token-gated

  YTCMD.bridge.get = () => null;
  YTCMD.bridge.waitFor = async () => (panelPayload ? { body: panelPayload, at: 1 } : null);

  YTCMD.panel.isOpen = () => false;
  YTCMD.panel.open = async () => {
    if (panelThrows) throw new Error(panelThrows);
    return true;
  };
  YTCMD.panel.close = async () => {};
  YTCMD.panel.scrape = () => null;
  YTCMD.panel.currentLanguageLabel = () => 'English';
  YTCMD.panel.selectLanguage = async () => true;
}

const GATED_TRACK = {
  index: 0,
  lang: 'en',
  kind: 'asr',
  name: 'English (auto-generated)',
  baseUrl: 'https://www.youtube.com/api/timedtext?v=x&exp=xpe',
  tokenGated: true,
};

const REAL_PLAYER = {
  videoDetails: { videoId: '5kDU67RVIhY', title: 'A Video', author: 'A Channel' },
  streamingData: {},
};

const PANEL_PAYLOAD = JSON.stringify({
  actions: [
    {
      updateEngagementPanelAction: {
        content: {
          transcriptRenderer: {
            content: {
              transcriptSearchPanelRenderer: {
                body: {
                  transcriptSegmentListRenderer: {
                    initialSegments: [
                      {
                        transcriptSegmentRenderer: {
                          startMs: '0',
                          endMs: '3000',
                          snippet: { runs: [{ text: 'some spoken words' }] },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
});

test('an unreadable player response does not become "no captions"', async () => {
  // The shipped bug. The player response is null, so the track list is empty
  // because nothing is known, not because the video lacks captions.
  const YTCMD = loadContentScripts();
  stub(YTCMD, { player: null, tracks: [], panelPayload: PANEL_PAYLOAD });

  const outcome = await YTCMD.acquire.run({});
  assert.equal(outcome.ok, true);
  assert.equal(outcome.source, 'panel-network');
  assert.ok(outcome.raw.includes('some spoken words'));
});

test('a readable player response with no tracks does report "no captions"', async () => {
  // The other half: when the player response was read and genuinely lists no
  // caption tracks, refusing is correct and must still happen.
  const YTCMD = loadContentScripts();
  stub(YTCMD, { player: REAL_PLAYER, tracks: [], panelPayload: PANEL_PAYLOAD });

  await assert.rejects(() => YTCMD.acquire.run({}), (error) => {
    assert.equal(error.code, 'NO_CAPTIONS');
    return true;
  });
});

test('isUsable separates "read it" from "could not read it"', () => {
  const YTCMD = loadContentScripts();
  assert.equal(YTCMD.playerResponse.isUsable(REAL_PLAYER), true);
  assert.equal(YTCMD.playerResponse.isUsable(null), false);
  assert.equal(YTCMD.playerResponse.isUsable(undefined), false);
  assert.equal(YTCMD.playerResponse.isUsable({}), false);
  assert.equal(YTCMD.playerResponse.isUsable({ captions: {} }), true);
});

test('a known track list still takes the panel path when the fetch is gated', async () => {
  const YTCMD = loadContentScripts();
  stub(YTCMD, {
    player: REAL_PLAYER,
    tracks: [{ index: 0, lang: 'en', kind: 'asr', name: 'English', baseUrl: 'x', tokenGated: true }],
    panelPayload: PANEL_PAYLOAD,
  });

  const outcome = await YTCMD.acquire.run({});
  assert.equal(outcome.source, 'panel-network');
  assert.equal(outcome.track.lang, 'en');
});

test('an already-open panel is closed and reopened so a request actually fires', async () => {
  // The retry bug. A failed first attempt can leave the panel open. Opening an
  // open panel issues no request, so without this the wait stalls for its full
  // timeout and falls through to the DOM scrape.
  const YTCMD = loadContentScripts();
  stub(YTCMD, { player: REAL_PLAYER, tracks: [GATED_TRACK], panelPayload: PANEL_PAYLOAD });

  const calls = [];
  let opens = 0;
  YTCMD.panel.isOpen = () => true; // left open by a previous failed attempt
  YTCMD.panel.open = async () => {
    calls.push('open');
    opens += 1;
    return opens > 1; // first call finds it already open
  };
  YTCMD.panel.close = async () => {
    calls.push('close');
    return true;
  };

  const outcome = await YTCMD.acquire.run({});
  // Closed and reopened to force a request, then left open because that is how
  // it was found.
  assert.deepEqual(calls, ['open', 'close', 'open']);
  assert.equal(outcome.source, 'panel-network');
  assert.equal(outcome.timingsSynthesized, false);
});

test('a panel we opened ourselves is not needlessly closed and reopened', async () => {
  const YTCMD = loadContentScripts();
  stub(YTCMD, { player: REAL_PLAYER, tracks: [GATED_TRACK], panelPayload: PANEL_PAYLOAD });

  const calls = [];
  YTCMD.panel.open = async () => {
    calls.push('open');
    return true;
  };
  YTCMD.panel.close = async () => {
    calls.push('close');
    return true;
  };

  await YTCMD.acquire.run({});
  // One open, then one close at the end because we opened it.
  assert.deepEqual(calls, ['open', 'close']);
});

test('no panel and no readable tracks fails with a message naming the next step', async () => {
  const YTCMD = loadContentScripts();
  stub(YTCMD, { player: null, tracks: [], panelThrows: 'NO_TRANSCRIPT_BUTTON' });

  await assert.rejects(() => YTCMD.acquire.run({}), (error) => {
    assert.equal(error.code, 'NO_PANEL');
    assert.match(error.message, /turn captions on/i);
    return true;
  });
});

test('a live stream is refused before anything else is attempted', async () => {
  const YTCMD = loadContentScripts();
  stub(YTCMD, {
    player: { videoDetails: { videoId: '5kDU67RVIhY', isLive: true }, streamingData: {} },
    tracks: [],
  });

  await assert.rejects(() => YTCMD.acquire.run({}), (error) => {
    assert.equal(error.code, 'LIVE_STREAM');
    return true;
  });
});

test('a non-watch page is refused', async () => {
  const YTCMD = loadContentScripts({ href: 'https://www.youtube.com/feed/subscriptions' });
  stub(YTCMD, { player: null, tracks: [] });

  await assert.rejects(() => YTCMD.acquire.run({}), (error) => {
    assert.equal(error.code, 'NOT_A_VIDEO');
    return true;
  });
});
