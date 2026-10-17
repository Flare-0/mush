// ArchiveTune Desktop — persistent namespaced JSON store (main process).
//
// Persistence lives under `app.getPath('userData')` (see HOOKS.md for wiring).
// Zero dependencies: node:fs + node:path only. Writes are atomic (tmp file +
// rename in the same directory) with a debounced flush, so rapid `set()`
// bursts hit disk once. Every block that touches disk is guarded so a
// headless smoke run never crashes.
//
// Key model: `namespace` groups related keys (e.g. "settings", "session").
// Backing JSON shape: `{ [namespace]: { [key]: value } }`.
// Namespaces must not contain ':' or '.' (reserved as key separators).
//
// Accepted call forms (all equivalent):
//   store.get("settings", "theme", "dark")
//   store.get("settings:theme", "dark")
//   store.get("settings.theme", "dark")
//   store.get("settings", "theme")        // no fallback -> undefined
//   store.get("theme")                    // default namespace -> undefined
// Same overloads apply to `set` and `subscribe`:
//   store.set("settings", "theme", "dark")
//   store.set("settings:theme", "dark")
//   store.set("theme", "dark")            // default namespace
// `set(ns, key, undefined)` deletes the key.
import fs from 'node:fs';
import path from 'node:path';

export const STORE_FILENAME = 'archivetune-store.json';
export const DEFAULT_NAMESPACE = 'default';
const FLUSH_DEBOUNCE_MS = 150;
// Separator for in-memory listener keys. Keys may contain any visible char,
// so use a control char that never appears in real keys. Built with
// fromCharCode to keep this file plain printable ASCII.
const LISTENER_SEP = String.fromCharCode(1);

function isCompoundKey(s) {
  return s.includes(':') || s.includes('.');
}

// Split "ns:key" / "ns.key" / "key" into [namespace, key].
export function splitStoreKey(key, fallbackNamespace = DEFAULT_NAMESPACE) {
  const s = String(key);
  const colon = s.indexOf(':');
  if (colon > 0) return [s.slice(0, colon), s.slice(colon + 1)];
  const dot = s.indexOf('.');
  if (dot > 0) return [s.slice(0, dot), s.slice(dot + 1)];
  return [String(fallbackNamespace), s];
}

