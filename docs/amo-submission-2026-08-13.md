# Submitting Caption Scribe to addons.mozilla.org

Prepared 2026-08-13, for version 0.1.0.

The add-on is named **Caption Scribe**, settled 2026-08-13. The name carries no
trademark, which removes the most likely rejection reason. The service it works
on is named only in the summary and description, which is descriptive use and
the pattern add-ons in this category survive on.

## Pick the channel first

AMO has two, and they are very different things.

**Unlisted** is a signature and nothing more. Automated, usually done in minutes,
no human review, no listing page. You get an `.xpi` that installs permanently in
release Firefox. Nobody can find it by searching. Use this if the goal is simply
to have the add-on properly installed on your own machines.

```bash
npm run sign
```

**Listed** puts it in the public gallery at addons.mozilla.org, where anyone can
find and install it, and users get automatic updates. This is what "submitted to
Firefox" normally means, and it is what the rest of this document covers. It
requires review, listing assets, and a commitment to answer bug reports from
strangers.

You can move from unlisted to listed later. Signing unlisted now costs nothing
and does not complicate a listing afterwards.

## Before you submit

1. **A Firefox Account**, then developer access at
   https://addons.mozilla.org/developers/. Free.
2. **API credentials** if you want to submit from the command line, generated at
   Developer Hub → Manage API Keys. Set them as `WEB_EXT_API_KEY` and
   `WEB_EXT_API_SECRET` in your own shell. Never commit them. The web upload form
   works fine too and needs no keys.
3. ~~Decide the add-on name.~~ Settled: **Caption Scribe**. Check it is not
   already taken on AMO when you create the listing, since names must be unique.
4. ~~Decide the version.~~ Settled: ship as **0.1.0**. AMO will not accept the
   same version number twice, so the next upload must be 0.1.1 or higher.
5. ~~A screenshot.~~ Done: `screenshots/caption-scribe-overview.png`, 1280x800,
   showing the popup and a sample of the Markdown it produces side by side. It
   is rendered from the real `popup.css`, so the popup in the image is the popup
   users see. Upload it on the listing form. It is excluded from the add-on
   package, which is why the build ignores `screenshots/`.

## Submission steps

1. Build the package.

   ```bash
   npm run build
   ```

   That writes `web-ext-artifacts/*.zip`. Upload that file, not the source
   folder and not a hand-made zip.

2. Go to Developer Hub → **Submit a New Add-on**.

3. Choose **"On this site"** for a listed add-on.

4. Upload the zip. The validator runs immediately. It should pass with zero
   errors and zero warnings, which is what `npm run lint` already reports
   locally.

5. **Source code:** AMO requires a source upload when the submitted package
   contains minified, obfuscated, or machine-generated code. This add-on has
   none. There is no bundler and no build step, and every file in the package is
   the file that was written. Answer no, and say so if asked. This is a real
   payoff from the no-bundler architecture.

6. Fill in the listing. Draft copy is below.

7. **Paste the reviewer notes below into the "Notes for Reviewers" field.** Do
   not skip this. It is the highest-leverage thing in the whole submission.

8. Submit, then wait. Timelines vary and Mozilla does not guarantee one. An
   add-on with broad host permissions and a page-world content script is likely
   to draw manual review rather than sail through automated checks.

## Listing copy, draft

**Summary** (AMO caps this at 250 characters):

> Export the captions of a video as clean, readable Markdown. Merges caption
> fragments into real paragraphs, removes the duplication in auto-generated
> tracks, and keeps chapter headings and clickable timestamps.

**Description:**

> Turns a video's captions into a document you would actually want to read.
>
> Most caption exporters hand you one line per caption cue, and auto-generated
> tracks come out with every phrase repeated two or three times because of the
> way the scrolling effect is encoded. This one merges the fragments into
> paragraphs, breaks them where the speaker pauses, and strips the duplication.
>
> What you get:
>
> - Markdown with YAML frontmatter: title, channel, duration, language, and
>   whether the captions were auto-generated or written by a human.
> - Clickable timestamps that jump back to the moment in the video.
> - Chapter headings, taken from the video's own chapters.
> - Plain text, SubRip (.srt), and WebVTT (.vtt) export as well.
> - Formatting you control: timestamp density, paragraph length, frontmatter
>   depth, and the filename pattern.
>
> Nothing is collected, nothing is transmitted, and no server other than the
> video site is ever contacted. Everything happens in your browser.
>
> When timings can only be read approximately, the add-on says so and disables
> subtitle export rather than writing a file with invented timings.

