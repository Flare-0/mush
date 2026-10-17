# mushplayer — Project Documentation

> A YouTube-Music-style desktop web player with YouLy+/Apple-style karaoke lyrics.
> **Stack:** Vite + React 19 + TypeScript (strict) + WebGL1 + Web Animations API + Motion.
> **Spec authority:** `DESIGN.md` is the single source of truth for all visual decisions.
> This file documents what the project is, how each system is implemented, and why.

---

## 1. What it is

Search YouTube for music, play it through a hidden 1×1 IFrame player, and get
word-by-word karaoke lyrics with ruby romaji — all on a near-black stage with
cover-reactive ambient glow. No backend, no accounts: the YouTube Data v3 API
key lives in `localStorage`, lyrics come from four public providers with a
manual source switcher.

---

## 2. Quickstart

| Command | What |
|---|---|
| `npm run dev -- --port 5173 --host 127.0.0.1` | Dev server (note: binds IPv6 `::1`; use `http://localhost:5173`, **not** `127.0.0.1`) |
| `npm run build` | `tsc -b && vite build` (~2–3s warm) |
| `npm run lint` | `oxlint` (warnings only; zero errors is the bar) |
| `http://localhost:5173/?preview[=seconds]` | Dev-only lyric fixture (karaoke test bench + live animation self-check) |

**First run:** paste a YouTube Data API v3 key into the top-right field, search
(e.g. `Ado Odo`), pick a track from Related.

### `localStorage` keys

| Key | Purpose |
|---|---|
| `yt_api_key` | YouTube Data v3 key |
| `ly_provider` | Lyrics provider choice (`auto` + 4) |
| `mp_shuffle` / `mp_repeat` | Transport modes |

---

## 3. File map (`src/`, 31 files)

```
main.tsx                  entry; mounts <App/> or dev-only <Preview/> on ?preview
App.tsx                   all state + orchestration (queue, lyrics load, transport)
App.css                   art stage + panel layout + responsive stack
index.css                 import anchor only (real globals live in styles/)
hooks/useYouTubePlayer.ts hidden IFrame player: load/play/pause/seek/volume,
                          15fps time poll, buffered fraction, onEnded hook
lib/youtube.ts            searchYouTube, splitArtistTitle/cleanTitle,
                          fetchVideoStats (duration + likeCount), fetchDuration
lib/lyrics/types.ts       LyricWord / LyricLine / LyricsResult / SongMeta
lib/lyrics/parsers.ts     parseTTML, parseLRC (incl. enhanced <mm:ss.xx>),
                          parsePlain
lib/lyrics/providers.ts   BetterLyrics → Unison → lrc.red → LRCLIB cascade +
                          per-provider fetch + LyricsProviderId list
lib/romanize.ts           ja (wanakana) / ko (Hangul tables) / zh (pinyin-pro,
                          lazy) detection + ensureRomanization
lib/translate.ts          chunked gtx translation with cache + timeout
lib/palette.ts            48×48 k-means palette, accent picking, total fns
components/
  LyricsView.tsx          THE karaoke engine (see §6)
  LyricsView.css          lyric tiers, two-layer wipe, mask feather, gaps
  AmbientBackground.tsx   WebGL cover-glow shader + palette tweening
  AmbientBackground.css   canvas/scrim/grain layers + CSS fallback
  PanelTabs.tsx           UP NEXT | LYRICS | COMMENTS | RELATED + toggles row
                          (sync badge, Source select, Original/Romaji/English)
  PlayerBar.tsx           full transport bar (see §7)
  TopBar.tsx              menu, wordmark, search, API key, Focus, cast, avatar
  Sidebar.tsx             76px icon rail (Home/Explore/Library/Upgrade)
  QueueList.tsx/.css      Up-next / Related rows with EQ indicator
  Slider.tsx              accessible thin slider (seek + volume)
  Pill.tsx / IconButton.tsx  chromeless controls
  phosphorX.d.ts          type shim: @phosphor-icons/react omits X's types
styles/
  fonts.css               @font-face for self-hosted SF Pro (public/fonts)
  tokens.css              every design token (spacing/type/color/shape/motion)
  base.css                reset, font imports, scrollbars, focus, reduced-motion
  shell.css               app grid, topbar, sidebar, player, menus, responsive
  panel.css               tab row, toggles row, pills, badge, select
preview/Preview.tsx       dev-only fixture: Yellow-style lines, 8.2s gap,
                          Japanese romaji line, rAF clock, animation self-check
```

