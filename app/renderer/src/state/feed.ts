import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * coder-2 feed store (stubs + YouTube search).
 * Real library/persistence lands later; these typed stubs keep
 * Home/Search/Library rendering honestly with empty states.
 */

export interface FeedVideo {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  /** Seconds. Present when the search source knows it (innertube does). */
  duration?: number;
}

export interface QuickPick {
  id: string;
  title: string;
  subtitle: string;
  thumbnail?: string;
  videoId?: string;
}

export interface HomeSection {
  id: string;
  title: string;
  items: FeedVideo[];
}

export const YT_API_KEY_STORAGE_KEY = 'yt_api_key';

/** Read the YouTube Data API v3 key. Null when unset (empty-state mode). */
export function getYouTubeApiKey(): string | null {
  try {
    const raw = localStorage.getItem(YT_API_KEY_STORAGE_KEY);
    const key = (raw ?? '').trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/* ---- search source: innertube bridge (desktop) > Data API key (browser dev) ---- */

export type SearchSource = 'bridge' | 'key' | 'none';

/**
 * Which search backend is available:
 * - 'bridge': Electron preload exposes innertube search (no API key, the
 *   ArchiveTune/InnerTune way — the desktop app always has this).
 * - 'key': plain browser with a saved YouTube Data API v3 key (web-dev only;
 *   CORS prevents innertube from the page itself).
 * - 'none': no source — search shows an honest empty state.
 */
export function getSearchSource(): SearchSource {
  try {
    const bridge = typeof window !== 'undefined' ? window.archivetune?.searchMusic : undefined;
    if (typeof bridge === 'function') return 'bridge';
  } catch {
    // fall through to key check
  }
  return getYouTubeApiKey() !== null ? 'key' : 'none';
}

/** Validate/coerce one innertube bridge row into a FeedVideo. */
function coerceBridgeVideo(v: unknown): FeedVideo | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const videoId = typeof o['videoId'] === 'string' ? o['videoId'] : '';
  if (!videoId) return null;
  const out: FeedVideo = {
    videoId,
    title: typeof o['title'] === 'string' && o['title'] ? o['title'] : videoId,
    artist: typeof o['artist'] === 'string' && o['artist'] ? o['artist'] : 'Unknown artist',
    thumbnail: typeof o['thumbnail'] === 'string' ? o['thumbnail'] : '',
  };
  const d = o['duration'];
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) out.duration = d;
  return out;
}

async function searchViaBridge(query: string): Promise<FeedVideo[]> {
  const bridge = window.archivetune?.searchMusic;
  if (typeof bridge !== 'function') return [];
  const raw = await bridge(query);
  if (!Array.isArray(raw)) return [];
  const out: FeedVideo[] = [];
  for (const item of raw) {
    const v = coerceBridgeVideo(item);
    if (v) out.push(v);
  }
  return out;
}

/* ---- title/channel cleanup (ported approach from E:/mush src/lib/youtube.ts) ---- */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanTitle(t: string): string {
  let s = decodeEntities(t);
  const bracketClutter =
    /[\(\[][^()\[\]]*(official\s+(music\s+)?video|official\s*mv|official\s*audio|official\s*lyric\s*(video)?|official\s*music\s*video|music\s*video|\bmv\b|lyric\s*video|lyrics?\b|visualiz(er|er)|visualiser|live|audio|official|hd|4k|explicit)[^()\[\]]*[\)\]]/gi;
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(bracketClutter, ' ');
  }
  s = s.replace(
    /\s*[-–—|:]\s*(official\s+(music\s+)?video|official\s*mv|official\s*audio|official\s*lyric\s*(video)?|music\s*video|lyric\s*video|visualiz(er|er)|audio)\s*$/i,
    '',
  );
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return s;
}