**Category:** Search Tools, or Other. **Tags:** captions, transcript, markdown,
subtitles, notes. **License:** MIT, matching the LICENSE file in the repo.
**Privacy policy:** the contents of PRIVACY.md.

## Notes for reviewers, paste verbatim

> Hi, thanks for reviewing. Two things in here look unusual, so let me get ahead
> of both.
>
> **What it does:** exports a YouTube video's captions as Markdown, or .txt,
> .srt, .vtt, to the clipboard or a file. Only ever on an explicit click.
>
> **1. A MAIN-world script patches `fetch` and `XMLHttpRequest`.**
> YouTube gates its caption endpoint. Every caption URL carries `exp=xpe`, and
> without a proof-of-origin token generated by the page's own player it returns
> an empty HTTP 200. That token is in no URL we can read, so fetching the caption
> URL ourselves gets nothing back.
>
> So we watch the requests the page already makes.
> `src/content/interceptor.js` reads a **clone** of the response for two URLs
> only (`/api/timedtext` and `/youtubei/v1/get_transcript`) and hands it to the
> extension. It never modifies or blocks anything, and `response.clone()` means
> the page's own copy is untouched. Every other request passes straight through.
>
> `webRequest` would be the conventional route, but it cannot read response
> bodies without more privileges. This needs fewer: no `webRequest`, no
> `webRequestBlocking`, no `<all_urls>`.
>
> **2. It clicks things on the page.**
> To open YouTube's own "Show transcript" panel, which makes the page fetch the
> transcript for us, and to pick a language from that panel's menu. Only after
> the user clicks our button, never on page load, and the panel is closed again
> afterwards. Nothing is clicked that the user could not click themselves.
>
> **Permissions:** `*://*.youtube.com/*` (the only site it runs on), `downloads`
> (saving a file), `storage` (formatting preferences).
>
> **No remote code, no data collection.** No `eval`, no CDN, no bundler, no
> minification. Nothing leaves the browser.
>
> **Source:** https://github.com/jerichoapo/caption-scribe, public and MIT.
> `npm test` runs 63 tests over the browser-free core; `npm run lint` is clean.
>
> **To test:** open any video with captions, click the toolbar icon, grant the
> youtube.com permission when prompted (MV3 makes it optional, so nothing works
> until you do), then hit Copy Markdown.

## What could get this rejected

Ranked by how likely I think each one is.

1. ~~**The add-on name.**~~ **Resolved 2026-08-13.** Renamed to Caption Scribe,
   which carries no trademark. The service appears only in the summary and
   description, as descriptive use. This was the highest-ranked risk and it is
   now gone, which makes the interceptor below the leading one.
2. **The page-world interceptor.** Patching `fetch` and `XMLHttpRequest` is
   exactly the shape of a lot of malicious code, and a reviewer is right to look
   hard at it. The reviewer notes above exist for this. The defensible facts are
   that it is read-only, scoped to two URL patterns, and chosen because it needs
   fewer permissions than the alternative.
3. **Terms of service.** Reviewers sometimes reject add-ons that extract content
   from a service. The honest position: it reads caption data the page has
   already fetched, for the user's own personal use, and it neither bypasses
   payment or access restrictions nor harvests in bulk. That is a defensible
   position rather than a guaranteed one.
4. **The SVG icon.** Firefox and the local validator both accept it. If AMO's
   listing pipeline objects, exporting 48px and 96px PNGs and pointing the
   manifest at those is a five-minute fix.

## After approval

Users get automatic updates. To ship one, bump `version` in `manifest.json`,
rebuild, and upload the new zip against the same add-on. AMO refuses a version
number it has already seen, so the bump is mandatory.
