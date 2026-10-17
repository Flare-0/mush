// Preload bridge (context-isolated). Native APIs for workstreams land here:
// downloads, tray, media keys, file access. Renderer must never get node.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('archivetune', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  // Subscribe to transport/media-key actions from main.
  // Actions: 'play' | 'pause' | 'toggle' | 'next' | 'previous'.
  // Returns an unsubscribe function.
  onTransportKey: (cb) => {
    const listener = (_event, action) => {
      try {
        cb(action);
      } catch {
        // Never let renderer callback errors break the bridge.
      }
    };
    try {
      ipcRenderer.on('transport:key', listener);
    } catch {
      // Headless-safe: return a no-op unsubscribe.
      return () => {};
    }
    return () => {
      try {
        ipcRenderer.removeListener('transport:key', listener);
      } catch {
        // ignore
      }
    };
  },
  // YouTube Music search via the main-process innertube client (no API key).
  // Resolves to [{ videoId, title, artist, thumbnail, duration? }].
  // Rejects with the main-process error message on failure.
  searchMusic: (query) => ipcRenderer.invoke('yt:search', String(query ?? '')),
});
