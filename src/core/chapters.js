// Chapter discovery and paragraph grouping.
//
// Chapters come from one of two places: the macro-marker renderer YouTube
// builds its chapter list from, or timestamp lines in the description. The
// description fallback only fires when it finds a plausible run of increasing
// timestamps, so a description that merely mentions a time is not mistaken for
// a chapter list.

import { parseClock } from './time.js';

const LINE = /^\s*[([]?\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*[)\]]?\s*[-–—:.|]?\s*(.+?)\s*$/;
const TRAILING = /^\s*(.+?)\s+[([]?\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*[)\]]?\s*$/;

export function parseChaptersFromDescription(description) {
  const lines = String(description ?? '').split(/\r?\n/);
  const found = [];

  for (const line of lines) {
    let m = line.match(LINE);
    let stamp;
    let title;
    if (m) {
      stamp = m[1];
      title = m[2];
    } else {
      m = line.match(TRAILING);
      if (!m) continue;
      title = m[1];
      stamp = m[2];
    }

    const start = parseClock(stamp);
    if (start === null) continue;
    const clean = title.replace(/^[-–—:|.\s]+/, '').trim();
    if (!clean || clean.length > 120) continue;
    found.push({ start, title: clean });
  }

  if (found.length < 2) return [];

  // Keep only a strictly increasing run, which is what a real chapter list is.
  const ordered = [];
  for (const item of found) {
    if (ordered.length === 0 || item.start > ordered[ordered.length - 1].start) {
      ordered.push(item);
    }
  }
  if (ordered.length < 2) return [];
  return ordered;
}

/** Normalize the macro-marker chapter shape YouTube uses in ytInitialData. */
export function normalizeChapters(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const start = Number(item?.start);
    const title = String(item?.title ?? '').trim();
    if (!Number.isFinite(start) || !title) continue;
    out.push({ start, title });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Group paragraphs under chapter headings. A paragraph belongs to the last
 * chapter that starts at or before it. Content before the first chapter is
 * returned in a leading section with a null title.
 */
export function groupByChapters(paragraphs, chapters) {
  if (!chapters || chapters.length === 0) {
    return [{ title: null, start: paragraphs[0]?.start ?? 0, paragraphs }];
  }

  const sections = [];
  let current = { title: null, start: paragraphs[0]?.start ?? 0, paragraphs: [] };
  let index = 0;

  for (const paragraph of paragraphs) {
    while (index < chapters.length && chapters[index].start <= paragraph.start) {
      if (current.paragraphs.length > 0) sections.push(current);
      current = {
        title: chapters[index].title,
        start: chapters[index].start,
        paragraphs: [],
      };
      index++;
    }
    current.paragraphs.push(paragraph);
  }
  if (current.paragraphs.length > 0) sections.push(current);

  return sections.length > 0
    ? sections
    : [{ title: null, start: 0, paragraphs }];
}
