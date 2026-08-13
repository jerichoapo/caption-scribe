// Page metadata: title, channel, duration, description, and chapter markers.

var YTCMD = YTCMD || {};

YTCMD.currentVideoId = function currentVideoId() {
  try {
    const url = new URL(location.href);
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const shorts = url.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (shorts) return shorts[1];
  } catch {
    /* ignore */
  }
  return null;
};

YTCMD.meta = (() => {
  function fromPlayer(player, initialData) {
    const details = player?.videoDetails ?? {};
    const videoId = details.videoId ?? YTCMD.currentVideoId();
    return {
      videoId,
      title: details.title ?? domTitle(),
      channel: details.author ?? domChannel(),
      durationSec: Number(details.lengthSeconds) || null,
      description: details.shortDescription ?? '',
      // isLiveContent stays true on the finished VOD, which is exportable.
      // Only isLive means the stream is running right now.
      isLive: Boolean(details.isLive),
      chapters: chaptersFrom(initialData),
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : location.href,
    };
  }

  function domTitle() {
    const el = YTCMD.pick(YTCMD.SELECTORS.videoTitle);
    const text = el?.textContent?.trim();
    if (text) return text;
    return document.title.replace(/\s*-\s*YouTube\s*$/, '').trim() || null;
  }

  function domChannel() {
    const el = YTCMD.pick(YTCMD.SELECTORS.channelName);
    return el?.textContent?.trim() || null;
  }

  /**
   * Chapters live in a macro-marker renderer inside ytInitialData. The exact
   * path has moved between YouTube revisions, so this collects every
   * chapterRenderer in the tree rather than walking a fixed route.
   */
  function chaptersFrom(initialData) {
    if (!initialData || typeof initialData !== 'object') return [];
    const out = [];
    const seen = new Set();

    const visit = (node, depth) => {
      if (depth > 30 || node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const child of node) visit(child, depth + 1);
        return;
      }
      const chapter = node.chapterRenderer;
      if (chapter) {
        const start = Number(chapter.timeRangeStartMillis);
        const title =
          chapter.title?.simpleText ?? chapter.title?.runs?.[0]?.text ?? '';
        const key = `${start}|${title}`;
        if (Number.isFinite(start) && title && !seen.has(key)) {
          seen.add(key);
          out.push({ start: start / 1000, title: String(title).trim() });
        }
      }
      for (const key of Object.keys(node)) visit(node[key], depth + 1);
    };

    visit(initialData, 0);
    out.sort((a, b) => a.start - b.start);
    return out;
  }

  return { fromPlayer, chaptersFrom, domTitle, domChannel };
})();
