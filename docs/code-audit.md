# ArchiveTune Desktop port — code quality audit ("spaghetti hunt")

Date: 2026-10-17 · Scope: `E:\mush\app` (read-only review; no source modified, no builds run)
Reference for drift: `E:\mush\src` (original web app). Known/expected and not re-litigated: `electron/services/store.mjs` is unwired, `global.css` reset was just added, `app/tsconfig.tsbuildinfo` on disk.

Method: full read of every file in scope, diff against the web originals (`git diff --no-index`) to separate port-introduced decay from shared web bugs, and a consistency sweep (localStorage keys, CSS tokens, bridge typing, listeners/timers).

Severity counts: **3 Critical · 6 High · 9 Medium · 8 Low**

---

## Critical

### C1 — The entire lyrics pipeline is stubbed out; ~1,000 lines of engine code are dead in the shipped path

**Files:** `E:\mush\app\renderer\src\screens\lyrics\LyricsScreen.tsx:26-33` (stub), `:90` (call), `E:\mush\app\renderer\src\state\session.ts:6,138`, entire `app/renderer/src/screens/lyrics/{api/providers.ts, engine/parsers.ts, engine/romanize.ts, engine/translate.ts}` (≈1,000 lines)
**Reference (web):** `E:\mush\src\App.tsx:156-215` — the web app loads lyrics on track/provider change via `fetchLyricsFromProvider` → `ensureRomanization` → `translateLines`.

`useLyricsLoader` is literally:

```ts
export function useLyricsLoader(_track?: TrackMeta | null): LyricsLoaderResult {
  return { lines: [], source: 'none', type: '', loading: false };
}
```

`session.ts:138` calls this stub, so `session.lyricsProps.lines` is always `[]`, source `'none'`, type `''`. The Lyrics screen therefore always renders "No lyrics yet", the sync badge always reads "No lyrics", and romanize/translate toggles are inert. `git diff` confirms `parsers.ts`, `providers.ts`, `romanize.ts`, `translate.ts` were copied nearly verbatim from `src/lib/lyrics/*` and are imported only through the unused barrel `screens/lyrics/index.ts:6-10` — the port's single biggest "patched seam".

**Fix:** Port the web effect into `state/session.ts` (or a real `screens/lyrics/useLyricsLoader.ts`), keeping the web app's cancellation flag and provider dependency:

```ts
// state/session.ts
useEffect(() => {
  const track = store.current; // derive from the player store, see H2
  if (!track) return;
  let cancelled = false;
  setLoading(true);
  (async () => {
    try {
      const res = await fetchLyricsFromProvider(provider, {
        title: track.title, artist: track.artist,
        videoId: track.videoId, duration: track.duration,
      });
      if (cancelled) return;
      const withRoman = await ensureRomanization(res.lines);
      if (!cancelled) { setLines(withRoman); setSource(res.source); setType(res.lines.length ? res.type : ''); }
    } finally { if (!cancelled) setLoading(false); }
  })();
  return () => { cancelled = true; };
}, [store.current?.videoId, provider]);
```

Then delete the stub, the duplicate call in `LyricsScreen.tsx:90`, and (later) the unused `SessionLyricsProps.lines` pass-through plumbing. Lazy-translate on toggle mirrors web `App.tsx:208-215`.

---

### C2 — LyricsView rebuilds every WAAPI animation on every rAF frame

**File:** `E:\mush\app\renderer\src\screens\lyrics\LyricsView.tsx:620-641` (the bare `{ ... }` block inside `tick`), claimed design at `:337-341` and `:617-619`

The comment says "Mount: … so sync it once here", but the block is unconditional inside `tick` and `tick` re-schedules itself at line 641. Result, at 60 fps:

- `syncLine()` (`:382-504`) runs `cancelRowAnims(key)` then calls `lit.animate(...)` for the wipe **and one ripple animation per letter** — for the active line every single frame. A 6-word × 4-letter line churns ~30 animations/frame (~1,800/s), the exact opposite of the file's "no DOM writes per frame / compositor-driven" contract.
- The catch-up branch (`:394-439`) is anchored at `now` (`delay: i * CATCHUP_STAGGER_MS`) but is destroyed and recreated every ~16 ms, so it can never progress: after a seek/late line activation, already-sung words stay stuck at ≈0 wipe progress (dim) instead of the intended staggered fill.
- `rowAnims` is replaced every frame, so the `playing` pause/resume effect (`:712-725`) operates on animations that are always milliseconds old.

