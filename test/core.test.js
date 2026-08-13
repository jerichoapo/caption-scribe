import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatClock,
  formatClockPadded,
  formatSubtitleTime,
  parseSubtitleTime,
  parseClock,
} from '../src/core/time.js';
import { decodeEntities, stripCaptionTags, cleanCueText } from '../src/core/html.js';
import { slugify, sanitizeSegment, buildFilename } from '../src/core/filename.js';

test('formatClock omits hours below one hour', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7), '0:07');
  assert.equal(formatClock(754), '12:34');
  assert.equal(formatClock(3723), '1:02:03');
  assert.equal(formatClockPadded(7), '00:07');
});

test('formatSubtitleTime carries rounded milliseconds into the next second', () => {
  assert.equal(formatSubtitleTime(0, ','), '00:00:00,000');
  assert.equal(formatSubtitleTime(1.5, ','), '00:00:01,500');
  assert.equal(formatSubtitleTime(3723.25, '.'), '01:02:03.250');
  // 2.9999 rounds to 3000ms, which must become the next whole second.
  assert.equal(formatSubtitleTime(2.9999, ','), '00:00:03,000');
});

test('parseSubtitleTime accepts both separators and optional hours', () => {
  assert.equal(parseSubtitleTime('00:00:02,500'), 2.5);
  assert.equal(parseSubtitleTime('00:00:02.500'), 2.5);
  assert.equal(parseSubtitleTime('01:02:03.250'), 3723.25);
  assert.equal(parseSubtitleTime('02:30'), 150);
  assert.equal(parseSubtitleTime('nonsense'), null);
});

test('parseClock reads human timestamps', () => {
  assert.equal(parseClock('1:23'), 83);
  assert.equal(parseClock('01:02:03'), 3723);
  assert.equal(parseClock('nope'), null);
  assert.equal(parseClock('1:2:3:4'), null);
});

test('decodeEntities handles named, numeric, hex, and double encoding', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&lt;tag&gt;'), '<tag>');
  assert.equal(decodeEntities('&#39;quoted&#39;'), "'quoted'");
  assert.equal(decodeEntities('&#x27;hex&#x27;'), "'hex'");
  // YouTube double-encodes some payloads: &amp;#39; must resolve fully.
  assert.equal(decodeEntities('it&amp;#39;s'), "it's");
  assert.equal(decodeEntities('unknown &fake; stays'), 'unknown &fake; stays');
});

test('stripCaptionTags removes karaoke and colour markup', () => {
  assert.equal(
    stripCaptionTags('<c.colorE5E5E5>hello</c> <00:00:03.100>world'),
    'hello world'
  );
  assert.equal(stripCaptionTags('<v Speaker>line</v>'), 'line');
});

test('cleanCueText collapses whitespace after decoding', () => {
  assert.equal(cleanCueText('  a &amp;\n  b  '), 'a & b');
});

test('slugify produces safe, word-boundary-cut slugs', () => {
  assert.equal(slugify('Attention Is All You Need!'), 'attention-is-all-you-need');
  assert.equal(slugify('Café Niño — déjà vu'), 'cafe-nino-deja-vu');
  assert.equal(slugify(''), 'untitled');
  assert.equal(slugify("Don't Stop"), 'dont-stop');
  const long = slugify('a'.repeat(200));
  assert.ok(long.length <= 60);
});

test('sanitizeSegment strips Windows-illegal characters and reserved names', () => {
  assert.equal(sanitizeSegment('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
  assert.equal(sanitizeSegment('CON'), '_CON');
  assert.equal(sanitizeSegment('nul'), '_nul');
  assert.equal(sanitizeSegment('trailing dot.'), 'trailing dot');
  assert.equal(sanitizeSegment('trailing space   '), 'trailing space');
  // Spaces inside a title are legal on Windows and must survive.
  assert.equal(sanitizeSegment('A Real Title'), 'A Real Title');
});

test('buildFilename fills tokens and appends the extension', () => {
  const fields = {
    date: '2026-08-13',
    title: 'How It Works: Part 1',
    videoId: 'abc123',
    lang: 'en',
    channel: 'Some Channel',
  };
  assert.equal(
    buildFilename('{date}-{slug}', fields, 'md'),
    '2026-08-13-how-it-works-part-1.md'
  );
  assert.equal(buildFilename('{id}-{lang}', fields, 'srt'), 'abc123-en.srt');
  // A colon in the raw title must not survive into the filename.
  assert.ok(!buildFilename('{title}', fields, 'md').includes(':'));
  assert.equal(buildFilename('{unknown}', fields, 'md'), '{unknown}.md');
});
