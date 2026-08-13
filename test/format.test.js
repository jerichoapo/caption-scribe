import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, yamlScalar } from '../src/core/format/markdown.js';
import {
  renderSrt,
  renderVtt,
  renderPlainText,
  normalizeForSubtitles,
} from '../src/core/format/subtitles.js';

const transcript = {
  videoId: 'abc123',
  title: 'How Captions Work',
  channel: 'Some Channel',
  url: 'https://www.youtube.com/watch?v=abc123',
  durationSec: 754,
  lang: 'en',
  langName: 'English',
  kind: 'asr',
  source: 'capture',
  exported: '2026-08-13',
  timingsSynthesized: false,
  chapters: [],
};

const paragraphs = [
  { start: 0, end: 8, text: 'first paragraph of the transcript' },
  { start: 107, end: 120, text: 'second paragraph of the transcript' },
];

test('markdown renders frontmatter, title, and linked timestamps', () => {
  const md = renderMarkdown(transcript, paragraphs);
  assert.ok(md.startsWith('---\n'));
  // A title with no YAML-significant characters needs no quoting.
  assert.match(md, /^title: How Captions Work$/m);
  assert.match(md, /caption_type: auto-generated/);
  assert.match(md, /^# How Captions Work$/m);
  assert.match(md, /\[0:00\]\(https:\/\/youtu\.be\/abc123\?t=0\)/);
  assert.match(md, /\[1:47\]\(https:\/\/youtu\.be\/abc123\?t=107\)/);
  assert.ok(md.endsWith('\n'));
});

test('markdown timestamp modes behave differently', () => {
  const none = renderMarkdown(transcript, paragraphs, { timestamps: 'none' });
  assert.ok(!none.includes('youtu.be/abc123?t='));

  const plain = renderMarkdown(transcript, paragraphs, { linkTimestamps: false });
  assert.match(plain, /\[0:00\]/);
  assert.ok(!plain.includes('](https://youtu.be'));

  const interval = renderMarkdown(transcript, paragraphs, {
    timestamps: 'interval',
    intervalMinutes: 5,
  });
  // Both paragraphs sit inside the first five minutes except the second, which
  // is at 1:47, so only the opening stamp should appear.
  assert.equal((interval.match(/\[\d+:\d\d\]/g) ?? []).length, 1);
});

test('markdown frontmatter modes', () => {
  const minimal = renderMarkdown(transcript, paragraphs, { frontmatter: 'minimal' });
  assert.match(minimal, /title:/);
  assert.ok(!minimal.includes('channel:'));

  const none = renderMarkdown(transcript, paragraphs, { frontmatter: 'none' });
  assert.ok(!none.startsWith('---'));
});

test('markdown emits chapter headings when chapters exist', () => {
  const withChapters = {
    ...transcript,
    chapters: [{ start: 100, title: 'The second part' }],
  };
  const md = renderMarkdown(withChapters, paragraphs);
  assert.match(md, /^## The second part$/m);
});

test('markdown flags approximate timings in frontmatter', () => {
  const md = renderMarkdown({ ...transcript, timingsSynthesized: true }, paragraphs);
  assert.match(md, /timings: approximate/);
});

test('yamlScalar quotes anything ambiguous', () => {
  assert.equal(yamlScalar('plain text'), 'plain text');
  assert.equal(yamlScalar('has: colon'), '"has: colon"');
  assert.equal(yamlScalar('true'), '"true"');
  assert.equal(yamlScalar('123'), '"123"');
  assert.equal(yamlScalar('- leading dash'), '"- leading dash"');
  assert.equal(yamlScalar('say "hi"'), '"say \\"hi\\""');
  assert.equal(yamlScalar(''), '""');
});

test('subtitle normalization clamps overlapping cues', () => {
  const out = normalizeForSubtitles([
    { start: 0, end: 5, text: 'a' },
    { start: 2, end: 7, text: 'b' },
    { start: 6, end: 8, text: 'c' },
  ]);
  assert.equal(out[0].end, 2);
  assert.equal(out[1].end, 6);
  assert.ok(out.every((c) => c.end > c.start));
});

test('subtitle normalization gives zero-length cues a floor', () => {
  const out = normalizeForSubtitles([{ start: 3, end: 3, text: 'x' }]);
  assert.ok(out[0].end > out[0].start);
});

test('srt output is numbered and comma-separated', () => {
  const srt = renderSrt([
    { start: 0, end: 2.5, text: 'first' },
    { start: 2.5, end: 5, text: 'second' },
  ]);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nfirst$/m);
  assert.match(srt, /^2\n00:00:02,500 --> 00:00:05,000\nsecond$/m);
});

test('vtt output carries the header and period separator', () => {
  const vtt = renderVtt([{ start: 0, end: 2.5, text: 'first' }]);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.match(vtt, /00:00:00\.000 --> 00:00:02\.500/);
});

test('plain text output is paragraphs separated by blank lines', () => {
  const txt = renderPlainText(paragraphs);
  assert.equal(txt, 'first paragraph of the transcript\n\nsecond paragraph of the transcript\n');
});
