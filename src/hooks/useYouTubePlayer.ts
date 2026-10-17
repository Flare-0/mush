import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface YTPlayerInstance {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  width?: number | string;
  height?: number | string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: () => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// PlayerState numeric values from the IFrame API.
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeAPI(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window object"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API failed to initialize"));
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => {
        apiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API script"));
      };
      document.head.appendChild(tag);
    }
    // Safety timeout so we never hang forever.
    window.setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT);
    }, 15000);
  });
  return apiPromise;
}

export interface YouTubePlayer {
  playerRefDiv: RefObject<HTMLDivElement | null>;
  load: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  setVolume: (v: number) => void;
  currentTime: number;
  duration: number;
  /** 0–1 fraction of the video buffered, when known. */
  buffered: number;
  playing: boolean;
  ready: boolean;
}

export interface YouTubePlayerHandlers {
  /** Fired when the current video ends (auto-advance / repeat live here). */
  onEnded?: () => void;
}

export function useYouTubePlayer(handlers?: YouTubePlayerHandlers): YouTubePlayer {
  const playerRefDiv = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  const pendingVideoRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  // Ref-stable handlers so the YT event closure never goes stale.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);

  const stopPolling = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const poll = useCallback(() => {
    rafRef.current = 0;
    const p = playerRef.current;
    if (!p || !playingRef.current) return;
    let time = 0;
    let len = 0;
    let frac = 0;
    try {
      time = p.getCurrentTime() ?? 0;
      len = p.getDuration() ?? 0;
      frac = p.getVideoLoadedFraction() ?? 0;
    } catch {
      // Player not ready for reads yet; retry next frame.
    }
    const now = performance.now();
    if (now - lastTickRef.current >= 66) {
      lastTickRef.current = now;
      setCurrentTime(time);
      if (len > 0) setDuration(len);
      setBuffered(Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) : 0);
    }
    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(poll);
  }, [poll, stopPolling]);

  useEffect(() => {
    let cancelled = false;
    const div = playerRefDiv.current;
    if (div) {
      div.style.position = "absolute";
      div.style.width = "1px";
      div.style.height = "1px";
      div.style.opacity = "0";
      div.style.pointerEvents = "none";
      div.style.overflow = "hidden";
    }

    loadYouTubeAPI()
      .then((YT) => {
        if (cancelled || !playerRefDiv.current || playerRef.current) return;
        playerRef.current = new YT.Player(playerRefDiv.current, {
          width: 1,
          height: 1,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              const pending = pendingVideoRef.current;
              pendingVideoRef.current = null;
              if (pending && playerRef.current) {
                try {
                  playerRef.current.loadVideoById(pending);
                } catch {
                  // ignore load errors pre-ready
                }
              }
            },
            onStateChange: (e) => {
              if (cancelled) return;
              if (e.data === PLAYING) {
                playingRef.current = true;
                setPlaying(true);
                startPolling();
              } else if (e.data === PAUSED) {
                playingRef.current = false;
                setPlaying(false);
                stopPolling();
                try {
                  if (playerRef.current) setCurrentTime(playerRef.current.getCurrentTime());
                } catch {
                  // ignore read errors
                }
              } else if (e.data === ENDED) {
                playingRef.current = false;
                setPlaying(false);
                stopPolling();
                try {
                  handlersRef.current?.onEnded?.();
                } catch {
                  // app-level ended handler must never break the player
                }
              }
            },
            onError: () => {
              if (cancelled) return;
              playingRef.current = false;
              setPlaying(false);
              stopPolling();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
      playingRef.current = false;
      stopPolling();
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore destroy errors on unmount
      }
      playerRef.current = null;
    };
  }, [startPolling, stopPolling]);

  const load = useCallback((videoId: string) => {
    setCurrentTime(0);
    setBuffered(0);
    const p = playerRef.current;
    if (p) {
      try {
        p.loadVideoById(videoId);
      } catch {
        pendingVideoRef.current = videoId;
      }
    } else {
      pendingVideoRef.current = videoId;
    }
  }, []);

  const play = useCallback(() => {
    try {
      playerRef.current?.playVideo();
    } catch {
      // ignore when player not ready
    }
  }, []);

  const pause = useCallback(() => {
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // ignore when player not ready
    }
  }, []);

  const seekTo = useCallback((sec: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.seekTo(Math.max(0, sec), true);
      setCurrentTime(Math.max(0, sec));
    } catch {
      // ignore when player not ready
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(v)));
    try {
      playerRef.current?.setVolume(clamped);
    } catch {
      // ignore when player not ready
    }
  }, []);

  return {
    playerRefDiv,
    load,
    play,
    pause,
    seekTo,
    setVolume,
    currentTime,
    duration,
    buffered,
    playing,
    ready,
  };
}