function listenerKey(namespace, key) {
  return `${namespace}${LISTENER_SEP}${key}`;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {
    // Fall through to JSON round-trip.
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

export function createStore(userDataPath) {
  const dir = String(userDataPath);
  const filePath = path.join(dir, STORE_FILENAME);

  let data = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    data = {};
  }

  const listeners = new Map(); // listenerKey -> Set<fn>
  let flushTimer = null;
  let flushInFlight = false;
  let needsFlush = false;

  function ensureBucket(ns) {
    const bucket = data[ns];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      data[ns] = {};
    }
    return data[ns];
  }

  function read(ns, key, fallback) {
    try {
      const bucket = data[ns];
      if (
        bucket &&
        typeof bucket === 'object' &&
        Object.prototype.hasOwnProperty.call(bucket, key)
      ) {
        return cloneJson(bucket[key]);
      }
    } catch {
      // Ignore and fall through to fallback.
    }
    return fallback;
  }

  function notify(ns, key, value) {
    const set = listeners.get(listenerKey(ns, key));
    if (!set || set.size === 0) return;
    const snapshot = cloneJson(value);
    for (const fn of [...set]) {
      try {
        fn(snapshot);
      } catch {
        // A bad subscriber must never break the store.
      }
    }
  }

  function scheduleFlush() {
    needsFlush = true;
    if (flushTimer || flushInFlight) return;
    try {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, FLUSH_DEBOUNCE_MS);
      if (typeof flushTimer.unref === 'function') flushTimer.unref();
    } catch {
      // Timers unavailable — fall back to a best-effort sync flush.
      flushSync();
    }
  }

  function serialize() {
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }

  async function flush() {
    if (flushTimer) {
      try {
        clearTimeout(flushTimer);
      } catch {
        // ignore
      }
      flushTimer = null;
    }
    if (flushInFlight) {
      needsFlush = true;
      return false;
    }
    needsFlush = false;
    const payload = serialize();
    if (payload === null) return false;
    flushInFlight = true;
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.promises.writeFile(tmp, payload, 'utf8');
      await fs.promises.rename(tmp, filePath);
      return true;
    } catch {
      return false;
    } finally {
      flushInFlight = false;
      if (needsFlush) {
        scheduleFlush();
      }
    }
  }

  function flushSync() {
    if (flushTimer) {
      try {
        clearTimeout(flushTimer);
      } catch {
        // ignore
      }
      flushTimer = null;
    }
    needsFlush = false;
    const payload = serialize();
    if (payload === null) return false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, filePath);
      return true;
    } catch {
      return false;
    }
  }

  // get: 1 arg -> split key; 2+ args -> canonical unless the first arg is
  // itself compound ("ns:key", fallback).
  function get(a, b, c) {
    if (b === undefined && c === undefined) {
      const [ns, key] = splitStoreKey(String(a));
      return read(ns, key, undefined);
    }
    if (typeof a === 'string' && isCompoundKey(a)) {
      const [ns, key] = splitStoreKey(a);
      return read(ns, key, b);
    }
    return read(String(a), String(b), c);
  }

  // set: 3 args -> (ns, key, value); 2 args -> (compound-or-plain key, value).
  function set(a, b, c) {
    let ns;
    let key;
    let value;
    if (c !== undefined) {
      ns = String(a);
      key = String(b);
      value = c;
    } else {
      [ns, key] = splitStoreKey(String(a));
      value = b;
    }
    if (value === undefined) {
      return remove(ns, key);
    }
    const stored = cloneJson(value);
    try {
      ensureBucket(ns)[key] = stored === undefined ? null : stored;
    } catch {
      return undefined;
    }
    notify(ns, key, stored);
    scheduleFlush();
    return cloneJson(stored);
  }

  function remove(a, b) {
    let ns;
    let key;
    if (b === undefined) {
      [ns, key] = splitStoreKey(String(a));
    } else {
      ns = String(a);
      key = String(b);
    }
    let existed = false;
    try {
      const bucket = data[ns];
      if (bucket && typeof bucket === 'object') {
        existed = Object.prototype.hasOwnProperty.call(bucket, key);
        if (existed) delete bucket[key];
      }
    } catch {
      existed = false;
    }
    if (existed) {
      notify(ns, key, undefined);
      scheduleFlush();
    }
    return existed;
  }

  function getAll(namespace) {
    const ns = String(namespace);
    try {
      const bucket = data[ns];
      if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
        return cloneJson(bucket);
      }
    } catch {
      // ignore
    }
    return {};
  }

  function clearNamespace(namespace) {
    const ns = String(namespace);
    let keys = [];
    try {
      const bucket = data[ns];
      if (bucket && typeof bucket === 'object') keys = Object.keys(bucket);
      delete data[ns];
    } catch {
      keys = [];
    }
    for (const key of keys) notify(ns, key, undefined);
    if (keys.length > 0) scheduleFlush();
    return keys.length;
  }

  // subscribe: 3 args -> (ns, key, fn); 2 args -> (compound-or-plain key, fn).
  function subscribe(a, b, c) {
    let ns;
    let key;
    let fn;
    if (typeof b === 'string') {
      ns = String(a);
      key = b;
      fn = c;
    } else {
      [ns, key] = splitStoreKey(String(a));
      fn = b;
    }
    const noop = () => {};
    if (typeof fn !== 'function') return noop;
    const lk = listenerKey(ns, key);
    let set = listeners.get(lk);
    if (!set) {
      set = new Set();
      listeners.set(lk, set);
    }
    set.add(fn);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      try {
        const s = listeners.get(lk);
        if (s) {
          s.delete(fn);
          if (s.size === 0) listeners.delete(lk);
        }
      } catch {
        // ignore
      }
    };
  }

  function dispose() {
    try {
      flushSync();
    } catch {
      // ignore
    }
  }

  return {
    filePath,
    dir,
    get,
    set,
    getAll,
    remove,
    clearNamespace,
    subscribe,
    flush,
    flushSync,
    dispose,
  };
}

// Normalize an IPC payload into [namespace, key]. Accepts:
//   { namespace, key }  |  { key: "ns:key" }  |  { namespace: "ns:key" }  |
//   "ns:key"  |  "key"
function payloadToKey(payload) {
  try {
    if (typeof payload === 'string') return splitStoreKey(payload);
    if (payload && typeof payload === 'object') {
      if (typeof payload.key === 'string') {
        if (payload.namespace === undefined || payload.namespace === null) {
          return splitStoreKey(payload.key);
        }
        return [String(payload.namespace), String(payload.key)];
      }
      if (typeof payload.namespace === 'string') {
        // Preload single-key form: { namespace: "ns:key" }.
        return splitStoreKey(payload.namespace);
      }
    }
  } catch {
    // fall through
  }
  return [DEFAULT_NAMESPACE, ''];
}

function safeHandle(ipcMain, channel, handler) {
  try {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Not previously registered — fine.
    }
    ipcMain.handle(channel, handler);
  } catch {
    // Headless-safe: registration must never throw.
  }
}

