// Parser for YouTube's XML timedtext formats, srv1 and srv3.
//
// srv1: <transcript><text start="1.5" dur="2.0">hello</text></transcript>
// srv3: <timedtext><body><p t="1500" d="2000"><s t="0">hello</s></p></body></timedtext>
//
// Deliberately regex-based rather than DOMParser-based so this module stays
// pure and runs under node for tests. The input grammar is narrow enough that
// a real XML parser buys nothing.

import { cleanCueText } from '../html.js';
import { backfillEnds } from './json3.js';

export function parseTimedTextXml(input) {
  const xml = String(input ?? '');
  return /<\s*p[\s>]/i.test(xml) && /<\s*(?:timedtext|body)[\s>]/i.test(xml)
    ? parseSrv3(xml)
    : parseSrv1(xml);
}

function parseSrv1(xml) {
  const cues = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = attrMap(m[1]);
    const start = num(attrs.start);
    if (start === null) continue;
    const dur = num(attrs.dur);
    const text = cleanCueText(m[2]);
    if (!text) continue;
    cues.push({ start, end: dur === null ? null : start + dur, text });
  }
  return backfillEnds(cues);
}

function parseSrv3(xml) {
  const cues = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = attrMap(m[1]);
    const startMs = num(attrs.t);
    if (startMs === null) continue;
    const durMs = num(attrs.d);
    const start = startMs / 1000;

    const inner = m[2];
    const text = cleanCueText(inner.replace(/<s\b[^>]*>/gi, '').replace(/<\/s>/gi, ''));
    if (!text) continue;

    const words = [];
    const sre = /<s\b([^>]*)>([\s\S]*?)<\/s>/gi;
    let sm;
    while ((sm = sre.exec(inner)) !== null) {
      const sAttrs = attrMap(sm[1]);
      const offset = num(sAttrs.t) ?? 0;
      const w = cleanCueText(sm[2]);
      if (w) words.push({ t: start + offset / 1000, w });
    }

    cues.push({
      start,
      end: durMs === null ? null : start + durMs / 1000,
      text,
      ...(words.length > 1 ? { words } : {}),
    });
  }
  return backfillEnds(cues);
}

function attrMap(attrString) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrString)) !== null) out[m[1]] = m[2];
  return out;
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
