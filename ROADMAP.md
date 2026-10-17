# ArchiveTune Desktop — Roadmap

Purpose: sequence the Electron port of ArchiveTune from the current working shell to a shippable Tier-1 client, driven by `docs/archivetune-features.md` (feature inventory) and `docs/code-audit.md` (quality audit). How to use: find your item ID (P0-1, P1-2, R-3, …), read What/Why/Depends/DoD, claim it via the agent mailbox before touching files, and do not mark it done until its DoD is demonstrated. Items are the unit of work and the unit of reporting; phases are checkpoints, not gates for starting research. Any new workstream not in this doc needs the orchestrator to add an item first — nothing must-port may drift silently.

**Verified baseline (2026-10-17).** Repo `E:\mush` (main, pushed to git@github.com:Flare-0/mush.git). Web player `E:\mush\src` is DONE, READ-ONLY, and is the behavior/style reference; Android reference `E:\mush\archivetune-ref` is READ-ONLY; active port is `E:\mush\app` (renderer = React 19 + TS + Vite; electron = plain ESM `.mjs`, NOT typechecked). Build green: `tsc -b` + `vite build` exit 0. Electron boots 1440×900 ("ArchiveTune Desktop"), 6 screens render. Search works keyless via `electron/services/youtube.mjs` over `yt:search`. `electron/services/store.mjs` is complete but unwired. Playback is a simulated clock; the lyrics loader is a stub. Disk: C: ~2 GB free — caches on E:, run node binaries directly; `electron-builder` packaging has never been run; no gh CLI; single-instance lock (kill electron before fresh smoke).

---

## 2. Now / Next / Later

| Item | Why now | Where it is captured |
|---|---|---|
| **P0-1** Wire lyrics pipeline (C1+H2+M9) | Biggest user-visible gap; ~1,000 lines of reviewed engine code are dead; unblocks C2/H6 verification | §3 Phase 0 |
| **P0-2** LyricsView per-frame rebuild fix (C2) | Hottest loop in the app (~30 anims/frame); catch-up fill is broken | §3 Phase 0 |
| **P0-3** Kill ghost second player store (C3) | Duplicate clock/MediaSession/key listener on every Player mount; small, safe diff | §3 Phase 0 |
| **P0-4** Transport key `'previous'` → `'prev'` (H1) | Media Previous is silently dead; one-line union fix | §3 Phase 0 |
| **P0-8** Search request-token guard (H4) | Clearing the box repopulates stale results; visible bug | §3 Phase 0 |
| **P0-11** Store flush retry + set() trap doc (M3+L6) | Must land before the store is wired in P1-1 (silent data loss) | §3 Phase 0 |
| **R-3** ArchiveTune streaming-engine port spike | User decision: stream exactly like ArchiveTune (InnerTube + PoToken + `morideobfuscator` JS, native Node); gates P1-2 and downloads/quality/pitch/crossfade/EQ; runs in parallel with Phase 0 | §3 Phase R |
| **P1-1…P1-5** Store wiring, real playback, lyrics E2E | Foundations — every Tier-1/2 item depends on at least one of these | §3 Phase 1 |
| **P2-1…P2-31** Tier-1 wave | The must-ship slice that makes the app feel like ArchiveTune | §3 Phase 2 |
| **P3 / P4 / P5** Tier-2, Tier-3 + desktop analogs, Ship | Differentiators, then polish, then installer/updater/first-run | §3 Phases 3–5 |

---

## 3. Phased plan

Conventions: **Size** S ≤ half day, M ≈ 1–3 days, L ≥ 3 days of focused agent work. **DoD** must be demonstrable — exact command or observable behavior; "code looks right" is not a DoD. Unless stated otherwise, DoD assumes the baseline build stays green (see §5 for the exact recipe). Feature-report references are `docs/archivetune-features.md` domain rows; audit references are `docs/code-audit.md` IDs.

### Phase 0 — Stabilize

Fix the port's dead seams and quality defects before building on them. Order matters inside the phase: **C1 → C2 → C3 first**, then H-tier, then the M-tier real bugs, then hygiene. L-tier items fold into the H/M items they touch (L4→P0-6, L6/L7→P0-11, L8→P0-9, L1/L2/L3/L5/L7→P0-13). M1 is deliberately deferred into P1-2 (the engine decides which dead API survives); M4 into P1-1 (same main.mjs pass); M6 into P2-30 (needs a real perf signal).

- **P0-1 — Wire the lyrics pipeline end-to-end (C1 + H2 + M9).** · M.
  *What:* replace the `useLyricsLoader` stub with the real effect ported from the web original (`E:\mush\src\App.tsx:154-214`): on track/provider change → `fetchLyricsFromProvider` → `ensureRomanization` → lazy `translateLines` on toggle, with the web app's cancellation flag; delete the stub call at `screens/lyrics/LyricsScreen.tsx:90`; derive `track` from `store.current` instead of the stale `session.currentTrack` (H2, then delete it); compute `leadSec` by sync type (`'line'` → ~0.3, else 0) and pass through `SessionLyricsProps` (M9).
  *Why/refs:* audit C1 (`state/session.ts:6,138`; `screens/lyrics/{api/providers.ts,engine/*}` ≈1,000 dead lines), H2 (`session.ts:96,140-157`), M9 (`session.ts:32-43`, `LyricsView.tsx:19-20,71`); features report §3 (multi-provider fetch, sync model, romanization, translation).
  *Depends on:* —.
  *DoD:* play any track → Lyrics renders real lines and a correct sync badge; press ⏭ in Player → lyrics swap to the new track (proves H2); romanize and translate toggles change output; `grep -c "fetchLyricsFromProvider" app/renderer/src/state/session.ts` ≥ 1 and the stub body no longer exists.
- **P0-2 — LyricsView animation loop fix (C2).** · M.
  *What:* make the mount-sync one-shot (sync only on the first tick), let the existing line-change branch own per-line sync; anchor the catch-up branch to line-activation time (negative delay) or simplify to `setWordState(el,'past')`; stop replacing `rowAnims` every frame so pause/resume works.
  *Why/refs:* audit C2 (`screens/lyrics/LyricsView.tsx:620-641`, `:337-341`, `:617-619`; `syncLine` `:382-504`). **Decision (web-shared bug): fix in the port only.** The same bug exists in the web original (`E:\mush\src\components\LyricsView.tsx`), but `src/` is READ-ONLY in this effort and frozen as the behavior reference; a web backport is a post-ship human decision (OQ-6). Apply the same decision to H1 in P0-4.
  *Depends on:* P0-1 (real lyrics are needed to verify fills).
  *DoD:* instrument `lit.animate` calls — active-line animation creation drops from ~30/frame to ≤ one line's worth per line change; after a seek mid-line, already-sung words visibly fill (catch-up progresses instead of freezing at ~0); pause/resume freezes and resumes the wipe.
- **P0-3 — PlayerScreen ghost store split (C3).** · S.
  *What:* stop calling `usePlayerStore()` unconditionally; split into `PlayerScreenView({store})` + a fallback wrapper, or make `store` required (App always passes `session.store`).
  *Why/refs:* audit C3 (`screens/player/PlayerScreen.tsx:22-24`); removes the second 250 ms clock, second MediaSession registration and second `onTransportKey` listener (`state/player.ts:317-326,335-386,389-422`).
  *Depends on:* —.
  *DoD:* on the Player screen exactly one MediaSession is registered and exactly one store clock runs (temporary log/DevTools instrumentation); a media-key press mutates one store only; no visible behavior change.
- **P0-4 — Transport action union fix (H1).** · S.
  *What:* change `main.mjs:161` `sendTransportKey('previous')` → `'prev'` (preferred) and fix the stale action list in the `preload.mjs:13` comment.
  *Why/refs:* audit H1 (`main.mjs:156-164`, `player.ts:28,394-410`, `preload.mjs:13`); web-shared — same port-only decision as P0-2.
  *Depends on:* —.
  *DoD:* press the Windows "previous track" media key → the store switches to the previous track (was a no-op); no `'previous'` transport dispatch remains in `app/electron`.
- **P0-5 — Decompose LyricsView (H6).** · L.
  *What:* split the 869-line component in dependency order, no behavior changes per commit: `engine/rowModel.ts` (`buildRows`/`findRowIndex`/`Row`), `useLyricClock.ts`, `useWipeEngine.ts`, `useLyricAutoScroll.ts`, `RowList.tsx`.
  *Why/refs:* audit H6 (`screens/lyrics/LyricsView.tsx`); do after P0-2 so the split preserves fixed behavior; features report §3 (rendering & animation).
  *Depends on:* P0-2.
  *DoD:* all P0-1/P0-2 checks still pass; the extracted modules are the only owners of row model/clock/wipe/autoscroll; build green after each extraction commit.
- **P0-6 — Global UI CSS consolidation (H5 + L4).** · M.
  *What:* create `renderer/src/ui.css` with the shared `:root --at-*` token block + one `.at-btn{,--ghost,--danger}`, `.at-empty`, skeleton shimmer; import once from `main.tsx` after `global.css`; delete duplicated blocks from Home/Search/Library/Settings CSS and the dead rules (`.at-empty code`, `.at-btn .is-liked`, `.lv-word` reduced-motion transition).
  *Why/refs:* audit H5 (`LibraryScreen.css:1-11,228-260`, `SearchScreen.css:1-11,138-168`, `HomeScreen.css:1-11,179-187`, `SettingsScreen.css:150-172`), L4.
  *Depends on:* —.
  *DoD:* the `--at-*` token block exists in exactly one file; `.at-btn` base rule defined once; visual spot-check of Home/Search/Library buttons unchanged (padding conflict resolved to one value).
- **P0-7 — Shared localStorage helpers (H3, interim).** · S.
  *What:* one `state/persist.ts` (typed get/set, `PROVIDER_IDS`, `readProvider/readRepeat/readShuffle`) used by `session.ts`, `SettingsScreen.tsx`, `feed.ts`, `library.ts`; delete duplicated key constants/parsers and the double `ly_provider` writer.
  *Why/refs:* audit H3 (`session.ts:53-91,99-136`, `SettingsScreen.tsx:15-58,80-117`, `feed.ts:32-43`, `library.ts:174-222`). Interim only: P1-3/P1-4 replace this layer with the store backend — do not build more abstraction than the above.
  *Depends on:* P0-1, P0-8 (shared `session.ts`/`feed.ts`).
  *DoD:* each key (`ly_provider`, `mp_shuffle`, `mp_repeat`, `yt_api_key`, `at-library-v1`) is read/written from exactly one renderer module; changing the provider in Settings changes the same value `session` reads.
