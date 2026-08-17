// Popup logic.
//
// The popup does all parsing and formatting. Content scripts cannot use ES
// modules, but an extension page can, so the pure core is imported here
// directly and the content script stays a thin page-access layer.

import {
  buildTranscript,
  render,
  filenameFor,
  subtitlesAreTrustworthy,
} from '../core/pipeline.js';
import { selectedTranscriptLanguage } from '../core/parse/getTranscript.js';

const api = globalThis.browser ?? globalThis.chrome;
const ORIGINS = ['*://*.youtube.com/*'];

const el = (id) => document.getElementById(id);
const show = (id) => el(id).removeAttribute('hidden');
const hide = (id) => el(id).setAttribute('hidden', '');

const DEFAULTS = {
  timestamps: 'paragraph',
  frontmatter: 'full',
  wordBudget: 100,
  headings: true,
  linkTimestamps: true,
  capitalize: false,
  intervalMinutes: 5,
  filenamePattern: '{date}-{slug}',
};

let state = {
  tabId: null,
  videoId: null,
  tracks: [],
  options: { ...DEFAULTS },
  lastResult: null,
};

init();

async function init() {
  try {
    const granted = await api.permissions.contains({ origins: ORIGINS });
    if (!granted) {
      show('permission');
      el('grant').addEventListener('click', requestPermission);
      return;
    }
    await start();
  } catch (error) {
    show('main');
    setStatus(`Could not start: ${error.message}`, 'err');
  }
}

async function requestPermission() {
  // Must be called from a user gesture, which a click handler satisfies.
  const granted = await api.permissions.request({ origins: ORIGINS });
  if (!granted) return;
  hide('permission');
  await start();
}

async function start() {
  state.options = await loadOptions();
  bindOptionInputs();

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:\/\/([\w-]+\.)*youtube\.com\//.test(tab.url ?? '')) {
    show('idle');
    return;
  }
  state.tabId = tab.id;

  const status = await sendToTab({ type: 'ytcmd:status' });
  if (!status) {
    show('main');
    el('title').textContent = 'Reload the page';
    el('subtitle').textContent =
      'The add-on was not running when this tab loaded.';
    el('copy').disabled = true;
    return;
  }
  if (!status.ok) {
    show('idle');
    return;
  }

  state.videoId = status.videoId;
  state.tracks = status.tracks ?? [];
  state.tracksKnown = status.tracksKnown !== false;

  show('main');
  el('title').textContent = status.meta?.title ?? 'Untitled video';
  el('subtitle').textContent = [
    status.meta?.channel,
    trackSummary(state.tracks, state.tracksKnown),
  ]
    .filter(Boolean)
    .join(' · ');

  populateTracks(state.tracks, state.tracksKnown);
  el('copy').addEventListener('click', onCopy);
  for (const button of document.querySelectorAll('[data-action="download"]')) {
    button.addEventListener('click', () => onDownload(button.dataset.format));
  }

  // Only refuse up front when we positively know there are no captions. An
  // unreadable player response also yields an empty list, and treating that as
  // "no captions" would block a video that has them.
  if (state.tracks.length === 0 && state.tracksKnown) {
    setStatus('This video has no caption tracks.', 'err');
    el('copy').disabled = true;
  }
}

function trackSummary(tracks, tracksKnown) {
  if (tracks.length === 0) return tracksKnown ? 'No captions' : 'Captions unknown';
  return tracks.length === 1 ? '1 track' : `${tracks.length} tracks`;
}

function populateTracks(tracks, tracksKnown) {
  const select = el('track');
  select.innerHTML = '';
  if (tracks.length === 0) {
    const option = document.createElement('option');
    // The panel path does not need a track list, so an unknown list is still
    // worth an attempt. Say which case this is rather than implying failure.
    option.textContent = tracksKnown ? 'None available' : 'Default';
    select.appendChild(option);
    select.disabled = true;
    return;
  }
  tracks.forEach((track, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent =
      track.kind === 'asr' ? `${track.name} (auto)` : track.name;
    select.appendChild(option);
  });
  const preferred = tracks.findIndex(
    (t) => t.kind === 'manual' && t.lang?.startsWith('en')
  );
  select.value = String(preferred >= 0 ? preferred : 0);
}

async function extract() {
  const trackIndex = Number(el('track').value);
  setStatus('Reading captions', 'busy');

  const response = await sendToTab({
    type: 'ytcmd:extract',
    videoId: state.videoId,
    trackIndex: Number.isFinite(trackIndex) ? trackIndex : null,
  });

  if (!response) throw new Error('The page stopped responding. Reload it.');
  if (!response.ok) throw new Error(response.message ?? 'Extraction failed.');

  const transcript = buildTranscript(
    response.raw,
    {
      videoId: response.meta?.videoId ?? state.videoId,
      title: response.meta?.title,
      channel: response.meta?.channel,
      url: response.meta?.url,
      durationSec: response.meta?.durationSec,
      description: response.meta?.description,
      chapters: response.meta?.chapters,
      ...resolveLanguage(response),
      source: response.source,
      timingsSynthesized: response.timingsSynthesized,
      exported: today(),
    },
    response.format
  );

  if (transcript.cues.length === 0) {
    throw new Error('The caption track came back empty.');
  }

  state.lastResult = { transcript, source: response.source };
  updateSubtitleAvailability(transcript);
  updateLanguageWarning(response, transcript);
  el('diagnostic').textContent =
    `${transcript.cues.length} cues via ${sourceLabel(response.source)}` +
    (transcript.langName ? `, ${transcript.langName}` : '') +
    (transcript.chapters.length ? `, ${transcript.chapters.length} chapters` : '');

  return transcript;
}

