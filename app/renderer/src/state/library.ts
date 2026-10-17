import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Library store for the ArchiveTune desktop port (screens-2).
 *
 * Local-storage backed for now. The backend-1 persistent JSON store
 * (electron/services/*) will replace localStorage later — use the narrow
 * `LibraryBackend` seam (load/save) so the swap is a one-line injection
 * into `useLibrary(backend)` with no hook-signature changes.
 */

export const LIBRARY_STORAGE_KEY = 'at-library-v1';
export const LIBRARY_STORAGE_VERSION = 1 as const;

/** Minimal video shape shared with feed/player stores. */
export interface LibraryVideoInput {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

export interface LikedEntry extends LibraryVideoInput {
  likedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  videos: LibraryVideoInput[];
}

export interface PlayStats {
  videoId: string;
  count: number;
  lastPlayed: number;
  video: LibraryVideoInput;
}

export interface PersistedLibrary {
  version: typeof LIBRARY_STORAGE_VERSION;
  liked: LikedEntry[];
  playlists: Playlist[];
  plays: PlayStats[];
}

export interface ArtistEntry {
  name: string;
  count: number;
  thumbnail: string;
  videos: LibraryVideoInput[];
}

export interface AlbumEntry {
  id: string;
  /** Same as `id` — lets album rows satisfy LibraryVideoInput consumers. */
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  playCount: number;
  lastPlayed: number;
}

/** Narrow seam for the backend-1 swap (persistent JSON store + IPC). */
export interface LibraryBackend {
  load(): PersistedLibrary | null;
  save(state: PersistedLibrary): void;
}

function emptyState(): PersistedLibrary {
  return { version: LIBRARY_STORAGE_VERSION, liked: [], playlists: [], plays: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeVideo(v: unknown): LibraryVideoInput | null {
  if (!isRecord(v)) return null;
  const videoId = asString(v['videoId']).trim();
  if (!videoId) return null;
  const out: LibraryVideoInput = {
    videoId,
    title: asString(v['title'], videoId),
    artist: asString(v['artist'], 'Unknown artist'),
    thumbnail: asString(v['thumbnail']),
  };
  const d = v['duration'];
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) out.duration = d;
  return out;
}

/** Validate + normalize a parsed payload; null = corrupt (recover to empty). */
function sanitizePersisted(raw: unknown): PersistedLibrary | null {
  if (!isRecord(raw)) return null;
  if (raw['version'] !== LIBRARY_STORAGE_VERSION) return null;

  const liked: LikedEntry[] = [];
  if (Array.isArray(raw['liked'])) {
    for (const item of raw['liked']) {
      if (!isRecord(item)) continue;
      const video = sanitizeVideo(item);
      if (!video) continue;
      liked.push({ ...video, likedAt: asNumber(item['likedAt'], 0) });
    }
  }

  const playlists: Playlist[] = [];
  if (Array.isArray(raw['playlists'])) {
    for (const item of raw['playlists']) {
      if (!isRecord(item)) continue;
      const id = asString(item['id']).trim();
      const name = asString(item['name']).trim();
      if (!id || !name) continue;
      const videos: LibraryVideoInput[] = [];
      if (Array.isArray(item['videos'])) {
        for (const v of item['videos']) {
          const sv = sanitizeVideo(v);
          if (sv) videos.push(sv);
        }
      }
      playlists.push({
        id,
        name,
        createdAt: asNumber(item['createdAt'], 0),
        updatedAt: asNumber(item['updatedAt'], 0),
        videos,
      });
    }
  }

  const plays: PlayStats[] = [];
  if (Array.isArray(raw['plays'])) {
    for (const item of raw['plays']) {
      if (!isRecord(item)) continue;
      const videoId = asString(item['videoId']).trim();
      if (!videoId) continue;
      const video = sanitizeVideo(item['video']);
      plays.push({
        videoId,
        count: Math.max(0, Math.floor(asNumber(item['count'], 0))),
        lastPlayed: asNumber(item['lastPlayed'], 0),
        video: video ?? { videoId, title: videoId, artist: 'Unknown artist', thumbnail: '' },
      });
    }
  }

  return { version: LIBRARY_STORAGE_VERSION, liked, playlists, plays };
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to Math.random
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const LIBRARY_CHANGE_EVENT = 'at-library-change';

function notifyLibraryChange(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LIBRARY_CHANGE_EVENT));
    }
  } catch {
    // Non-fatal: other hook instances reload on next mount / storage event.
  }
}

