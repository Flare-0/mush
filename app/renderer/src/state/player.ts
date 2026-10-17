import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Player state machine for the ArchiveTune desktop port (coder-3).
 *
 * State machine only — no real audio yet. A simulated clock advances
 * `currentTime` while `playing` so the seek rail, the 3s prev-restart rule
 * and auto-advance are demonstrable; the real playback engine (hidden
 * IFrame, cf. E:/mush/src/hooks/useYouTubePlayer.ts) will drive
 * seek/play/pause/ended later through the same public API.
 *
 * Transport behavior mirrors the web app (E:/mush/src/App.tsx):
 * shuffle / repeat-one / history / prev-restart / auto-advance.
 */

export interface VideoItem {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  /** Seconds. Absent/0 = unknown: seek rail renders disabled (honest). */
  duration?: number;
}

/** 'off' | 'all' (loop queue) | 'one' (repeat-one). Cycles off -> all -> one. */
export type RepeatMode = 'off' | 'all' | 'one';

export type TransportAction = 'play' | 'pause' | 'toggle' | 'next' | 'prev';

/**
 * Typing for the preload bridge (electron/preload.mjs). Always access via
 * `window.archivetune?.<member>` — members are optional so plain-browser
 * dev still works.
 */
export interface ArchivetuneBridge {
  onTransportKey?: (cb: (action: TransportAction) => void) => void | (() => void) | undefined;
  /** Innertube search in the main process. Resolves to FeedVideo-shaped rows. */
  searchMusic?: (query: string) => Promise<unknown>;
}

declare global {
  interface Window {
    archivetune?: ArchivetuneBridge;
  }
}

export interface PlayerStoreOptions {
  initialQueue?: VideoItem[];
  /**
   * Observer notified AFTER the internal ended handling (auto-advance /
   * repeat-one / stop-at-end) runs. Must not itself advance the queue.
   */
  onEnded?: () => void;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const HISTORY_CAP = 100;
const PREV_RESTART_SEC = 3;
const TICK_SEC = 0.25;

export function usePlayerStore(options?: PlayerStoreOptions) {
  const [queue, setQueue] = useState<VideoItem[]>(options?.initialQueue ?? []);
  const [currentIndex, setCurrentIndex] = useState(() =>
    options?.initialQueue && options.initialQueue.length > 0 ? 0 : -1,
  );
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [history, setHistoryState] = useState<number[]>([]);

  // Fresh mirrors for use inside ref-stable callbacks (ended, transport
  // keys, MediaSession handlers) — same pattern as E:/mush/src/App.tsx.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const historyRef = useRef<number[]>([]);
  const durationRef = useRef(0);
  const prevVolRef = useRef(80);
  const onEndedObserver = useRef(options?.onEnded);
  onEndedObserver.current = options?.onEnded;

  const current: VideoItem | null =
    currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const duration = current?.duration ?? 0;
  durationRef.current = duration;

  const pushHistory = useCallback((idx: number) => {
    const nextHist = [...historyRef.current, idx].slice(-HISTORY_CAP);
    historyRef.current = nextHist;
    setHistoryState(nextHist);
  }, []);

  const popHistory = useCallback((): number | undefined => {
    const h = historyRef.current;
    if (h.length === 0) return undefined;
    const nextHist = h.slice(0, -1);
    historyRef.current = nextHist;
    setHistoryState(nextHist);
    return h[h.length - 1];
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setHistoryState([]);
  }, []);

  // Reset position whenever the track identity changes.
  const currentId = current?.videoId;
  useEffect(() => {
    setCurrentTime(0);
  }, [currentId]);

  const play = useCallback(() => {
    if (queueRef.current.length === 0) return;
    if (indexRef.current < 0) {
      setCurrentIndex(0);
      setCurrentTime(0);
    }
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (queueRef.current.length === 0) return;
    if (indexRef.current < 0) {
      setCurrentIndex(0);
      setCurrentTime(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const i = indexRef.current;
    if (i >= 0) pushHistory(i);
    let idx: number;
    if (shuffleRef.current && q.length > 1) {
      // Random pick that avoids repeating the same track back-to-back.
      let r = Math.floor(Math.random() * (q.length - 1));
      if (r >= i) r += 1;
      idx = r;
    } else {
      idx = i < 0 ? 0 : (i + 1) % q.length;
    }
    setCurrentIndex(idx);
    setCurrentTime(0);
    setPlaying(true);
  }, [pushHistory]);

  const nextRef = useRef(next);
  nextRef.current = next;

  const prev = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    // Standard transport behavior: restart the song when well into it.
    if (timeRef.current > PREV_RESTART_SEC) {
      setCurrentTime(0);
      return;
    }
    const h = popHistory();
    if (h !== undefined && h >= 0 && h < q.length) {
      setCurrentIndex(h);
    } else {
      const i = indexRef.current;
      setCurrentIndex(i < 0 ? 0 : (i - 1 + q.length) % q.length);
    }
    setCurrentTime(0);
    setPlaying(true);
  }, [popHistory]);

  /**
   * End of track: repeat-one replays, repeat-off stops at the queue end,
   * otherwise the queue keeps rolling (shuffle stays shuffled).
   * Called by the (simulated-for-now) playback clock; the real engine will
   * call this same function on media ended.
   */
  const handleEnded = useCallback(() => {
    const q = queueRef.current;
    const i = indexRef.current;
    const r = repeatRef.current;
    if (q.length === 0 || i < 0) return;
    const notify = () => {
      try {
        onEndedObserver.current?.();
      } catch {
        // Observer must never break transport.
      }
    };
    if (r === 'one') {
      setCurrentTime(0);
      setPlaying(true);
      notify();
      return;
    }
    const atEnd = !shuffleRef.current && i >= q.length - 1;
    if (r === 'off' && atEnd) {
      setPlaying(false);
      notify();
      return;
    }
    nextRef.current();
    notify();
  }, []);

  const handleEndedRef = useRef(handleEnded);
  handleEndedRef.current = handleEnded;

  /** Append-or-jump: matches web playTrack (history push + switch). */
  const playTrack = useCallback(
    (item: VideoItem) => {
      const q = queueRef.current;
      const i = indexRef.current;
      const idx = q.findIndex((v) => v.videoId === item.videoId);
      if (idx === -1) {
        if (i >= 0) pushHistory(i);
        setQueue([...q, item]);
        setCurrentIndex(q.length);
      } else {
        if (i >= 0 && i !== idx) pushHistory(i);
        setCurrentIndex(idx);
      }
      setCurrentTime(0);
      setPlaying(true);
    },
    [pushHistory],
  );

  const playIndex = useCallback(
    (idx: number) => {
      const q = queueRef.current;
      if (idx < 0 || idx >= q.length) return;
      const i = indexRef.current;
      if (i >= 0 && i !== idx) pushHistory(i);
      setCurrentIndex(idx);
      setCurrentTime(0);
      setPlaying(true);
    },
    [pushHistory],
  );

  const setQueueItems = useCallback(
    (items: VideoItem[], startIndex = 0) => {
      setQueue(items);
      clearHistory();
      setCurrentIndex(items.length === 0 ? -1 : Math.min(Math.max(startIndex, 0), items.length - 1));
      setCurrentTime(0);
      setPlaying(items.length > 0);
    },
    [clearHistory],
  );

  const enqueue = useCallback((item: VideoItem) => {
    setQueue((q) => [...q, item]);
  }, []);

  const seek = useCallback((sec: number) => {
    const d = durationRef.current;
    const v = Number.isFinite(sec) ? sec : 0;
    setCurrentTime(d > 0 ? Math.min(Math.max(v, 0), d) : 0);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(v)));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (m) {
        setVolumeState(prevVolRef.current || 80);
        return false;
      }
      setVolumeState((cur) => {
        prevVolRef.current = cur;
        return cur;
      });
      return true;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => !s);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const actionsRef = useRef({ play, pause, togglePlay, next, prev, seek });
  actionsRef.current = { play, pause, togglePlay, next, prev, seek };

