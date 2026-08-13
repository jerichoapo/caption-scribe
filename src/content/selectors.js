// Every YouTube DOM selector lives here.
//
// These are the most breakage-prone strings in the extension. Keeping them in
// one object means a YouTube redesign is a single-file fix rather than a hunt.
// Each entry is a list tried in order, so an old and a new selector can
// coexist during a rollout.

var YTCMD = YTCMD || {};

YTCMD.SELECTORS = {
  // The "...more" control that expands the description.
  expandDescription: [
    'tp-yt-paper-button#expand',
    '#expand',
    'ytd-text-inline-expander #expand',
  ],
  // The "Show transcript" button inside the expanded description.
  showTranscript: [
    'ytd-video-description-transcript-section-renderer button',
    'ytd-video-description-transcript-section-renderer ytd-button-renderer button',
    'button[aria-label="Show transcript"]',
  ],
  // The transcript panel and its rows.
  transcriptPanel: [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    'ytd-transcript-renderer',
  ],
  transcriptSegments: ['#segments-container', 'ytd-transcript-segment-list-renderer'],
  transcriptSegment: ['ytd-transcript-segment-renderer'],
  segmentTimestamp: ['.segment-timestamp', '[class*="segment-timestamp"]'],
  segmentText: ['.segment-text', 'yt-formatted-string.segment-text'],
  // The language selector in the transcript panel footer. Clicking through it
  // makes the page refetch the transcript in that language, which the
  // interceptor then captures.
  languageMenuTrigger: [
    'ytd-transcript-footer-renderer tp-yt-paper-button',
    'ytd-transcript-footer-renderer #label',
    'ytd-transcript-footer-renderer ytd-menu-renderer',
    'ytd-transcript-footer-renderer yt-dropdown-menu',
  ],
  languageMenuItems: [
    'tp-yt-iron-dropdown tp-yt-paper-listbox ytd-menu-service-item-renderer',
    'tp-yt-iron-dropdown tp-yt-paper-listbox tp-yt-paper-item',
    'ytd-menu-popup-renderer ytd-menu-service-item-renderer',
    'tp-yt-paper-listbox ytd-menu-service-item-renderer',
  ],
  // Panel close button.
  closePanel: [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button',
    'ytd-engagement-panel-title-header-renderer #visibility-button button',
  ],
  // Page metadata.
  videoTitle: [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata',
    'h1.title yt-formatted-string',
  ],
  channelName: ['ytd-channel-name#channel-name a', '#owner #channel-name a', '#upload-info a'],
  description: ['ytd-text-inline-expander #description-inline-expander', '#description-inline-expander'],
};

YTCMD.pick = function pick(names, root) {
  const scope = root || document;
  for (const selector of names) {
    const found = scope.querySelector(selector);
    if (found) return found;
  }
  return null;
};

YTCMD.pickAll = function pickAll(names, root) {
  const scope = root || document;
  for (const selector of names) {
    const found = scope.querySelectorAll(selector);
    if (found && found.length) return Array.from(found);
  }
  return [];
};