- **P0-8 — Search request-token guard (H4).** · S.
  *What:* capture `const seq = ++seqRef.current` per search/retry/attempt; guard every `setResults/setError/setLoading` with the token (an AbortController through the bridge is the better long-term fix, optional).
  *Why/refs:* audit H4 (`state/feed.ts:291-326`).
  *Depends on:* —.
  *DoD:* type a query, clear the box before it resolves → results stay empty; reject/unmount mid-flight → no post-unmount setState warning.
- **P0-9 — Queue-end restart + single tick constant (M2 + L8).** · S.
  *What:* in `play`/`togglePlay`, if parked at end (`currentTime >= duration > 0`) reset to 0 before playing; derive the interval from one constant (`TICK_SEC * 1000`) instead of the hardcoded `250`.
  *Why/refs:* audit M2 (`player.ts:142-151,328-332`), L8 (`player.ts:65,319-324`).
  *Depends on:* —.
  *DoD:* let the queue finish, press Play → playback restarts instead of a dead button; one tick-cadence literal only.
- **P0-10 — Play-history choke point + single search owner (M8 + M7).** · S.
  *What:* call `recordPlay` inside `session.playVideo` and delete the per-screen calls in Home/Library; remove the unused `search` from `useSession`/`Session` (SearchScreen keeps its own `useYouTubeSearch()`).
  *Why/refs:* audit M8 (`SearchScreen.tsx:21-29` vs `HomeScreen.tsx:75-84`, `LibraryScreen.tsx:76-79`), M7 (`session.ts:95,176`, `App.tsx:54-58`). **Decision:** SearchScreen stays the single search owner (session.search has no consumers).
  *Depends on:* P0-1 (shared `session.ts`).
  *DoD:* play a song from Search → it appears in Library songs/history data; `recordPlay` call sites are `session.ts` + library hook internals only; no `search` field on `Session`.
- **P0-11 — Store flush retry + `set()` trap doc (M3 + L6 + L7-store).** · S.
  *What:* in `flush()`/`flushSync()` catch paths set `needsFlush = true` so a failed write is retried; document/guard the 2-arg `set("ns","key")` trap (throw in dev for non-compound 2-arg); `console.warn` on malformed payloads; fix the header's nonexistent `HOOKS.md` reference.
  *Why/refs:* audit M3 (`store.mjs:147-178`), L6 (`store.mjs:217-229,359-381`), L7. Pre-wiring hardening — the store stays unwired until P1-1.
  *Depends on:* —.
  *DoD:* simulate a write failure in a scratch script (read-only dir) → after failure, a subsequent `set` still reaches disk; guard/comment present; no reference to a missing doc.
- **P0-12 — Library single-instance owner (M5 short-term).** · M.
  *What:* hoist `useLibrary()` into one App-level context/provider; pass slices + actions down; eliminate the two-instance parse/save JSON-compare clobber risk while keeping the localStorage backend (the store-backed `LibraryBackend` swap lands in P1-3).
  *Why/refs:* audit M5 (`library.ts:258-312`, `HomeScreen.tsx:19`, `LibraryScreen.tsx:59`).
  *Depends on:* P0-10 (shared screens).
  *DoD:* only the provider calls `useLibrary` (code review + one instance visible in React DevTools); play from Home and like in Library in quick succession → both persist after reload; single `at-library-v1` write per change.
- **P0-13 — Hygiene sweep (L1/L2/L3/L5/L7).** · S.
  *What:* remove leftover wave scaffolding comments (`coder-N`, `screens-N`, `backend-1`, `orchestrator`), the stale `player.ts:388,413` preload note, dead branches that P2 will not resurrect (LyricsView skeleton branch decision), key/class naming notes in L3, `L5` Library default-tab comment (keep `'Playlists'`), `vite.config.ts:4` main.cjs→main.mjs comment, move `screens/home/css.d.ts` to `renderer/src/vite-env.d.ts`, drop the duplicate `LyricsView.css` import in `LyricsScreen.tsx:7`.
  *Why/refs:* audit L1, L2, L3, L5, L7. Do NOT delete `getQuickPicks`/`getHomeSections` or Home skeleton paths — L1 notes they are the wiring surface for P2-11.
  *Depends on:* P0-5 (lyrics files settle), P0-12 (screens settle).
  *DoD:* no scaffolding comment matches remain; every L7 item addressed; build green; zero behavior change.

### Phase 1 — Foundations

Wire the persistence seam, make playback real, and prove the lyrics cascade. Phase 0 must be green before this phase starts. Suggested waves: **1A**: P1-1, P1-2, P1-5 (file-disjoint); **1B**: P1-3, P1-4 (after P1-1).

