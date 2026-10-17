# HANDOVER — ArchiveTune desktop port (next agent)

**Check which environment you are in first — it changes several steps below:**
- **Windows Sandbox (likely):** only **T3 Code + npm/Node** installed. No git, no gh, no host
  credentials, no host loopback services. See "Sandbox environment".
- **Host machine:** full toolchain (git + SSH + mailbox server) — use the "Host quirks" section.

Date: 2026-10-17 · Repo: `E:\mush` on the host · branch `main`
Commits: `9eec6e7` (Phase 0 audit fixes) · `efb7830` (ROADMAP + docs + R-3 evidence) · `9fc3968` (handover v1)
· plus the commit(s) updating this file.

## Objective

1:1 Electron desktop port of ArchiveTune (Android Kotlin/Compose music player), app at `<repo>\app`.
**`<repo>\ROADMAP.md` is the execution plan — read it before doing anything.** §8 holds the user-locked
decisions; §5 holds checkpoints (incl. the exact build/smoke recipe); §6 the working agreement. Work items
(P0-x, P1-x, …) are the unit of work; claim before touching files, don't mark done without demonstrating the DoD.

## State right now

- **Phase 0 fixes committed and verified by inspection on disk:** P0-3 (ghost player store), P0-4
  (media Previous key `'previous'` → `'prev'`), P0-8 (search race guard), P0-11 (store.mjs hardening).
  **NOT yet build/smoke-verified** — the joint verification was deliberately deferred; run it first (below).
- **R-3 (streaming engine spike): GO, with hard evidence.** The exact ArchiveTune `youtubei.bundle.js`
  (v18.0.0) runs in plain Node 24 with 8 bridge shims + 2 anchored in-memory patches; it resolved a real
  signed `googlevideo` audio URL (itag 140, audio/mp4, ~6 h expiry) and range-fetched `HTTP 206` bytes.
  Evidence: `docs\research\r3-spike-results.md`; reproduction script `docs\research\r3-resolve-stream-spike.mjs`.
  **Remaining R-3 scope:** the port-plan doc (flow map + `stream.mjs` design) feeding P1-2 / P2-19 — not written yet.
