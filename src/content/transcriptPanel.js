// Driving YouTube's own transcript panel.
//
// Opening the panel makes the page fetch get_transcript itself, which the
// interceptor catches. That response carries real start and end times, so it is
// strictly better than reading the rendered rows. Scraping the DOM is kept as
// the final fallback, and it flags its timings as synthesized because the panel
// shows only a start time per row.
//
// The panel is restored to its previous state afterwards, so an export leaves
// no visible trace.

var YTCMD = YTCMD || {};

YTCMD.panel = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, { timeout = 6000, interval = 120 } = {}) {
    const started = Date.now();
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() - started > timeout) return null;
      await sleep(interval);
    }
  }

  function isOpen() {
    const panel = YTCMD.pick(YTCMD.SELECTORS.transcriptPanel);
    if (!panel) return false;
    const visibility = panel.getAttribute('visibility') ?? '';
    if (visibility.includes('EXPANDED')) return true;
    return Boolean(YTCMD.pick(YTCMD.SELECTORS.transcriptSegments));
  }

  /** Open the panel if it is not already open. Returns true if we opened it. */
  async function open() {
    if (isOpen()) return false;

    const expand = YTCMD.pick(YTCMD.SELECTORS.expandDescription);
    if (expand) {
      expand.click();
      await sleep(220);
    }

    let button = YTCMD.pick(YTCMD.SELECTORS.showTranscript);
    if (!button) {
      button = await waitFor(() => YTCMD.pick(YTCMD.SELECTORS.showTranscript), {
        timeout: 2500,
      });
    }
    if (!button) throw new Error('NO_TRANSCRIPT_BUTTON');

    button.click();
    const appeared = await waitFor(() => YTCMD.pick(YTCMD.SELECTORS.transcriptSegments), {
      timeout: 6000,
    });
    if (!appeared) throw new Error('PANEL_DID_NOT_OPEN');
    return true;
  }

  /**
   * Close the panel and wait until it has actually gone. Callers may reopen it
   * immediately afterwards, and reopening while the DOM still reports it as
   * open would be a no-op.
   */
  async function close() {
    const button = YTCMD.pick(YTCMD.SELECTORS.closePanel);
    if (!button) return false;
    button.click();
    const closed = await waitFor(() => (isOpen() ? null : true), {
      timeout: 1500,
      interval: 100,
    });
    return Boolean(closed);
  }

  /** The language the panel footer currently shows, as displayed text. */
  function currentLanguageLabel() {
    const trigger = YTCMD.pick(YTCMD.SELECTORS.languageMenuTrigger);
    const text = trigger?.textContent?.trim();
    return text || null;
  }

  /**
   * Switch the panel to another language by driving its own footer menu.
   *
   * This is the only way to honour an explicit language choice on a
   * token-gated video: the page reissues its own transcript request, which the
   * interceptor captures. Returns true only when a matching entry was found and
   * clicked, so the caller can tell the difference between "switched" and
   * "could not switch" rather than silently returning the wrong language.
   */
  async function selectLanguage(wanted) {
    if (!wanted) return false;
    const trigger = YTCMD.pick(YTCMD.SELECTORS.languageMenuTrigger);
    if (!trigger) return false;

    if (matchesLanguage(currentLanguageLabel(), wanted)) return true;

    trigger.click();
    const items = await waitFor(
      () => {
        const found = YTCMD.pickAll(YTCMD.SELECTORS.languageMenuItems);
        return found.length ? found : null;
      },
      { timeout: 2500 }
    );
    if (!items) return false;

    const target = items.find((item) => matchesLanguage(item.textContent, wanted));
    if (!target) {
      // Leave the page as we found it rather than stranding an open menu.
      document.body?.click();
      return false;
    }

    target.click();
    await sleep(250);
    return true;
  }

  /**
   * Loose comparison of language labels. YouTube writes "English
   * (auto-generated)" in the menu where the track list says "English (auto)",
   * so an exact match is too strict.
   */
  function matchesLanguage(label, wanted) {
    if (!label || !wanted) return false;
    const normalize = (s) =>
      String(s)
        .toLowerCase()
        .replace(/\(auto-generated\)|\(auto\)/g, 'auto')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    const a = normalize(label);
    const b = normalize(wanted);
    if (!a || !b) return false;
    return a === b || a.startsWith(b) || b.startsWith(a);
  }

  /**
   * Read the rendered rows. Start times only, so ends are inferred from the
   * next row and the result is marked as approximate.
   */
  function scrape() {
    const container = YTCMD.pick(YTCMD.SELECTORS.transcriptSegments);
    if (!container) return null;
    const rows = YTCMD.pickAll(YTCMD.SELECTORS.transcriptSegment, container);
    if (!rows.length) return null;

    const cues = [];
    for (const row of rows) {
      const stampEl = YTCMD.pick(YTCMD.SELECTORS.segmentTimestamp, row);
      const textEl = YTCMD.pick(YTCMD.SELECTORS.segmentText, row);
      const stamp = stampEl?.textContent?.trim();
      const text = textEl?.textContent?.trim();
      if (!text) continue;

      let start = null;
      const attr = Number(row.getAttribute('start-offset'));
      if (Number.isFinite(attr) && attr > 0) start = attr / 1000;
      if (start === null && stamp) start = parseClock(stamp);
      if (start === null) continue;

      cues.push({ start, end: null, text });
    }
    if (!cues.length) return null;

    cues.sort((a, b) => a.start - b.start);
    for (let i = 0; i < cues.length; i++) {
      cues[i].end = cues[i + 1] ? cues[i + 1].start : cues[i].start + 3;
    }
    return cues;
  }

  function parseClock(text) {
    const parts = String(text).trim().split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null;
    const n = parts.map(Number);
    return n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
  }

  return { open, close, isOpen, scrape, selectLanguage, currentLanguageLabel };
})();
