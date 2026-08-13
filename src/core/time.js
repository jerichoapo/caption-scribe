// Time parsing and formatting. Pure, no browser APIs.

/** Format seconds as a human clock: 0:07, 12:34, 1:02:03. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Format seconds as a zero-padded clock, always at least mm:ss. */
export function formatClockPadded(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Format seconds as a subtitle timestamp.
 * SRT uses a comma before milliseconds, WebVTT uses a period.
 */
export function formatSubtitleTime(seconds, separator = ',') {
  const total = Math.max(0, Number(seconds) || 0);
  const whole = Math.floor(total);
  const ms = Math.round((total - whole) * 1000);
  // Rounding can carry into the next second.
  const carry = ms === 1000 ? 1 : 0;
  const msFinal = ms === 1000 ? 0 : ms;
  const s = whole + carry;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}${separator}${pad(msFinal, 3)}`;
}

/**
 * Parse a subtitle timestamp (SRT or VTT) into seconds.
 * Accepts hh:mm:ss,mmm / hh:mm:ss.mmm / mm:ss.mmm.
 * Returns null when the input does not look like a timestamp.
 */
export function parseSubtitleTime(text) {
  const m = String(text)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  const ms = frac ? Number(frac.padEnd(3, '0')) : 0;
  return Number(h || 0) * 3600 + Number(mm) * 60 + Number(ss) + ms / 1000;
}

/** Parse a loose human timestamp such as 1:23 or 01:02:03 into seconds. */
export function parseClock(text) {
  const parts = String(text).trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
}