`public/fonts/` — self-hosted SF Pro Display + SF Pro Text (400/500/600/700,
copied from a local install; served as-is, copied to `dist` on build).

---

## 4. Playback engine (`useYouTubePlayer` + `App` transport)

- Loads `https://www.youtube.com/iframe_api` once (module-level promise). The
  player lives in a 1×1 `opacity: 0` div — audio with no video chrome.
- Polls `getCurrentTime / getDuration / getVideoLoadedFraction` in rAF,
  committing React state at ~15fps (66ms throttle). Buffered fraction resets
  on every `load()`.
- `onEnded` handler (ref-stable, never breaks the player) drives **auto-advance**.
- **Repeat:** `off → all → one` (persisted). One replays via seek+play; off
  stops at the queue end; otherwise the queue rolls (shuffle stays shuffled).
- **Shuffle:** random non-repeating pick + capped (100) history stack.
- **Prev:** restarts the track past 3s (standard), else walks history, else
  steps back. `playTrack` records history so explicit picks stay rewindable.
- **Like count** is real (`videos.list` statistics, K/M/B formatted); unknown →
  icons only. Vote resets per `trackId`. **Buffered** seconds feed the rail
  under-fill. **Kebab** opens a frosted menu: Copy link / Open in YouTube.

---

## 5. Lyrics pipeline (fetch → parse → enrich → render)

```
track change ─▶ fetchVideoStats (duration+likes, cached per videoId)
            ─▶ fetchLyricsFromProvider(provider | auto-cascade, 8s timeout each)
            ─▶ parse (TTML / LRC / plain) ─▶ ensureRomanization ─▶ LyricsView
```

- **Cascade order:** BetterLyrics (Apple TTML, word timings) → Unison
  (videoId or title/artist, format-sniffed) → lrc.red (ISRC match → TTML) →
  LRCLIB (`get` → 404 → `search` → first synced hit). Never throws; total
  failure returns `{type:'plain', lines:[], source:'none'}`.
- **Classification** (`toResult`): any line with >1 word → `word`; any timed
  line → `line`; else `plain`. The badge shows exactly this
  (`Word-synced · <source>` + accent dot, etc.).
- **TTML parser:** namespace-safe, `p` begin/end/dur lines, `span`
  begin/end/dur words (relativized to `p`), transliteration roles →
  `word.roman`, translation roles → `line.translation`, neighbor-repaired ends.
- **LRC parser:** `[mm:ss.xx]` line tags (multi-stamp, `[offset:]`), enhanced
  `<mm:ss.xx>word` inline tags → per-word timings; single-word fallback lines.
- **Romanization:** kana→`wanakana.toRomaji`, Hangul decomposition tables,
  CJK→lazy `pinyin-pro`; song-aware ja/co/zh detection; never throws, 500ms
  race fallback. **Translation:** lazy on toggle, 8-line chunks, cached.

---

## 6. Karaoke renderer (`LyricsView`) — the heart of the project

React owns **structure + active-row class only**. All motion runs off the main
thread. Per-frame JS does zero DOM writes.

### 6.1 Smooth clock (dead-reckoning + drift correction)

The polled player clock arrives at ~15fps, so the engine extrapolates locally
every rAF while playing, then eases toward the poll — snap past 250ms drift,
otherwise 8% correction capped at 2ms/frame (ArchiveTune Enhanced technique).
Row flips and animation anchors use this smooth time: no stair-stepping.
**Lead is sync-aware:** ~0.02s for word-synced, ~0.3s for line-synced.

### 6.2 Two-layer word wipe (the important one)

Each word = static **dim base** + absolutely-positioned **bright overlay** with
identical letter spans. While live, the overlay is revealed left-to-right by
one WAAPI `clip-path: inset()` animation on the word's exact
`[start, end]` timeline (`fill: both`, so seeks land mid-wipe with no jump).
Settled words are static classes; cancelling an animation restores the hidden
clip, so teardown is free.

> **Why two layers:** the previous design (gradient `background-clip: text`
> over transform-animated letter children) mispaints on some Chrome/GPU
> setups — layout measured correct while paint piled every word into one
> blob. Clip-path over plain layers is boring and bulletproof. Crisp hard
> edge, no feather needed.

### 6.3 Letter ripple + line breath (YouLy+ rules)

- The **sung word** ripples **letter by letter**: each letter swells to 1.28
  and settles in turn, staggered across the word's duration on the wipe's
  timeline. Never a whole-word pop. (Spaces use explicit `\u00A0` so no
  encoding can silently rejoin words.)
