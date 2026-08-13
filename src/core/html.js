// HTML entity decoding and caption tag stripping. Pure, no DOMParser.

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  deg: '°',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  szlig: 'ß',
  ntilde: 'ñ',
};

/**
 * Decode HTML entities. YouTube double-encodes some caption payloads, so this
 * runs up to two passes when the first pass produces another entity.
 */
export function decodeEntities(input, maxPasses = 2) {
  let text = String(input ?? '');
  for (let pass = 0; pass < maxPasses; pass++) {
    if (!text.includes('&')) break;
    const next = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
      if (body[0] === '#') {
        const isHex = body[1] === 'x' || body[1] === 'X';
        const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      const named = NAMED[body] ?? NAMED[body.toLowerCase()];
      return named ?? whole;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Strip the inline markup YouTube embeds in VTT caption text: karaoke timing
 * tags like <00:00:01.234>, colour spans like <c.colorE5E5E5>, and voice spans.
 */
export function stripCaptionTags(input) {
  return String(input ?? '')
    .replace(/<\/?c[^>]*>/g, '')
    .replace(/<\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}>/g, '')
    .replace(/<\/?v[^>]*>/g, '')
    .replace(/<\/?(?:b|i|u|ruby|rt|lang)[^>]*>/g, '');
}

/** Collapse runs of whitespace (including newlines) into single spaces. */
export function collapseWhitespace(input) {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Full cleanup applied to every parsed cue's text. */
export function cleanCueText(input) {
  return collapseWhitespace(decodeEntities(stripCaptionTags(input)));
}