/**
 * Decide what language the document should claim.
 *
 * Only the direct-fetch path honours an explicit choice, and it is token-gated
 * on most videos. When the panel answered, the language is whatever the panel
 * returned, so read it from the payload rather than asserting what was asked
 * for. Where it genuinely cannot be determined, say nothing: a missing language
 * line is better than a wrong one.
 */
function resolveLanguage(response) {
  const fromPanel =
    response.source === 'panel-network' || response.source === 'panel-dom';

  if (!fromPanel) {
    return {
      lang: response.track?.lang,
      langName: response.track?.name,
      kind: response.track?.kind,
    };
  }

  const detected =
    (response.source === 'panel-network'
      ? safeSelectedLanguage(response.raw)
      : null) ?? response.panelLanguage;

  if (detected) {
    // A display name, not a language code, and `kind` is left undefined so the
    // pipeline infers manual or auto from the punctuation it can see.
    return { lang: null, langName: detected, kind: undefined };
  }

  // A single-track video can only have returned that track.
  if ((response.tracks?.length ?? 0) <= 1) {
    return {
      lang: response.track?.lang,
      langName: response.track?.name,
      kind: response.track?.kind,
    };
  }

  return { lang: null, langName: null, kind: undefined };
}

function safeSelectedLanguage(raw) {
  try {
    return selectedTranscriptLanguage(raw);
  } catch {
    return null;
  }
}

function updateLanguageWarning(response, transcript) {
  const node = el('language-warning');
  if (!node) return;
  const requested = response.track?.name;
  const got = transcript.langName;

  if (response.languageHonoured === false && requested) {
    node.textContent = got
      ? `Could not switch to ${requested}. This transcript is ${got}.`
      : `Could not switch to ${requested}. This transcript is in whichever ` +
        `language the transcript panel offered.`;
    node.removeAttribute('hidden');
    return;
  }
  node.setAttribute('hidden', '');
}

function updateSubtitleAvailability(transcript) {
  const trustworthy = subtitlesAreTrustworthy(transcript);
  el('srt-button').disabled = !trustworthy;
  el('vtt-button').disabled = !trustworthy;
  el('subtitle-warning').toggleAttribute('hidden', trustworthy);
}

function sourceLabel(source) {
  return (
    {
      capture: 'captured player request',
      playerResponse: 'direct track fetch',
      'panel-network': 'transcript panel',
      'panel-dom': 'transcript panel (approximate timings)',
    }[source] ?? source
  );
}

async function onCopy() {
  await withBusy(async () => {
    const transcript = await extract();
    const markdown = render(transcript, 'md', state.options);
    await navigator.clipboard.writeText(markdown);
    setStatus('Markdown copied to the clipboard.', 'ok');
  });
}

async function onDownload(format) {
  await withBusy(async () => {
    const transcript = await extract();
    if ((format === 'srt' || format === 'vtt') && !subtitlesAreTrustworthy(transcript)) {
      throw new Error('Subtitle export is unavailable for approximate timings.');
    }
    const text = render(transcript, format, state.options);
    const filename = filenameFor(transcript, format, state.options);
    const mime =
      { md: 'text/markdown', txt: 'text/plain', srt: 'text/plain', vtt: 'text/vtt' }[
        format
      ] ?? 'text/plain';

    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    try {
      await api.downloads.download({ url, filename, saveAs: false });
      setStatus(`Saved ${filename}`, 'ok');
    } finally {
      // Give the download a moment to start before the blob is revoked.
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    }
  });
}

async function withBusy(work) {
  const buttons = Array.from(document.querySelectorAll('button'));
  const previouslyDisabled = new Set(buttons.filter((b) => b.disabled));
  for (const b of buttons) b.disabled = true;
  try {
    await work();
  } catch (error) {
    setStatus(error.message ?? String(error), 'err');
  } finally {
    for (const b of buttons) if (!previouslyDisabled.has(b)) b.disabled = false;
    if (state.lastResult) updateSubtitleAvailability(state.lastResult.transcript);
  }
}

function setStatus(message, kind) {
  const node = el('status');
  node.textContent = message;
  node.className = `status ${kind ?? ''}`.trim();
}

async function sendToTab(message) {
  try {
    return await api.tabs.sendMessage(state.tabId, message);
  } catch {
    return null;
  }
}

function bindOptionInputs() {
  const wire = (id, key, read) => {
    const node = el(id);
    if (!node) return;
    if (read === 'checked') node.checked = Boolean(state.options[key]);
    else node.value = String(state.options[key]);
    node.addEventListener('change', async () => {
      state.options[key] = read === 'checked' ? node.checked : coerce(node.value);
      await saveOptions(state.options);
    });
  };

  wire('timestamps', 'timestamps');
  wire('frontmatter', 'frontmatter');
  wire('wordBudget', 'wordBudget');
  wire('headings', 'headings', 'checked');
  wire('linkTimestamps', 'linkTimestamps', 'checked');
  wire('capitalize', 'capitalize', 'checked');
}

function coerce(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function loadOptions() {
  try {
    const stored = await api.storage.sync.get('options');
    return { ...DEFAULTS, ...(stored?.options ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveOptions(options) {
  try {
    await api.storage.sync.set({ options });
  } catch {
    /* storage failures should never block an export */
  }
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
