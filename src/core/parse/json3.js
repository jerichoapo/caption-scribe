// Parser for YouTube's json3 timedtext format.
//
// Shape:
//   { events: [ { tStartMs, dDurationMs, aAppend?, wWinId?, segs: [{ utf8, tOffsetMs? }] } ] }
//
// Two structural quirks matter. Events carrying `aAppend: 1` are roll-up
// continuations that re-render text already emitted, and window-definition
// events carry no `segs` at all. Both must be dropped before anything else.

import { cleanCueText, decodeEntities } from '../html.js';

export function parseJson3(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const events = Array.isArray(data?.events) ? data.events : [];
  const cues = [];

  for (const ev of events) {
    if (ev?.aAppend === 1) continue; // roll-up continuation
    if (!Array.isArray(ev?.segs) || ev.segs.length === 0) continue; // window def

    const raw = ev.segs.map((s) => s?.utf8 ?? '').join('');
    const text = cleanCueText(raw);
    if (!text) continue;

    const start = msToSec(ev.tStartMs);
    if (start === null) continue;
    const dur = msToSec(ev.dDurationMs);
    const end = dur === null ? null : start + dur;

    const words = [];
    for (const seg of ev.segs) {
      const w = decodeEntities(seg?.utf8 ?? '').trim();
      if (!w) continue;
      const offset = msToSec(seg?.tOffsetMs) ?? 0;
      words.push({ t: start + offset, w });
    }

    cues.push({ start, end, text, ...(words.length > 1 ? { words } : {}) });
  }

  return backfillEnds(cues);
}

function msToSec(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1000 : null;
}

/** Give any cue without a duration an end equal to the next cue's start. */
export function backfillEnds(cues, tailPadding = 2) {
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end !== null && cues[i].end !== undefined) continue;
    const next = cues[i + 1];
    cues[i].end = next ? next.start : cues[i].start + tailPadding;
  }
  return cues;
}
