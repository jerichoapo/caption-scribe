import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeCues,
  isPunctuated,
  mergeIntoParagraphs,
  capitalizeParagraphs,
} from '../src/core/cues.js';
import { parseJson3 } from '../src/core/parse/json3.js';
import {
  parseChaptersFromDescription,
  groupByChapters,
  normalizeChapters,
} from '../src/core/chapters.js';
import { fixture } from './helpers.js';

test('roll-up duplication is removed from auto-captions', () => {
  const cues = dedupeCues(parseJson3(fixture('asr-rollup.json3.json')));
  const joined = cues.map((c) => c.text).join(' ');

  assert.equal(
    joined,
    'welcome back to the channel today we are looking at how captions ' +
      'actually work the second thing worth knowing is that timing matters a lot'
  );

  // The tell-tale symptom: no phrase should appear twice.
  const phrase = 'welcome back to the channel';
  assert.equal(joined.split(phrase).length - 1, 1);
  assert.equal(joined.split('looking at how captions').length - 1, 1);
});

test('dedupe leaves non-overlapping repetition alone', () => {
  // Same words twice, but the cues do not overlap in time, so this is real
  // repeated speech rather than a roll-up repaint.
  const cues = dedupeCues([
    { start: 0, end: 1, text: 'no no no' },
    { start: 2, end: 3, text: 'no no no' },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].text, 'no no no');
});

test('dedupe absorbs an exact repeat and extends the span', () => {
  const cues = dedupeCues([
    { start: 0, end: 2, text: 'same line' },
    { start: 1, end: 4, text: 'same line' },
  ]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].end, 4);
});

test('dedupe drops a cue fully contained in the previous one', () => {
  const cues = dedupeCues([
    { start: 0, end: 3, text: 'the whole sentence here' },
    { start: 1, end: 4, text: 'the whole sentence here' },
    { start: 2, end: 5, text: 'the whole sentence here and more' },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].text, 'and more');
});

test('punctuation detection separates manual captions from auto-captions', () => {
  const manual = parseJson3(fixture('manual-punctuated.json3.json'));
  const asr = dedupeCues(parseJson3(fixture('asr-rollup.json3.json')));
  assert.equal(isPunctuated(manual), true);
  assert.equal(isPunctuated(asr), false);
});

test('a long pause forces a paragraph break', () => {
  const cues = dedupeCues(parseJson3(fixture('asr-rollup.json3.json')));
  const paragraphs = mergeIntoParagraphs(cues, { gapThreshold: 2 });
  assert.equal(paragraphs.length, 2);
  assert.ok(paragraphs[0].text.startsWith('welcome back'));
  assert.ok(paragraphs[1].text.startsWith('the second thing'));
  assert.equal(paragraphs[1].start, 12);
});

test('paragraphs break on the word budget at a sentence boundary', () => {
  const cues = [];
  for (let i = 0; i < 40; i++) {
    cues.push({
      start: i * 2,
      end: i * 2 + 2,
      text: 'this sentence has exactly seven words here.',
    });
  }
  const paragraphs = mergeIntoParagraphs(cues, {
    gapThreshold: 5,
    wordBudget: 40,
  });
  assert.ok(paragraphs.length > 1);
  // Every paragraph but the last should end on a sentence.
  for (const p of paragraphs.slice(0, -1)) {
    assert.match(p.text, /[.!?]$/);
  }
});

test('unpunctuated text still breaks on the word budget', () => {
  const cues = [];
  for (let i = 0; i < 40; i++) {
    cues.push({ start: i * 2, end: i * 2 + 2, text: 'word word word word word' });
  }
  const paragraphs = mergeIntoParagraphs(cues, {
    gapThreshold: 5,
    wordBudget: 30,
    punctuated: false,
  });
  assert.ok(paragraphs.length >= 6);
  assert.ok(paragraphs.every((p) => p.text.split(/\s+/).length <= 40));
});

test('a speaker who never pauses still gets paragraph breaks', () => {
  const cues = [];
  for (let i = 0; i < 60; i++) {
    cues.push({ start: i, end: i + 1, text: 'continuous speech with no stops' });
  }
  const paragraphs = mergeIntoParagraphs(cues, {
    gapThreshold: 10,
    wordBudget: 100,
    maxWords: 150,
  });
  assert.ok(paragraphs.length > 1);
  assert.ok(paragraphs.every((p) => p.text.split(/\s+/).length <= 155));
});

test('capitalizeParagraphs only touches the first letter', () => {
  const out = capitalizeParagraphs([{ start: 0, end: 1, text: 'hello there world' }]);
  assert.equal(out[0].text, 'Hello there world');
});

test('description chapters need an increasing run to be trusted', () => {
  const good = parseChaptersFromDescription(
    ['0:00 Intro', '2:15 The main idea', '10:40 Wrapping up'].join('\n')
  );
  assert.equal(good.length, 3);
  assert.equal(good[1].start, 135);
  assert.equal(good[1].title, 'The main idea');

  // A single stray timestamp is not a chapter list.
  assert.deepEqual(parseChaptersFromDescription('see 3:20 for details'), []);
});

test('description chapters accept a trailing timestamp layout', () => {
  const chapters = parseChaptersFromDescription(
    ['Introduction 0:00', 'Deep dive 4:30'].join('\n')
  );
  assert.equal(chapters.length, 2);
  assert.equal(chapters[1].title, 'Deep dive');
  assert.equal(chapters[1].start, 270);
});

test('groupByChapters assigns paragraphs to the chapter in force', () => {
  const paragraphs = [
    { start: 0, end: 10, text: 'before' },
    { start: 20, end: 30, text: 'during one' },
    { start: 70, end: 80, text: 'during two' },
  ];
  const sections = groupByChapters(paragraphs, [
    { start: 15, title: 'One' },
    { start: 60, title: 'Two' },
  ]);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].title, null);
  assert.equal(sections[1].title, 'One');
  assert.equal(sections[2].paragraphs[0].text, 'during two');
});

test('groupByChapters with no chapters returns one untitled section', () => {
  const sections = groupByChapters([{ start: 0, end: 1, text: 'x' }], []);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, null);
});

test('normalizeChapters sorts and rejects malformed entries', () => {
  const out = normalizeChapters([
    { start: 10, title: 'Later' },
    { start: 0, title: 'First' },
    { start: 'bad', title: 'Dropped' },
    { start: 5, title: '' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'First');
});
