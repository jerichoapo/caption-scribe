// Filename derivation, sanitized for Windows.
//
// Windows rejects <>:"/\|?* and control characters, treats a trailing dot or
// space as an error, and reserves a set of device names regardless of
// extension. Downloads land on the user's filesystem, so all of it applies.

const ILLEGAL = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g');
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function slugify(input, maxLength = 60) {
  const base = String(input ?? '')
    .normalize('NFKD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLength) return base || 'untitled';
  // Cut at a word boundary rather than mid-word.
  const cut = base.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  const trimmed = lastDash > maxLength * 0.6 ? cut.slice(0, lastDash) : cut;
  return trimmed.replace(/-+$/, '') || 'untitled';
}

export function sanitizeSegment(input, maxLength = 120) {
  let out = String(input ?? '')
    .replace(ILLEGAL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (RESERVED.test(out)) out = `_${out}`;
  if (out.length > maxLength) out = out.slice(0, maxLength).replace(/[. ]+$/, '');
  return out || 'untitled';
}

/**
 * Build a filename from a pattern. Supported tokens:
 *   {date} {title} {slug} {id} {lang} {channel}
 * The extension is appended, never taken from the pattern.
 */
export function buildFilename(pattern, fields, extension) {
  const values = {
    date: String(fields.date ?? ''),
    title: sanitizeSegment(fields.title ?? 'untitled'),
    slug: slugify(fields.title ?? 'untitled'),
    id: sanitizeSegment(fields.videoId ?? ''),
    lang: sanitizeSegment(fields.lang ?? ''),
    channel: sanitizeSegment(fields.channel ?? ''),
  };

  const rendered = String(pattern ?? '{date}-{slug}')
    .replace(/\{(\w+)\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole
    )
    .replace(/-{2,}/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '');

  const safe = sanitizeSegment(rendered || 'transcript', 150);
  const ext = String(extension ?? 'md').replace(/^\./, '');
  return `${safe}.${ext}`;
}
