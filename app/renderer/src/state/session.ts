import { useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from '../state/player';
import type { PlayerStore, RepeatMode } from '../state/player';
import { useYouTubeSearch } from '../state/feed';
import type { YouTubeSearchState } from '../state/feed';
import { useLyricsLoader } from '../screens/lyrics';
import type { LyricsProviderId, TrackMeta } from '../screens/lyrics';

/**
 * Shared session for the ArchiveTune desktop port (screens-1).
 *
 * Composes a SINGLE shared player store, the feed search, and the lyrics
 * loader so Search -> Player -> Lyrics play together:
 * - SearchScreen.onPlay(video) -> playVideo(): enqueues into the shared
 *   store (playTrack append-or-jump) AND sets the lyrics track.
 * - PlayerScreen receives the shared store via `store` prop.
 * - LyricsScreen receives track + loader props via `lyricsProps`.
 *
 * Persistence mirrors the web app (E:/mush/src/App.tsx:71-85):
 * - ly_provider, mp_shuffle ('1'/'0'), mp_repeat ('off'|'all'|'one').
 * The YouTube key (yt_api_key) is owned by state/feed + SettingsScreen.
 */

export interface SessionVideo {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

export interface SessionLyricsProps {
  track: TrackMeta | null;
  lines: import('../screens/lyrics').LyricLine[];
  source: string;
  syncType: import('../screens/lyrics').LyricsSyncType;
  loading: boolean;
  currentTime: number;
  playing: boolean;
  provider: LyricsProviderId;
  onProviderChange: (p: LyricsProviderId) => void;
  onSeek: (sec: number) => void;
}

export interface Session {
  store: PlayerStore;
  search: YouTubeSearchState;
  currentTrack: TrackMeta | null;
  lyricsProps: SessionLyricsProps;
  playVideo: (video: SessionVideo) => void;
}

const LY_PROVIDER_KEY = 'ly_provider';
const MP_SHUFFLE_KEY = 'mp_shuffle';
const MP_REPEAT_KEY = 'mp_repeat';

function readProvider(): LyricsProviderId {
  try {
    const saved = localStorage.getItem(LY_PROVIDER_KEY);
    if (
      saved === 'betterlyrics' ||
      saved === 'unison' ||
      saved === 'lrc.red' ||
      saved === 'lrclib' ||
      saved === 'auto'
    ) {
      return saved;
    }
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return 'auto';
}

function readRepeat(): RepeatMode {
  try {
    const saved = localStorage.getItem(MP_REPEAT_KEY);
    if (saved === 'all' || saved === 'one' || saved === 'off') return saved;
  } catch {
    // ignore
  }
  return 'off';
}

function readShuffle(): boolean {
  try {
    return localStorage.getItem(MP_SHUFFLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useSession(): Session {
  const store = usePlayerStore();
  const search = useYouTubeSearch();
  const [currentTrack, setCurrentTrack] = useState<TrackMeta | null>(null);
  const [provider, setProvider] = useState<LyricsProviderId>(() => readProvider());

  // Persist lyrics provider (mirrors web App.tsx).
  useEffect(() => {
    try {
      localStorage.setItem(LY_PROVIDER_KEY, provider);
    } catch {
      // Storage unavailable — provider still works for this session.
    }
  }, [provider]);

  // Apply persisted playback defaults once onto the fresh store.
  useEffect(() => {
    try {
      if (readShuffle() !== store.shuffle) store.toggleShuffle();
      const savedRepeat = readRepeat();
      if (savedRepeat !== store.repeat) store.setRepeatMode(savedRepeat);
    } catch {
      // Store still works with defaults.
    }
    // Mount-only: mirrors web-app defaults without fighting live toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist live playback prefs (mirrors web App.tsx).
  useEffect(() => {
    try {
      localStorage.setItem(MP_SHUFFLE_KEY, store.shuffle ? '1' : '0');
    } catch {
      // ignore
    }
  }, [store.shuffle]);

  useEffect(() => {
    try {
      localStorage.setItem(MP_REPEAT_KEY, store.repeat);
    } catch {
      // ignore
    }
  }, [store.repeat]);

  const loader = useLyricsLoader(currentTrack);

  const playVideo = useCallback(
    (video: SessionVideo) => {
      store.playTrack({
        videoId: video.videoId,
        title: video.title,
        artist: video.artist,
        thumbnail: video.thumbnail,
        duration: video.duration,
      });
      setCurrentTrack({
        title: video.title,
        artist: video.artist,
        videoId: video.videoId,
        duration: video.duration,
      });
    },
    [store],
  );

  const handleProviderChange = useCallback((p: LyricsProviderId) => {
    setProvider(p);
  }, []);

  const lyricsProps: SessionLyricsProps = {
    track: currentTrack,
    lines: loader.lines,
    source: loader.source,
    syncType: loader.type,
    loading: loader.loading,
    currentTime: store.currentTime,
    playing: store.playing,
    provider,
    onProviderChange: handleProviderChange,
    onSeek: store.seek,
  };

  return { store, search, currentTrack, lyricsProps, playVideo };
}

export default useSession;
