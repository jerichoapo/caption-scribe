// Content script entry point.
//
// Owns two things: invalidating everything on a soft navigation, and answering
// the popup. YouTube never reloads between videos, so every cached object is
// stamped with its videoId and rejected on mismatch. Serving the previous
// video's transcript is the failure mode this guards against.

var YTCMD = YTCMD || {};

(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime) return;

  let activeVideoId = YTCMD.currentVideoId();

  function onNavigated() {
    const next = YTCMD.currentVideoId();
    if (next === activeVideoId) return;
    activeVideoId = next;
    YTCMD.bridge.clear();
  }

  document.addEventListener('yt-navigate-finish', onNavigated, true);
  document.addEventListener('yt-page-data-updated', onNavigated, true);
  window.addEventListener('popstate', onNavigated);

  // Belt and braces: the custom events above are YouTube's own and could be
  // renamed, so poll the URL cheaply as well.
  setInterval(onNavigated, 1000);

  async function handleStatus() {
    const videoId = YTCMD.currentVideoId();
    if (!videoId) {
      return { ok: false, code: 'NOT_A_VIDEO', message: 'Not a YouTube video page.' };
    }
    const { player, initialData } = await YTCMD.playerResponse.read();
    const meta = YTCMD.meta.fromPlayer(player, initialData);
    const tracks = YTCMD.playerResponse.captionTracks(player);
    return {
      ok: true,
      videoId,
      meta: { ...meta, description: undefined },
      tracks: tracks.map(({ baseUrl, ...rest }) => rest),
      hasCapture: Boolean(
        YTCMD.bridge.get(videoId, 'timedtext') ??
          YTCMD.bridge.get(videoId, 'getTranscript')
      ),
    };
  }

  async function handleExtract(message) {
    const requestedFor = message?.videoId ?? null;
    const current = YTCMD.currentVideoId();
    if (requestedFor && requestedFor !== current) {
      return {
        ok: false,
        code: 'VIDEO_CHANGED',
        message: 'The video changed. Reopen the popup.',
      };
    }

    try {
      const outcome = await YTCMD.acquire.run({
        preferredTrackIndex: message?.trackIndex ?? null,
      });

      // Re-check after the await: the user may have navigated mid-extraction.
      if (YTCMD.currentVideoId() !== current) {
        return {
          ok: false,
          code: 'VIDEO_CHANGED',
          message: 'The video changed while reading captions. Try again.',
        };
      }

      return {
        ok: true,
        raw: outcome.raw,
        format: outcome.format,
        meta: outcome.meta,
        track: outcome.track ? stripBaseUrl(outcome.track) : null,
        tracks: outcome.tracks.map(stripBaseUrl),
        source: outcome.source,
        timingsSynthesized: outcome.timingsSynthesized,
      };
    } catch (error) {
      return {
        ok: false,
        code: error?.code ?? 'UNKNOWN',
        message: error?.message ?? 'Something went wrong reading captions.',
      };
    }
  }

  function stripBaseUrl(track) {
    if (!track) return track;
    const { baseUrl, ...rest } = track;
    return rest;
  }

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ytcmd:status') {
      handleStatus().then(sendResponse);
      return true;
    }
    if (message?.type === 'ytcmd:extract') {
      handleExtract(message).then(sendResponse);
      return true;
    }
    return false;
  });
})();
