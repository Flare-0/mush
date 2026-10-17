# R-3 — Streaming engine port spike: RESULT (GO)

Date: 2026-10-17 · Machine: this dev box (Windows, Node v24.14.1)
Probe: `r3-resolve-stream-spike.mjs` (committed alongside; original path `E:\mush\scratch\spike\resolve-stream.mjs`)
Bundle under test: `E:\mush\scratch\morideobfuscator\src\main\assets\youtubei\youtubei.bundle.js`
(v18.0.0, 1,130,679 bytes — the exact asset the Android app ships)

## What was proven

The **unmodified production bundle** runs in plain Node (no npm deps, no QuickJS) with a bridge shim set and two in-memory source patches:

1. Bundle evaluates & initializes: `ArchiveTuneYoutubei` v18.0.0, ~800 ms including the 1.1 MB parse.
2. `prepare(request)` → ok (44 ms; anonymous session).
3. It performs the real InnerTube call: `POST www.youtube.com/youtubei/v1/player`.
4. `resolvePrepared(request)` → ok (698 ms) with a real, signed `googlevideo` URL:
   - itag 140, `audio/mp4` / `mp4a.40.2`, 44.1 kHz, ~130 kbps, contentLength 3,449,447 B
   - expiry ≈ 6 h from mint (21,540 s)
   - playback headers returned: `Accept, Origin, Referer, User-Agent`
5. Range fetch of the URL: **HTTP 206**, `content-type: audio/mp4`,
   `content-range: bytes 0-2047/3449447`, 2048 bytes received, `ftyp` magic — the stream really plays.

## Shims required (Node side)

Mirrors of the QuickJS bridge in `YoutubeiQuickJsWorker.kt`:

- `__archiveTuneHttp` (request/response as base64 JSON)
- `__archiveTunePlayerSource`
- `__archiveTuneVideoPoToken` (returning `null` worked for this anonymous resolve)
- `__archiveTuneCacheRead` / `__archiveTuneCacheWrite` / `__archiveTuneCacheRemove`
- `__archiveTuneSha1`, `__archiveTuneUuid`, `__archiveTuneRandom`

## Bundle patches (exactly two, in-memory only — no file writes)

1. Replace the QuickJS `ReadableStream` stub class with the native one.
2. Add a `body` getter to the minified `BodyContainer` (`cloneBytes(){...}` anchor) wrapping the bytes in a native `ReadableStream`.

Both patches are anchored on exact strings; the script throws if an anchor drifts, so a
bundle upgrade fails loudly instead of silently misbehaving.

## Reproduction

```
node E:\mush\scratch\spike\resolve-stream.mjs dQw4w9WgXcQ
# exit 0 = STREAM VERIFIED; the script prints only redacted URL info
```

## Verdict: **GO**

The exact ArchiveTune engine runs on desktop Node. Remaining R-3 scope (not yet written):
the port-plan doc for P1-2 / P2-19 — flow map + `stream.mjs` module design (bundle load
strategy, shim ownership, IPC `stream:resolve`, URL cache/expiry re-resolve mirroring
`isExpiredOrNearExpiredStreamUrl`, and where bytes are piped: direct `<audio src>` vs a
main-process proxy for the required headers).
