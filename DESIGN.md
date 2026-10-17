# DESIGN.md: mushplayer

> **Layout AND look = YouTube Music desktop now-playing (reference screenshots).**
> This file is the single source of truth for all visual decisions. When anything conflicts with older instructions, this file wins.
> **Never change app logic, data fetching, state, or features.** Only layout, styling, typography, spacing, color, icons, and motion.
> Engineering constraints that always hold: tokens-only styling (`styles/tokens.css`, no raw values in components), no logic/state/handler changes, keyboard + screen-reader accessibility, `prefers-reduced-motion` support.

---

## 0. How to use this file (instructions for the coding agent)

1. Read this entire file before touching code. Then read the existing components and CSS, and check `package.json` for the framework and styling approach.
2. Do it in **one pass**. No placeholders, no TODOs, no lorem ipsum. Everything must render and work at the end.
3. `src/styles/tokens.css` holds every token in this file. Components may only consume tokens (CSS variables), never raw hex/px values outside the scales below.
4. No new npm dependencies.
5. Preserve all props, handlers, state, API calls, and component names. Do not delete features. You may move + restyle only.
6. Do not ask questions. Make the best decision and note assumptions in the final summary.
7. When finished, run the checklist in section 14 and fix anything that fails.

---

## 1. Design principles (YTM reference)

1. **Near-black stage, color does the talking.** Base `#0a0a0c`; the only color fields are soft cover-tinted light glows. ~80% of the frame stays near-black.
2. **No sections.** Only the search box keeps its own frosted surface (YTM-style). Everything else — toggles, like buttons, API-key field, avatar, player bar — is chromeless and floats directly on the animated gradient background. Transient overlays (kebab menu, mobile nav, error banner) may stay frosted for legibility; hover/active feedback stays.
3. **Lyrics are the hero.** Left-aligned bold lines on the bare background — no cards, no centering, no glow. Active line pure white with a per-word wipe; near lines flat gray; far lines recede darker + blurrier.
4. **One dynamic accent.** Follows the cover (see §5/§12); used only for progress fill, focus rings, EQ bars, and the wordmark dot. Tab underline is white, not accent.
5. **Readable at arm's length.** Lyric lines 30px bold; UI text never under 12px.

---

## 2. Layout (YouTube Music now-playing grid)

Reference viewport 1600x900 (holds 900–2560px wide).

```
+------------------------------------------------------------------+
| TOP BAR 64px: [menu]      [ wide frosted search pill ]  [cast][avatar] |
+-----+----------------------------------------------------+-------+
| RAIL|  CENTER: art card ~440px, radius 12-16px,        | PANEL w/  |
| 76px|  thin light border                              | tabs: UP NEXT | LYRICS | COMMENTS | RELATED |
|Home/|                                                 | 12px letterspaced gray; active white + 2px |
|Expl/|                                                 | white underline. Lyrics inline. Two small  |
|Libr/|                                                 | frosted square buttons float bottom-right. |
|Upgr/|                                                 |                                |
+-----+----------------------------------------------------+-------+
| 3px progress hairline, full width (top edge of player)           |
| PLAYER: [40px thumb + title + artist · album · year] [shuffle prev PLAY next repeat] [time like-pill volume kebab] |
+------------------------------------------------------------------+
```

### 2.1 App shell
- CSS grid: `grid-template-columns: var(--sidebar-w) 1fr; grid-template-rows: var(--topbar-h) 1fr var(--player-h);`
- Sidebar spans rows 1–2. Top bar sits in column 2. Player spans both columns.
- `--sidebar-w: 76px`, `--topbar-h: 64px`, `--player-h: 76px` (+ 3px progress hairline on the player top edge).
- Whole shell `height: 100dvh; overflow: hidden`. Only the panel content scrolls (under 900px the main column stacks and scrolls).

### 2.2 Sidebar (YTM icon rail)
- 76px rail: **Home / Explore / Library / Upgrade**, white icons (22px) above tiny labels. No menu entry here — the hamburger lives in the top bar.
- Each entry maps to an EXISTING feature (lyrics / related / upnext / focus). Active: `fill` icon, `--text-1`; inactive: ~75% white.
- Transparent background, no border.

