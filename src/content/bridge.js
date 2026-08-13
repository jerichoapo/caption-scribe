// Bridge between the MAIN-world interceptor and the isolated content script.
//
// Holds the most recent caption payload seen for the current video. Everything
// is keyed by videoId and cleared on navigation, because YouTube is a single
// page app and serving the previous video's transcript is the worst bug this
// extension could ship.

var YTCMD = YTCMD || {};

YTCMD.bridge = (() => {
  const captures = new Map(); // videoId -> { timedtext, getTranscript }
  const waiters = [];
  let latestPlayerResponse = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'ytcmd-page') return;

    if (data.kind === 'playerResponse') {
      latestPlayerResponse = {
        videoId: data.videoId,
        body: data.body,
        initialData: data.initialData,
      };
      return;
    }

    const videoId = data.videoId || YTCMD.currentVideoId?.();
    if (!videoId) return;

    const entry = captures.get(videoId) || {};
    entry[data.kind] = { url: data.url, body: data.body, at: data.at };
    captures.set(videoId, entry);

    // Wake anything waiting for this kind of payload.
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.videoId === videoId && (!w.kind || w.kind === data.kind)) {
        waiters.splice(i, 1);
        w.resolve(entry[data.kind]);
      }
    }
  });

  return {
    get(videoId, kind) {
      const entry = captures.get(videoId);
      if (!entry) return null;
      return kind ? entry[kind] ?? null : entry;
    },

    /** Resolve when a payload of `kind` arrives, or null on timeout. */
    waitFor(videoId, kind, timeoutMs = 6000) {
      const existing = this.get(videoId, kind);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve) => {
        const waiter = { videoId, kind, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
            resolve(null);
          }
        }, timeoutMs);
      });
    },

    /** Ask the page for its player response and wait briefly for the reply. */
    requestPlayerResponse(timeoutMs = 1500) {
      latestPlayerResponse = null;
      window.postMessage(
        { source: 'ytcmd-content', request: 'playerResponse' },
        window.location.origin
      );
      return new Promise((resolve) => {
        const started = Date.now();
        const poll = () => {
          if (latestPlayerResponse) return resolve(latestPlayerResponse);
          if (Date.now() - started > timeoutMs) return resolve(null);
          setTimeout(poll, 50);
        };
        poll();
      });
    },

    clear() {
      captures.clear();
      latestPlayerResponse = null;
      while (waiters.length) waiters.pop().resolve(null);
    },
  };
})();
