// SubRip and WebVTT rendering.
//
// Both formats require strictly ordered, non-overlapping cues, but roll-up
// caption sources routinely overlap. Ends are clamped to the next cue's start
// and zero-length cues are given a floor, so the output is always playable.

import { formatSubtitleTime } from '../time.js';

const MIN_DURATION = 0.2;

export function normalizeForSubtitles(cues, { minDuration = MIN_DURATION } = {}) {
  const ordered = [...cues].sort((a, b) => a.start - b.start);
  const out = [];

  for (let i = 0; i < ordered.length; i++) {
    const cue = ordered[i];
    const next = ordered[i + 1];
    let start = Math.max(0, cue.start);
    let end = cue.end ?? start + minDuration;

    if (next && end > next.start) end = next.start;
    if (end <= start) end = start + minDuration;
    if (next && end > next.start) {
      // Cues genuinely collide; give this one whatever room exists.
      end = Math.max(start + 0.001, next.start);
    }

    out.push({ start, end, text: cue.text });
  }

  return out;
}

export function renderSrt(cues) {
  const normalized = normalizeForSubtitles(cues);
  const blocks = normalized.map((cue, i) => {
    const from = formatSubtitleTime(cue.start, ',');
    const to = formatSubtitleTime(cue.end, ',');
    return `${i + 1}\n${from} --> ${to}\n${cue.text}`;
  });
  return blocks.join('\n\n') + '\n';
}

export function renderVtt(cues) {
  const normalized = normalizeForSubtitles(cues);
  const blocks = normalized.map((cue) => {
    const from = formatSubtitleTime(cue.start, '.');
    const to = formatSubtitleTime(cue.end, '.');
    return `${from} --> ${to}\n${cue.text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** Plain text, one paragraph per blank-line-separated block. */
export function renderPlainText(paragraphs) {
  return paragraphs.map((p) => p.text).join('\n\n') + '\n';
}
