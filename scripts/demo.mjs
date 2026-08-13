// Render a fixture end to end and print the result. Useful for eyeballing
// output quality, which is the one thing tests cannot judge.
//
//   node scripts/demo.mjs fixtures/asr-rollup.json3.json

import { readFileSync } from 'node:fs';
import { buildTranscript, render, filenameFor } from '../src/core/pipeline.js';

const path = process.argv[2] ?? 'fixtures/asr-rollup.json3.json';
const raw = readFileSync(path, 'utf8');

const transcript = buildTranscript(raw, {
  videoId: 'demoVideo1',
  title: 'A Demonstration Video',
  channel: 'Demo Channel',
  durationSec: 1122,
  lang: 'en',
  langName: 'English',
  source: 'capture',
  exported: '2026-08-13',
});

console.log(`# source: ${path}`);
console.log(`# cues: ${transcript.cues.length}, kind: ${transcript.kind}`);
console.log(`# filename: ${filenameFor(transcript, 'md')}`);
console.log('-'.repeat(64));
console.log(render(transcript, 'md'));
