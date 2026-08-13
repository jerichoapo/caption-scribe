import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJson3 } from '../src/core/parse/json3.js';
import { parseTimedTextXml } from '../src/core/parse/timedtextXml.js';
import { parseVtt } from '../src/core/parse/vtt.js';
import { parseSrt } from '../src/core/parse/srt.js';
import {
  parseGetTranscript,
  parseTranscriptLanguages,
  selectedTranscriptLanguage,
} from '../src/core/parse/getTranscript.js';
import { fixture } from './helpers.js';

test('json3 drops window-definition and aAppend events', () => {
  const cues = parseJson3(fixture('asr-rollup.json3.json'));
  // Nine events in, seven cues out: the window definition and the aAppend
  // continuation are both dropped before any other processing.
  assert.equal(cues.length, 7);
  assert.ok(cues.every((c) => c.text.trim() !== ''));
  assert.ok(cues.every((c) => Number.isFinite(c.start)));
  assert.ok(cues.every((c) => Number.isFinite(c.end)));
});

test('json3 keeps word-level timings when segments carry offsets', () => {
  const cues = parseJson3(fixture('asr-rollup.json3.json'));
  const withWords = cues.find((c) => c.words);
  assert.ok(withWords, 'expected at least one cue with word timings');
  assert.ok(withWords.words.length >= 2);
  assert.ok(withWords.words[1].t > withWords.words[0].t);
});

test('json3 decodes entities in cue text', () => {
  const cues = parseJson3(fixture('manual-punctuated.json3.json'));
  const joined = cues.map((c) => c.text).join(' ');
  assert.ok(joined.includes('&'), 'entity should decode to a literal ampersand');
  assert.ok(!joined.includes('&amp;'));
});

test('json3 backfills a missing duration from the next cue', () => {
  const cues = parseJson3({
    events: [
      { tStartMs: 0, segs: [{ utf8: 'first' }] },
      { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'second' }] },
    ],
  });
  assert.equal(cues[0].end, 4);
  assert.equal(cues[1].end, 5);
});

test('srv1 XML parses start and duration attributes', () => {
  const cues = parseTimedTextXml(fixture('sample.srv1.xml'));
  assert.equal(cues.length, 3);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 2.5);
  assert.ok(cues[1].text.includes('&'));
});

test('srv3 XML parses paragraph timings and word segments', () => {
  const cues = parseTimedTextXml(fixture('sample.srv3.xml'));
  // The whitespace-only <p> must be dropped.
  assert.equal(cues.length, 3);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 2.5);
  assert.equal(cues[0].text, 'First chunk here');
  assert.ok(cues[0].words.length >= 2);
});

test('vtt parser skips headers and NOTE blocks and strips inline tags', () => {
  const cues = parseVtt(fixture('sample.vtt'));
  assert.equal(cues.length, 3);
  assert.equal(cues[0].text, 'Opening line of the video');
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 2.5);
  assert.ok(!cues[1].text.includes('<'));
  assert.ok(cues[2].text.includes('&'));
});

test('vtt parser tolerates a cue identifier line', () => {
  const cues = parseVtt(
    'WEBVTT\n\nnamed-cue\n00:00:01.000 --> 00:00:02.000\nbody text\n'
  );
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'body text');
});

test('srt parser reads numbered and unnumbered blocks', () => {
  const cues = parseSrt(fixture('sample.srt'));
  assert.equal(cues.length, 3);
  assert.equal(cues[1].text, 'Second subtitle line spanning two rows');

  const unnumbered = parseSrt('00:00:01,000 --> 00:00:02,000\nno index here\n');
  assert.equal(unnumbered.length, 1);
  assert.equal(unnumbered[0].text, 'no index here');
});

test('get_transcript parser finds segments and section headers at any depth', () => {
  const { cues, chapters } = parseGetTranscript(fixture('get_transcript.json'));
  assert.equal(cues.length, 3);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 4);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Opening');
  assert.equal(chapters[1].start, 20);
});

test('get_transcript parser survives a changed renderer path', () => {
  // Same nodes, different wrapper. The recursive walk should still find them.
  const reshaped = {
    someNewWrapper: {
      whatever: [
        {
          transcriptSegmentRenderer: {
            startMs: '1000',
            endMs: '2000',
            snippet: { runs: [{ text: 'still found' }] },
          },
        },
      ],
    },
  };
  const { cues } = parseGetTranscript(reshaped);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'still found');
});

test('selectedTranscriptLanguage reports what the panel actually returned', () => {
  assert.equal(selectedTranscriptLanguage(fixture('get_transcript.json')), 'English');

  // A different entry selected must change the answer, since this value is what
  // the exported document will claim it contains.
  const german = JSON.parse(fixture('get_transcript.json'));
  const items =
    german.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content
      .transcriptSearchPanelRenderer.footer.transcriptFooterRenderer.languageMenu
      .sortFilterSubMenuRenderer.subMenuItems;
  items[0].selected = false;
  items[1].selected = true;
  assert.equal(selectedTranscriptLanguage(german), 'German');

  // No menu at all (single-language video) must yield null, never a guess.
  assert.equal(selectedTranscriptLanguage({ actions: [] }), null);
});

test('get_transcript language menu is readable', () => {
  const langs = parseTranscriptLanguages(fixture('get_transcript.json'));
  assert.equal(langs.length, 2);
  assert.equal(langs[0].title, 'English');
  assert.equal(langs[0].selected, true);
});