- **P1-1 — Wire `store.mjs` end-to-end + startup logging (M4).** · M.
  *What:* in `main.mjs`: `import { createStore, registerStoreIPC } from './services/store.mjs'`; inside `app.whenReady()` create `const store = createStore(app.getPath('userData'))` before `createWindow()`, call `registerStoreIPC(ipcMain, store)`, keep the store referenced, and call `store.dispose()` (flushSync) on `will-quit`. In `preload.mjs`: add an optional, headless-safe `store` bridge — `get(ns,key,fallback)` → `invoke('store:get',{namespace,key,fallback})`, `set(ns,key,value)` → `invoke('store:set',{namespace,key,value})`, `subscribe(ns,key,cb)` → `invoke('store:subscribe',…)` + a `store:changed` listener filtered by namespace/key, returning an unsubscribe (mirror `onTransportKey`'s try/catch style). Add a thin renderer client (`state/storeClient.ts`) with a localStorage fallback when the bridge is absent (pure-browser dev). Add M4 logging to `createWindow`/`whenReady`/`setupIpc`/`loadFile` catches (keep cosmetic feature catches silent).
  *Why/refs:* orchestrator-verified: store.mjs is complete but unimported; channels/comments at `store.mjs:396-404,503-558`; audit M4 (`main.mjs:20-22,31-33,56-60,71-73,…`), M3/L6 constraints already handled in P0-11.
  *Depends on:* P0-11 (`store.mjs` hardened).
  *DoD:* launch app, in DevTools `await window.archivetune.store.set('settings','probe',{ok:1})` returns `{ok:1}`; `%APPDATA%\archivetune-desktop\archivetune-store.json` (confirm actual name) contains the bucket; `store.get` returns it after a full app restart; a `subscribe` fires on `set`; no `.tmp` file left behind; startup failures now print `[main] …` errors.
- **P1-2 — Real playback via ArchiveTune's streaming engine.** · L.
  *What:* implement the R-3 engine port in the main process (`electron/services/stream.mjs`: resolve a `googlevideo` audio URL per videoId, mirroring `YoutubeiStreamRepository` + the `morideobfuscator` JS deobfuscator run natively in Node; cache/invalidate like `YTPlayerUtils` does), expose one IPC (`stream:resolve`) and play the resolved URL in an `<audio>` element in the renderer (no hidden YouTube iframe, no poll). Replace the simulated clock (`state/player.ts` `TICK_SEC` interval) with real audio events (`timeupdate`/`ended`/`loadedmetadata`/`error`) keeping transport/shuffle/history/MediaSession logic (`Healthy — leave alone` minus M1/M2/L8). Keep the audio backend abstracted so a local-file source (P2-13) can be added later. Resolve M1: consume or delete `enqueue`/`setQueueItems`/`rawVolume`/`history`. URL expiry/403 → exactly one re-resolve (mirror `isExpiredOrNearExpiredStreamUrl`).
  *Why/refs:* user directive OQ-1 ("stream EXACTLY like ArchiveTune using the engine it uses"); R-3 port plan; app refs `playback/stream/{YoutubeiStreamRepository,ResolveAudioStreamUseCase}.kt`, `utils/YTPlayerUtils.kt`; audit M1 (`player.ts:264-277,431-436,47-54`).
  *Depends on:* R-3 verdict (engine proven); P0-3, P0-9 (player.ts settled); P1-1 not required.
  *DoD:* real audio plays for a searched song via the same engine flow as ArchiveTune; play/pause/seek/volume from the UI affect real playback; progress comes from audio events, not the simulated tick; ended auto-advances per queue rules; offline/unreachable/blocked video → recoverable UI state, no crash; DevTools shows zero hidden YouTube iframes; a violated URL triggers exactly one re-resolve.
- **P1-3 — SQLite-backed library persistence + legacy migration (M5 long-term + OQ-2).** · L.
  *What:* replace the JSON file backend behind the `store.mjs` channels with SQLite (better-sqlite3, same `store:*` IPC contract — a backend swap inside/next to `store.mjs`); implement the `LibraryBackend` seam (`state/library.ts:68-72`) on `storeClient` (namespace `library`); hydrate on boot, write on change (debounced); one-time migration: if SQLite is empty and `at-library-v1` exists in localStorage, import it, then stop reading localStorage. **Native-module risk (first thing to verify):** a better-sqlite3 prebuild for Electron 39 on this machine, else `@electron/rebuild` (C: disk/gyp constraints) — if neither works, stop and report; OQ-2 reopens. Keep the JSON store as a fallback backend behind the same channels until SQLite is proven in a packaged/dev boot.
  *Why/refs:* user decision OQ-2 "SQLite required" (Room parity); audit M5 long-term note (`library.ts:68-72`), `Healthy — leave alone` sanitization layer (`:78-172`); P1-1 channels.
  *Depends on:* P1-1, P0-12.
  *DoD:* likes/playlists/play-history survive a restart with localStorage empty; the SQLite file in userData is openable by an external sqlite tool and holds the data; existing localStorage data migrates exactly once; corrupt/missing DB → clean defaults via the sanitization layer; dev boot with the native module loads without rebuild errors.
- **P1-4 — Store-backed session/settings persistence + migration.** · M.
  *What:* move `ly_provider`, `mp_shuffle`, `mp_repeat`, `yt_api_key`, session playback position/queue snapshot, and Settings screen prefs onto `storeClient` (namespaces `settings`, `session`); one-time migration from the legacy keys; then delete the interim helpers from P0-7 if fully unused. Queue snapshot is data-only — restore logic is P2-1.
  *Why/refs:* audit H3 (superseded), Phase 4 plan item 13 (`do not invest further in localStorage abstractions`); orchestrator fact: store namespaces prepared.
  *Depends on:* P1-1, P0-7, P1-3 (migration pattern).
  *DoD:* change provider/shuffle/repeat/settings → restart → values persist via the store file; legacy keys migrated once; no localStorage writes during a normal session (instrument or code review of remaining `localStorage.` uses shows only the legacy reader).
- **P1-5 — Lyrics cascade end-to-end proof + provider matrix.** · M.
  *What:* exercise the full path from P0-1 against every provider group in the report §3 (LrcLib, KuGou, BetterLyrics/Portato, YouLyPlus, SimpMusic, Megalobiz, Paxsenix, Unison, YT lyrics/subtitles), all sync types reachable in fixtures (plain/line/word), romanize + lazy translate; verify per-provider enable toggles are honored; apply the R-5 decision on where fetches execute (renderer vs main-process IPC) and fix failures accordingly; record the matrix in `docs/research/lyrics-provider-matrix.md`.
  *Why/refs:* audit C1/`api/providers.ts` cascade; features report §3 rows; R-5 spike.
  *Depends on:* P0-1, R-5.
  *DoD:* a table in `docs/research/lyrics-provider-matrix.md` with per-provider PASS/FAIL + failure mode (CORS/timeout/format); a song that exists only on a non-primary provider renders lyrics; toggling a provider off changes the chosen source; word-synced fixture shows word-level highlighting.

### Phase 2 — Tier-1 wave (core client)

Adopt the features report's Tier 1 list; the pieces already delivered by Phases 0–1 are marked "baseline exists". Suggested waves: **2A** engine-adjacent (P2-1…P2-7); **2B** data/library (P2-9…P2-16, after P1-3/P1-4); **2C** accounts/catalog (P2-17, P2-18, P2-10, after R-2/R-4); **2D** stream/downloads (P2-19…P2-21, after R-3); **2E** design/settings (P2-22…P2-28); **2F** P2-29, then P2-31 and P2-30 last.

- **P2-1 — Persistent queue & session restore.** · M.
  *What:* persist queue items + index + position (incl. radio "single-item" resume case from `PlaybackResumptionPlanner`) on change/quit; restore on boot without auto-playing; policy choice in settings (persistent queue toggle).
  *Why/refs:* features report §2 (persistent queue, `PlaybackResumptionPlanner.kt`); depends on the store (P1-1).
  *Depends on:* P1-2, P1-4.
  *DoD:* start a queue mid-song, quit, relaunch → same queue/index/position offered (paused), resume plays from the saved position; killed during a radio → radio resumes as one item; toggle off → queue starts empty.
- **P2-2 — Queue UI & queue actions.** · M.
  *What:* queue sheet/list UI (drag move, remove, clear), play next / add to queue from any item, current-item highlight; wire the store queue ops that exist (`state/player.ts`) and add missing ones.
  *Why/refs:* features report §1 (Queue sheet), §2 (queue system, per-source builders simplified for desktop); audit `Healthy` player transport core.
  *Depends on:* P1-2.
  *DoD:* from Search/Library: "play next" inserts after current, "add to queue" appends; reordering in the queue sheet changes playback order and persists per P2-1; removing the playing item behaves defined (skip to next).
- **P2-3 — Shuffle & repeat completion (+ permanent shuffle).** · S.
  *What:* verify shuffle/repeat against the Android semantics (shuffle non-repeating already exists `player.ts:159-163`); add the permanent-shuffle preference that survives queue rebuilds; repeat modes off/all/one with correct end behavior.
  *Why/refs:* features report §2 (shuffle & repeat, `PermanentShuffleKey`); audit `Healthy`.
  *Depends on:* P1-2.
  *DoD:* shuffle plays a non-repeating permutation then a fresh pass; repeat-one stays, repeat-all wraps; permanent shuffle on → autoplay/radio additions keep shuffle state; pref persists via store.
- **P2-4 — Radio / autoplay.** · M.
  *What:* "start radio" from any song/artist/playlist and autoplay continuation using the innertube "next/radio" endpoint (extend `electron/services/youtube.mjs`; exact endpoint params from R-2); dedicated radio queue source with no-repeat until exhausted.
  *Why/refs:* features report §2 (radio/autoplay, `startRadioSeamlessly`, YouTubeQueue/YouTubeAlbumRadio); R-2 evidence.
  *Depends on:* R-2, P1-2, P2-2.
  *DoD:* right-click → Start radio plays a continuous related-tracks stream beyond the current queue; autoplay appends more when the queue ends; radio items are real playable videoIds; failures surface as a toast, not a stall.
- **P2-5 — Player UI completion.** · L.
  *What:* finish the desktop player surfaces: persistent mini-player bar (outside Player route), bottom-sheet→full transitions, queue sheet (P2-2), buffering/error/no-audio states, artwork, and the V4/V9 style toggle baseline from settings.
  *Why/refs:* features report §1 (player UIs: MiniPlayer, Queue, Player.kt), §6 appearance (player design style); port baseline: Player screen exists with simulated clock.
  *Depends on:* P1-2, P2-2.
  *DoD:* audio playing on Home/Search/Library shows a live mini-player that can play/pause/skip and opens the full player; loading spinner during buffering; error state offers retry; style toggle visibly changes the full player without reload.
- **P2-6 — Sleep timer.** · S.
  *What:* timer in minutes + "pause at end of song" (-1) semantics; when it fires, suppress autoplay-resume (as `SleepTimer.kt` does).
  *Why/refs:* features report §2 (sleep timer, `SleepTimer.kt`, `Player.kt`).
  *Depends on:* P1-2, P2-5.
  *DoD:* set 1 minute → playback pauses at ~60 s; end-of-song mode pauses after the current track without advancing; timer countdown visible; cancel works.
- **P2-7 — Playback speed & volume.** · S.
  *What:* speed 0.25–2.0× via the IFrame `setPlaybackRate`; in-app volume slider mapped to `setVolume`. **Pitch is deferred to P3-3** — the YT IFrame audio is cross-origin and cannot be routed through Web Audio; pitch requires the direct-stream engine.
  *Why/refs:* features report §2 (playback speed & pitch, volume; `PlayerMenu.kt`).
  *Depends on:* P1-2.
  *DoD:* changing speed audibly changes tempo and survives track change per pref; volume slider affects output and persists; pitch UI is either absent or clearly labeled as coming with P3-3 (no dead control).
- **P2-8 — Search filters, suggestions, result pages.** · M.
  *What:* upgrade the existing keyless search to filters (Songs/Albums/Artists/Playlists/Videos) via innertube filter params, add suggestions/autocomplete, and typed result sub-screens; keep the debounce + P0-8 guard.
  *Why/refs:* features report §5 (online search filters, suggestions, result screens; `OnlineSearchViewModel`, `SearchFilter.*`); baseline: `electron/services/youtube.mjs` works keyless.
  *Depends on:* R-2, P0-8.
  *DoD:* each filter returns correctly-typed results (album/artist/playlist cards, not just songs); suggestions appear while typing and selecting one searches it; result pages open item details (P2-10) or play directly.
- **P2-9 — Search history + pause toggle.** · S.
  *What:* persist recent queries (store namespace `search`), show/clear them, honor a "pause search history" privacy toggle.
  *Why/refs:* features report §4/§5 (search history, pause search history; `SearchHistory`, `PauseSearchHistoryKey`), §6 privacy.
  *Depends on:* P1-1, P1-4.
  *DoD:* queries appear in a history list after searching; click replays the query; pause on → no new entries; clear empties it; all persist across restart.
- **P2-10 — Catalog screens: Artist, Album, Explore.** · L.
  *What:* artist page (songs/albums tabs), album page (track list + actions), Explore tab (moods/genres entry, new releases, charts using browse endpoints from R-2); all items playable/actionable via P2-14.
  *Why/refs:* features report §1 (artist, album, explore, charts, new release, browse); R-2 endpoint inventory.
  *Depends on:* R-2, P1-2, P2-14.
  *DoD:* open an artist from search → page loads real catalog content; album page plays any track; Explore shows mood/genre chips leading to populated lists; every endpoint failure degrades to an empty-state, not a crash.
- **P2-11 — Home completion & personalization.** · L.
  *What:* fill the home feed: YouTube Music home sections (via R-2 browse), account playlists (after P2-18), Quick Picks, Keep Listening, Forgotten Favorites driven by local play events; replaces the L1 empty stubs (`getQuickPicks`/`getHomeSections` return values) and their unreachable skeletons.
  *Why/refs:* features report §1 (Home screen), §4 (Quick Picks/Forgotten favorites/Keep Listening); audit L1 note; baseline: Home renders a basic feed.
  *Depends on:* P0-10, P2-10, P1-3; account sections also P2-18.
  *DoD:* Quick Picks populated from real play history after ≥1 playback; Keep Listening shows partially-played items; signed-out home still shows YT sections once P2-9 endpoints land; no permanently-empty skeleton states remain.
- **P2-12 — Library completion.** · L.
  *What:* all tabs (Songs/Albums/Artists/Playlists/Podcasts?/Local), sort + filter incl. tag filter, grid/list modes, in-library search, pull-to-refresh-style refresh feedback; artist/album detail navigation reusing P2-10 pages.
  *Why/refs:* features report §1/§4 (library screen 14 files, playlists, local search); baseline: Library screen with tabs exists.
  *Depends on:* P1-3, P2-10.
  *DoD:* liked songs sync to the Songs tab; album/artist tabs list correct entities; sort/filter change order without reload; in-library search finds local + liked items.
- **P2-13 — Local media indexing + local playback.** · L.
  *What:* folder scan (user-picked music folders) with metadata read (title/artist/album/artwork; pick a metadata lib only after checking size/licensing — prefer a small pure-JS reader), local library entities, hidden/unsupported-format handling, YouTube-matching aliases (best-effort), and a second playback source (HTMLAudioElement or custom `at-file://` protocol) integrated in the P1-2 engine; local songs sortable/searchable (P2-12).
  *Why/refs:* features report §4 (local media indexing, 8 files), §2 (local file playback); desktop = folder-scan analog.
  *Depends on:* P1-2, P2-12.
  *DoD:* point at a folder with 3+ audio files → they appear in Library > Local with tags and art; playing one produces audio and advances per queue; a file with no tags falls back to filename; unsupported files are skipped without breaking the scan.
- **P2-14 — Context menus + action plumbing.** · M.
  *What:* one shared item menu (songs/albums/artists/playlists): play, play next, add to queue, like/unlike, share (copy link), start radio (P2-4), download (P2-20, disabled until then), edit metadata (local only, P2-13), go to artist/album; consistent across Home/Search/Library/Player.
  *Why/refs:* features report §1 (context menus, `app/ui/menu/*`).
  *Depends on:* P2-2, P2-12.
  *DoD:* right-click/long-press menu appears on every item type with the correct subset of actions; each enabled action works; download/radio entries are hidden or honestly disabled until their items land.
- **P2-15 — Playlist CRUD & screens.** · L.
  *What:* local playlist create/rename/delete/add-remove/reorder with covers; playlist tags + tag filter; online (YT) playlist viewing + add; top/cache/auto playlist variants mapped to desktop equivalents (top mix stays NICE → §4 note); Spotify playlists remain NICE.
  *Why/refs:* features report §4 (playlists, playlist screens 12 files), §1 (playlist screens).
  *Depends on:* P1-3, P2-12, P2-18 (online playlists).
  *DoD:* create playlist → add songs → reorder → cover visible → survives restart; tags filter the library grid; an online YT playlist opens and plays; delete removes it everywhere.
- **P2-16 — Playlist import/export.** · M.
  *What:* CSV export (`Title, Artist, Album, Media ID` with formula-injection escaping), M3U import (online + local) with replacement search for missing tracks (import resolver), matching the Android repositories' behavior.
  *Why/refs:* features report §4 (playlist import/export; `PlaylistExportRepository`, `app/playlistimport/*`).
  *Depends on:* P2-15.
  *DoD:* export a playlist → CSV opens with escaped formula chars; import an M3U with one missing track → resolver finds a replacement (or reports it) and the playlist is created correctly; round-trip export→import preserves order.
- **P2-17 — Account & login.** · L.
  *What:* cookie-based YouTube login in an in-app WebView (`BrowserWindow`/`WebContentsView` + `session.cookies` extraction per R-4 strategy), advanced token login, saved multi-account store + quick switch, account screen + account settings (login/logout, sync status, force-sync-on-switch).
  *Why/refs:* features report §1/§4/§6 (login screen, account screen, saved accounts, account settings; `YouTubeLoginRepository`, `SavedAccounts.kt`); R-4 spike; OQ-3 gate.
  *Depends on:* R-4, P1-3 (account persistence), P2-24 (settings shell).
  *DoD:* sign in via the webview → account name/avatar appear; account-scoped data (liked songs, P2-18) loads; add a second account and switch → data swaps and force-sync runs; logout clears the cookie and scoped data; credentials never persisted outside the intended store/OS cookie jar.
- **P2-18 — YouTube Music library sync.** · L.
  *What:* sync liked songs/albums/artists/playlists from the signed-in account into the local library (innertube endpoints from R-2), with force-sync on account switch.
  *Why/refs:* features report §4 (YT Music library sync, `ForceSyncOnSwitchAccountKey`).
  *Depends on:* P2-17, R-2, P1-3.
  *DoD:* after login, liked songs appear in Library and mark items across the app; toggling liked state writes through (guest fallback: local-only like, flagged); switching accounts re-syncs without stale rows.
- **P2-19 — Direct-stream resolution + PoToken strategy.** · L. *(Gated on R-3 go.)*
  *What:* resolve audio stream URLs via the innertube player endpoint (formats/itags, request headers, URL expiry, auth fingerprint) and attach a botGuard/PoToken per the R-3 verdict (WebView-based generator, a maintained native module, or yt-dlp delegation for downloads only).
  *Why/refs:* features report §2 (stream resolution pipeline, PoToken/BotGuard; `AudioStreamRepository`, `app/utils/potoken/*`); R-3 spike decides feasibility/approach; OQ-1.
  *Depends on:* R-3, P1-2.
  *DoD:* for a range of songs (incl. one that fails in the IFrame) produce a working direct audio URL and play it through the engine (or the documented alternative accepted in OQ-1); expiry/rotation handled (re-resolve mid-track); failures degrade to IFrame playback.
- **P2-20 — Downloads.** · L. *(Gated on P2-19.)*
  *What:* download manager (parallel, resumable chunks), per-song artworks, download-all-in-playlist, download library screen, storage location selection + change, delete/retry; auto-download-on-like and smart trimmer stay NICE (§4/§2).
  *Why/refs:* features report §2 (downloads, `DownloadUtil.kt`, `ExoDownloadService`, `DownloadRepository`), §1 (download library screen).
  *Depends on:* P2-19, P2-27.
  *DoD:* download a song from its context menu → appears in the download library with art; plays offline (airplane/blocked network); resume after app restart; playlist "download all" queues every track; changing the storage folder migrates existing files.
- **P2-21 — Audio quality & format selection.** · M. *(Gated on P2-19.)*
  *What:* quality policy AUTO/HIGH/HIGHEST/LOW + pinned itag, metered-network awareness (best-effort on desktop), and a resolved-stream info readout; persists preferred format.
  *Why/refs:* features report §2 (audio quality & format selection, `AudioQuality`, `PreferredFormatKey(-s)`).
  *Depends on:* P2-19.
  *DoD:* AUTO vs LOW audibly/observably selects different formats (verify via the readout); pinned itag requests that format; setting persists; unsupported pin falls back to AUTO with a notice.
- **P2-22 — Theming & design system completion.** · M.
  *What:* finish the CSS design system on top of P0-6 (`renderer/src/ui.css`): Material-3-like tokens, dark/light/AMOLED (pure black), blur/backdrop effects (backdrop-filter, with a disable switch), custom theme color; dynamic color/tonal-palette generation stays NICE.
  *Why/refs:* features report §8 (M3 theming, blur/backdrop; `Theme.kt`, `DisableBlurKey`, `BlurRadiusKey`); port baseline: dark shell + global.css reset.
  *Depends on:* P0-6.
  *DoD:* switching light/dark/AMOLED restyles every screen without reload; blur toggles visibly change backdrop surfaces and can be disabled; a custom accent color propagates app-wide; no hardcoded colors outside tokens (spot-check).
- **P2-23 — Artwork-derived player colors.** · S.
  *What:* sample the current artwork thumbnail (canvas) to derive player background/slider accents, with a graceful fallback palette; if `i.ytimg.com` canvas readback is tainted, fetch the image through the main process (net) and pass a data URL.
  *Why/refs:* features report §8 (artwork-derived player colors; `PlayerColorExtractor.kt`, `PlayerBackgroundColorUtils.kt`).
  *Depends on:* P2-22, P1-2.
  *DoD:* different album art produces visibly different player palettes; very dark/light art still yields readable text; switching tracks updates the palette smoothly; no console CORS errors.
- **P2-24 — UI component kit + settings structure.** · M.
  *What:* shared components (nav, lists/grids, buttons, menus, dialogs, snackbar, preference rows) and the Settings root as a grouped list matching the report's groups (account, stats, appearance, player, lyrics, content, privacy, integration, ai, internet, storage, backup, update, about) — groups can lead to placeholder "coming in P3/P5" pages until their items land.
  *Why/refs:* features report §8 (UI component set), §6 (settings root, `SettingsScreen.kt`, `SettingsDataBuilders.kt`); baseline: Settings screen exists.
  *Depends on:* P2-22.
  *DoD:* every settings group from the report exists and navigates; no duplicate ad-hoc button/dialog implementations added in P2-25…P2-28 (each uses the kit); visual consistency spot-check.
- **P2-25 — Animation toggles & transitions.** · S.
  *What:* a global "disable animations" preference plus the small set of transitions (screen fades, player morph, lyric flourishes); respect `prefers-reduced-motion` and the toggle everywhere.
  *Why/refs:* features report §8 (animations; `DisableAnimationsKey`, `V9AnimatedPlaybackControls.kt`); audit C2 note — the WAAPI contract stays compositor-driven.
  *Depends on:* P2-24.
  *DoD:* toggle off → transitions/ripples removed and lyrics render statically; toggle persists; reduced-motion OS setting is honored independently of the app toggle.
- **P2-26 — Settings core: appearance, player, content, privacy.** · M.
  *What:* appearance (theme mode, AMOLED, blur, player style, fonts later), player prefs (audio quality [P2-21], persistent queue [P2-1], permanent shuffle [P2-3], crossfade placeholders lead to P3-1, auto-skip-on-error optional), content (language/country, hide explicit, hide video, app language), privacy (pause/clear history [P2-9, P3-10], reset stats [P3-11], screenshot-protection/haptics = ANDROID-ONLY dropped with a note); every setting reads/writes the store (P1-4). The AI content filter UI is NICE (P4-9).
  *Why/refs:* features report §6 (appearance, player, content, privacy rows).
  *Depends on:* P1-4, P2-22, P2-24 (and the feature items it exposes).
  *DoD:* each setting listed as active here visibly changes behavior and survives restart; no dead toggles (anything not yet implemented is absent, not inert).
- **P2-27 — Storage settings.** · M.
  *What:* clear downloads/song cache/image cache (electron `session.clearCache` etc.), max cache sizes (0=disable, -1=unlimited) enforced by the caches, storage folder pick + migration (P2-20), free-space display; smart trimmer stays NICE.
  *Why/refs:* features report §6 (storage settings; `StorageSettings.kt`, `StorageLocationRepository.kt`); audit plan item 14 (clear-cache stub).
  *Depends on:* P1-1, P2-20 (folder semantics), P2-24. (Cache clearing can land before P2-20 for images; downloads portion after.)
  *DoD:* clear-cache buttons measurably shrink the cache directory (check before/after sizes); free-space shows the real value; folder change migrates existing downloads and updates the pref.
- **P2-28 — Internet settings.** · M.
  *What:* proxy config (type/host/port/auth via `session.setProxy`), stream-bypass-proxy toggle, DoH provider/custom URL via `app.configureHostResolver`, connection test button; network warnings.
  *Why/refs:* features report §6 (internet settings; `InternetSettings.kt`, `ProxyUtils.kt`, `StreamBypassProxyKey`).
  *Depends on:* P1-1, P2-24.
  *DoD:* set a bogus proxy → connection test fails and the app reports it; disable proxy → test passes; DoH switch changes the resolver mode (verify via `net` logs or behavior with a controlled DNS name); settings persist.
- **P2-29 — Scrobble timing hooks.** · S.
  *What:* the timing engine behind scrobbling: scrobble delay percent/seconds + minimum song duration, emitting now-playing/scrobble events from the player store; actual Last.fm/ListenBrainz clients are P3-8/P3-9.
  *Why/refs:* features report §2/§7 (scrobble timing; `ScrobbleManager.kt` 156 ln, `ScrobbleDelay*Key`).
  *Depends on:* P1-2.
  *DoD:* with default timing, a track played past the threshold emits exactly one scrobble event (verify in DevTools logs); seeking forward counts correctly; tracks under the minimum duration never emit; percent/seconds settings change behavior.
- **P2-30 — Render-granularity pass (M6).** · M. *(Do last in Phase 2.)*
  *What:* stop App-level re-render at player tick rate: memoize `lyricsProps`, stable effect deps (`[s.togglePlay]` etc.), split `currentTime` out of the big subscription (context slice or `useSyncExternalStore`), memo boundaries in screens; re-profile after.
  *Why/refs:* audit M6 (`App.tsx:43`, `session.ts:163-174`, `PlayerScreen.tsx:30-41`), plan item 15 (do last so the profiling signal is real).
  *Depends on:* P1-2, P0-5, P2-5.
  *DoD:* React DevTools Profiler shows Home/Library/Settings do not re-render on each tick while playing; the PlayerScreen key listener is added once (effect counts); playback UI still updates smoothly.
- **P2-31 — Route graph & navigation completion.** · M.
  *What:* complete the route table from the report (~20 routes + settings subtree): every shipped screen reachable, deep back-stack via the desktop router, mini-player region persistent across routes; keep unmatched-report routes as placeholders only if absent from this roadmap.
  *Why/refs:* features report §1 (bottom nav shell, route graph, `NavigationBuilder.kt`); baseline: 6 screens.
  *Depends on:* P2-5, P2-24 (screens must exist first; may lag waves and finish last).
  *DoD:* every Phase-2 screen reachable by nav/back; back returns to the previous route; app reload lands on a sensible default; no orphan screens (unreferenced from nav) remain.

### Phase 3 — Tier-2 wave (signature differentiators)

The report's Tier-2 list minus the items already scheduled earlier for dependency reasons: internet settings (P2-28, needed by early features), playlist tags/filters (P2-15, belongs to playlist CRUD), quick picks/speed dial (P2-11, part of the Home feed), update channels (P5-2, needs the updater). Suggested waves: **3A** audio depth (P3-1…P3-3, after P2-19); **3B** lyrics depth (P3-4, P3-5); **3C** AI + scrobbling + stats/history (P3-6…P3-13); **3D** NICE differentiators (P3-14…P3-19, schedule only after Tier-1 is green).

- **P3-1 — Crossfade / gapless.** · M.
  *What:* crossfade (enable + duration) and gapless hand-off for the direct-stream engine; single-toggle gapless. If dual-stream playback proves infeasible with the P2-19 engine, record DEFERRED + reason in the coverage map instead of shipping a fake toggle.
  *Why/refs:* features report §2 (crossfade/gapless; `CrossfadeHandoffPolicy.kt`); gated on P2-19.
  *Depends on:* P2-19.
  *DoD:* with crossfade on, track transitions overlap audibly over the configured seconds; gapless mode removes the silence gap on a gapless album fixture; both off → unchanged behavior.
- **P3-2 — Equalizer (Web Audio).** · M. *(NICE per report; only after P2-19 makes audio routable.)*
  *What:* 8-band EQ profile model (band freqs/levels, output gain, bass boost, virtualizer best-effort, auto headroom) over a Web Audio graph on the direct-stream source.
  *Why/refs:* features report §2 (equalizer, `EqualizerModels.kt`, `EqualizerUseCases.kt`).
  *Depends on:* P2-19.
  *DoD:* band changes audibly alter playback; profiles save/load; bypass restores flat; no clipping on a loud fixture.
- **P3-3 — Pitch & loudness/normalization.** · M.
  *What:* pitch presets via playback-rate-preserving detune (completes P2-7's deferral) and loudness normalization using stream loudness metadata (approx. ReplayGain) via the Web Audio graph.
  *Why/refs:* features report §2 (playback speed & pitch, loudness/normalization; `LoudnessEnhancer`, `AudioNormalizationKey`).
  *Depends on:* P2-19, P2-7.
  *DoD:* pitch presets shift key without changing tempo; normalization on → clearly quieter/steadier perceived level across two fixtures with different loudness tags; settings persist.
- **P3-4 — Lyrics deep dive.** · M.
  *What:* complete the sync-model surface: word-level rendering verification (QRC/TTML fixtures), animated lyrics modes, line blur/text-size/spacing settings, romanization language prefs (ja/ko/zh/hi + others), translation UX polish, provider order/customization, click-to-seek/auto-scroll behaviors.
  *Why/refs:* features report §3 (sync model, rendering & animation, romanization, translation, provider order); baseline: P0-1 engine + P1-5 matrix.
  *Depends on:* P1-5, P2-22 (styling tokens), P0-5.
  *DoD:* word-synced fixture highlights per word and letters ripple; romanization language toggles change output per language; line blur/spacing/size settings visibly apply; click-to-seek jumps correctly; provider order pref changes the fallback sequence.
- **P3-5 — Lyrics settings screen.** · M.
  *What:* the report's lyrics settings surface: provider toggles + order (P3-4 data), romanization prefs, animation/blur/click behaviors, translation on/off + language; all persisted via the store.
  *Why/refs:* features report §3/§6 (lyrics settings; `LyricsSettings.kt` 1076 ln, `LyricsAnimationSettings.kt`).
  *Depends on:* P1-4, P2-24, P3-4.
  *DoD:* each toggle changes lyric behavior live (spot-check three); page survives restart; disabling all providers yields the honest "no lyrics" state.
- **P3-6 — AI provider service + AI settings.** · M.
  *What:* multi-provider AI client (ChatGPT/Gemini/OpenRouter/custom), model fetch/select, API key storage, custom translation prompt, API test button; keys stored in the store (document: plaintext JSON vs OS-safe storage — flag in OQ if the human requires encryption).
  *Why/refs:* features report §6/§7 (AI settings, AI provider service; `app/ai/*`).
  *Depends on:* P1-4, P2-24.
  *DoD:* enter a key → "test" reports success and the model list loads; invalid key reports the provider error; settings persist; key never logged.
- **P3-7 — AI lyric translation.** · M.
  *What:* translate the current lyrics document via the AI service with the custom prompt, cached per track/language, surfaced in the lyrics UI.
  *Why/refs:* features report §3 (AI lyric translation; `AiLyricsTranslator.kt`, `AiLyricsDocument.kt`).
  *Depends on:* P3-6, P0-1.
  *DoD:* toggle AI translation on a foreign-language fixture → translated lines appear aligned to the timeline; cached (no second request for the same track/language); provider error shows a retry state.
- **P3-8 — Last.fm scrobbling.** · M.
  *What:* Last.fm auth (API key/secret — see OQ-4), now-playing + scrobble submission using the P2-29 timing engine, offline queue for failed scrobbles, settings page.
  *Why/refs:* features report §7 (Last.fm; `:lastfm` module, `app/scrobbling/*`, `LastFMSettings.kt`).
  *Depends on:* P2-29, P2-24.
  *DoD:* connect an account (test key allowed) → a played track appears as now-playing and scrobbles once past the threshold; offline scrobbles flush on reconnect; disconnect stops submissions.
- **P3-9 — ListenBrainz scrobbling.** · S.
  *What:* token-based now-playing/submit with the same timing engine and a status/error surface inside Integration settings.
  *Why/refs:* features report §7 (ListenBrainz; `ListenBrainzManager.kt` 202 ln).
  *Depends on:* P2-29, P2-24.
  *DoD:* with a token, one submission lands per track (verify against the user's LB profile or a mock); invalid token shows an error; token persists.
- **P3-10 — Listening history screen.** · M.
  *What:* local play-event history (Today/Yesterday/This week/Last week groups) from the `library` event data, with clear/pause behavior, plus remote YT history if R-2 confirms the endpoint.
  *Why/refs:* features report §4 (listening history; `HistoryScreen.kt`, event table).
  *Depends on:* P1-3, P0-10 (events exist), P2-24.
  *DoD:* playback fills grouped history; clearing empties it; remote history appears when signed in (or the section is omitted with a note if R-2 says no).
- **P3-11 — Listening stats screen.** · M.
  *What:* play counts, top songs/albums/artists, unique counts, reset, over the local event data.
  *Why/refs:* features report §4 (listening stats; `ListeningStatsRepository.kt`, `ResetListeningStatsUseCase.kt`).
  *Depends on:* P3-10, P2-24.
  *DoD:* play a known fixture 3× → top lists reflect real counts; date-range behavior matches the report's grouping; reset clears to zero after confirmation.
- **P3-12 — Backup & restore (local).** · L.
  *What:* export a zip of the store JSON + (later) DB checkpoint; import/restore with validation; scheduled backups optional (worker analog = app-scheduler NICE).
  *Why/refs:* features report §4/§6 (backup & restore; `BackupArchiveRepository.kt` 240 ln, `BackupAndRestore.kt` 852 ln).
  *Depends on:* P1-3, P1-4.
  *DoD:* export → wipe store → import → library/settings/playlists restored (spot-check 3 entities); importing a corrupt zip shows a clean error and leaves data untouched.
- **P3-13 — Integration settings screen.** · S.
  *What:* the Integration hub listing Discord/Spotify/Last.fm/ListenBrainz with per-integration status; entries for not-yet-built integrations are absent until their items land.
  *Why/refs:* features report §6 (integration settings; `IntegrationScreen.kt` 705 ln).
  *Depends on:* P2-24, P3-8, P3-9.
  *DoD:* Last.fm/ListenBrainz rows navigate to working pages and show connected state; no dead rows.
- **P3-14 — Music recognition (Shazam-like).** · L. *(NICE — pull on request.)*
  *What:* mic capture → fingerprint identification → result details + recognition history (port of `app/musicrecognition/*` + `:shazamkit`); the item opens with a short spike to choose a viable desktop fingerprint backend (embedded lib vs external API).
  *Why/refs:* features report §7 (ShazamKit, `app/musicrecognition/*`), §1 (recognition screens).
  *Depends on:* P2-24 (UI shell), a viable fingerprint backend.
  *DoD:* hold-play a known track → a match with metadata appears (~≤15 s), or the item closes with a written DEFER + reason if no viable backend is found.
- **P3-15 — Canvas artwork.** · L. *(NICE — pull on request.)*
  *What:* looping video artwork (Apple Music-style) via the report's provider chain (AppleMusic/Spotify/Tidal through the artwork.boidu.dev API) with request policy + health tracking; player overlay surface.
  *Why/refs:* features report §7 (canvas module + `app/canvas/*`), §1 (canvas artwork player).
  *Depends on:* P1-2 (player), P2-22 (styles); API availability verified inside the item.
  *DoD:* a known canvas-enabled track loops its video in the player; API failure falls back silently to static artwork.
- **P3-16 — Discord Rich Presence.** · L. *(NICE — pull on request; needs a client id, OQ-4.)*
  *What:* OAuth login + local gateway client (`discord-rpc`-style), presence builder/policies, "show when paused" option, activity customization.
  *Why/refs:* features report §7 (Discord RPC; `app/discord/*`, `DiscordSettings.kt`).
  *Depends on:* OQ-4 (app client id), P2-24.
  *DoD:* with a client id, Discord shows the playing track (title/artist/artwork/time); pause hides or reflects per policy; disconnect clears presence.
- **P3-17 — Spotify import / connect.** · L. *(NICE — pull on request; needs OAuth keys, OQ-4.)*
  *What:* Spotify liked-songs/playlists import mapped to YT Music matches (port of `app/spotify/*`, `:spotifycore` auth/token models).
  *Why/refs:* features report §4 (Spotify import), §7 (Spotify connect).
  *Depends on:* OQ-4 (OAuth app), P2-15 (playlist creation), R-2 (matching search).
  *DoD:* connect Spotify → import a small playlist → tracks resolve to playable YT items with an unmatched-count report; tokens persist.
- **P3-18 — Year in Music.** · M. *(NICE — pull on request.)*
  *What:* annual recap screen generated from local listening stats.
  *Why/refs:* features report §1 (Year in Music; `YearInMusicScreen.kt`).
  *Depends on:* P3-11.
  *DoD:* seeded stats data produces a recap with correct top lists/counts; empty data shows an honest empty state.
- **P3-19 — Tier-2 stretch backlog (container, not an item).** · *(podcast screens, generic Browse, charts/new-release screens, embedded lyrics for local files, provider-order UI if not in P3-5.)* Entries have no work ID until the orchestrator pulls one; pulling requires adding a numbered item here with full What/Why/Depends/DoD/Size first.

### Phase 4 — Tier-3 + desktop analogs of Android-only items

All items here are NICE/optional except where noted; pull them after Tier-1 is green. Desktop analogs replace the ANDROID-ONLY rows (widgets, AOD, QS tiles, Android Auto, TV, haptics, screenshot protection — no desktop equivalent, dropped).

- **P4-1 — Real tray integration.** · M. *(NICE, but trays exist today with an empty icon — fix the empty `nativeImage` stub as part of this.)*
  *What:* tray icon asset (P5-1), now-playing tooltip + menu (play/pause/next/prev/like?), minimize-to-tray behavior, double-click restore; keep the existing `transport:key` plumbing.
  *Why/refs:* features report §2 (media notification NICE → desktop tray), §9 (widgets ANDROID-ONLY → tray as analog); baseline `main.mjs:76-146` builds the tray with `nativeImage.createEmpty()`.
  *Depends on:* P1-2, P5-1 (icon), P2-2 (current-item data for labels).
  *DoD:* tray shows the real icon and the current track title/artist; tray menu controls playback; closing the window can minimize to tray without stopping playback; quit works from tray.
- **P4-2 — OS media integration audit (MediaSession/SMTC).** · M.
  *What:* audit the renderer MediaSession wiring (`player.ts:335-386`) against the main-process `globalShortcut` media keys (`main.mjs:148-168`): ensure no double-handling (both paths currently fire on the same key), set rich metadata (artwork, album, duration), expose seek/position when supported, and verify Windows SMTC shows the app.
  *Why/refs:* features report §9 (media overlay analog), §2 (media notification NICE); port baseline has both layers live.
  *Depends on:* P1-2, P0-4.
  *DoD:* pressing a media key performs exactly one action (instrument both paths); Windows media overlay shows title/artist/art; play/pause/next/prev from the overlay work; no key is claimed twice.
- **P4-3 — Global shortcuts.** · S. *(NICE.)*
  *What:* a small customizable shortcut set (play/pause, next, prev, like, show window) with registration feedback; built on the existing `globalShortcut` scaffolding.
  *Why/refs:* features report §9 (desktop analogs of media buttons).
  *Depends on:* P4-2.
  *DoD:* each shortcut fires while the app is in the background; conflicts with other apps are detected and reported; bindings persist.
- **P4-4 — Deep links & file associations.** · M. *(NICE.)*
  *What:* register `archivetune://` protocol + `music.youtube.com`/`youtube.com` link handling → open the item in-app; "open with" audio file association → play locally (P2-13); single-instance second-launch forwarding (already partly present).
  *Why/refs:* features report §1 (deep links & share intents, `AndroidManifest.xml`, `handleDeepLinkIntent`).
  *Depends on:* P2-13, P2-10 (item resolution).
  *DoD:* opening an `archivetune://` test link launches/focuses the app on that item; clicking a YouTube Music link with the app registered opens the song; opening an audio file from Explorer plays it.
- **P4-5 — Desktop download integration.** · S. *(NICE.)*
  *What:* reveal-download-in-folder, copy file path, "open download folder" from the download library; external-downloader launcher analog (report §9) for users who want an external tool.
  *Why/refs:* features report §9 (external downloader; `ExternalDownloaderLauncher.kt`), §2 (downloads P2-20).
  *Depends on:* P2-20.
  *DoD:* buttons reveal the file in Explorer (or open the folder); paths are correct for the configured storage location; external launcher is optional/off by default.
- **P4-6 — Media info panel.** · S. *(NICE.)*
  *What:* technical readout of the resolved stream/file (codec, bitrate, sample rate, format id, expiry) reachable from the player.
  *Why/refs:* features report §9 (media info; `app/mediainfo/*`).
  *Depends on:* P2-19 (or P1-2 basics for local files).
  *DoD:* panel shows live values for a streaming track and a local file; unavailable fields render as "—", not errors.
- **P4-7 — Share as image.** · S. *(NICE.)*
  *What:* generate a share card (artwork + title/artist) via canvas → save/copy image.
  *Why/refs:* features report §9 (share as image; `ComposeToImage.kt`).
  *Depends on:* P2-22.
  *DoD:* produce a card PNG for a track; save and clipboard paths both work; artwork missing → card still generates with placeholder.
- **P4-8 — Appearance & library extras.** · M. *(NICE.)*
  *What:* hidden playlists, custom font file + system-font toggle, palette/theme creator, launcher-icon variants analog (tray/window icon picker), customize player background (image/color).
  *Why/refs:* features report §6/§8/§4 (hidden playlists, custom fonts, palette picker, icon screen, customize background); IconPack submodule empty (R-1) — desktop variants don't depend on it.
  *Depends on:* P2-22, P3-12 (export safety for backups).
  *DoD:* each pulled sub-feature has its own verification; as a set, none regress the P2-22 checks.
- **P4-9 — Tier-3 stretch backlog (container, not an item).** · *(About/Changelog, news feed (Koiverse repo — skip unless asked), Music Together party sync, Google Drive cloud backup (plus Dropbox/OneDrive alt), top mixes, auto-download/smart trimmer, next-track preloading, stream recovery/auto-skip-on-error, hide-video handling, immersive fullscreen player, proxy-bypass for streams, Koiverse gatekeeper/news/donate links.)* Entries get an ID + full fields only when the orchestrator pulls one; none block Tier-1/2 targets.

### Phase 5 — Ship

- **P5-1 — App icon & branding assets.** · S.
  *What:* icon set (window/installer/tray, `.ico` + sizes) wired into `package.json` build config and the tray (fixes the empty `nativeImage`), consistent product name "ArchiveTune Desktop", about panel branding.
  *Why/refs:* `package.json` build block, `main.mjs:80-85`; GPL-3.0 provenance note for derivative branding (report header).
  *Depends on:* —.
  *DoD:* window taskbar icon, tray icon and installer icon are all the real asset (no blank/default Electron icon anywhere).
- **P5-2 — electron-updater + update screen.** · M.
  *What:* electron-updater with stable/nightly channels (feed config in electron-builder), update check/download/install flow, an Update settings screen with channel + check button, and update-available/ready notifications.
  *Why/refs:* features report §6 (update screen; `UpdateScreen.kt`, `app/updates/*`), §9 (update installer → electron-updater).
  *Depends on:* P5-3 (needs a publish target to check against).
  *DoD:* with a local/file feed carrying a newer version, the app detects it, downloads it and offers restart-to-install (test with a bumped version); on latest, "up to date"; channel switch changes the feed.
- **P5-3 — Packaging & installer.** · L.
  *What:* run `electron-builder --win nsis` (first time ever — only after a green Phase 4), verify the installer on a clean VM/profile, decide code signing (OQ-5), ensure the packaged app's userData store and downloads paths behave, and add the packaging command to README.
  *Why/refs:* `package.json` build block is pre-configured (nsis, x64); orchestrator constraint: packaging has never been run.
  *Depends on:* Phases 0–4 green, OQ-5 answer.
  *DoD:* `release\` contains an NSIS installer; installing on a clean profile launches a window that plays audio, persists to the store, and survives uninstall/reinstall; no dev-only paths required.
- **P5-4 — First-run experience.** · M.
  *What:* adapted 4-step onboarding (WELCOME → PERMISSIONS analog → LOGIN → COMMUNITY, dropping Android permission steps), first-run defaults (theme, download folder, playback), About/license screen (GPL-3.0 + upstream credit).
  *Why/refs:* features report §1 onboarding (NICE adapted), §6 about.
  *Depends on:* P2-22, P2-24, P5-1; login step P2-17 optional-skip.
  *DoD:* fresh profile (wiped userData) shows onboarding once; each step works or is skippable; completing it lands on Home with chosen defaults applied; it never re-appears afterwards.
- **P5-5 — Release checklist & regression smoke matrix.** · S.
  *What:* a checked-in checklist: build green, phase smoke recaps, media keys/tray/store/lyrics/downloads spot-checks, version bump rules, installer smoke; run it before calling any release done.
  *Why/refs:* §5 checkpoints accumulate into this.
  *Depends on:* P5-3.
  *DoD:* checklist exists in `docs/release-checklist.md`; running it on the release candidate passes every line (with evidence noted).

### Phase R — Research spikes (run early, in parallel with Phase 0)

No source changes except research notes under `docs/research/`. Each spike ends with a written verdict memo.

- **R-1 — Submodule upstream verification.** · M.
  *What:* per `.gitmodules`, fetch and inspect the upstream repos for `:core` (InnerTube), `:lyrics:{kugou,lrclib,simpmusic,paxsenix,betterlyrics,unison,youlyplus}`, `IconPack`, `morideobfuscator` (upstream `github.com/rukamori/…` per report). **Do not init submodules inside `E:\mush\archivetune-ref` (read-only)** — clone into a scratch dir (e.g. `E:\caches\research\`) and record: real endpoint URLs, request/response shapes, provider parsing details, icon formats.
  *Why/refs:* features report "Evidence gaps" (`:core`, `:lyrics:*`, IconPack, morideobfuscator all empty in the snapshot).
  *Depends on:* —.
  *DoD:* `docs/research/submodule-verification.md` per module: checked-out commit, key files, endpoints confirmed/refuted, impacts on P2-4/P2-8/P2-10/P2-18/P1-5.
- **R-2 — InnerTube endpoint inventory.** · M.
  *What:* enumerate the endpoints `electron/services/youtube.mjs` must grow: search filters, suggestions, artist/album browse, home sections, radio/`next`, charts/new releases, liked-songs/library endpoints for P2-18; capture exact params (`params`/continuation tokens) and required headers.
  *Why/refs:* features report §1/§4/§5 rows; audit `youtube.mjs` as the working client.
  *Depends on:* R-1.
  *DoD:* `docs/research/innertube-endpoints.md` with a working request example per endpoint (curl/fetch + observed shape), noting auth requirements; flags any endpoint needing login.
- **R-3 — ArchiveTune streaming-engine port (go/no-go).** · L.
  *What:* port the exact engine ArchiveTune uses (user decision OQ-1): InnerTube `player` endpoint (same clients/visitorData/PoToken flow as `YoutubeiStreamRepository`) + stream URL resolution/deobfuscation via the `morideobfuscator` JS bundle, executed **natively in Node** (no QuickJS/Rhino port needed), then play the resolved `googlevideo` URL in an `<audio>` element. Sources (read-only): `E:\mush\archivetune-ref\app\...\playback\stream\*.kt`, `utils\YTPlayerUtils.kt`, `utils\potoken\*.kt`; clones at `E:\mush\scratch\core` (InnerTube client) and `E:\mush\scratch\morideobfuscator` (JS bundle + QuickJS worker). Prove feasibility by resolving ONE real audio stream from a `node` script (range-fetch first bytes). yt-dlp sidecar is the user-approved emergency fallback only. Gates P1-2, P2-19/20/21, P3-1/2/3.
  *Why/refs:* user directive OQ-1 ("stream EXACTLY like ArchiveTune using the engine it uses"); features report §2; engine recon 2026-10-17 (see §8).
  *Depends on:* —.
  *DoD:* `docs/research/streaming-engine-port-plan.md` — flow map (headers/clients/tokens → player response → URL decipher → playable URL), Node architecture for P1-2, and a REAL resolved stream URL fetched from a node script (or the precise blocking failure + the yt-dlp fallback decision).
- **R-4 — Cookie/login strategy.** · M.
  *What:* verify Electron WebView login → cookie extraction (`session.cookies` for `.youtube.com`), token lifetime/refresh, multi-account switching isolation (separate partitions vs cookie snapshots), and the risk posture for ToS/safety; recommends the P2-17 implementation.
  *Why/refs:* features report §1/§4 (login screen, saved accounts; `YouTubeLoginRepository.kt`, `SavedAccounts.kt`); OQ-3.
  *Depends on:* —.
  *DoD:* `docs/research/login-strategy.md` with a tested cookie flow recipe (or exact blocker), partition/isolation recommendation, and what breaks when logged out.
- **R-5 — Lyrics provider CORS/reachability matrix.** · S.
  *What:* for each provider in `renderer/src/screens/lyrics/api/providers.ts`, test the fetch from (a) the renderer and (b) node/Electron `net`; record which need to move to the main process (CORS), which need headers/UA, and which are dead; feeds P1-5's implementation choice.
  *Why/refs:* audit C1 (cascade never exercised in the port); P1-5.
  *Depends on:* —.
  *DoD:* raw matrix table handed to P1-5 (can live inside `docs/research/lyrics-provider-matrix.md` as its first section).

## 4. MUST-PORT coverage map

Every MUST-PORT row from `docs/archivetune-features.md` mapped to a phase/item. Nothing here is orphaned: items marked "gated" carry an explicit go/no-go (R-3) and an OQ for the fallback; substitutions are named. Domain 6's "Lyrics settings" and "Backup & restore settings" are the same surfaces as D3 #38 and D4 #49 (cross-references in the report, not new features).

| # | MUST-PORT feature (domain) | Covered by | Notes |
|---|---|---|---|
| 1 | Bottom navigation shell (D1) | P2-31 | Baseline exists (Home/Search/Library + Player/Lyrics/Settings). |
| 2 | Route graph (D1) | P2-31 | ~20 routes + settings subtree. |
| 3 | Home screen (D1) | P2-11 | Baseline exists (basic feed); personalization lands here. |
| 4 | Search screen (D1) | P2-8 | Baseline exists (working keyless search). |
| 5 | Explore tab (D1) | P2-10 | Needs R-2 browse endpoints. |
| 6 | Library screen (D1) | P2-12 | Baseline exists (tabbed v1). |
| 7 | Artist screens (D1) | P2-10 | Needs R-2. |
| 8 | Album screen (D1) | P2-10 | Needs R-2. |
| 9 | Song/album context menus (D1) | P2-14 | Menu kit + action plumbing. |
| 10 | Playlist screens (D1) | P2-15 | Local/online/top/cache/auto variants; Spotify = NICE. |
| 11 | History screen (D1) | P3-10 | Tier-2 per report. |
| 12 | Stats screen (D1) | P3-11 | Tier-2 per report. |
| 13 | Account screen (D1) | P2-17 | Depends R-4; OQ-3 timing. |
| 14 | Login screen (D1) | P2-17 | Desktop webview cookie login per R-4. |
| 15 | Download library screen (D1) | P2-20 | Gated on P2-19/R-3. |
| 16 | Player UIs (D1) | P2-5 | Baseline exists (Player screen + Lyrics screen). |
| 17 | Core playback engine (D2) | P1-2 (+ P2-19) | IFrame engine first; direct-stream upgrade gated R-3. |
| 18 | Queue system (D2) | P2-2 | Queue data logic partially in `player.ts`. |
| 19 | Persistent queue (D2) | P2-1 | Depends store (P1-1/P1-4). |
| 20 | Shuffle & repeat (D2) | P2-3 | Non-repeating shuffle baseline exists. |
| 21 | Crossfade / gapless (D2) | P3-1 | Gated P2-19; DEFERRED + reason if dual-stream infeasible. |
| 22 | Sleep timer (D2) | P2-6 | — |
| 23 | Playback speed & pitch (D2) | P2-7 (speed) + P3-3 (pitch) | Pitch explicitly deferred: IFrame audio is cross-origin → no Web Audio routing. |
| 24 | Volume control (D2) | P2-7 | Store volume baseline exists; maps to iframe `setVolume`. |
| 25 | Audio quality & format selection (D2) | P2-21 | Gated P2-19. |
| 26 | Stream resolution pipeline (D2) | P2-19 | Gated R-3. |
| 27 | PoToken / BotGuard auth (D2) | P2-19 (+ R-3) | Gated R-3; fallback decided in OQ-1. |
| 28 | Downloads (D2) | P2-20 | Gated P2-19; fallback in OQ-1. |
| 29 | Scrobble timing (D2) | P2-29 | Hooks only; clients in P3-8/P3-9. |
| 30 | Radio / autoplay (D2) | P2-4 | Needs R-2 endpoints. |
| 31 | Local file playback (D2) | P2-13 | Second engine source. |
| 32 | Multi-provider lyrics fetch (D3) | P0-1 + P1-5 | Wiring + E2E matrix. |
| 33 | Sync model (D3) | P0-1 + P3-4 | PLAIN/LINE/WORD; fixtures in P1-5. |
| 34 | Rendering & animation (D3) | P0-2 + P0-5 + P3-4 | C2 fix, decomposition, then polish. |
| 35 | Romanization (D3) | P0-1 + P3-4 | `ensureRomanization` wired in P0-1. |
| 36 | Translation (D3) | P0-1 (lazy on toggle) + P3-4 | — |
| 37 | AI lyric translation (D3) | P3-7 | Depends P3-6; provider keys per OQ-4. |
| 38 | Lyrics settings screen (D3) | P3-5 | Provider toggles/order/animation/blur/click. |
| 39 | Room database (D4) | P1-3 | **Substitution:** durable JSON store via `store.mjs` instead of Room/SQLite; SQLite only if scale demands (OQ-2). |
| 40 | Entities (D4) | P1-3 + feature items | Song/artist/album/playlist in P1-3/P2-15; events in P0-10/P3-10; search history P2-9. |
| 41 | YT Music library sync (D4) | P2-18 | Needs P2-17 + R-2. |
| 42 | Local media indexing (D4) | P2-13 | Desktop = folder scan (report-approved analog). |
| 43 | Playlists (D4) | P2-15 | Tags/filter included. |
| 44 | Playlist import/export (D4) | P2-16 | CSV + M3U + replacement search. |
| 45 | Listening history (D4) | P3-10 | Local events first; remote YT if R-2 confirms. |
| 46 | Listening stats (D4) | P3-11 | — |
| 47 | Quick Picks / Forgotten favorites / Keep Listening (D4) | P2-11 | Uses P0-10 event data. |
| 48 | Search history (D4) | P2-9 | — |
| 49 | Backup & restore (D4) | P3-12 | Local zip; cloud backup NICE (P4-9). |
| 50 | Multi-account saved accounts (D4) | P2-17 | R-4 isolation strategy. |
| 51 | Online search (D5) | P2-8 | Baseline works keyless; filters/suggestions added. |
| 52 | Search suggestions (D5) | P2-8 | Needs R-2 suggestion endpoint. |
| 53 | Local search (D5) | P2-12 + P2-13 | Library + local files. |
| 54 | Search result screens (D5) | P2-8 + P2-10 | Typed pages. |
| 55 | Pause search history (D5) | P2-9 | — |
| 56 | Settings root (D6) | P2-24 + P2-26 | Grouped list per report. |
| 57 | Appearance (D6) | P2-22 + P2-26 | Dynamic color/tonal palettes stay NICE. |
| 58 | Player settings (D6) | P2-26 + feature items | Each pref row links its feature item. |
| 59 | Content settings (D6) | P2-26 | AI content filter UI = NICE (P4-9). |
| 60 | Privacy settings (D6) | P2-26 (+ P2-9/P3-10/P3-11) | Screenshot-protection/haptics Android-only, dropped with note. |
| 61 | Storage settings (D6) | P2-27 | Smart trimmer NICE. |
| 62 | Internet settings (D6) | P2-28 | Proxy + DoH + test. |
| 63 | Integration settings (D6) | P3-13 | Rows appear as integrations land. |
| 64 | AI settings (D6) | P3-6 | Key storage caveat noted in item. |
| 65 | Account settings (D6) | P2-17 | Login/logout/sync/saved accounts. |
| 66 | Update screen (D6) | P5-2 | electron-updater. |
| 67 | Last.fm scrobbling (D7) | P3-8 | Keys per OQ-4. |
| 68 | ListenBrainz scrobbling (D7) | P3-9 | Token-based. |
| 69 | AI provider service (D7) | P3-6 | ChatGPT/Gemini/OpenRouter/custom. |
| 70 | Material 3 theming (D8) | P2-22 | CSS design system. |
| 71 | Artwork-derived player colors (D8) | P2-23 | Canvas sampling (+ main-process fallback). |
| 72 | Blur/backdrop (D8) | P2-22 | `backdrop-filter` + disable switch. |
| 73 | UI component set (D8) | P2-24 | Shared kit. |
| 74 | Animations (D8) | P2-25 | Toggles + transitions. |
| 75 | Update installer (D9) | P5-2 + P5-3 | Updater + NSIS packaging. |

## 5. Milestone checkpoints (after each phase)

Shared recipe — run in `E:\mush\app`:

```powershell
$env:npm_config_cache='E:\caches\npm'; $env:TMP='E:\caches\tmp'; $env:TEMP='E:\caches\tmp'
node node_modules/typescript/bin/tsc -b          # exit 0
node node_modules/vite/bin/vite.js build         # exit 0, dist/ rewritten
node node_modules/oxlint/bin/oxlint              # exit 0 (or `npm run lint`)
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force   # single-instance lock
node node_modules/electron/cli.js .              # fresh smoke boot
```

Expected boot: window 1440×900 titled "ArchiveTune Desktop", no unhandled errors in the DevTools console. Reminder: `electron/*.mjs` is NOT typechecked — main-process changes are verified by boot + behavior only.

- **Checkpoint 0 (after Phase 0):** lyrics appear for a played track and change on ⏭ (P0-1/H2); lyrics wipe runs without per-frame animation churn and catch-up fills after a seek (P0-2); one MediaSession/one store clock on Player (P0-3); Windows media Previous works (P0-4); clearing the search box mid-flight leaves results empty (P0-8); Play restarts a finished queue (P0-9); a play from Search lands in Library history (P0-10). Then git: only intended files changed; source sweep DoD greps from Phase 0 items pass.
- **Checkpoint 1 (after Phase 1):** store file appears in userData and survives restart (P1-1); real audio plays with working seek/volume/auto-advance (P1-2); library + settings survive restart with localStorage unread (P1-3/P1-4); the lyrics provider matrix has ≥1 PASS per provider group or a documented failure with workaround (P1-5).
- **Checkpoint 2 (after Phase 2):** a full user journey with no placeholder screens: search (filters/suggestions) → play → queue manage (play next/reorder) → survive restart mid-song (P2-1) → like → library/playlist → context menu actions → downloaded track plays blocked-network (P2-20) → palette follows artwork → settings all live. Navigation: every Phase-2 screen reachable and back-navigable (P2-31). Profiler: no app-wide rerender per tick (P2-30).
- **Checkpoint 3 (after Phase 3):** word-synced lyrics fixture verified; romanize + translate + AI translate live; one scrobble per track in both scrobblers; history/stats reflect real plays; backup export/import round-trips; every pulled NICE item individually DoD-verified.
- **Checkpoint 4 (after Phase 4):** tray controls playback with the real icon; exactly one handler per media key; deep link opens the item; downloads reveal in folder; no Android-only dead rows in Settings.
- **Checkpoint 5 (after Phase 5 / release candidate):** fresh-profile install from the NSIS package plays audio, persists state, updates against a test feed, and passes `docs/release-checklist.md` top to bottom.

## 6. Working agreement

- Keep the build green: every item ends with `tsc -b` + `vite build` (+ `oxlint`) exit 0 and a boot smoke if renderer/electron changed.
- Verify before claiming done: the item's DoD is the contract. Report the exact command/observation in your mailbox message — never claim a UI behavior you did not see.
- Mailbox: pick a fresh identity (`<role>-N@local`, e.g. `roadmap-1@local`), `am health` before sending, claim your item ID with `orchestrator@local` before editing shared files, and report status + evidence when done. Blocked > 20 min → mailbox the blocker (what broke, what you tried, what you need); do not thrash or guess.
- `E:\mush\src` and `E:\mush\archivetune-ref` are READ-ONLY references. Never edit them, never `git submodule update` inside them (R-1 clones to scratch).
- Disk rules: C: has ~2 GB free — set `npm_config_cache`/`TMP`/`TEMP` to `E:\caches\…`; run node binaries directly (no slow npm.cmd); never run `electron-builder` before Phase 5 and a human go-ahead.
- Don't re-architect the audit's "Healthy — leave alone" list (`store.mjs` mechanics, `youtube.mjs`, `library.ts` sanitization, `player.ts` transport core, LyricsView row model, `animate.ts`, `providers.ts` cascade, `global.css`, preload optionality).
- One writer per file at a time; before touching hot files (`state/session.ts`, `state/player.ts`, `main.mjs`, `App.tsx`) check the mailbox roster for concurrent claims. Commit only when the orchestrator asks; prefix messages with the item ID.

## 7. Open questions for the human

1. **OQ-1 — PoToken / offline downloads fallback (blocks P2-19…P2-21, P3-1…P3-3):** if R-3 is a no-go, is "IFrame-only audio, no offline downloads, no EQ/crossfade/pitch/quality choice" acceptable for v1, or should we adopt a yt-dlp sidecar for downloads?
2. **OQ-2 — Data layer substitution (affects P1-3):** OK to substitute the namespaced JSON store for Room/SQLite (SQLite native module only if scale demands), or is a real SQLite DB a hard requirement for parity?
3. **OQ-3 — Login timing (affects P2-17/P2-18):** ship the Tier-1 wave guest-first (search/play/library local) and add cookie/webview login after, or block Tier-1 on account login?
4. **OQ-4 — Third-party integration keys (affects P3-6…P3-8, P3-16, P3-17):** Last.fm API key, Discord app client id, Spotify OAuth app — you must register these; ship as user-supplied keys, provide your own, or drop these from scope?
5. **OQ-5 — Code signing (affects P5-3):** no cert is available in this environment — is shipping an unsigned NSIS installer (SmartScreen warnings) acceptable for the first release?
6. **OQ-6 — Web-app backports (referenced by P0-2/P0-4):** C2 and H1 exist identically in the frozen web original (`E:\mush\src`); fix port-only now confirmed — do you want a scheduled backport to the web app after this roadmap's Phase 2, or is the web app closed?

## 8. Decisions locked (2026-10-17, answered by the user)

| # | Question | Decision |
|---|---|---|
| OQ-1 | Streaming | **Stream exactly like ArchiveTune, using the engine it uses** — InnerTube + PoToken + the `morideobfuscator` JS deobfuscator, run natively in Node; play the resolved URL in an `<audio>` element. No IFrame player. R-3 re-scoped to the engine port (see §3); **yt-dlp sidecar is the emergency fallback only** if the port proves infeasible. |
| OQ-2 | Data layer | **SQLite required** (Room parity). The JSON store remains the P1-1 IPC seam; P1-3 swaps the backend to SQLite (better-sqlite3 prebuild/rebuild risk called out in P1-3). |
| OQ-3 | Login timing | **Guest-first** — the Tier-1 wave ships without login; cookie/webview login after (P2-17/P2-18 unchanged). |
| OQ-4 | Third-party keys | **Defer, optional later** — no key-dependent integrations in v1; Last.fm/Discord/Spotify stay unscheduled NICE items. |
| OQ-5 | Code signing | **Unsigned installer OK** for the first release (P5-3 proceeds without a certificate). |
| OQ-6 | Web backports | **Port-only** — `E:\mush\src` stays frozen; C2/H1 fixed in the port only. |

Engine recon facts backing OQ-1 (context for R-3/P1-2): `core` = standalone InnerTube client for YouTube Music (Ktor; NewPipe Extractor 0.26.2 for cipher/stream URL; Rhino for JS) — cloned to `E:\mush\scratch\core`. `morideobfuscator` = JS stream-URL resolver bundle (`javascript/src/*.js` → `youtubei.bundle.js`) + Android QuickJS worker (`YoutubeiQuickJsWorker.kt`) — cloned to `E:\mush\scratch\morideobfuscator`. In Node the JS runs natively. App-side flow reference: `playback/stream/{YoutubeiStreamRepository,ResolveAudioStreamUseCase}.kt`, `utils/YTPlayerUtils.kt`, `utils/potoken/{BotGuardTokenGenerator,ChallengeParser}.kt` (all local in `archivetune-ref`).