  // Simulated clock (state machine only — replaced by real engine later).
  useEffect(() => {
    if (!playing || duration <= 0) return;
    const id = window.setInterval(() => {
      setCurrentTime((t) => {
        const nt = t + TICK_SEC;
        return nt >= duration ? duration : nt;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, duration]);

  useEffect(() => {
    if (playing && duration > 0 && currentTime >= duration) {
      handleEndedRef.current();
    }
  }, [playing, duration, currentTime]);

  // MediaSession metadata.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      if (current) {
        ms.metadata = new MediaMetadata({
          title: current.title || 'Unknown title',
          artist: current.artist || 'Unknown artist',
          album: 'ArchiveTune',
          artwork: current.thumbnail
            ? [{ src: current.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      } else {
        ms.metadata = null;
      }
    } catch {
      // MediaSession metadata unsupported — ignore.
    }
  }, [current]);

  // MediaSession action handlers.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    try {
      ms.setActionHandler('play', () => actionsRef.current.play());
      ms.setActionHandler('pause', () => actionsRef.current.pause());
      ms.setActionHandler('previoustrack', () => actionsRef.current.prev());
      ms.setActionHandler('nexttrack', () => actionsRef.current.next());
      ms.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number') {
          actionsRef.current.seek(details.seekTime);
        }
      });
    } catch {
      // MediaSession actions unsupported — ignore.
    }
    return () => {
      try {
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
        ms.setActionHandler('previoustrack', null);
        ms.setActionHandler('nexttrack', null);
        ms.setActionHandler('seekto', null);
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  // Preload 'transport:key' bridge (coder-1 owns preload; may not exist yet).
  useEffect(() => {
    let off: unknown;
    try {
      off = window.archivetune?.onTransportKey?.((action: TransportAction) => {
        const a = actionsRef.current;
        switch (action) {
          case 'play':
            a.play();
            break;
          case 'pause':
            a.pause();
            break;
          case 'toggle':
            a.togglePlay();
            break;
          case 'next':
            a.next();
            break;
          case 'prev':
            a.prev();
            break;
        }
      });
    } catch {
      // Bridge not ready yet — ignore until coder-1 lands preload.
    }
    return () => {
      try {
        if (typeof off === 'function') (off as () => void)();
      } catch {
        // Ignore unsubscribe errors.
      }
    };
  }, []);

  return {
    queue,
    currentIndex,
    current,
    playing,
    currentTime,
    duration,
    volume: muted ? 0 : volume,
    rawVolume: volume,
    muted,
    shuffle,
    repeat,
    history,
    play,
    pause,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    setRepeatMode: setRepeat,
    playTrack,
    playIndex,
    setQueueItems,
    enqueue,
    handleEnded,
  };
}

export type PlayerStore = ReturnType<typeof usePlayerStore>;
