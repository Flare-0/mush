# HANDOVER — ArchiveTune desktop port (next agent)

Date: 2026-10-17 · Repo: `E:\mush` (branch `main`)
Related commits: `9eec6e7` (Phase 0 audit fixes) · `efb7830` (ROADMAP + docs + R-3 evidence) · plus the commit that adds this file.

## Objective

1:1 Electron desktop port of ArchiveTune (Android Kotlin/Compose music player) at `E:\mush\app`.
**`E:\mush\ROADMAP.md` is the execution plan — read it before doing anything.** §8 holds the user-locked
decisions; §5 holds checkpoints (incl. the exact build/smoke recipe); §6 the working agreement. Work items
(P0-x, P1-x, …) are the unit of work; claim before touching files, don't mark done without demonstrating the DoD.

## State right now

- **Phase 0 fixes committed and verified by inspection on disk:** P0-3 (ghost player store), P0-4
  (media Previous key `'previous'` → `'prev'`), P0-8 (search race guard), P0-11 (store.mjs hardening).
  **NOT yet build/smoke-verified** — the joint verification was deliberately deferred; run it first (below).
- **R-3 (streaming engine spike): GO, with hard evidence.** The exact ArchiveTune `youtubei.bundle.js`
  (v18.0.0) runs in plain Node 24 with 8 bridge shims + 2 anchored in-memory patches; it resolved a real
  signed `googlevideo` audio URL (itag 140, audio/mp4, ~6 h expiry) and range-fetched `HTTP 206` bytes.
  Evidence: `docs/research/r3-spike-results.md` + reproduction script `docs/research/r3-resolve-stream-spike.mjs`
  (`node E:\mush\scratch\spike\resolve-stream.mjs dQw4w9WgXcQ`, exit 0 = verified).
  **Remaining R-3 scope:** the port-plan doc (flow map + `stream.mjs` design) that feeds P1-2 / P2-19.
- `docs/` also has the audit (`code-audit.md`), the feature inventory (`archivetune-features.md`), and a
  local viewer (`viewer.html` + `serve-docs.mjs`, port 4599).
- Working tree is clean except `app/tsconfig.tsbuildinfo` and `scratch/` (both intentionally uncommitted).

## Do first (in order)

1. **Verify the committed wave** — from `E:\mush\app`:
   ```
   Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
   node node_modules\typescript\bin\tsc -b; $LASTEXITCODE   # expect 0
   node node_modules\vite\bin\vite.js build                 # expect 0
   node node_modules\oxlint\bin\oxlint.exe .                # expect 0
   Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
   node node_modules\electron\cli.js .                      # boot smoke: search works, Player opens, P0-4/P0-3/P0-8 do not regress
   ```
   Note: `.mjs` files are not typechecked — verify by boot/behavior. (The user deferred running this
   earlier in the session; confirm before running if they are present.)
2. **Continue Phase 0** per ROADMAP §3. Recommended next: **P0-1 (lyrics sync, audit C2) → P0-2
   (lyrics perf)** — the biggest user-visible items. `state/session.ts` and `state/player.ts` are hot
   files: keep a single writer (one agent) per file; P0-9/P0-10 also touch player.ts.
3. **Write the R-3 port plan doc** (`docs/research/streaming-engine-port-plan.md`) from the spike
   evidence + `archivetune-ref` refs — unblocks **P1-2** (`electron/services/stream.mjs`, IPC
   `stream:resolve`, real `<audio>` playback replacing the simulated clock) and later P2-19.
4. **P1-1:** wire the hardened `store.mjs` behind preload/IPC (it is still unwired; P0-11 hardened it).

## Agent orchestration (same pattern the previous wave used)

- **Subagents:** T3 `delegate_task` (provider `opencode`, model `opencode/deepseek-v4.1-flash-free`).
  Children write their deliverables as they go and end their turn at completion — **always verify files
  on disk; don't trust summaries** (one summary arrived as mid-turn narration). Give each child:
  exact files allowed, "no builds / no commits" (orchestrator runs the joint build), read-only refs.
- **Mailbox:** server in `E:\agentmail` (`node src/server.js`, `127.0.0.1:3456`, CLI `am`). Restart hidden:
  `Start-Process node -ArgumentList 'src/server.js' -WorkingDirectory 'E:\agentmail' -WindowStyle Hidden`.
  Per-agent protocol: `$env:AGENTMAIL_FROM='<id>@local'; am health; am send orchestrator@local 'claim <item>'`
  → work → evidence report to `orchestrator@local`. Blocked >20 min → send blocker + stop.
  Earlier reports are still in the box (`am inbox` as `orchestrator@local`).
- **T3 child threads from the last wave** (project `e8521a8c-0e94-436b-920f-f48b094d7dd2`):
  completed: `feat-inventory-1`, `code-audit-1`, `roadmap-synth-1`, `p0-3-1`, `p0-4-1`, `p0-8-1`, `p0-11-1`;
  `r3-engine-1` was **interrupted** mid-investigation (after producing the working script — its thread has
  the full findings if resumed inside T3).

## Environment constraints (still apply)

- C: has ~2 GB free — installs only with caches redirected:
  `$env:npm_config_cache='E:\caches\npm'; $env:TMP='E:\caches\tmp'; $env:TEMP='E:\caches\tmp'`.
  `npm.cmd` is slow (cold boot); prefer direct `node node_modules\...` calls.
- `ELECTRON_RUN_AS_NODE=1` is set globally — remove before launching Electron.
- Electron has a single-instance lock — kill running electron before a fresh smoke.
- `html_preview` / `html_render` cannot reach loopback (SOCKS proxy error) — use the T3 preview tab for
  local pages (docs viewer: `http://localhost:4599/docs/viewer.html`; relaunch `serve-docs.mjs` if down).

## Git hygiene

- **Never `git add -A`** — `app/tsconfig.tsbuildinfo` is not ignored, and `scratch/` holds large clones
  (incl. `core`, `morideobfuscator`, and `scratch/spike/`). Stage explicit paths only.
- `E:\mush\src` (web original) and `archivetune-ref` are **READ-ONLY** (OQ-6: fixes are port-only).
- Do not edit `.gitignore` (user-approved as-is). CRLF warnings on commit are benign.

## Key paths

- `E:\mush\ROADMAP.md` — the plan (§8 decisions locked; P1-2/P1-3/R-3 were re-scoped to the engine-port approach).
- `E:\mush\app` — the port. Electron main: `app\electron\main.mjs`; services: `app\electron\services\{youtube,store}.mjs`;
  renderer state: `app\renderer\src\state\{feed,player,session}.ts`; screens: `app\renderer\src\screens\...`.
- `E:\mush\docs\` — audit, features, viewer, `research/r3-*` evidence.
- `E:\mush\scratch\morideobfuscator\src\main\assets\youtubei\youtubei.bundle.js` — the exact engine asset.
- `E:\mush\archivetune-ref` — Kotlin reference (streaming flow: `playback\stream\*.kt`, `utils\YTPlayerUtils.kt`, `utils\potoken\*.kt`).
