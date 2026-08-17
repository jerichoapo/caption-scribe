// MAIN-world interceptor.
//
// This is the load-bearing piece. YouTube signs every caption URL with an
// `exp=xpe` parameter, and the endpoint returns an empty 200 unless the request
// also carries a proof-of-origin token that the player generates at runtime.
// That token is never present in the baseUrl we can read, so reconstructing the
// request from the player response does not work. Watching the requests the
// player actually makes does.
//
// Running in the page's own world rather than through webRequest means response
// bodies are readable and no extra permission is needed. The page keeps its own
// copy of every response: only clones are read here.

(() => {
  'use strict';
  if (window.__ytcmdInterceptorInstalled) return;
  window.__ytcmdInterceptorInstalled = true;

  const CHANNEL = 'ytcmd-page';
  const TIMEDTEXT = '/api/timedtext';
  const TRANSCRIPT = '/youtubei/v1/get_transcript';
  // YouTube refetches player data over this endpoint on a soft navigation,
  // when the page-level ytInitialPlayerResponse global still describes the
  // video the user arrived on. Capturing it is the only way to get a caption
  // track list that matches the video actually being watched.
  const PLAYER = '/youtubei/v1/player';

  const classify = (url) => {
    if (typeof url !== 'string') return null;
    if (url.includes(TIMEDTEXT)) return 'timedtext';
    if (url.includes(TRANSCRIPT)) return 'getTranscript';
    if (url.includes(PLAYER)) return 'playerApi';
    return null;
  };

  const videoIdFromUrl = (url) => {
    const m = /[?&]v=([\w-]{11})/.exec(url) || /[?&]v=([\w-]{11})/.exec(location.href);
    return m ? m[1] : null;
  };

  const publish = (kind, url, body) => {
    if (typeof body !== 'string' || body.length < 40) return;
    try {
      window.postMessage(
        {
          source: CHANNEL,
          kind,
          url,
          body,
          videoId: videoIdFromUrl(url),
          at: Date.now(),
        },
        window.location.origin
      );
    } catch {
      // A payload too large to structure-clone is not worth crashing over.
    }
  };

  const absolute = (input) => {
    try {
      if (typeof input === 'string') return new URL(input, location.href).href;
      if (input && typeof input.url === 'string') return input.url;
    } catch {
      /* fall through */
    }
    return typeof input === 'string' ? input : '';
  };

  // fetch
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      const url = absolute(input);
      const kind = classify(url);
      const promise = nativeFetch.apply(this, arguments);
      if (!kind) return promise;
      return promise.then((response) => {
        try {
          response
            .clone()
            .text()
            .then((text) => publish(kind, url, text))
            .catch(() => {});
        } catch {
          /* cloning can fail on opaque responses */
        }
        return response;
      });
    };
  }

  // XMLHttpRequest
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ytcmdUrl = absolute(url);
    this.__ytcmdKind = classify(this.__ytcmdUrl);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__ytcmdKind) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            publish(this.__ytcmdKind, this.__ytcmdUrl, this.responseText);
          } else if (this.responseType === 'json' && this.response) {
            publish(this.__ytcmdKind, this.__ytcmdUrl, JSON.stringify(this.response));
          }
        } catch {
          /* ignore */
        }
      });
    }
    return send.apply(this, arguments);
  };

  // Hand the page's player response over on request. Reading it here avoids
  // relying on Xray unwrapping from the isolated world.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'ytcmd-content') return;
    if (event.data.request !== 'playerResponse') return;
    let payload = null;
    try {
      const pr = window.ytInitialPlayerResponse;
      if (pr && typeof pr === 'object') payload = JSON.stringify(pr);
    } catch {
      payload = null;
    }
    let initial = null;
    try {
      const d = window.ytInitialData;
      if (d && typeof d === 'object') initial = JSON.stringify(d);
    } catch {
      initial = null;
    }
    window.postMessage(
      {
        source: CHANNEL,
        kind: 'playerResponse',
        body: payload,
        initialData: initial,
        videoId: videoIdFromUrl(location.href),
        at: Date.now(),
      },
      window.location.origin
    );
  });
})();
