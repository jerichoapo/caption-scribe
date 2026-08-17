// Structural fingerprint of a caption payload.
//
// When a payload parses to zero cues, the useful question is what shape it
// actually had. YouTube renames and restructures its renderers, so a parser
// that finds nothing is usually looking for a key that no longer exists. This
// reports what is there instead of what was expected, which turns "came back
// empty" into something actionable.

const MAX_DEPTH = 40;

export function describePayload(raw, { maxKinds = 6 } = {}) {
  const bytes = typeof raw === 'string' ? raw.length : null;

  let data = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trimStart();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return {
        bytes,
        kind: 'text',
        topKeys: [],
        renderers: [],
        summary: `${bytes} bytes, not JSON (starts "${trimmed.slice(0, 24)}")`,
      };
    }
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        bytes,
        kind: 'unparseable',
        topKeys: [],
        renderers: [],
        summary: `${bytes} bytes, JSON did not parse`,
      };
    }
  }

  const topKeys =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.keys(data).slice(0, 8)
      : [];

  const counts = new Map();
  walk(data, 0, (key) => {
    if (!key.endsWith('Renderer')) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const renderers = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKinds)
    .map(([name, count]) => `${name}×${count}`);

  const parts = [];
  if (bytes !== null) parts.push(`${bytes} bytes`);
  if (topKeys.length) parts.push(`top: ${topKeys.join(',')}`);
  parts.push(renderers.length ? `renderers: ${renderers.join(' ')}` : 'no renderers found');

  return { bytes, kind: 'json', topKeys, renderers, summary: parts.join(' · ') };
}

function walk(node, depth, visitKey) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth + 1, visitKey);
    return;
  }
  for (const key of Object.keys(node)) {
    visitKey(key);
    walk(node[key], depth + 1, visitKey);
  }
}
