import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFormat,
  parseCaptions,
  buildTranscript,
  render,
  filenameFor,
  subtitlesAreTrustworthy,
} from '../src/core/pipeline.js';
import { fixture } from './helpers.js';

test('detectFormat recognises every supported payload', () => {
  assert.equal(detectFormat(fixture('asr-rollup.json3.json')), 'json3');
  assert.equal(detectFormat(fixture('get_transcript.json')), 'getTranscript');
  assert.equal(detectFormat(fixture('sample.srv1.xml')), 'timedtextXml');
  assert.equal(detectFormat(fixture('sample.srv3.xml')), 'timedtextXml');
  assert.equal(detectFormat(fixture('sample.vtt')), 'vtt');
  assert.equal(detectFormat(fixture('sample.srt')), 'srt');
  assert.throws(() => detectFormat('not a caption file'), /Unrecognized/);
});

test('detectFormat handles an already-parsed object', () => {
  assert.equal(detectFormat({ events: [] }), 'json3');
  assert.equal(detectFormat({ actions: [] }), 'getTranscript');
});

test('parseCaptions routes to the right parser', () => {
  const { cues, format } = parseCaptions(fixture('sample.vtt'));
  assert.equal(format, 'vtt');
  assert.equal(cues.length, 3);
});

test('end to end: auto-captions become clean Markdown', () => {
  const transcript = buildTranscript(fixture('asr-rollup.json3.json'), {
    videoId: 'abc123',
    title: 'A Test Video',
    channel: 'Test Channel',
    durationSec: 18,
    lang: 'en',
    langName: 'English',
    kind: 'asr',
    source: 'capture',
    exported: '2026-08-13',
  });

  assert.equal(transcript.cues.length, 7);
  assert.equal(transcript.sourceFormat, 'json3');

  const md = render(transcript, 'md');
  assert.match(md, /^# A Test Video$/m);
  assert.match(md, /caption_type: auto-generated/);
  // Two paragraphs, split by the long pause in the fixture.
  const body = md.split('---')[2];
  const paragraphs = body
    .split('\n\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  assert.equal(paragraphs.length, 2);
  // The roll-up phrase survives exactly once in the final document.
  assert.equal(md.split('welcome back to the channel').length - 1, 1);
});

test('end to end: manual captions keep their sentences', () => {
  const transcript = buildTranscript(fixture('manual-punctuated.json3.json'), {
    videoId: 'xyz789',
    title: 'Punctuated Talk',
    exported: '2026-08-13',
  });
  assert.equal(transcript.kind, 'manual');
  const md = render(transcript, 'md');
  assert.match(md, /caption_type: manual/);
  assert.match(md, /Good morning, and thanks for joining\./);
  // The decoded ampersand must reach the output.
  assert.match(md, /answer & a long one/);
});

test('end to end: chapters from the panel payload become headings', () => {
  const transcript = buildTranscript(fixture('get_transcript.json'), {
    videoId: 'abc123',
    title: 'Panel Sourced',
    source: 'panel',
    exported: '2026-08-13',
  });
  assert.equal(transcript.chapters.length, 2);
  const md = render(transcript, 'md');
  assert.match(md, /^## Opening$/m);
  assert.match(md, /^## The middle part$/m);
});

test('description chapters are used when nothing better exists', () => {
  const transcript = buildTranscript(fixture('manual-punctuated.json3.json'), {
    videoId: 'xyz789',
    title: 'With Description Chapters',
    description: '0:00 Start here\n0:20 Second half',
    exported: '2026-08-13',
  });
  assert.equal(transcript.chapters.length, 2);
  const md = render(transcript, 'md');
  assert.match(md, /^## Second half$/m);
});

test('srt and vtt render from the same transcript', () => {
  const transcript = buildTranscript(fixture('sample.srt'), {
    videoId: 'abc123',
    title: 'Subtitle Round Trip',
    exported: '2026-08-13',
  });
  const srt = render(transcript, 'srt');
  const vtt = render(transcript, 'vtt');
  assert.match(srt, /^1$/m);
  assert.ok(vtt.startsWith('WEBVTT'));
  assert.equal(subtitlesAreTrustworthy(transcript), true);
});

test('synthesized timings mark subtitles untrustworthy', () => {
  const transcript = buildTranscript(fixture('sample.srt'), {
    videoId: 'abc123',
    title: 'Panel Scrape',
    timingsSynthesized: true,
    exported: '2026-08-13',
  });
  assert.equal(subtitlesAreTrustworthy(transcript), false);
});

test('filenameFor produces a safe, dated name per format', () => {
  const transcript = buildTranscript(fixture('sample.srt'), {
    videoId: 'abc123',
    title: 'Title: With / Illegal \\ Characters',
    lang: 'en',
    exported: '2026-08-13',
  });
  const md = filenameFor(transcript, 'md');
  assert.equal(md, '2026-08-13-title-with-illegal-characters.md');
  assert.equal(filenameFor(transcript, 'srt').endsWith('.srt'), true);
  assert.ok(!/[<>:"/\\|?*]/.test(md));
});

test('scraped panel cues parse and are marked approximate', () => {
  const scraped = JSON.stringify({
    __ytcmdCues: [
      { start: 0, end: null, text: 'read from the rendered panel' },
      { start: 4, end: null, text: 'second row &amp; an entity' },
      { start: 9, end: null, text: '' },
      { start: null, end: null, text: 'dropped, no start' },
    ],
  });
  assert.equal(detectFormat(scraped), 'scrapedCues');

  const transcript = buildTranscript(scraped, {
    videoId: 'abc123',
    title: 'Panel Scrape',
    source: 'panel-dom',
    timingsSynthesized: true,
    exported: '2026-08-13',
  });

  // Blank text and a missing start are both dropped.
  assert.equal(transcript.cues.length, 2);
  // Ends are backfilled from the following cue's start.
  assert.equal(transcript.cues[0].end, 4);
  assert.equal(transcript.cues[1].text, 'second row & an entity');
  assert.equal(subtitlesAreTrustworthy(transcript), false);

  const md = render(transcript, 'md');
  assert.match(md, /timings: approximate/);
});

test('an empty caption payload produces an empty transcript, not a crash', () => {
  const transcript = buildTranscript('{"events":[]}', {
    videoId: 'abc123',
    title: 'No Cues',
    exported: '2026-08-13',
  });
  assert.equal(transcript.cues.length, 0);
  const md = render(transcript, 'md');
  assert.match(md, /^# No Cues$/m);
});

test('a very long transcript reflows without hanging', () => {
  const events = [];
  for (let i = 0; i < 20000; i++) {
    events.push({
      tStartMs: i * 1500,
      dDurationMs: 1500,
      segs: [{ utf8: `chunk number ${i} of continuous speech` }],
    });
  }
  const started = process.hrtime.bigint();
  const transcript = buildTranscript(
    { events },
    { videoId: 'long', title: 'Three Hour Video', exported: '2026-08-13' }
  );
  const md = render(transcript, 'md');
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(transcript.cues.length, 20000);
  assert.ok(md.length > 100000);
  assert.ok(elapsedMs < 15000, `reflow took ${elapsedMs.toFixed(0)}ms`);
});

test('non-Latin and RTL text survives the whole pipeline', () => {
  const transcript = buildTranscript(
    {
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'こんにちは世界' }] },
        { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'مرحبا بالعالم' }] },
      ],
    },
    { videoId: 'i18n', title: '日本語のタイトル', exported: '2026-08-13' }
  );
  const md = render(transcript, 'md');
  assert.match(md, /こんにちは世界/);
  assert.match(md, /مرحبا بالعالم/);
  assert.match(md, /日本語のタイトル/);
  // A title with no Latin characters still yields a usable filename.
  const name = filenameFor(transcript, 'md');
  assert.ok(name.endsWith('.md'));
  assert.ok(name.length > 3);
});