- The **whole active line** breathes: inactive lines rest at 0.99 scale, the
  active line settles to 1.0 over 700ms — deliberately barely noticeable.
- Fades are long: group opacity 450ms, gap open 450ms, scroll tween 0.9s. The
  wipe itself stays locked to the singing (stretching it would desync karaoke).

### 6.4 Scroll, gaps, conflicts

- Active line pins to **true center** via one cancellable Motion tween (new
  tweens stop in-flight ones — stacked smooth-scrolls were the old jitter).
  Jumps >8 rows (seeks) snap; lines already in the middle band don't scroll
  at all; user scroll pauses auto-scroll 3s.
- ≥7s silences synthesize instrumental `• • •` rows with per-dot WAAPI fills
  + breathing; open/close choreography is DOM-class owned, never re-rendered.
- Pause freezes every compositor clock (`pause()/play()`); seeks rebuild
  anchors at the new time. `prefers-reduced-motion` = fully static.
- Active-row lookup is binary-search with a sequential hint; the initial row
  syncs on mount (a past bug left the first visible line unanimated).

### 6.5 Legibility system

Outfit→SF Pro Display Bold 700 32/42 lyrics; inactive lines dim flat
(.42 base → .18 far) with ≤1px whisper blur; 140px container edge feather;
romaji ruby 13px + translations 14px; hover clears to .8.

---

## 7. Player bar & shell UI

- **Bar:** transparent, chromeless — 3px seek hairline (accent glow on hover,
  live buffered fill), 40px thumb + ellipsis meta, shuffle/prev/56px white
  play/next/repeat (accent when engaged, `RepeatOnce` glyph for repeat-one),
  tabular time, bare thumbs, volume, kebab. Space toggles play globally.
- **Chrome philosophy:** the search box is the ONLY frosted surface (YTM-style).
  Toggles, badges, API field, avatar, player — all bare text/icons floating on
  the animated background. Transient overlays (kebab menu, mobile nav, error
  banner) stay frosted for legibility.
- **Fonts:** Poppins UI (ArchiveTune's app font) + self-hosted SF Pro stack
  for lyrics (real SF everywhere, Noto JP for kana/kanji). Phosphor icons only.
- **Background:** WebGL1 near-black + 3 drifting cover-tinted gaussians
  (incommensurate sine/cos phases — never loops), 0.5× res, ≤30fps, tab-hidden
  pause, static frame under reduced-motion, radial-gradient CSS fallback.
  Palette: 48×48 k-means, 1.2s tween on track change; `--accent` follows the
  cover (600ms crossfade) and drives progress/focus/EQ/wordmark-dot only.
- **Responsive:** rail collapses <1100px (overlay menu), single-column stack
  <900px with sticky tabs; player hides volume/time/count progressively.

---

## 8. Verification bench (`?preview`)

Dev-only fixture (zero prod impact): Yellow-style word timings, one 8.2s gap,
one Japanese romaji line, rAF clock with `?preview=<sec>` offset + wipe/gap/
romaji jump buttons — plus a **live self-check readout** (`X words / Y wipe
anims / Z total anims`) that proves per-word/per-letter WAAPI timelines are
running. Check it after any engine change.

---

## 9. Gotcha log (paid for in debugging hours)

1. Fresh GL programs start with `(0,0)` uniforms — always upload `uRes`, or
   StrictMode double-mount paints a black canvas.
2. `background-clip: text` + transformed children = paint blobs (see §6.2).
3. NBSP must be explicit (`\u00A0`/`fromCharCode(160)`), never a literal that
   an edit can silently convert to a collapsing space.
4. Dev server binds IPv6 `::1` — `localhost` works, `127.0.0.1` refuses.
5. `verbatimModuleSyntax` needs the `phosphorX.d.ts` shim for the `X` icon.
6. Automation browsers hate this page (YT iframe + WebGL + adblock); the
   Playwright MCP backend works when the T3 preview tabs wedge.

---

## 10. Known gaps / next tracks

- Real-cover glow + word-sync feel never verified against a real track with
  the API key (all cover states tested via fallback palette + fixture).
- No local audio/video file playback (YouTube streams only).
- No repeat/shuffle for Up-Next list UI itself; no lyrics offset control;
  translation gating is manual-toggle only.
- `dist/`, screenshots (`mush-*.png`), and `public/fonts/*.otf` are build
  inputs/outputs kept in-folder intentionally.
