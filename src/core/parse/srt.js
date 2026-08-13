// SubRip (.srt) parser. Tolerant of a missing sequence number and of both
// comma and period as the millisecond separator.

import { cleanCueText } from '../html.js';
import { parseSubtitleTime } from '../time.js';
import { backfillEnds } from './json3.js';

export function parseSrt(input) {
  const text = String(input ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;

    let idx = 0;
    if (/^\d+$/.test(lines[0].trim()) && lines.length > 1) idx = 1;

    const timingLine = lines[idx];
    if (!timingLine || !timingLine.includes('-->')) continue;
    const [leftRaw, rightRaw] = timingLine.split('-->');
    const start = parseSubtitleTime(leftRaw);
    const end = parseSubtitleTime((rightRaw ?? '').trim().split(/\s+/)[0]);
    if (start === null) continue;

    const body = cleanCueText(lines.slice(idx + 1).join(' '));
    if (!body) continue;
    cues.push({ start, end, text: body });
  }

  return backfillEnds(cues);
}