This bug is shared with the web original (the port diverges from `src/components/LyricsView.tsx` only in two import lines), but it is real and it is the hottest loop in the app.

**Fix:** make the mount-sync one-shot and let the existing change-branch (`:663-687`) own line syncs:

```ts
let mountSynced = false;
const tick = (nowMs: number): void => {
  if (!mountSynced) {
    mountSynced = true;
    const row = activeRowRef.current >= 0 ? rowsRef.current[activeRowRef.current] : undefined;
    if (row) {
      if (row.kind === 'gap') { /* open + syncGap once */ }
      else syncLine(row.key, row.lineIndex, timeRef.current + leadRef.current);
    }
  }
  raf = requestAnimationFrame(tick);
  ...
```

For the catch-up branch, anchor the animation to line activation time (`delay` should be *negative* by the already-elapsed amount), or simply call `setWordState(el, 'past')` — the flourish is optional.

---

### C3 — PlayerScreen instantiates a second, ghost player store on every mount

**File:** `E:\mush\app\renderer\src\screens\player\PlayerScreen.tsx:22-24`

```ts
const fallback = usePlayerStore();   // always called
const s = store ?? fallback;
```

`App.tsx:57` always passes `session.store`, so the fallback store is never displayed — but its hook body still runs:

- a second 250 ms simulated-clock interval (`player.ts:317-326`),
- a second MediaSession registration (`player.ts:335-386`) — the last-registered handler set wins, and effect ordering (child before parent) makes which one wins fragile,
- a second `window.archivetune.onTransportKey` listener (`player.ts:389-422`): every media-key press mutates both stores (the ghost store's queue is empty, so mostly invisible, but the previous-track action is double-broken, see H1).

**Fix:** split the component instead of conditionally calling hooks:

```tsx
export default function PlayerScreen({ store }: PlayerScreenProps) {
  if (store) return <PlayerScreenView store={store} />;
  return <PlayerScreenWithFallback />;          // calls usePlayerStore() once
}
```

Or, since App always passes a store, make `store` required and drop `usePlayerStore` from this file.

---

## High

### H1 — `MediaPreviousTrack` sends an action the renderer never handles

**Files:** `E:\mush\app\electron\main.mjs:156-164` (registers `MediaPreviousTrack` → `sendTransportKey('previous')`), `E:\mush\app\renderer\src\state\player.ts:28` (`TransportAction = … 'prev'`), `:394-410` (`case 'prev'`)
**Why:** `'previous'` matches no case in the switch; the key is silently dead (and `preload.mjs:13` documents the wrong value too).
**Fix:** unify the union — either change `main.mjs:161` to `sendTransportKey('prev')`, or add `case 'previous'` alongside `'prev'` in `player.ts`. Prefer the former; add the string union to `preload.mjs`'s doc comment.

### H2 — Duplicated playback source of truth: `session.currentTrack` goes stale

**Files:** `E:\mush\app\renderer\src\state\session.ts:96,140-157` (`currentTrack` set only in `playVideo`), `PlayerScreen.tsx:129` (`s.next`), `:139` (`s.next`/prev), `:196` (`s.playIndex`), `E:\mush\app\renderer\src\state\player.ts:98-100` (`current` derived from the queue)
**Why:** the store advances tracks through next/prev/queue-click/auto-advance, but the lyrics `track` only changes when playback starts from Home/Search/Library. Press Play on a search result, then hit ⏭ in Player — lyrics (once C1 is wired) query the *previous* song. Also duplicated state to keep in sync.
**Fix:** delete `currentTrack` and derive:

```ts
const currentTrack: TrackMeta | null = store.current
  ? { title: store.current.title, artist: store.current.artist,
      videoId: store.current.videoId, duration: store.current.duration }
  : null;
```

### H3 — localStorage access is scattered across four modules with duplicated keys, parsers and writers

**Files:** `state/session.ts:53-91,99-136`; `screens/settings/SettingsScreen.tsx:15-58,80-117`; `state/feed.ts:32-43`; `state/library.ts:174-222`
**Why:** `ly_provider`, `mp_shuffle`, `mp_repeat`, `yt_api_key` are each read/written in two modules with *separately implemented* validation (`session.ts:57-91` inlines the provider list; `SettingsScreen.tsx:20-58` has `isProviderId`/read helpers for the identical keys). `ly_provider` is written by both `session.ts:102` (controlled) and `SettingsScreen.tsx:94` (fallback). Any future key change must be made in up to three places; divergence is guaranteed (already: session's `readProvider` and Settings' `isProviderId` must be kept in sync manually).
**Fix:** one `state/persist.ts` (or `lib/storage.ts`) with `getItem/setItem` wrappers + a `PROVIDER_IDS` set + typed `readProvider/readRepeat/readShuffle`, used by all four modules. Long-term this whole layer is replaced by the store.mjs IPC seam (see plan).

### H4 — Search: stale results / wrong loading state when the query changes or a fetch rejects after unmount

**File:** `E:\mush\app\renderer\src\state\feed.ts:291-326`
**Why:** the effect clears the debounce timer but nothing cancels an in-flight promise. Type "ab", wait for the request to launch, then clear the box → the old `.then((videos) => setResults(videos))` lands *after* the empty-query reset and repopulates results for a query that no longer exists. `.finally(() => setLoading(false))` also fires on the unmounted component. `retry` and `attempt` have the same issue.
**Fix:** capture a request token and guard every setter:

```ts
const seq = ++seqRef.current;
...
run.then((videos) => { if (seq === seqRef.current) setResults(videos); })
   .catch((e) => { if (seq === seqRef.current) { setResults([]); setError(...); } })
   .finally(() => { if (seq === seqRef.current) setLoading(false); });
```

(An `AbortController` passed into `searchViaBridge`/`searchYouTubeFeed` is better but requires signature changes.)

### H5 — Global utility CSS redefined per screen with conflicting values; effect depends on import order

**Files:** `screens/library/LibraryScreen.css:1-11` + `:228-260`; `screens/search/SearchScreen.css:1-11` + `:138-168`; `screens/home/HomeScreen.css:1-11` + `:179-187`; `screens/settings/SettingsScreen.css:150-172`
**Why:** the identical `:root { --at-* }` token block is copy-pasted into three files (a 4th, scoped, in Settings). `.at-empty` is defined three times identically; `.at-btn` is defined three times with **different padding** (Library `8px 14px` vs Search/Settings `8px 16px`) and `.at-btn--ghost` twice. Every screen imports its own CSS (`HomeScreen.tsx:4`, `SearchScreen.tsx:3`, …), so which `.at-btn` wins depends on Vite's module-graph CSS order — currently deterministic but one import reorder away from visual regressions. This is the clearest cross-wave seam (`screens-2` styles vs later screens).
**Fix:** create `renderer/src/ui.css` with the token block + `.at-btn{,--ghost,--danger}`, `.at-empty`, skeleton shimmer, imported once from `main.tsx` after `global.css`; delete the duplicates.

### H6 — `LyricsView.tsx` is a 869-line god component (one file = UI + row model + clock + WAAPI engine + scroll + gaps)

**File:** `E:\mush\app\renderer\src\screens\lyrics\LyricsView.tsx`
**Why:** five independent concerns share one closure and ~20 refs: row model (`buildRows`/`findRowIndex` `:32-105`), dead-reckoning clock (`:609-654`), WAAPI wipe/ripple engine (`:382-538`), gap choreography (`:353-379`), autoscroll tween (`:727-777`), plus the memoized `RowList` (`:138-241`). Every fix risks all five (C2 is proof). `LyricsScreen.tsx:31-33,90` adds a second, contradictory loader path on top.
**Fix (split targets, largest first):**
1. `engine/rowModel.ts` — `buildRows`, `findRowIndex`, `Row`, constants (pure, testable).
2. `useLyricClock.ts` — smooth clock + seek-jump detection.
3. `useWipeEngine.ts` — `syncLine`/`syncGap`/`resyncRowClock`/`fadeTeardownRow` + `rowAnims`.
4. `useLyricAutoScroll.ts` — autoscroll + user-scroll pause; `RowList.tsx` — presentational.
Do this **after** C1 so the engine can be exercised with real lyrics.

---

## Medium

### M1 — Dead PlayerStore API surface (`enqueue`, `setQueueItems`, `rawVolume`, `history`, `onEnded`)

**File:** `E:\mush\app\renderer\src\state\player.ts:264-277,431-436,47-54`
**Why:** none of these are consumed anywhere in the app (`grep` confirms). Some are deliberate forward API for the real engine (`handleEnded`, `onEnded`), but `enqueue`/`setQueueItems`/`rawVolume`/`history` have no consumer *and* no documented future caller; `PlayerStoreOptions` is never passed by `session.ts` (`usePlayerStore()` with no options).
**Fix:** either mark with a `// engine API — wired with hidden-IFrame playback` comment and keep, or drop `enqueue`/`setQueueItems`/`rawVolume` until the engine lands. Do not leave them silently "used-looking" in the `PlayerStore` type.

### M2 — Play button is dead at queue end (can't restart)

**File:** `E:\mush\app\renderer\src\state\player.ts:142-151` + `:328-332`
**Why:** stop-at-end sets `playing=false` but leaves `currentTime === duration`. Pressing Play sets `playing=true`; the ended effect immediately fires `handleEnded()` → repeat `'off'` && at end → `setPlaying(false)`. The transport play button becomes a no-op on a finished queue.
**Fix:** in `togglePlay`/`play`, reset position when parked at the end:

```ts
if (durationRef.current > 0 && timeRef.current >= durationRef.current) setCurrentTime(0);
```

### M3 — Store flush failure forgets pending writes (silent data loss)

**File:** `E:\mush\app\electron\services\store.mjs:147-178`
**Why:** `flush()` sets `needsFlush = false` (line 160) *before* the write; on `writeFile`/`rename` failure the catch (170-171) returns `false` and the dirty state is never retried until the next `set()` — a transient disk error drops the change even though `data` still holds it. `flushSync` has the same shape.
**Fix:** in the catch, `needsFlush = true` (and let `scheduleFlush` retry), e.g.:

```ts
} catch {
  needsFlush = true;
  return false;
} finally { flushInFlight = false; if (needsFlush) scheduleFlush(); }
```

### M4 — `main.mjs` blanket empty `catch` blocks make every real failure invisible

**Files:** `E:\mush\app\electron\main.mjs:20-22,31-33,56-60,71-73,118-120,124-126,133-137,142-145,165-167,174-176,180-182,195-197,212-214,227-229,240-242`
**Why:** the "headless smoke must never crash" goal is legitimate, but `createWindow` (36-74) swallowing a failed `loadFile` leaves users staring at a blank window with zero diagnostics; `setupIpc` (26-34) hides duplicate-handler bugs; `app.whenReady().then` hides all init errors. ~40 empty catches in 259 lines.
**Fix:** keep headless-safety, add logging in the catches that wrap *unexpected* failure: `catch (e) { console.error('[main] createWindow failed', e); }` for `createWindow`, `whenReady`, `setupIpc`, `loadFile`; leave the per-feature cosmetic catches (tray, menu, shortcuts) silent. Distinguish "feature may be unavailable in test" (silent) from "our own startup failed" (log).

### M5 — Every screen instantiates its own `useLibrary()`; persistence is last-writer-wins

**Files:** `E:\mush\app\renderer\src\state\library.ts:258-312`, `screens/home/HomeScreen.tsx:19`, `screens/library/LibraryScreen.tsx:59`
**Why:** Home and Library each run the full hook: each parses localStorage on mount, each `useEffect` saves the *whole* state on change (294-302), and cross-instance sync is a JSON-compare reload (263-291). Two instances that mutate near-simultaneously (e.g., `recordPlay` from a Home play + `toggleLike` in Library) can interleave so one write clobbers the other before the sync event lands. Also `JSON.stringify` on every state change per instance.
**Fix (short term):** hoist `useLibrary` into a single context provider at App level and pass slices/actions down, or memo-select. **Long term:** this is the file designed for the store.mjs backend seam (`LibraryBackend` at `library.ts:68-72`) — collapse to a store-backed implementation when it is wired.

### M6 — Whole-app re-render at 4 Hz; PlayerScreen re-subscribes its key listener every render

**Files:** `E:\mush\app\renderer\src\App.tsx:43` (`useSession()` subscribes App to the entire store), `state/session.ts:163-174` (unmemoized `lyricsProps`), `screens/player/PlayerScreen.tsx:30-41` (effect dep `[s]`, and `s` is a fresh object each render)
**Why:** the simulated clock `setCurrentTime` runs 4×/s whenever playing; every tick re-renders `usePlayerStore` → `useSession` → `App` → the active screen (Home/Library/Settings get re-rendered for unrelated state). In PlayerScreen, `[s]` re-adds/removes the `keydown` listener 4×/s.
**Fix:** deps that actually matter (`useCallback`-stable actions): `useEffect(..., [s.togglePlay])`; memoize `lyricsProps` with `useMemo`. Full fix (post-refactor): split the store so `currentTime` lives in its own context/store slice, or move to `useSyncExternalStore` for the player.

### M7 — `useSession().search` is created but never consumed; SearchScreen keeps its own copy

**Files:** `E:\mush\app\renderer\src\state\session.ts:95,176` (`search` in the Session object), `App.tsx:54-58` (never uses `session.search`), `screens/search/SearchScreen.tsx:19` (own `useYouTubeSearch()`)
**Why:** a dead second instance of the search hook (idle, but state identity outside anyone's control) and a phantom "shared search" contract in `Session`.
**Fix:** either pass `session.search` into SearchScreen (and drop the screen's own call) or remove `search` from `useSession`/`Session`. One owner.

### M8 — Playing from Search never records play history

**Files:** `screens/search/SearchScreen.tsx:21-29` (`onPlay` → `session.playVideo` only), vs `screens/home/HomeScreen.tsx:75-84` and `screens/library/LibraryScreen.tsx:76-79` (both call `lib.recordPlay`)
**Why:** the same "Play" affordance has different side effects per screen: songs played from Search never enter Songs/history, quick-picks or artists. `session.playVideo` is the shared choke point that should own it.
**Fix:** call `recordPlay` inside `session.playVideo` (it has `videoId/title/artist/thumbnail`), and remove the screen-level `recordPlay` calls (or keep a `lib` injection; either way one call site).

### M9 — `leadSec` is never wired to `syncType`; line-synced lyrics use the word-synced lead

**Files:** `E:\mush\app\renderer\src\state\session.ts:32-43` (`SessionLyricsProps` has no `leadSec`), `screens/lyrics/LyricsScreen.tsx:48-49`, `LyricsView.tsx:19-20,71` (default `LEAD_SEC = 0.12`)
**Why:** LyricsView's own doc says "~0 for word-synced, ~0.3 for line-synced so the eye lands early", but the wiring never supplies the line-synced value, so line-synced lyrics highlight late. Small but exactly the "seam patched over" pattern this audit was asked to find.
**Fix:** in `session.ts` compute `leadSec: loader.type === 'line' ? 0.3 : 0` and pass through `SessionLyricsProps` → LyricsScreen → LyricsView.

---

## Low

### L1 — Dead code and unreachable branches

- `LyricsView.tsx:841-849` — the skeleton branch is unreachable via the only consumer: `LyricsScreen.tsx:176-192` swaps to `.lyrics-empty` whenever `effectiveLines.length === 0`, so LyricsView is only mounted with a non-empty payload. (Keep if the component is intended for reuse; otherwise delete.)
- `state/feed.ts:236-262` — `getQuickPicks()`/`getHomeSections()` return `[]` and are referenced only by `useHomeFeed`, whose `quickPicks`/`sections` fields `HomeScreen.tsx:18` doesn't even destructure. `HomeFeedState`'s `loading: false` literal makes Home's skeleton branches (HomeScreen.tsx:100-111,150-162) permanently unreachable.
- `screens/lyrics/index.ts:4-10` barrel members (`LyricsView`, `parseLRC`, `ensureRomanization`, `translateLines`, `fetchLyricsCascade`, …) have no consumers outside the lyrics folder; they are the intended wiring surface for C1, so keep, but be aware every import of the barrel pulls the whole engine graph until C1 lands and tree-shaking gets a chance.

### L2 — Leftover "coder-N / screens-N / backend-1 / orchestrator" scaffolding comments

`state/feed.ts:4`; `state/player.ts:4,388,413`; `state/session.ts:10`; `state/library.ts:4,6,68`; `screens/settings/SettingsScreen.tsx:141-142`; `screens/lyrics/LyricsScreen.tsx:28-30`; `engine/romanize.ts:69`; `engine/optional-deps.d.ts:4`; `README.md:5,48`. `player.ts:388,413` ("until coder-1 lands preload") is now factually wrong — preload exists. Sweep them once the referenced workstreams land.

### L3 — Naming/ownership inconsistencies between waves

- localStorage keys mix conventions: `at-library-v1` (namespaced+versioned) vs `ly_provider`/`mp_shuffle`/`mp_repeat`/`yt_api_key` (bare, inherited from web).
- CSS namespaces: `at-*` providers/Library/Home/Search, `lv-*` LyricsView, `lyrics-*` LyricsScreen, plus generic unprefixed `pill`/`sync-badge`/`provider-field` in `LyricsScreen.css:80-199`.
- Modifier convention flips between BEM `--active`/`--ghost` and `is-*` (`PlayerScreen.css:331` `.at-eq.is-paused`) — fine per-file, inconsistent portfolio-wide.

### L4 — Dead CSS rules

- `SearchScreen.css:148-151` `.at-empty code` — SearchScreen renders no `<code>`.
- `LibraryScreen.css:256-260` `.at-btn .is-liked` — descendant selector; `is-liked` is applied to the same element (only `.at-btn.is-liked` can match).
- `LyricsView.css:378-380` `.lv-word { transition: none; }` under reduced-motion — `.lv-word` has no base transition to disable.

### L5 — Library opens on "Playlists", not the first tab

`LibraryScreen.tsx:60` `useState<LibraryTab>('Playlists')` while `TABS` (`:5`) starts at `Liked`. Either deliberate (playlists are the main verb) — then comment it — or a leftover.

### L6 — `store.set` 2-arg overload is a trap

`store.mjs:217-229`: `set("settings", "theme")` does **not** set `settings/theme` — it falls into the split branch and writes `default/settings = "theme"`. Only the 3-arg form is unambiguous for two-string keys. The accepted-forms comment (lines 13-23) shows only 3-arg or compound 2-arg usage, so it's safe today, but nothing enforces it.
**Fix:** document the rule loudly in the header comment, or require 3-arg for non-compound keys (throw in dev when `typeof a === 'string' && !isCompoundKey(a) && b !== undefined` with 2 args).
`payloadToKey` (`:359-381`) returning `[default, '']` for malformed payloads is a benign "read key `''`" fallback; fine, but a `console.warn` would help.

### L7 — Stale comments/odd file placement

- `vite.config.ts:4` says "outDir ../dist for electron/main.cjs" — the file is `main.mjs`.
- `main.mjs:2` points at "README in E:/mush/app" (fine) but `store.mjs:3` references a `HOOKS.md` that does not exist anywhere (checked).
- `screens/home/css.d.ts` (`declare module '*.css'`) lives inside the home screen folder; it should be `renderer/src/vite-env.d.ts`. It works only because ambient declarations are program-wide.
- `LyricsScreen.tsx:7` re-imports `./LyricsView.css` which `LyricsView.tsx:4` already imports (Vite dedupes; still confusing ownership).

### L8 — Stub clock constants duplicated

`player.ts:65` defines `TICK_SEC = 0.25` but `:319-324` hardcodes the interval at `250` ms — two sources for one cadence. Fold into one constant (`TICK_SEC * 1000`).

---

## Healthy — leave alone

- `electron/services/store.mjs` — the namespaced store's core mechanics are careful and worth keeping: atomic tmp+rename writes, debounced flush with in-flight coalescing (`:124-178`), `structuredClone` with JSON fallback, per-subscriber try/catch isolation, sender-destroyed cleanup in `registerStoreIPC` (`:413-501`). Only M3 (retry) and L6 (doc/signature) need touching before wiring.
- `electron/services/youtube.mjs` — genuinely good: null-tolerant renderer parsing, `AbortSignal.timeout`, dedupe by `videoId`, `parseDuration`/`artistFromOverlay` edge handling (`:35-142`). No changes recommended.
- `state/library.ts` sanitization layer (`:78-172`): versioned schema, corrupt-cache recovery, member-by-member validation. The most defensive file in the renderer; keep as-is.
- `state/player.ts` transport *core* (minus M1/M2/L8): ref-mirror pattern for stable callbacks, non-repeating shuffle (`:159-163`), 3-second prev-restart (`:179-182`), history cap, MediaSession wiring, StrictMode-tolerant cleanup. The pattern is sound; keep it.
- `LyricsView`'s row model (`findRowIndex` hint fast-path `:32-61`, gap synthesis `:87-105`) and the WAAPI two-layer wipe CSS (`LyricsView.css:158-198`) — the architecture is right; only the per-frame loop (C2) is wrong.
- `animate.ts` rAF tween with proper `stop()` and exception guards.
- `api/providers.ts` cascade — timeouts per request, never throws, honest `{type:'plain',lines:[],source:'none'}` fallback; identical to the battle-tested web version.
- `global.css` reset, preload bridge optionality/headless-safe unsubscribe (`preload.mjs:15-36`).

---

## Refactor plan (ordered; low-risk first)

**Phase 0 — no behavior deps, ship any time (small self-contained diffs)**
1. Fix H1 (`'previous'` → `'prev'` in `main.mjs:161`; fix preload comment).
2. Fix C3 (PlayerScreen hook split) — removes double store/clock/MediaSession/listeners.
3. Fix M2 (restart at queue end) and L8 (single tick constant).
4. Fix H4 (search request token guard) — three guarded setters.
5. Fix M8 (recordPlay inside `session.playVideo`; delete per-screen calls) and M7 (one search owner).
6. Fix M3 (store flush retry) — two lines; `store.mjs` stays unwired, this is pre-wiring hardening.

**Phase 1 — the big payoff: wire the lyrics pipeline (C1)**
7. Implement real `useLyricsLoader` (port `src/App.tsx:156-215`), delete the stub, derive `track` from `store.current` (H2), add `leadSec` by syncType (M9), lazy-translate on toggle. This activates ~1,000 lines of already-reviewed engine code and makes lyrics visible for the first time.

**Phase 2 — LyricsView surgery (do after Phase 1 so behavior can be verified against real lyrics)**
8. Fix C2 (one-shot mount sync; catch-up anchoring).
9. Split H6: `engine/rowModel.ts` → `useLyricClock.ts` → `useWipeEngine.ts` → `useAutoScroll.ts` → `RowList.tsx`; no behavior changes per commit; also fold the duplicate loader state in `LyricsScreen.tsx` (inner provider/roman/translation fallbacks stay only if standalone use is real).

**Phase 3 — consistency sweep**
10. H5 + L4: create `renderer/src/ui.css` (tokens + `.at-btn*` + `.at-empty` + shimmer), import from `main.tsx`, delete duplicates and dead rules.
11. H3: extract shared localStorage helpers; delete duplicated key constants/parsers in `session.ts`/`SettingsScreen.tsx`.
12. L1/L2/L3/L5/L7 cleanup: dead branches, scaffolding comments, key/comment hygiene.

**Phase 4 — architectural (needs store.mjs wiring first)**
13. **Must wait for store.mjs + a preload `store:*` bridge:** replace `localStorageBackend` with a store-backed `LibraryBackend`; move `ly_provider`/`mp_*`/`yt_api_key` persistence behind the same seam; then delete the localStorage helpers entirely. Until then, do not invest further in localStorage abstractions beyond H3's shared helpers.
14. **Should wait for the same wiring:** Settings "Clear cache" stub (`SettingsScreen.tsx:140-143`) and the M4 logging pass are cheaper once main-process store/IPC code is live.
15. M6 (render-granularity: player store slicing / `useSyncExternalStore`, memo boundaries) — do last, after C3 and Phase 1/2 remove the double-store and stub noise, so the profiling signal is real.

> Residual risk note: C2 and H1 exist identically in the web app (`E:\mush\src`), so both apps should be fixed in lockstep, or fixes backported.