// Wire the store to IPC. Channels:
//   store:get       (invoke { namespace?, key } | "ns:key") -> value | fallback
//   store:set       (invoke { namespace?, key, value })      -> stored value
//   store:subscribe (invoke { namespace?, key } | "ns:key")  -> true;
//                   changes push to webContents as 'store:changed'
//                   { namespace, key, value }.
// Changes made via `store:set` IPC are pushed to every subscribed renderer
// through a single shared store subscription per key. Returns a cleanup fn.
export function registerStoreIPC(ipcMain, store) {
  const noop = () => {};
  if (!ipcMain || !store) return noop;

  // skey -> { senders: Set<WebContents>, unsub: fn }
  const forwarders = new Map();
  // senderId -> Set<cleanup> so 'destroyed' listeners attach once per sender.
  const senderCleanup = new Map();

  function watchSender(sender) {
    let senderId = null;
    try {
      senderId = sender.id;
    } catch {
      return null;
    }
    if (senderCleanup.has(senderId)) return senderId;
    const cleanups = new Set();
    senderCleanup.set(senderId, cleanups);
    const onDestroyed = () => {
      try {
        for (const [skey, entry] of [...forwarders]) {
          entry.senders.delete(sender);
          if (entry.senders.size === 0) {
            try {
              entry.unsub();
            } catch {
              // ignore
            }
            forwarders.delete(skey);
          }
        }
      } catch {
        // ignore
      }
      senderCleanup.delete(senderId);
    };
    try {
      sender.once('destroyed', onDestroyed);
      cleanups.add(() => {
        try {
          sender.removeListener('destroyed', onDestroyed);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    return senderId;
  }

  function ensureForwarder(ns, key) {
    const skey = listenerKey(ns, key);
    const existing = forwarders.get(skey);
    if (existing) return existing;
    const senders = new Set();
    const entry = { senders, unsub: noop };
    entry.unsub = (() => {
      try {
        return store.subscribe(ns, key, (value) => {
          try {
            for (const sender of [...senders]) {
              let dead = false;
              try {
                dead = sender.isDestroyed();
              } catch {
                dead = true;
              }
              if (dead) {
                senders.delete(sender);
                continue;
              }
              try {
                sender.send('store:changed', { namespace: ns, key, value });
              } catch {
                senders.delete(sender);
              }
            }
            if (senders.size === 0) {
              try {
                entry.unsub();
              } catch {
                // ignore
              }
              if (forwarders.get(skey) === entry) forwarders.delete(skey);
            }
          } catch {
            // ignore
          }
        });
      } catch {
        return noop;
      }
    })();
    forwarders.set(skey, entry);
    return entry;
  }

  safeHandle(ipcMain, 'store:get', (event, payload) => {
    try {
      const [ns, key] = payloadToKey(payload);
      const fallback =
        payload && typeof payload === 'object' ? payload.fallback : undefined;
      return store.get(ns, key, fallback);
    } catch {
      try {
        return payload && typeof payload === 'object'
          ? payload.fallback
          : undefined;
      } catch {
        return undefined;
      }
    }
  });

  safeHandle(ipcMain, 'store:set', (event, payload) => {
    try {
      const [ns, key] = payloadToKey(payload);
      const value =
        payload && typeof payload === 'object' ? payload.value : undefined;
      // store.set notifies forwarders, which push 'store:changed'.
      return store.set(ns, key, value);
    } catch {
      return undefined;
    }
  });

  safeHandle(ipcMain, 'store:subscribe', (event, payload) => {
    try {
      const [ns, key] = payloadToKey(payload);
      const sender = event && event.sender ? event.sender : null;
      if (!sender) return false;
      const entry = ensureForwarder(ns, key);
      entry.senders.add(sender);
      watchSender(sender);
      // Push the current value immediately so the renderer can hydrate.
      let current;
      try {
        current = store.get(ns, key, undefined);
      } catch {
        current = undefined;
      }
      try {
        if (!sender.isDestroyed()) {
          sender.send('store:changed', { namespace: ns, key, value: current });
        }
      } catch {
        // Non-fatal — the live subscription is still registered.
      }
      return true;
    } catch {
      return false;
    }
  });

  return () => {
    try {
      for (const [, entry] of [...forwarders]) {
        try {
          entry.unsub();
        } catch {
          // ignore
        }
      }
      forwarders.clear();
    } catch {
      // ignore
    }
    try {
      for (const channel of ['store:get', 'store:set', 'store:subscribe']) {
        try {
          ipcMain.removeHandler(channel);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  };
}
