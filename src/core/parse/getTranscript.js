// Parser for the InnerTube get_transcript response, which is what YouTube's own
// "Show transcript" panel renders from.
//
// The renderer path YouTube uses has changed repeatedly, so rather than walking
// a fixed path this collects every transcriptSegmentRenderer and
// transcriptSectionHeaderRenderer node found anywhere in the tree. Depth is
// capped so a hostile or cyclic payload cannot hang the walk.
//
// Unlike a DOM scrape of the same panel, this carries endMs, so cue timings are
// real rather than synthesized.

import { cleanCueText } from '../html.js';
import { backfillEnds } from './json3.js';

const MAX_DEPTH = 40;

export function parseGetTranscript(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const segments = [];
  const headers = [];

  collect(data, 0, segments, headers);

  const cues = [];
  for (const s of segments) {
    const start = msToSec(s.startMs);
    if (start === null) continue;
    const end = msToSec(s.endMs);
    const text = cleanCueText(runsToText(s.snippet));
    if (!text) continue;
    cues.push({ start, end, text });
  }
  cues.sort((a, b) => a.start - b.start);

  const chapters = [];
  for (const h of headers) {
    const start = msToSec(h.startMs);
    const title = cleanCueText(runsToText(h.snippet ?? h.title));
    if (start === null || !title) continue;
    chapters.push({ start, title });
  }
  chapters.sort((a, b) => a.start - b.start);

  return { cues: backfillEnds(cues), chapters };
}

/** Language options offered by the panel footer, when present. */
export function parseTranscriptLanguages(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const found = [];
  walk(data, 0, (node) => {
    if (node?.sortFilterSubMenuRenderer?.subMenuItems) {
      for (const item of node.sortFilterSubMenuRenderer.subMenuItems) {
        const title = cleanCueText(item?.title ?? '');
        const params =
          item?.continuation?.reloadContinuationData?.continuation ??
          item?.serviceEndpoint?.getTranscriptEndpoint?.params ??
          null;
        if (title) found.push({ title, params, selected: Boolean(item?.selected) });
      }
    }
  });
  return found;
}

/**
 * The language the panel actually returned, read from the footer menu's
 * selected entry.
 *
 * This is authoritative. The language a user asks for and the language they get
 * are not always the same, because only the direct-fetch path honours an
 * explicit choice and that path is token-gated on most videos. The document
 * must report what it contains rather than what was requested.
 *
 * Returns null when the video offers one language and so renders no menu.
 */
export function selectedTranscriptLanguage(input) {
  const found = parseTranscriptLanguages(input).find((item) => item.selected);
  return found?.title ?? null;
}

function collect(node, depth, segments, headers) {
  walk(node, depth, (n) => {
    if (n.transcriptSegmentRenderer) segments.push(n.transcriptSegmentRenderer);
    if (n.transcriptSectionHeaderRenderer) headers.push(n.transcriptSectionHeaderRenderer);
  });
}

function walk(node, depth, visit) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth + 1, visit);
    return;
  }
  visit(node);
  for (const key of Object.keys(node)) walk(node[key], depth + 1, visit);
}

function runsToText(snippet) {
  if (!snippet) return '';
  if (typeof snippet === 'string') return snippet;
  if (typeof snippet.simpleText === 'string') return snippet.simpleText;
  if (Array.isArray(snippet.runs)) return snippet.runs.map((r) => r?.text ?? '').join('');
  return '';
}

function msToSec(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1000 : null;
}
