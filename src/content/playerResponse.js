// Reading ytInitialPlayerResponse.
//
// The caption baseUrl found here is signed but carries no proof-of-origin
// token, so fetching it directly returns an empty 200 on most videos. It is
// still the only source for the full list of available language tracks, which
// is what the language picker is built from, and it works on the minority of
// tracks that are not token-gated.

var YTCMD = YTCMD || {};

YTCMD.playerResponse = (() => {
  /** Ask the page world for its globals, then fall back to the raw HTML. */
  async function read() {
    const fromPage = await YTCMD.bridge.requestPlayerResponse();
    if (fromPage?.body) {
      const player = safeParse(fromPage.body);
      if (isPlausiblePlayerResponse(player)) {
        return { player, initialData: safeParse(fromPage.initialData) };
      }
    }

    // Firefox lets an isolated content script reach page globals directly.
    try {
      const unwrapped = window.wrappedJSObject?.ytInitialPlayerResponse;
      if (isPlausiblePlayerResponse(unwrapped)) {
        const cloned = safeParse(JSON.stringify(unwrapped));
        if (cloned) {
          return {
            player: cloned,
            initialData: safeParse(
              tryStringify(window.wrappedJSObject?.ytInitialData)
            ),
          };
        }
      }
    } catch {
      /* the page can redefine anything; fall through */
    }

    // Last resort: the global is absent after a soft navigation, so scrape the
    // document for the inline assignment.
    const html = document.documentElement?.innerHTML ?? '';
    return {
      player: extractAssignment(html, 'ytInitialPlayerResponse'),
      initialData: extractAssignment(html, 'ytInitialData'),
    };
  }

  function isPlausiblePlayerResponse(value) {
    return Boolean(
      value &&
        typeof value === 'object' &&
        (value.videoDetails || value.captions || value.streamingData)
    );
  }

  function safeParse(text) {
    if (typeof text !== 'string' || text.length < 2) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function tryStringify(value) {
    try {
      return value ? JSON.stringify(value) : null;
    } catch {
      return null;
    }
  }

  /** Pull `var NAME = {...};` out of page HTML by brace matching. */
  function extractAssignment(html, name) {
    const marker = `${name} = `;
    const at = html.indexOf(marker);
    if (at === -1) return null;
    const start = html.indexOf('{', at);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /** Normalize the caption track list into what the popup shows. */
  function captionTracks(player) {
    const raw =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    return raw.map((t, index) => ({
      index,
      lang: t.languageCode ?? '',
      kind: t.kind === 'asr' ? 'asr' : 'manual',
      name:
        t.name?.simpleText ??
        t.name?.runs?.[0]?.text ??
        t.languageCode ??
        `Track ${index + 1}`,
      baseUrl: t.baseUrl ?? '',
      tokenGated: /[?&]exp=[^&]*xpe/.test(t.baseUrl ?? ''),
    }));
  }

  /**
   * Opportunistic direct fetch. Cheap and silent, so it is worth trying before
   * anything that moves the page's UI, but it returns an empty body whenever
   * the track is token-gated. An empty response is a failure signal, never
   * evidence that the video has no captions.
   */
  async function fetchTrack(track) {
    if (!track?.baseUrl) return null;
    const url = `${track.baseUrl}&fmt=json3`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const body = await res.text();
      if (!body || body.trim().length < 40) return null;
      return body;
    } catch {
      return null;
    }
  }

  return { read, captionTracks, fetchTrack, extractAssignment };
})();
