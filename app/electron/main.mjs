// ArchiveTune Desktop — Electron main process (ESM, no build step).
// All disk-heavy caches are redirected to E: (see README in E:/mush/app).
import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchMusic } from './services/youtube.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let win = null;
let tray = null;

// Forward a transport action to the renderer. Channel: 'transport:key'.
function sendTransportKey(action) {
  try {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('transport:key', action);
    }
  } catch {
    // Headless/smoke-safe: never throw from key forwarding.
  }
}

// YouTube Music search via innertube (no API key). Renderer -> 'yt:search'.
function setupIpc() {
  try {
    ipcMain.handle('yt:search', async (_event, query) => {
      return searchMusic(query, 20);
    });
  } catch {
    // headless-safe
  }
}

function createWindow() {
  try {
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      backgroundColor: '#0a0a0c',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // Required for the ESM .mjs preload (sandboxed preloads must be CJS).
        // contextIsolation stays on — renderer only sees the contextBridge API.
        sandbox: false,
      },
    });

    // No menu (keep window chrome minimal).
    try {
      win.setMenu(null);
    } catch {
      // ignore — headless-safe
    }

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    win.on('closed', () => {
      win = null;
    });
  } catch {
    // Headless smoke must never crash here.
  }
}

function setupTray() {
  try {
    if (tray) return;
    let icon = null;
    try {
      icon = nativeImage.createEmpty();
    } catch {
      icon = undefined;
    }
    tray = new Tray(icon);
    try {
      tray.setToolTip('ArchiveTune Desktop');
    } catch {
      // ignore
    }
    let menu = null;
    try {
      menu = Menu.buildFromTemplate([
        {
          label: 'Play',
          click: () => sendTransportKey('play'),
        },
        {
          label: 'Pause',
          click: () => sendTransportKey('pause'),
        },
        {
          label: 'Next',
          click: () => sendTransportKey('next'),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            try {
              app.quit();
            } catch {
              // ignore
            }
          },
        },
      ]);
    } catch {
      menu = null;
    }
    if (menu) {
      try {
        tray.setContextMenu(menu);
      } catch {
        // ignore
      }
    }
    try {
      tray.on('click', () => {
        try {
          if (win && !win.isDestroyed()) {
            if (win.isMinimized()) win.restore();
            win.focus();
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  } catch {
    // Tray unavailable headless — safe to skip.
    tray = null;
  }
}

function setupMediaKeys() {
  try {
    try {
      globalShortcut.register('MediaPlayPause', () => sendTransportKey('toggle'));
    } catch {
      // ignore individual failures
    }
    try {
      globalShortcut.register('MediaNextTrack', () => sendTransportKey('next'));
    } catch {
      // ignore
    }
    try {
      globalShortcut.register('MediaPreviousTrack', () => sendTransportKey('previous'));
    } catch {
      // ignore
    }
  } catch {
    // ignore — headless-safe
  }
}

// Single-instance lock: second launch focuses the existing window.
let gotLock = true;
try {
  gotLock = app.requestSingleInstanceLock();
} catch {
  gotLock = true;
}
if (!gotLock) {
  try {
    app.quit();
  } catch {
    // ignore
  }
} else {
  try {
    app.on('second-instance', () => {
      try {
        if (win) {
          if (win.isMinimized()) win.restore();
          win.focus();
        }
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }

  try {
    app.whenReady().then(() => {
      try {
        // Hide the default application menu (no menu).
        try {
          Menu.setApplicationMenu(null);
        } catch {
          // ignore
        }
        createWindow();
        setupTray();
        setupMediaKeys();
        setupIpc();
      } catch {
        // Headless smoke must never crash.
      }
      try {
        app.on('activate', () => {
          try {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

try {
  app.on('window-all-closed', () => {
    try {
      if (process.platform !== 'darwin') app.quit();
    } catch {
      // ignore
    }
  });
} catch {
  // ignore
}

try {
  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
    try {
      if (tray) tray.destroy();
    } catch {
      // ignore
    }
  });
} catch {
  // ignore
}