function cleanChannel(c: string): string {
  return decodeEntities(c).replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

function splitArtistTitle(
  videoTitle: string,
  channelTitle: string,
): { title: string; artist: string } {
  const decoded = decodeEntities(videoTitle);
  const sep = decoded.indexOf(' - ');
  if (sep >= 0) {
    const artist = decoded.slice(0, sep).trim();
    const title = cleanTitle(decoded.slice(sep + 3));
    return { title, artist: artist || cleanChannel(channelTitle) };
  }
  return { title: cleanTitle(decoded), artist: cleanChannel(channelTitle) };
}

interface SearchSnippet {
  title?: string;
  channelTitle?: string;
  thumbnails?: {
    default?: { url?: string };
    medium?: { url?: string };
    high?: { url?: string };
  };
}

interface SearchApiItem {
  id?: { videoId?: string };
  snippet?: SearchSnippet;
}

interface SearchApiResponse {
  items?: SearchApiItem[];
  error?: { message?: string };
}

function toFeedVideo(item: SearchApiItem): FeedVideo | null {
  const videoId = item.id?.videoId;
  if (!videoId) return null;
  const { title, artist } = splitArtistTitle(
    item.snippet?.title ?? '',
    item.snippet?.channelTitle ?? 'Unknown',
  );
  const thumbs = item.snippet?.thumbnails;
  const thumbnail =
    thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? '';
  return { videoId, title, artist, thumbnail };
}

function searchErrorMessage(status: number, apiMessage: string): string {
  if (status === 403) {
    return (
      `YouTube API error 403 (forbidden): ${apiMessage} ` +
      `Usually quota-exceeded, disabled API, or a restricted key. ` +
      `Enable YouTube Data API v3 and check key restrictions.`
    );
  }
  if (status === 400) return `YouTube API error 400 (bad request): ${apiMessage}`;
  return `YouTube search failed (HTTP ${status}): ${apiMessage}`;
}

/** Raw search, same query shape as the E:/mush player (music category 10). */
export async function searchYouTubeFeed(
  apiKey: string,
  query: string,
  maxResults = 20,
): Promise<FeedVideo[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    q,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!res.ok) {
    let apiMessage = res.statusText || 'request failed';
    try {
      const body = (await res.json()) as SearchApiResponse;
      if (body.error?.message) apiMessage = body.error.message;
    } catch {
      // keep fallback
    }
    throw new Error(searchErrorMessage(res.status, apiMessage));
  }
  const data = (await res.json()) as SearchApiResponse;
  const out: FeedVideo[] = [];
  for (const item of data.items ?? []) {
    const v = toFeedVideo(item);
    if (v) out.push(v);
  }
  return out;
}

/* ---- typed stubs (real stores land later) ---- */

/** Time-of-day greeting for the home header. */
export function getGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Stub: quick picks are empty until playback history lands. */
export function getQuickPicks(): QuickPick[] {
  return [];
}

/** Stub: home sections are empty until feed/recommendations land. */
export function getHomeSections(): HomeSection[] {
  return [];
}

export interface HomeFeedState {
  greeting: string;
  quickPicks: QuickPick[];
  sections: HomeSection[];
  loading: boolean;
  /** True when a search source exists (innertube bridge or API key). */
  hasSource: boolean;
}

/** Skeleton-tolerant home feed. Today: resolves immediately to empty stubs. */
export function useHomeFeed(): HomeFeedState {
  const [greeting] = useState<string>(() => getGreeting());
  const [quickPicks] = useState<QuickPick[]>(() => getQuickPicks());
  const [sections] = useState<HomeSection[]>(() => getHomeSections());
  const [hasSource] = useState<boolean>(() => getSearchSource() !== 'none');
  return { greeting, quickPicks, sections, loading: false, hasSource };
}

export interface YouTubeSearchState {
  query: string;
  setQuery: (q: string) => void;
  results: FeedVideo[];
  loading: boolean;
  error: string | null;
  hasSource: boolean;
  retry: () => void;
}

/**
 * Debounced YouTube Music search. Uses the Electron innertube bridge when
 * present (no API key — the ArchiveTune way); falls back to the YouTube Data
 * API v3 key in a plain browser. Returns empty (no fetch) when no source is
 * available or the query is blank, so callers can render honest empty states.
 */
export function useYouTubeSearch(initialQuery = '', debounceMs = 400): YouTubeSearchState {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSource, setHasSource] = useState<boolean>(() => getSearchSource() !== 'none');
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<number | null>(null);
  /** Monotonic request token: only the latest effect run may commit results. */
  const seqRef = useRef(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const seq = ++seqRef.current;
    const source = getSearchSource();
    setHasSource(source !== 'none');
    if (source === 'none') {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const run: Promise<FeedVideo[]> =
        source === 'bridge'
          ? searchViaBridge(q)
          : searchYouTubeFeed(getYouTubeApiKey() ?? '', q);
      run
        .then((videos) => {
          if (seq === seqRef.current) setResults(videos);
        })
        .catch((e: unknown) => {
          if (seq === seqRef.current) {
            setResults([]);
            setError(e instanceof Error ? e.message : 'YouTube search failed');
          }
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false);
        });
    }, Math.max(debounceMs, 0));
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [query, attempt, debounceMs]);

  return { query, setQuery, results, loading, error, hasSource, retry };
}
