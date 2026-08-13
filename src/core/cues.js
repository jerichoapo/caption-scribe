// The cue model and the reflow that turns fragmentary caption cues into
// readable prose. This is the part that separates a useful export from a dump.

/**
 * Remove roll-up duplication.
 *
 * Auto-caption tracks repeat text across overlapping cues to animate the
 * scrolling effect, so the naive parse shows every line two or three times.
 * The reliable signal is temporal: a cue that starts before the previous cue
 * has ended is a roll-up repaint, not new speech. Only those pairs get their
 * shared word prefix stripped, so genuine repetition in non-overlapping cues
 * survives untouched.
 */
export function dedupeCues(cues, { maxOverlapWords = 60, epsilon = 0.05 } = {}) {
  const out = [];

  for (const cue of cues) {
    const text = (cue.text ?? '').trim();
    if (!text) continue;
    const current = { ...cue, text };
    const last = out[out.length - 1];

    // Both forms of deduplication are gated on genuine temporal overlap.
    // Without that gate, a speaker who repeats a phrase after a pause loses it.
    if (last && current.start < last.end - epsilon) {
      // Exact repeat: absorb it into the previous cue's span.
      if (norm(last.text) === norm(current.text)) {
        last.end = maxEnd(last.end, current.end);
        continue;
      }

      const trimmed = stripSharedPrefix(last.text, current.text, maxOverlapWords);
      if (trimmed === null) {
        // The whole cue was already emitted.
        last.end = maxEnd(last.end, current.end);
        continue;
      }
      current.text = trimmed;
    }

    out.push(current);
  }

  return out;
}

/**
 * If `next` begins with the same words `prev` ends with, return `next` minus
 * that prefix. Returns null when `next` is entirely contained in `prev`.
 */
function stripSharedPrefix(prev, next, maxOverlapWords) {
  const prevWords = prev.split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const limit = Math.min(prevWords.length, nextWords.length, maxOverlapWords);

  for (let k = limit; k >= 1; k--) {
    const tail = prevWords.slice(prevWords.length - k).map(norm).join(' ');
    const head = nextWords.slice(0, k).map(norm).join(' ');
    if (tail === head) {
      const rest = nextWords.slice(k).join(' ').trim();
      return rest === '' ? null : rest;
    }
  }
  return next;
}

function norm(word) {
  return String(word)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function maxEnd(a, b) {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;
  return Math.max(a, b);
}

/**
 * Does this transcript carry real punctuation?
 *
 * Manual captions average one sentence end every 10 to 25 words. Auto-captions
 * have essentially none, and the few that slip through stay far below the
 * threshold. The answer decides whether reflow may break on sentences.
 */
export function isPunctuated(cues) {
  const text = cues.map((c) => c.text).join(' ');
  if (!text.trim()) return false;
  const words = text.split(/\s+/).filter(Boolean).length;
  const enders = (text.match(/[.!?]["')\]]?(?=\s|$)/g) ?? []).length;
  return enders >= 2 && words > 0 && enders / words >= 0.01;
}

const SENTENCE_END = /[.!?]["')\]]?$/;

/**
 * Merge cues into paragraphs.
 *
 * A pause longer than `gapThreshold` always ends a paragraph. Beyond that,
 * punctuated transcripts wait for a sentence boundary once past the word
 * budget, and unpunctuated ones break on the budget alone. `maxWords` is the
 * backstop for a speaker who never pauses.
 */
export function mergeIntoParagraphs(cues, options = {}) {
  const {
    gapThreshold = 2,
    wordBudget = 100,
    maxWords = 220,
    minWords = 12,
    punctuated = null,
  } = options;

  const usePunctuation = punctuated === null ? isPunctuated(cues) : punctuated;
  const paragraphs = [];
  let buffer = [];
  let words = 0;
  let prevEnd = null;

  const flush = () => {
    if (buffer.length === 0) return;
    paragraphs.push({
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end ?? buffer[buffer.length - 1].start,
      text: joinCueTexts(buffer),
    });
    buffer = [];
    words = 0;
  };

  for (const cue of cues) {
    if (buffer.length > 0) {
      const gap = prevEnd === null ? 0 : cue.start - prevEnd;
      const currentText = joinCueTexts(buffer);
      const atSentenceEnd = SENTENCE_END.test(currentText);

      const pauseBreak = gap >= gapThreshold && words >= minWords;
      const budgetBreak =
        words >= wordBudget && (!usePunctuation || atSentenceEnd);
      const overflowBreak = words >= maxWords;

      if (pauseBreak || budgetBreak || overflowBreak) flush();
    }

    buffer.push(cue);
    words += cue.text.split(/\s+/).filter(Boolean).length;
    prevEnd = cue.end ?? cue.start;
  }
  flush();

  return paragraphs;
}

function joinCueTexts(cues) {
  let out = '';
  for (const cue of cues) {
    const piece = cue.text.trim();
    if (!piece) continue;
    if (out === '') {
      out = piece;
    } else if (/[-–—]$/.test(out)) {
      out += piece;
    } else {
      out += ' ' + piece;
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Capitalize the first letter of each paragraph. Opt-in, off by default. */
export function capitalizeParagraphs(paragraphs) {
  return paragraphs.map((p) => ({
    ...p,
    text: p.text.replace(/^(\p{Ll})/u, (c) => c.toUpperCase()),
  }));
}

/** Total spoken duration covered by the cues, in seconds. */
export function cueSpan(cues) {
  if (cues.length === 0) return 0;
  const last = cues[cues.length - 1];
  return (last.end ?? last.start) - cues[0].start;
}