### 2.3 Top bar
- 64px, transparent flex row (`nowrap`, no absolute positioning — the search is a
  `flex: 1 1 auto` child with `max-width: 720px` + `margin: auto`, so it shrinks
  between the wordmark and the right cluster instead of overlapping either).
  Left: hamburger (40px ghost). Center: **wide frosted search pill** — 48px tall, dark translucent + `var(--glass)`, magnifier left, clear/search right. Right: API-key field (functional), Focus pill, cast ghost button, 32px avatar circle.

### 2.4 Main stage
- Padding `0 48px 24px 48px`, column gap 64px (48px under 1600px).
- `grid-template-columns: minmax(0, 1fr) minmax(500px, 560px)`.
- **Art card:** ~440px square, `object-fit: cover` (no letterbox), radius `--r-art` (16px), art shadow + thin light ring. Two frosted overlay buttons top-right on hover/focus. No meta under the art (title/artist live in the player).
- **Panel:** transparent surface, full height (lyrics sit directly on the background like the reference — no card, no border). No nested cards.
  - **Tab row** 56px: UP NEXT | LYRICS | COMMENTS | RELATED — 12px, 600, uppercase, letterspaced, gray (`--text-2`); active white with **2px white underline**. Never wraps/overlaps: horizontal scroll on narrow panels. **Lyric display pills (Original/Romaji/English) sit in their own slim right-aligned row directly under the tab row (lyrics tab only), so the tab row never gets cut off.**
  - **Content:** independent scroll, fade mask top/bottom (96px).
  - **Floating buttons:** two small frosted square buttons (40px, radius 12px) bottom-right of the panel — jump-to-current-line + scroll-down (DOM-only scroll helpers).

### 2.5 Player bar
- 76px + 3px hairline seek rail on its top edge (grows to 6px + accent glow on hover, 14px thumb on hover, ≥16px hit area). Rail `--surface-3`, fill `--accent`, buffered `rgba(255,255,255,.18)` fed live from the player. The ONLY seek control.
- Translucent-blur bar is gone — the player is fully transparent, controls float on the background.
- Grid `1fr auto 1fr`, padding `0 32px`.
- **Left:** 40px thumb (radius 8, hairline ring) + title 17px 1-line ellipsis + dim `artist · album · year` 14px.
- **Center:** shuffle / prev / 56px white circular play-pause (dark glyph) / next / repeat. Shuffle toggles random order (accent when on, history-aware prev). Repeat cycles off → all → one (accent when on, `RepeatOnce` glyph for one).
- **Right:** tabular time `0:34 / 4:27`, bare like/dislike icon buttons (real count from the API when known, icons only otherwise; vote resets per track), volume icon + 120px slider (white fill), kebab opening a frosted menu (Copy link, Open in YouTube).
- Track end auto-advances (repeat-one replays, repeat-off stops at the queue end). Prev restarts the song past 3s, otherwise steps through history.
- Space = play/pause (existing global handler). All controls labelled + focus-visible.

### 2.6 Responsive rules
| Width | Behavior |
|---|---|
| ≥1600 | Full layout, art 440px, panel 520–560px |
| 1100–1599 | Art ≤440px, panel 480–520px, gap 48px |
| 900–1099 | Rail collapses away (menu opens it as an overlay); volume slider + time hide first |
| <900 | Stack: art on top, panel full-width below with sticky tab row; main column scrolls |

---

## 3. Spacing (4px base grid)

Tokens: `--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;`
- Page gutters 48px (32px under 1280px). Panel inner padding 24–32px. List rows `12px 16px`, 4px between rows.
- Nothing touches a container edge.

---

## 4. Typography

