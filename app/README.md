# ArchiveTune Desktop (Electron 1:1 port)

Electron shell lives in `E:/mush/app`. Renderer source is `renderer/` → builds to `dist/`.
Reference Android source (`C:/Users/Muaj/AppData/Local/Temp/opencode/archivetune`) and `E:/mush`
stems are **read-only** — never write there. coder-1 owns only `electron/*`, `package.json`, `README.md`.

## Disk-safe rules (C: is off-limits for caches)

PowerShell (every terminal before npm/electron):

```powershell
$env:npm_config_cache="E:/caches/npm"
$env:TMP="E:/caches/tmp"
$env:TEMP="E:/caches/tmp"
New-Item -ItemType Directory -Force "E:/caches/npm", "E:/caches/tmp" | Out-Null
```

Rules:

- `npm_config_cache` → `E:/caches/npm` (never default `%APPDATA%` on C:).
- `TMP`/`TEMP` → `E:/caches/tmp` (electron-builder / Squirrel / NSIS staging).
- electron-builder output → `E:/mush/app/release` (see `build.directories.output`).
- Verify with `npm config get cache` and `$env:TMP` if the disk fills or C: grows.

## Dev commands

Vite renderer is pinned to port **5174** (`vite.config.ts` → `server.strictPort`).

```powershell
# terminal 1 — renderer dev server
$env:npm_config_cache="E:/caches/npm"; $env:TMP="E:/caches/tmp"; $env:TEMP="E:/caches/tmp"
npm run dev
# → http://localhost:5174/

# terminal 2 — electron against the dev server
$env:npm_config_cache="E:/caches/npm"; $env:TMP="E:/caches/tmp"; $env:TEMP="E:/caches/tmp"
$env:VITE_DEV_SERVER_URL="http://localhost:5174/"
npm run dev:electron
```

Production smoke (no dev server):

```powershell
npm run build:renderer
npm start  # electron . loads dist/index.html
```

## App shell (coder-1)

- `electron/main.mjs` — 1440×900 window, `backgroundColor #0a0a0c`, no app/dock menu
  (`Menu.setApplicationMenu(null)` + `win.setMenu(null)` + `autoHideMenuBar`).
  Single-instance lock (second launch focuses the window), tray with
  Play / Pause / Next / Quit + `ArchiveTune Desktop` tooltip, and media keys
  (`MediaPlayPause` → `toggle`, `MediaNextTrack` → `next`,
  `MediaPreviousTrack` → `previous`) forwarded on IPC channel `transport:key`.
  Every block is `try/catch`-guarded so headless `electron .` smoke never crashes
  (tray uses `nativeImage.createEmpty()`, no icon file dependency).
- `electron/preload.mjs` — context-isolated bridge only (`contextIsolation: true`,
  `nodeIntegration: false`, never expose node to the renderer):
  `window.archivetune = { platform, versions, onTransportKey(cb) }`.
  Renderer usage: `const off = window.archivetune.onTransportKey(a => …)` with
  actions `'play' | 'pause' | 'toggle' | 'next' | 'previous'`.

## Packaging notes

- `npm run dist` → `electron-builder --win nsis --x64`, output `E:/mush/app/release`.
- `build.files` packs only `dist/**`, `electron/**`, `package.json` (no `renderer/`,
  no caches).
- Config-only change: do **not** run `npm run dist` here (downloads NSIS tools /
  code-sign deps — heavy). CI or a disk-safe workstation runs it with the
  `E:/caches/*` env vars above.
- `npm run build:renderer` (`tsc -b && vite build`) must stay green — it does not
  need `electron-builder` installed.
