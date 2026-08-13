// The acquisition ladder.
//
// Ordered so that silent attempts come first and anything that moves the page's
// UI comes last. Every rung reports which one answered, so the popup can show
// it and a future failure is diagnosable rather than mysterious.
//
//   1. Already captured   the interceptor saw a payload for this video
//   2. Direct track fetch  silent, but token-gated on most videos
//   3. Panel, over network opens the transcript panel, reads the real response
//   4. Panel, from the DOM last resort, timings are approximate
//
// An empty body from rung 2 means "token gated", never "no captions". Only an
// empty caption track list means the video genuinely has none.

var YTCMD = YTCMD || {};

YTCMD.acquire = (function () {
  async function run({ preferredTrackIndex = null, onProgress = () => {} } = {}) {
    const videoId = YTCMD.currentVideoId();
    if (!videoId) throw fail('NOT_A_VIDEO', 'Open a YouTube video first.');

    onProgress('Reading page data');
    const { player, initialData } = await YTCMD.playerResponse.read();
    const meta = YTCMD.meta.fromPlayer(player, initialData);
    const tracks = YTCMD.playerResponse.captionTracks(player);

    if (meta.isLive) {
      throw fail('LIVE_STREAM', 'This is a live stream. Captions are not final yet.');
    }

    const playability = player?.playabilityStatus?.status;
    if (playability && playability !== 'OK' && tracks.length === 0) {
      throw fail(
        'NOT_PLAYABLE',
        player?.playabilityStatus?.reason ||
          'This video cannot be read (it may be private, members-only, or age-restricted).'
      );
    }

    if (tracks.length === 0) {
      throw fail('NO_CAPTIONS', 'This video has no caption tracks.');
    }

    const chosen =
      preferredTrackIndex !== null && tracks[preferredTrackIndex]
        ? tracks[preferredTrackIndex]
        : pickDefaultTrack(tracks);

    // 1. Anything the interceptor already captured for this video.
    const cached =
      YTCMD.bridge.get(videoId, 'timedtext') ??
      YTCMD.bridge.get(videoId, 'getTranscript');
    if (cached?.body) {
      onProgress('Using captured captions');
      return result(cached.body, meta, chosen, tracks, 'capture', false);
    }

    // 2. Direct fetch. Silent and fast, and the only rung that honours an
    //    explicit language choice, so it is always worth one attempt.
    onProgress('Fetching caption track');
    const direct = await YTCMD.playerResponse.fetchTrack(chosen);
    if (direct) {
      return result(direct, meta, chosen, tracks, 'playerResponse', false);
    }

    // 3. Let the page fetch it. The interceptor reads the response.
    onProgress('Opening the transcript panel');
    let weOpenedIt = false;
    try {
      weOpenedIt = await YTCMD.panel.open();
    } catch (err) {
      if (err?.message === 'NO_TRANSCRIPT_BUTTON') {
        throw fail(
          'NO_PANEL',
          'This video has caption tracks but no transcript panel, and the ' +
            'caption endpoint is token-gated. Turn captions on during playback, ' +
            'then try again.'
        );
      }
      throw fail('PANEL_FAILED', 'Could not open the transcript panel.');
    }

    const captured = await YTCMD.bridge.waitFor(videoId, 'getTranscript', 6000);
    if (captured?.body) {
      if (weOpenedIt) await YTCMD.panel.close();
      return result(captured.body, meta, chosen, tracks, 'panel-network', false);
    }

    // 4. The panel is open but its network response never landed. Read the DOM.
    onProgress('Reading the transcript panel');
    const scraped = YTCMD.panel.scrape();
    if (weOpenedIt) await YTCMD.panel.close();

    if (scraped?.length) {
      return {
        ok: true,
        raw: JSON.stringify({ __ytcmdCues: scraped }),
        format: 'scrapedCues',
        meta,
        track: chosen,
        tracks,
        source: 'panel-dom',
        timingsSynthesized: true,
      };
    }

    throw fail(
      'ALL_TIERS_FAILED',
      'Captions exist but could not be read. Turn captions on during playback, ' +
        'then try again.'
    );
  }

  function pickDefaultTrack(tracks) {
    const uiLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return (
      tracks.find((t) => t.lang.toLowerCase().startsWith(uiLang) && t.kind === 'manual') ??
      tracks.find((t) => t.lang.toLowerCase().startsWith(uiLang)) ??
      tracks.find((t) => t.lang.toLowerCase().startsWith('en') && t.kind === 'manual') ??
      tracks.find((t) => t.kind === 'manual') ??
      tracks[0]
    );
  }

  function result(raw, meta, track, tracks, source, timingsSynthesized) {
    return {
      ok: true,
      raw,
      format: null, // let the pipeline sniff it
      meta,
      track,
      tracks,
      source,
      timingsSynthesized,
    };
  }

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  return { run };
})();