export const localStorageBackend: LibraryBackend = {
  load(): PersistedLibrary | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const clean = sanitizePersisted(parsed);
      if (!clean) {
        // Corrupt cache: drop it so the app recovers to empty (honest).
        try {
          localStorage.removeItem(LIBRARY_STORAGE_KEY);
        } catch {
          // ignore cleanup failure
        }
        return null;
      }
      return clean;
    } catch {
      // JSON.parse failure or storage unavailable: recover to empty.
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(LIBRARY_STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
  },
  save(state: PersistedLibrary): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota / private-mode: keep in-memory state for this session.
    }
  },
};

function loadInitial(backend: LibraryBackend): PersistedLibrary {
  try {
    return backend.load() ?? emptyState();
  } catch {
    return emptyState();
  }
}

export interface LibraryStore {
  liked: LikedEntry[];
  playlists: Playlist[];
  plays: PlayStats[];
  /** Plays sorted newest-first (Songs tab, keep-listening). */
  history: PlayStats[];
  /** Plays sorted most-played-first (quick picks). */
  mostPlayed: PlayStats[];
  /** Liked sorted newest-first (recently-liked row). */
  recentlyLiked: LikedEntry[];
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  isLiked: (videoId: string) => boolean;
  toggleLike: (video: LibraryVideoInput) => void;
  createPlaylist: (name: string) => Playlist | null;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, video: LibraryVideoInput) => void;
  removeFromPlaylist: (playlistId: string, videoId: string) => void;
  recordPlay: (videoId: string, video?: LibraryVideoInput) => void;
}

/**
 * Library hook: liked songs, playlists CRUD, play counts + last-played.
 * Persists to localStorage (`at-library-v1`, versioned, corrupt-cache safe).
 */
