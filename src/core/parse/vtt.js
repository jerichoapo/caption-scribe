// WebVTT parser. Handles the cue-settings suffix and YouTube's inline karaoke
// timing tags, which are stripped by cleanCueText.

import { cleanCueText } from '../html.js';
import { parseSubtitleTime } from '../time.js';
import { backfillEnds } from './json3.js';

const ARROW = /-->/;

export function parseVtt(input) {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  const cues = [];
  let i = 0;

  // Skip the WEBVTT header and any header metadata block.
  if (lines[0]?.startsWith('WEBVTT')) {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '') i++;
  }

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    // NOTE and STYLE blocks run until a blank line.
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[i])) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // An optional cue identifier sits on the line before the timing line.
    let timingLine = lines[i];
    if (!ARROW.test(timingLine)) {
      if (i + 1 < lines.length && ARROW.test(lines[i + 1])) {
        i++;
        timingLine = lines[i];
      } else {
        i++;
        continue;
      }
    }

    const timing = parseTimingLine(timingLine);
    i++;
    if (!timing) continue;

    const body = [];
    while (i < lines.length && lines[i].trim() !== '') {
      body.push(lines[i]);
      i++;
    }

    const text = cleanCueText(body.join(' '));
    if (text) cues.push({ start: timing.start, end: timing.end, text });
  }

  return backfillEnds(cues);
}

function parseTimingLine(line) {
  const [left, rightRaw] = String(line).split(ARROW);
  if (rightRaw === undefined) return null;
  const start = parseSubtitleTime(left);
  // Strip cue settings such as "align:start position:0%".
  const right = rightRaw.trim().split(/\s+/)[0];
  const end = parseSubtitleTime(right);
  if (start === null) return null;
  return { start, end };
}
