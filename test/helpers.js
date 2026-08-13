import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return readFileSync(join(here, '..', 'fixtures', name), 'utf8');
}

export function textOf(cues) {
  return cues.map((c) => c.text).join(' | ');
}
