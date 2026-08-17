import test from 'node:test';
import assert from 'node:assert/strict';

import { describePayload } from '../src/core/describe.js';
import { fixture } from './helpers.js';

test('describePayload names the renderers actually present', () => {
  const out = describePayload(fixture('get_transcript.json'));
  assert.equal(out.kind, 'json');
  assert.ok(out.topKeys.includes('actions'));
  assert.ok(out.renderers.some((r) => r.startsWith('transcriptSegmentRenderer×3')));
  assert.ok(out.summary.includes('renderers:'));
});

test('describePayload reports when no renderers exist at all', () => {
  // The signal that matters: a payload arrived but contains nothing we know.
  const out = describePayload(JSON.stringify({ responseContext: {}, error: 'nope' }));
  assert.equal(out.renderers.length, 0);
  assert.match(out.summary, /no renderers found/);
});

test('describePayload survives non-JSON and broken JSON', () => {
  const text = describePayload('<?xml version="1.0"?><transcript></transcript>');
  assert.equal(text.kind, 'text');
  assert.match(text.summary, /not JSON/);

  const broken = describePayload('{"unclosed": ');
  assert.equal(broken.kind, 'unparseable');
  assert.match(broken.summary, /did not parse/);
});

test('describePayload reports byte size', () => {
  const raw = JSON.stringify({ a: 1 });
  assert.equal(describePayload(raw).bytes, raw.length);
});

test('describePayload handles an already-parsed object', () => {
  const out = describePayload({ actions: [{ someRenderer: {} }] });
  assert.equal(out.bytes, null);
  assert.ok(out.renderers.some((r) => r.startsWith('someRenderer×1')));
});