Fonts: **Poppins** (UI — ArchiveTune's app font) + **SF Pro Display Bold stack** for lyrics (self-hosted from `public/fonts`, so the real SF renders on every OS — Inter Tight fallback, Noto Sans JP for kana/kanji). `font-feature-settings: "cv11", "ss01"`; tabular numerals for all times.

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| lyric | 32 / 42 | 700, -0.01em | lyric originals (left-aligned, `--font-lyric`) |
| lyric-sm | 13 / 18 | 500 | per-word ruby romaji (dimmer) |
| body-lg | 17 / 24 | 600 | player title, list titles |
| body | 16 / 24 | 500 | search input, translations |
| body-sm | 14 / 20 | 400–500 | artist, metadata, time |
| caption | 12 / 16 | 600, uppercase, 0.06–0.08em | tabs, labels |
| title-2 | 20 / 28 | 600 | wordmark, headings |

- Japanese: `letter-spacing: 0; word-break: keep-all; line-break: strict;`.
- Never truncate lyrics. Minimum text 12px (captions only).

---

## 5. Color

Dark theme only. Defined on `:root`.

```css
:root {
  --bg: #0a0a0c;
  --surface-1: rgba(255, 255, 255, 0.07);
  --surface-2: rgba(255, 255, 255, 0.09);
  --surface-3: rgba(255, 255, 255, 0.12);
  --border: rgba(255, 255, 255, 0.14);

  --text-1: #ffffff;
  --text-2: rgba(255, 255, 255, 0.55);
  --text-3: rgba(255, 255, 255, 0.40);

  --accent: #ff4d5e;   /* warm default; overwritten by cover color */
  --danger: #ff453a;
  --focus-ring: var(--accent);
}
```

- **Accent is dynamic:** most vibrant non-neon cover swatch (existing `palette.ts` logic: highest saturation×size, HSL clamped), applied via `setProperty('--accent', …)` with a 600ms crossfade. Default warm `#ff4d5e`.
- Accent is used **only** for: progress fill, focus rings, EQ bars, wordmark dot. (Active tab underline is white.)
- UI surfaces stay neutral white-alpha; the **background does the color work** (§12).

---

## 6. Shape, elevation, glass

```css
:root {
  --r-sm: 8px; --r-md: 12px; --r-panel: 16px; --r-art: 16px; --r-pill: 999px;
  --shadow-art: 0 24px 64px rgba(0,0,0,.55), 0 4px 16px rgba(0,0,0,.35);
  --shadow-player: 0 -8px 32px rgba(0,0,0,.35);
  --glass: blur(20px) saturate(1.4);
  --glass-strong: blur(20px) saturate(1.4);
}
```
- Shadows only on art + player. 1px hairlines only between panel/chrome and background.

---

## 7. Motion

- `--ease-out: cubic-bezier(.2,.8,.2,1)`; `--d-fast: 150ms` (hover/press), `--d-base: 300ms`, `--d-slow: 400ms` (lyrics), `--d-color: 600ms` (accent/palette).
- Buttons hover `scale(1.06)`, active `scale(.96)`. Animate only `transform`, `opacity`, `background-color`, `filter`.
- `prefers-reduced-motion`: static background frame, no transforms/looping animation.

---

## 8. Panel content

### 8.1 Up next / Related lists
- Row 72px, `12px 16px`, radius 12px, 4px gaps. Thumb 56px square radius 8, `cover`.
- Title 17px 2-line clamp `--text-1`; artist 14px `--text-2`; duration tabular `--text-3` right.
- Hover `--surface-2`; now-playing `--surface-3` + 3px accent bar + 16px 3-bar EQ (frozen when paused); focus 2px accent ring.
- Thin 6px scrollbar, thumb on hover.

### 8.2 Lyrics (the hero; YouLy+ behavior)
- Container: left-aligned, fills panel width, padding `48px 32px 32px`, line gap 26px, active group pinned at true center (0.9s cancellable Motion tween; seeks jumping >8 rows snap; lines already in the middle band don't scroll at all). User scroll pauses auto-scroll 3s.
- Mask: prominent feather — 140px fade top/bottom.
- Original 32/42 800 in `--font-lyric` (Outfit Variable, Noto Sans JP fallback for kana/kanji); romaji ruby 13/18 dimmer under each word (6px); translation 14/20 below (8px). 32px between groups.
- **Clock:** dead-reckoning (ArchiveTune Enhanced-style) — extrapolated locally every frame while playing, eased toward the ~15fps polled player clock (snap past 250ms drift, else 8% correction capped 2ms/frame). Lookahead is sync-aware: ~0.02s word-synced, ~0.3s line-synced.
- **Active group:** opacity 1, pure white, whole line breathes at full size (inactive lines rest at 0.99 scale — barely-there 700ms settle). Per-word wipe is two-layer (ArchiveTune's exact recipe): static dim base text plus a bright overlay revealed by an off-main-thread WAAPI gradient-mask animation per live word — soft 32px edge, crisp at rest, liquid in motion (JS only creates animations on line change, resyncs on seeks, `pause()`/`play()` on play-state). No glow. The sung word additionally ripples letter-by-letter (each overlay letter swells to 1.28 and settles in turn on the wipe's exact timeline — never a whole-word pop). Rule: no word ever changes state without a timeline — words already sung when their line activates arrive via a quick staggered catch-up cascade (300ms + 45ms stagger), and line flips freeze the outgoing masks and fade overlays out over 250ms instead of clearing. Past/future words at rest carry static classes (zero paint cost).
- **Near-inactive** (adjacent lines): flat gray `.38–.45`, **no blur**.
- **Far tiers** (`is-d1..d4` / `is-b1..b4`): `.42→.18` opacity with only a whisper blur ramp (0 → max ~1px — readability first). Past lines sit darker than read-ahead.
- Hover on inactive: opacity .8, blur 0. Click seeks (existing handler; `role="button"`, keyboard operable, `aria-current` on active).
- Gaps ≥7s render `• • •` rows with progressive fill + breathing while active.
- Empty/loading: three 28px shimmer lines; error: `--text-2` message + ghost Retry pill.

### 8.3 Interludes / repeats
Same style as any group. No special treatment.

### 8.4 Lyric display toggles
In their own slim right-aligned row under the tab row (lyrics tab only, 12px top padding, wraps instead of clipping): a **sync badge** (`Word-synced · <source>` with accent dot / `Line-synced · <source>` / `Unsynced · <source>` / `No lyrics` / `Searching…`, full explanation in `title`), a **Source** provider select (Auto = cascade BetterLyrics → Unison → lrc.red → LRCLIB, or one pinned provider; refetches the current track on change, persisted), text toggles **Original** (locked on), **Romaji**, **English** mapping to the existing options (chromeless — active is plain white text + `Check`), plus a Translate icon button.

---

## 9. Player bar

See §2.5. One 3px seek hairline (accent glow on hover, live buffered fill), one volume slider, consistent styling. 56px white play/pause; tabular time; frosted like/dislike pill with real API counts; working shuffle (accent) + repeat off/all/one; kebab opens a frosted menu (Copy link, Open in YouTube).

---

## 10. Icons: Phosphor only

- `@phosphor-icons/react`, individual imports, `currentColor`. `fill` for play/pause/skip/toggled-on; `bold` only ≤16px.
- Sizes: 16 (pills), 20 (inputs/volume), 22–24 (rail/secondary), 28 (prev/next), 32 (play glyph).
- Mapping: search `MagnifyingGlass`, clear `X`, menu `List`, play/pause `Play`/`Pause`, prev/next `SkipBack`/`SkipForward`, shuffle `Shuffle`, repeat `Repeat`, volume `SpeakerHigh/Low/Slash`, like/dislike `ThumbsUp/Down`, overflow `DotsThree`, focus `CornersOut`, lyrics jump `Quotes`/`ArrowLineUp`, scroll `CaretDown`, cast `MonitorPlay`, account `User`, API key `Key`, fallback art `MusicNotes`.

---

## 11. Interaction and accessibility

- Every interactive element: hover, active, focus-visible (2px `--focus-ring`, 2px offset), disabled. Hit areas ≥40px (sliders ≥16px tall).
- Tabs: `role="tablist"`, arrow-key navigation. Lyric groups: `aria-current` on active.
- Scrollbars 6px, transparent track, `--surface-3` thumb on hover.
- Dark only. Honor `prefers-reduced-motion`.

---

## 12. Background: "Near-black cover glow"

Goal: the reference now-playing backdrop — a BLACK field with 3 soft cover-color light blobs (strong warm top-left, faint bottom-center-left, whisper top-right) that drift slowly and **never visibly loop**. ~80% of the frame stays near-black. This replaces any full-coverage wash.

### 12.1 Architecture
- `src/components/AmbientBackground.tsx` + `src/lib/palette.ts` (palette logic unchanged).
- One `<canvas>` fixed behind everything (`position: fixed; inset: 0; z-index: -1; pointer-events: none`), then scrim + grain layers.
- Pure WebGL1, no new dependency. 0.5x render resolution, ~30fps cap, pause when `document.hidden`. `prefers-reduced-motion`: render ONE static frame.
- Fallback if WebGL fails: static near-black + 3-blob look via layered `radial-gradient`s riding `--accent` (which still follows the cover on the fallback path). No looping keyframe blobs.
- Gotcha (documented 2026-10): a fresh GL program starts with `(0,0)` uniforms — always upload `uRes` even when the canvas size is unchanged, or dev StrictMode double-mount paints black.

### 12.2 Palette extraction (`palette.ts`)
Unchanged: 48×48 canvas, k-means k=6×8 iters (deterministic), drop near-black/white, HSL clamp s .45–.85 / l .22–.58, top 5 by size (strongest repeated). Fallback palette + `#FF4D5E` accent default. Never throws.

### 12.3 Shader
Black base `vec3(0.039,0.039,0.047)` + 3 gaussians from `uC[0..2]` at sine/cos-drifted positions (incommensurate frequencies, top-biased blob uses `1.0 - y` because `gl_FragCoord` y is bottom-up). Widths ~0.5/0.7/0.9 viewport, intensities ~0.55/0.3/0.18, faint vignette. Blob A mixes 45% toward warm `(1.0,0.30,0.16)` so the first paint already glows like the reference before cover colors arrive. (`uC[3..4]` stay declared so the 5-color upload path is untouched.)

### 12.4 Behavior
- `uTime` accumulates from a random offset, never reseeded on track change.
- Track change tweens palette old→new over 1200ms (ease-in-out) while time keeps running; `--accent` crossfades over 600ms.
- Clock speed 1.0 playing → eases to 0.35 paused.
- No fake beat pulses.

### 12.5 Legibility layers
1. **Scrim:** `to bottom rgba(0,0,0,.25)→rgba(0,0,0,.45)` + left-to-right darkening behind the lyrics column.
2. **Grain:** 4% static SVG noise, `overlay`, anti-banding.
3. **Glass** on panel + player (§6).

---

## 13. Implementation notes

- `src/styles/tokens.css` (tokens) → `base.css` (reset/fonts/scrollbars) → components consume vars only.
- `src/preview/Preview.tsx` is DEV-ONLY (mounted from `main.tsx` only when `import.meta.env.DEV && location.search.includes('preview')`): hand-written 9-line fixture (Yellow-style ~0.3s word steps, one 8.2s gap, one ja line with per-word romaji) on an rAF clock, with `?preview=<seconds>` start offset and wipe/gap/romaji jump buttons. Zero prod impact — keep it for visual regression checks.
- Shader canvas never triggers React re-renders (refs + rAF). Karaoke wipe + bounce run on WAAPI compositor animations (`--p` per word, transform arch on the same timeline) fed by a dead-reckoning smooth clock; Motion `animate` for auto-scroll; React only flips active-row classes.
- Keep all existing keyboard shortcuts and handlers.

---

## 14. Done checklist (verify, then fix failures)

**Layout**
- [ ] Single-screen grid: 76px rail (Home/Explore/Library/Upgrade), 64px topbar with wide frosted search, ~440px art card (radius 12–16px, thin border), right panel with UP NEXT | LYRICS | COMMENTS | RELATED tabs, bottom player with 3px hairline on its top edge
- [ ] Art is a clean square crop with no black bars; two frosted overlay buttons top-right; no meta under the art
- [ ] Panel is transparent (no card — lyrics sit on the background); tab row never overlaps (scrolls on narrow); toggles in their own slim row under the tabs; two floating square buttons bottom-right
- [ ] Holds at 800, 1000, 1440, 1600+ px: rail away <1100px, stack <900px with sticky tabs

**Typography and lyrics**
- [ ] Lyric originals 32/42 extrabold Outfit left-aligned; romaji ruby 13px dimmer per word; translations 14px
- [ ] Active line pure white with mid-word gradient wipe (WAAPI `--p`, compositor-driven); near lines flat gray no blur; far tiers darker + whisper blur (≤1px)
- [ ] ≥7s gaps render dot rows with fill; ja line shows per-word romaji
- [ ] Original/Romaji/English toggles map to existing options

**Player**
- [ ] Seek hairline with hover glow + buffered fill, one volume slider; 56px white play circle; 40px thumb + dim subtitle; tabular time; like pill with real counts; working shuffle/repeat with accent states; kebab menu (Copy link, Open in YouTube); auto-advance + prev-restart

**Color and background**
- [ ] Near-black base with warm top-left glow + faint bottom warmth; ~80% stays dark
- [ ] Glow drifts without looping; 1.2s palette tween without motion jumps; static under reduced-motion; paused-tab safe; ≤30fps; CSS radial-gradient fallback works
- [ ] `--accent` follows cover, defaults warm `#ff4d5e`; active tab underline stays white

**Icons and states**
- [ ] Phosphor only, correct weights/sizes; hover/active/focus-visible/disabled everywhere; hit areas ≥40px

**Function**
- [ ] Plays, searches, seeks, switches tabs, toggles lyric languages exactly as before; `tsc --noEmit` clean; preview route dev-only

When finished, reply with a short summary of files changed and any assumptions made.
