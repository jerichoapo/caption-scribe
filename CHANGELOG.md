# Changelog

Notable changes per released version. Dates are release dates.

## 0.1.1 - 2026-08-17

Bug fix release. Two failures found in real use, plus two more found while
testing the fixes for those.

### Fixed

- Videos with captions were sometimes reported as having none. An empty caption
  track list was treated as proof of absence, when it equally means the player
  response could not be read. Only a track list that was actually read can now
  rule captions out; otherwise the export continues down the ladder, since the
  transcript panel does not need the track list at all. This was the most common
  way the add-on failed.
- After moving between videos without reloading, the track list could describe
  the previous video. The add-on now captures YouTube's player API response,
  which is how the page refetches that data on a soft navigation, and checks it
  against the current video ID before using it.
- Retrying after a failed export stalled for six seconds and then fell back to
  approximate timings. A failed attempt can leave the transcript panel open, and
  opening an already-open panel issues no request, so there was nothing to read.
  The panel is now closed and reopened to force a refetch.
- A transcript panel the user opened themselves is no longer closed for them.
  Panel state is recorded on arrival and restored afterwards.
- `close()` waited a fixed 120ms rather than confirming the panel had gone, so an
  immediate reopen could silently do nothing.

### Added

- When a payload parses to zero cues, the popup reports its structure: byte size,
  top level keys, and a count of every renderer key found. A parser that finds no
  cues is usually looking for a name that no longer exists, so reporting what is
  there beats reporting what was expected.
- Nine content-script tests covering the acquisition ladder, which previously had
  no automated coverage at all. That gap is why both user-visible bugs above
  reached a published release. 77 tests total.

## 0.1.0 - 2026-08-13

First release.

- Export a video's captions as Markdown, with YAML frontmatter, clickable
  timestamps, and chapter headings taken from the video's own chapters.
- Caption fragments are merged into paragraphs and broken where the speaker
  pauses, rather than emitted one line per cue.
- Roll-up duplication in auto-generated tracks is removed, gated on genuine
  temporal overlap so real repeated speech survives.
- Plain text, SubRip, and WebVTT export. Subtitle export is disabled when timings
  could only be read approximately, rather than writing invented end times.
- Language selection through the transcript panel's own menu, with the exported
  document reporting the language it actually contains rather than the one that
  was requested.
