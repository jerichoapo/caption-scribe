# Caption Scribe

A Firefox extension that exports the captions of a YouTube video as clean,
readable Markdown. Also exports plain text, SubRip, and WebVTT.

It reflows the fragmentary caption cues into paragraphs rather than dumping one
line per cue, removes the roll-up duplication that makes auto-caption exports
unreadable, and carries chapter headings and clickable timestamps through to the
output.

## Install for development

```bash
npm install
npm start
```

`npm start` launches a temporary Firefox profile with the extension loaded. To
load it by hand instead, open `about:debugging`, choose "This Firefox", then
"Load Temporary Add-on" and select `manifest.json`.

Firefox requires signing for a permanent install. For personal use:

```bash
npm run sign
```

That signs on the unlisted channel and produces an installable `.xpi` in
`web-ext-artifacts/`. It needs AMO API credentials in `WEB_EXT_API_KEY` and
`WEB_EXT_API_SECRET`.

## Tests

```bash
npm test
```

62 tests over the pure core: parsers, deduplication, reflow, chapter grouping,
filename sanitizing, and every output format. The core has no browser
dependencies, so the whole path from caption bytes to finished Markdown runs
under node.

```bash
npm run lint
```

## How caption acquisition works

This is the only genuinely hard part, and it drove the architecture.

YouTube signs every caption URL with an `exp=xpe` parameter. When it is present,
`/api/timedtext` returns an empty HTTP 200 body unless the request also carries a
proof-of-origin token that the player's own JavaScript generates at runtime. The
token is a query parameter, not a cookie, so a valid logged-in session does not
substitute for it, and the `baseUrl` readable from `ytInitialPlayerResponse`
never contains one.

A sweep of 12 videos on 2026-08-13 found `exp=xpe` on every track of every video,
and every direct fetch returned 200 with a zero-length body. So reconstructing
the request does not work. Watching the requests the page itself makes does.

The extension installs a MAIN-world interceptor that patches `fetch` and
`XMLHttpRequest` and reads clones of the responses. This is preferred over
`webRequest` because it can read response bodies and needs no extra permission.
Acquisition then walks a ladder, silent attempts first, anything that moves the
page's UI last:

| Rung | Source | Notes |
| --- | --- | --- |
| 1 | Already captured | The interceptor saw a payload for this video |
| 2 | Direct track fetch | Silent, honours language choice, token-gated on most videos |
| 3 | Transcript panel, over the network | Opens the panel; reads the real `get_transcript` response, which carries true start and end times |
| 4 | Transcript panel, from the DOM | Last resort; start times only, so timings are marked approximate |

An empty body from rung 2 means "token gated", never "no captions". Only an empty
caption track list means the video genuinely has none.

Rung 4 synthesizes end times from the following cue's start. When that happens
the transcript is flagged, subtitle export is disabled, and the Markdown
frontmatter records `timings: approximate`. A subtitle file with invented timings
is worse than no file.

## Layout

```
src/core/      pure functions, no browser APIs, fully unit tested
  parse/       json3, srv1/srv3 XML, WebVTT, SubRip, InnerTube get_transcript
  format/      Markdown, SubRip, WebVTT, plain text
  cues.js      deduplication and paragraph reflow
  pipeline.js  raw payload in, rendered document out
src/content/   page access only: interceptor, metadata, panel driver, ladder
src/popup/     the UI; does all parsing and formatting
src/options/   filename pattern and reflow thresholds
test/          node --test over src/core
fixtures/      synthetic caption payloads, authored for this repo
```

Content scripts cannot use ES modules, so they stay a thin page-access layer and
share one `YTCMD` namespace. The popup is an extension page, so it imports the
core directly. That split is why no bundler is needed.

Every YouTube DOM selector lives in `src/content/selectors.js`, each as a list
tried in order. A YouTube redesign should be a one-file fix.

## Known limits

- Explicit language selection only works through rung 2, which is token-gated on
  most videos. The panel rungs return whichever language the panel offers.
- Live streams in progress are refused.
- Rungs 3 and 4 briefly open and re-close the transcript panel.
- Playlist and channel batch export are not implemented.

## Verification status

The core is covered by the test suite and runs green. The extension surface has
been syntax-checked and passes `web-ext lint` with zero errors and zero warnings,
but the acquisition ladder's live behaviour against youtube.com has not been
exercised in a real browser session. Rungs 1, 3, and 4 in particular depend on
page behaviour that cannot be verified from a test harness. Run `npm start` and
work through the smoke checklist below before trusting it.

## Smoke checklist

1. A video with manual captions exports punctuated paragraphs.
2. A video with auto-captions exports with no duplicated lines.
3. A video with chapters produces `##` headings.
4. Navigate from video A to video B without reloading, then export. The output
   must match B.
5. A video with no captions shows an explicit message, not an empty file.
6. A live stream is refused cleanly.
7. When rung 4 answers, `.srt` and `.vtt` are disabled and the reason is shown.
8. Non-Latin titles produce a usable filename.