- `docs\` also has the audit (`code-audit.md`), the feature inventory (`archivetune-features.md`) and a local
  viewer (`viewer.html` + `serve-docs.mjs`, port 4599).
- Host working tree is clean except `app\tsconfig.tsbuildinfo` and `scratch\` (both intentionally uncommitted).

## Sandbox environment (when running in the Windows Sandbox)

- Verify, don't assume: `node --version; npm --version; git --version` (git probably missing).
- **Find the repo:** it arrives as a folder mapped from the host and may NOT be at `E:\mush` here. Locate
  the folder containing `ROADMAP.md` + `app\` + `docs\` (T3's project view shows its path). Call it `<repo>`.
- **Writability:** confirm the mapping is writable (create a temp file inside `<repo>`, then delete it). If
  it is read-only, STOP and tell the user to re-map the folder as writable in the `.wsb` config.
- **Persistence:** only mapped folders survive when the sandbox closes. Keep every deliverable inside
  `<repo>`; never park work in `C:\Temp` or the desktop. `node_modules` written into the mapped repo persists.
- **Version control:** almost certainly no git and no credentials. Do NOT promise commits/pushes from the
  sandbox — write changes into the mapped repo and report exactly which files changed; the host (or the
  user) commits. If git exists AND `git ls-remote origin` works, a push is a bonus, with normal hygiene.
- **Network:** internet works (NAT through the host). Host loopback services (e.g. a mailbox server on the
  host's `127.0.0.1`) are NOT reachable as `localhost` from here.
- **node_modules:** if `<repo>\app\node_modules` is missing, run `npm install` in `<repo>\app` first
  (downloads Electron, ~100 MB). If the mapping is the host's real `E:\mush`, it is already there.
- **Electron boot** works in the sandbox; if it trips on GPU, retry `node node_modules\electron\cli.js . --disable-gpu`.
- Host env quirks do NOT automatically apply here: `ELECTRON_RUN_AS_NODE` is likely unset (remove only if
  present); no `E:\caches` redirect needed unless the folder is mapped.

## Do first (in order)

1. Orient: find `<repo>`, check writability, `node/npm/git --version`.
2. **Verify the committed wave** — from `<repo>\app`:
   ```
   node node_modules\typescript\bin\tsc -b            # exit 0
   node node_modules\vite\bin\vite.js build            # exit 0
   node node_modules\oxlint\bin\oxlint.exe .           # exit 0
   Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
   node node_modules\electron\cli.js .                 # boot smoke: search works; Player opens; no P0-3/P0-4/P0-8 regressions
   ```
   `.mjs` files are not typechecked — verify by boot/behavior. The user deferred running this earlier;
   confirm with them before running if they are present.
3. **Continue Phase 0** per ROADMAP §3. Recommended next: **P0-1 (lyrics sync, audit C2) → P0-2
   (lyrics perf)** — the biggest user-visible items. `renderer\src\state\session.ts` and `player.ts` are
   hot files: keep one writer per file; P0-9/P0-10 also touch `player.ts`.
4. **Write the R-3 port plan doc** (`docs\research\streaming-engine-port-plan.md`) from the spike evidence
   + `archivetune-ref` refs — unblocks **P1-2** (`electron\services\stream.mjs`, IPC `stream:resolve`,
   real `<audio>` playback replacing the simulated clock) and later P2-19.
5. **P1-1:** wire the hardened `store.mjs` behind preload/IPC (it is still unwired; P0-11 hardened it).

## Agent orchestration

- **Subagents:** T3 `delegate_task` (provider `opencode`) — works the same inside the sandbox. Children end
  their turn at completion and summaries can lag — **always verify deliverable files on disk**. Brief each
  child: exact files allowed; no builds; no commits; read-only refs; deliverables inside `<repo>`.
- **Mailbox:** only if the host `agentmail` folder is mapped into the sandbox. If it is: start it here
  (`Start-Process node -ArgumentList 'src/server.js' -WorkingDirectory '<agentmail>' -WindowStyle Hidden`)
  and use the protocol (`$env:AGENTMAIL_FROM='<id>@local'; am health; am send orchestrator@local 'claim <item>'`
  → work → evidence report to `orchestrator@local`; blocked >20 min → send blocker + stop). If it is not
  mapped (likely): **skip the mailbox**, coordinate through T3 tools only, and say so in reports.
- **Previous-wave T3 child threads** (project `e8521a8c-0e94-436b-920f-f48b094d7dd2`): completed
  `feat-inventory-1`, `code-audit-1`, `roadmap-synth-1`, `p0-3-1`, `p0-4-1`, `p0-8-1`, `p0-11-1`;
  `r3-engine-1` was **interrupted** mid-investigation (its thread holds the findings; resume inside T3 if useful —
  the working script and this evidence doc already survive on disk).

## Host quirks (apply only when present)

- C: has ~2 GB free → installs only with caches redirected:
  `$env:npm_config_cache='E:\caches\npm'; $env:TMP='E:\caches\tmp'; $env:TEMP='E:\caches\tmp'`.
  `npm.cmd` is slow (cold boot); prefer direct `node node_modules\...` calls.
- `ELECTRON_RUN_AS_NODE=1` is set globally on the host — remove before launching Electron.
- Electron has a single-instance lock (applies everywhere): kill a running electron before a fresh smoke.
- `html_preview` / `html_render` cannot reach loopback on the host (SOCKS proxy error) — use the T3 preview
  tab for local pages (docs viewer: `node docs\serve-docs.mjs` in `<repo>`, then port 4599).

## Git hygiene (host, or if git works in the sandbox)

- **NEVER `git add -A`** — `app\tsconfig.tsbuildinfo` is not ignored and `scratch\` holds large clones
  (`core`, `morideobfuscator`, `scratch\spike\`). Stage explicit paths only.
- `E:\mush\src` (web original) and `archivetune-ref` are **READ-ONLY** (OQ-6: fixes are port-only).
- Do not edit `.gitignore` (user-approved as-is). CRLF warnings on commit are benign.

## Key paths (relative to `<repo>`)

- `ROADMAP.md` — the plan (§8 decisions locked; P1-2/P1-3/R-3 re-scoped to the engine-port approach).
- `app\electron\main.mjs` — Electron main; services `app\electron\services\{youtube,store}.mjs`;
  renderer state `app\renderer\src\state\{feed,player,session}.ts`; screens `app\renderer\src\screens\…`.
- `docs\` — audit, features, viewer, `research\r3-*` (spike script: bundle path override via 3rd CLI arg or
  `R3_BUNDLE=<path>`; defaults to the host `E:` clone).
- `scratch\morideobfuscator\src\main\assets\youtubei\youtubei.bundle.js` — the exact engine asset
  (present when the mapping includes `scratch\`).
- `archivetune-ref` — Kotlin reference (streaming flow: `playback\stream\*.kt`, `utils\YTPlayerUtils.kt`,
  `utils\potoken\*.kt`).
