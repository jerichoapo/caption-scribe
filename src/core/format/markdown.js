// Markdown rendering.

import { formatClock } from '../time.js';
import { groupByChapters } from '../chapters.js';
import { capitalizeParagraphs } from '../cues.js';

export const DEFAULT_MARKDOWN_OPTIONS = {
  frontmatter: 'full', // 'full' | 'minimal' | 'none'
  timestamps: 'paragraph', // 'none' | 'paragraph' | 'interval'
  intervalMinutes: 5,
  linkTimestamps: true,
  headings: true,
  capitalize: false,
  includeTitleHeading: true,
};

export function renderMarkdown(transcript, paragraphs, options = {}) {
  const opts = { ...DEFAULT_MARKDOWN_OPTIONS, ...options };
  const body = opts.capitalize ? capitalizeParagraphs(paragraphs) : paragraphs;
  const parts = [];

  const front = renderFrontmatter(transcript, opts);
  if (front) parts.push(front);

  if (opts.includeTitleHeading && transcript.title) {
    parts.push(`# ${escapeHeading(transcript.title)}`);
  }

  const chapters = opts.headings ? transcript.chapters ?? [] : [];
  const sections = groupByChapters(body, chapters);

  let nextInterval = 0;
  for (const section of sections) {
    if (section.title) parts.push(`## ${escapeHeading(section.title)}`);
    for (const paragraph of section.paragraphs) {
      let prefix = '';
      if (opts.timestamps === 'paragraph') {
        prefix = stamp(paragraph.start, transcript, opts) + ' ';
      } else if (opts.timestamps === 'interval') {
        const boundary = nextInterval * opts.intervalMinutes * 60;
        if (paragraph.start >= boundary) {
          prefix = stamp(paragraph.start, transcript, opts) + ' ';
          nextInterval = Math.floor(paragraph.start / (opts.intervalMinutes * 60)) + 1;
        }
      }
      parts.push(prefix + paragraph.text);
    }
  }

  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function stamp(seconds, transcript, opts) {
  const label = formatClock(seconds);
  if (!opts.linkTimestamps || !transcript.videoId) return `[${label}]`;
  const t = Math.floor(seconds);
  return `[${label}](https://youtu.be/${transcript.videoId}?t=${t})`;
}

function renderFrontmatter(transcript, opts) {
  if (opts.frontmatter === 'none') return '';

  const rows = [
    ['title', transcript.title],
    ['url', transcript.url],
  ];

  if (opts.frontmatter === 'full') {
    rows.push(
      ['channel', transcript.channel],
      ['video_id', transcript.videoId],
      ['duration', transcript.durationSec ? formatClock(transcript.durationSec) : null],
      ['language', transcript.langName || transcript.lang],
      ['caption_type', transcript.kind === 'asr' ? 'auto-generated' : 'manual'],
      ['source', transcript.source],
      ['exported', transcript.exported]
    );
    if (transcript.timingsSynthesized) rows.push(['timings', 'approximate']);
  }

  const lines = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`);

  return lines.length ? `---\n${lines.join('\n')}\n---` : '';
}

/**
 * Quote a YAML scalar. Anything that could be read as a number, boolean, null,
 * or that carries YAML-significant punctuation gets double-quoted.
 */
export function yamlScalar(value) {
  const text = String(value);
  const needsQuote =
    text === '' ||
    /^[\s>|*&!%@`#-]/.test(text) ||
    /[:#\[\]{},"']/.test(text) ||
    /[\n\r\t]/.test(text) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(text) ||
    /^-?\d/.test(text) ||
    /\s$/.test(text);
  if (!needsQuote) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

function escapeHeading(text) {
  return String(text).replace(/\s*\n\s*/g, ' ').trim();
}