export function useLibrary(backend: LibraryBackend = localStorageBackend): LibraryStore {
  const [state, setState] = useState<PersistedLibrary>(() => loadInitial(backend));
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cross-instance sync: same-tab custom event + cross-tab storage event.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reload = () => {
      try {
        const next = backend.load();
        if (!next) return;
        // load() always returns a fresh object; only adopt it when the data
        // actually differs, or notify -> reload -> setState would re-fire the
        // notify effect forever (passive-update infinite loop).
        if (JSON.stringify(next) === JSON.stringify(stateRef.current)) return;
        setState(next);
      } catch {
        // keep current in-memory state
      }
    };
    const onCustom = () => reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIBRARY_STORAGE_KEY) reload();
    };
    window.addEventListener(LIBRARY_CHANGE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(LIBRARY_CHANGE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
    // backend is stable (module singleton or caller-owned); mount-only sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      backend.save(state);
    } catch {
      // save() already guards; never break render.
    }
    // backend stable; persist whenever state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Notify sibling hook instances after each committed change (skip initial).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }
    notifyLibraryChange();
  }, [state, mounted]);

  const isLiked = useCallback(
    (videoId: string) => state.liked.some((l) => l.videoId === videoId),
    [state.liked],
  );

  const toggleLike = useCallback((video: LibraryVideoInput) => {
    const vid = video.videoId.trim();
    if (!vid) return;
    setState((prev) => {
      const exists = prev.liked.some((l) => l.videoId === vid);
      if (exists) {
        return { ...prev, liked: prev.liked.filter((l) => l.videoId !== vid) };
      }
      const clean = sanitizeVideo({ ...video, videoId: vid });
      if (!clean) return prev;
      return { ...prev, liked: [...prev.liked, { ...clean, likedAt: Date.now() }] };
    });
  }, []);

  const createPlaylist = useCallback((name: string): Playlist | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const now = Date.now();
    const playlist: Playlist = {
      id: makeId(),
      name: trimmed.slice(0, 80),
      createdAt: now,
      updatedAt: now,
      videos: [],
    };
    setState((prev) => ({ ...prev, playlists: [...prev.playlists, playlist] }));
    return playlist;
  }, []);

  const renamePlaylist = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!id || !trimmed) return;
    setState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) =>
        p.id === id ? { ...p, name: trimmed.slice(0, 80), updatedAt: Date.now() } : p,
      ),
    }));
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    if (!id) return;
    setState((prev) => ({ ...prev, playlists: prev.playlists.filter((p) => p.id !== id) }));
  }, []);

  const addToPlaylist = useCallback((playlistId: string, video: LibraryVideoInput) => {
    const vid = video.videoId.trim();
    if (!playlistId || !vid) return;
    const clean = sanitizeVideo({ ...video, videoId: vid });
    if (!clean) return;
    setState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => {
        if (p.id !== playlistId) return p;
        if (p.videos.some((v) => v.videoId === vid)) return p;
        return { ...p, videos: [...p.videos, clean], updatedAt: Date.now() };
      }),
    }));
  }, []);

  const removeFromPlaylist = useCallback((playlistId: string, videoId: string) => {
    const vid = videoId.trim();
    if (!playlistId || !vid) return;
    setState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) =>
        p.id === playlistId
          ? { ...p, videos: p.videos.filter((v) => v.videoId !== vid), updatedAt: Date.now() }
          : p,
      ),
    }));
  }, []);

  const recordPlay = useCallback((videoId: string, video?: LibraryVideoInput) => {
    const vid = videoId.trim();
    if (!vid) return;
    const clean = video ? sanitizeVideo({ ...video, videoId: vid }) : null;
    const now = Date.now();
    setState((prev) => {
      const idx = prev.plays.findIndex((p) => p.videoId === vid);
      if (idx === -1) {
        const entry: PlayStats = {
          videoId: vid,
          count: 1,
          lastPlayed: now,
          video: clean ?? { videoId: vid, title: vid, artist: 'Unknown artist', thumbnail: '' },
        };
        return { ...prev, plays: [...prev.plays, entry] };
      }
      const next = prev.plays.slice();
      const cur = next[idx];
      next[idx] = {
        ...cur,
        count: cur.count + 1,
        lastPlayed: now,
        video: clean ?? cur.video,
      };
      return { ...prev, plays: next };
    });
  }, []);

  const history = useMemo(
    () => state.plays.slice().sort((a, b) => b.lastPlayed - a.lastPlayed),
    [state.plays],
  );

  const mostPlayed = useMemo(
    () =>
      state.plays
        .slice()
        .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed),
    [state.plays],
  );

  const recentlyLiked = useMemo(
    () => state.liked.slice().sort((a, b) => b.likedAt - a.likedAt),
    [state.liked],
  );

  const artists = useMemo<ArtistEntry[]>(() => {
    const byName = new Map<string, ArtistEntry>();
    const ingest = (video: LibraryVideoInput) => {
      const name = (video.artist || 'Unknown artist').trim() || 'Unknown artist';
      const key = name.toLowerCase();
      const cur = byName.get(key);
      if (cur) {
        if (!cur.videos.some((v) => v.videoId === video.videoId)) cur.videos.push(video);
        cur.count = cur.videos.length;
        if (!cur.thumbnail && video.thumbnail) cur.thumbnail = video.thumbnail;
      } else {
        byName.set(key, {
          name,
          count: 1,
          thumbnail: video.thumbnail,
          videos: [video],
        });
      }
    };
    for (const l of state.liked) ingest(l);
    for (const p of state.plays) ingest(p.video);
    return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [state.liked, state.plays]);

  const albums = useMemo<AlbumEntry[]>(() => {
    // No first-party album metadata on YouTube videos: each distinct video
    // surfaces as a single/album entry so the Albums tab reflects real data.
    const byId = new Map<string, AlbumEntry>();
    const ingest = (video: LibraryVideoInput, playCount: number, lastPlayed: number) => {
      const cur = byId.get(video.videoId);
      if (cur) {
        cur.playCount = Math.max(cur.playCount, playCount);
        cur.lastPlayed = Math.max(cur.lastPlayed, lastPlayed);
        return;
      }
      byId.set(video.videoId, {
        id: video.videoId,
        videoId: video.videoId,
        title: video.title || video.videoId,
        artist: video.artist || 'Unknown artist',
        thumbnail: video.thumbnail,
        playCount,
        lastPlayed,
      });
    };
    for (const l of state.liked) ingest(l, 0, l.likedAt);
    for (const p of state.plays) ingest(p.video, p.count, p.lastPlayed);
    return [...byId.values()].sort((a, b) => b.lastPlayed - a.lastPlayed);
  }, [state.liked, state.plays]);

  return {
    liked: state.liked,
    playlists: state.playlists,
    plays: state.plays,
    history,
    mostPlayed,
    recentlyLiked,
    artists,
    albums,
    isLiked,
    toggleLike,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    recordPlay,
  };
}

export type UseLibrary = typeof useLibrary;

export default useLibrary;
