// The pipeline: raw caption payload in, rendered document out.
//
// Everything above this line is browser-free, so the whole path from bytes to
// Markdown is exercised by the node test suite.

import { parseJson3, backfillEnds } from './parse/json3.js';
import { cleanCueText } from './html.js';
import { parseTimedTextXml } from './parse/timedtextXml.js';
import { parseVtt } from './parse/vtt.js';
import { parseSrt } from './parse/srt.js';
import { parseGetTranscript } from './parse/getTranscript.js';
import { dedupeCues, mergeIntoParagraphs, isPunctuated } from './cues.js';
import { normalizeChapters, parseChaptersFromDescription } from './chapters.js';
import { renderMarkdown, DEFAULT_MARKDOWN_OPTIONS } from './format/markdown.js';
import { renderSrt, renderVtt, renderPlainText } from './format/subtitles.js';
import { buildFilename } from './filename.js';

export const DEFAULT_OPTIONS = {
  ...DEFAULT_MARKDOWN_OPTIONS,
  gapThreshold: 2,
  wordBudget: 100,
  filenamePattern: '{date}-{slug}',
};

/** Sniff which caption format a raw payload is. */
export function detectFormat(raw) {
  const text = typeof raw === 'string' ? raw.trimStart() : '';
  if (typeof raw === 'object' && raw !== null) {
    if (raw.__ytcmdCues) return 'scrapedCues';
    return raw.events ? 'json3' : 'getTranscript';
  }
  if (text.startsWith('WEBVTT')) return 'vtt';
  if (text.startsWith('{')) {
    const head = text.slice(0, 400);
    if (/"__ytcmdCues"\s*:/.test(head)) return 'scrapedCues';
    return /"events"\s*:/.test(head) ? 'json3' : 'getTranscript';
  }
  if (text.startsWith('<')) return 'timedtextXml';
  if (/^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) return 'srt';
  if (/-->/.test(text)) return 'srt';
  throw new Error('Unrecognized caption format');
}

/** Parse a raw payload into { cues, chapters }. */
export function parseCaptions(raw, format = null) {
  const kind = format ?? detectFormat(raw);
  switch (kind) {
    case 'json3':
      return { cues: parseJson3(raw), chapters: [], format: kind };
    case 'timedtextXml':
      return { cues: parseTimedTextXml(raw), chapters: [], format: kind };
    case 'vtt':
      return { cues: parseVtt(raw), chapters: [], format: kind };
    case 'srt':
      return { cues: parseSrt(raw), chapters: [], format: kind };
    case 'getTranscript': {
      const { cues, chapters } = parseGetTranscript(raw);
      return { cues, chapters, format: kind };
    }
    case 'scrapedCues': {
      // Cues read straight off the rendered transcript panel. Already in the
      // cue shape, so this only needs validating and cleaning.
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const cues = (data.__ytcmdCues ?? [])
        .filter((c) => Number.isFinite(c?.start) && String(c?.text ?? '').trim())
        .map((c) => ({
          start: c.start,
          end: Number.isFinite(c.end) ? c.end : null,
          text: cleanCueText(c.text),
        }))
        .filter((c) => c.text);
      return { cues: backfillEnds(cues), chapters: [], format: kind };
    }
    default:
      throw new Error(`Unsupported caption format: ${kind}`);
  }
}

/**
 * Build a transcript object from a raw payload plus page metadata.
 * `meta` carries videoId, title, channel, url, durationSec, lang, langName,
 * kind, source, description, chapters, timingsSynthesized, exported.
 */
export function buildTranscript(raw, meta = {}, format = null) {
  const parsed = parseCaptions(raw, format);
  const cues = dedupeCues(parsed.cues);

  let chapters = normalizeChapters(meta.chapters);
  if (chapters.length === 0 && parsed.chapters?.length) {
    chapters = normalizeChapters(parsed.chapters);
  }
  if (chapters.length === 0 && meta.description) {
    chapters = parseChaptersFromDescription(meta.description);
  }

  return {
    videoId: meta.videoId ?? null,
    title: meta.title ?? null,
    channel: meta.channel ?? null,
    url:
      meta.url ??
      (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : null),
    durationSec: meta.durationSec ?? null,
    lang: meta.lang ?? null,
    langName: meta.langName ?? null,
    kind: meta.kind ?? (isPunctuated(cues) ? 'manual' : 'asr'),
    source: meta.source ?? null,
    timingsSynthesized: Boolean(meta.timingsSynthesized),
    exported: meta.exported ?? null,
    sourceFormat: parsed.format,
    chapters,
    cues,
  };
}

/** Render a transcript in the requested output format. */
export function render(transcript, format, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const paragraphs = mergeIntoParagraphs(transcript.cues, {
    gapThreshold: opts.gapThreshold,
    wordBudget: opts.wordBudget,
  });

  switch (format) {
    case 'md':
      return renderMarkdown(transcript, paragraphs, opts);
    case 'txt':
      return renderPlainText(paragraphs);
    case 'srt':
      return renderSrt(transcript.cues);
    case 'vtt':
      return renderVtt(transcript.cues);
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }
}

/** Filename for a rendered transcript. */
export function filenameFor(transcript, format, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return buildFilename(
    opts.filenamePattern,
    {
      date: transcript.exported ?? '',
      title: transcript.title ?? 'transcript',
      videoId: transcript.videoId ?? '',
      lang: transcript.lang ?? '',
      channel: transcript.channel ?? '',
    },
    format
  );
}

/** True when subtitle export would produce invented timings. */
export function subtitlesAreTrustworthy(transcript) {
  return !transcript.timingsSynthesized;
}
