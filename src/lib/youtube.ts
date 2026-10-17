export interface VideoItem {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Strip video-type clutter like (Official Video), [Official MV],
 * (Music Video), (Lyric Video), (Visualizer), (Live), (Audio), etc.
 * Keeps feat./collab info intact. Trims surrounding quotes/whitespace.
 */
export function cleanTitle(t: string): string {
  let s = decodeEntities(t);

  // Remove whole bracketed/paren segments that contain a video-type keyword.
  // e.g. "Song (Official Video)" -> "Song", but "Song (feat. X)" is kept.
  const bracketClutter =
    /[\(\[][^()\[\]]*(official\s+(music\s+)?video|official\s*mv|official\s*audio|official\s*lyric\s*(video)?|official\s*music\s*video|music\s*video|\bmv\b|lyric\s*video|lyrics?\b|visualiz(er|er)|visualiser|live|audio|official|hd|4k|explicit)[^()\[\]]*[\)\]]/gi;
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(bracketClutter, " ");
  }

  // Trailing dash/pipe suffix without brackets: "Title - Official Video"
  s = s.replace(
    /\s*[-–—|:]\s*(official\s+(music\s+)?video|official\s*mv|official\s*audio|official\s*lyric\s*(video)?|music\s*video|lyric\s*video|visualiz(er|er)|audio)\s*$/i,
    "",
  );

  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return s;
}

/** Normalize a channel name: strip "- Topic" suffix and trailing VEVO. */
function cleanChannel(c: string): string {
  return decodeEntities(c).replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
}

/**
 * If the video title contains " - ", treat the left side as artist and
 * the right side as title. Otherwise use the channel name as artist.
 */
export function splitArtistTitle(
  videoTitle: string,
  channelTitle: string,
): { title: string; artist: string } {
  const decoded = decodeEntities(videoTitle);
  const sep = decoded.indexOf(" - ");
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
  error?: { message?: string; code?: number };
}

function toVideoItem(item: SearchApiItem): VideoItem | null {
  const videoId = item.id?.videoId;
  if (!videoId) return null;
  const rawTitle = item.snippet?.title ?? "";
  const rawChannel = item.snippet?.channelTitle ?? "Unknown";
  const { title, artist } = splitArtistTitle(rawTitle, rawChannel);
  const thumbs = item.snippet?.thumbnails;
  const thumbnail = thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? "";
  return { videoId, title, artist, thumbnail };
}

function searchErrorMessage(status: number, apiMessage: string): string {
  if (status === 403) {
    return (
      `YouTube API error 403 (forbidden): ${apiMessage} ` +
      `This is usually a quota-exceeded, disabled API, or HTTP-referrer/IP-restricted key. ` +
      `Check the key in Google Cloud Console (YouTube Data API v3 enabled, quota, key restrictions).`
    );
  }
  if (status === 400) {
    return `YouTube API error 400 (bad request): ${apiMessage}`;
  }
  return `YouTube search failed (HTTP ${status}): ${apiMessage}`;
}

export async function searchYouTube(
  apiKey: string,
  query: string,
  maxResults = 10,
): Promise<VideoItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    q: query,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!res.ok) {
    let apiMessage = res.statusText || "request failed";
    try {
      const body = (await res.json()) as SearchApiResponse;
      if (body.error?.message) apiMessage = body.error.message;
    } catch {
      // keep fallback message
    }
    throw new Error(searchErrorMessage(res.status, apiMessage));
  }
  const data = (await res.json()) as SearchApiResponse;
  const out: VideoItem[] = [];
  for (const item of data.items ?? []) {
    const v = toVideoItem(item);
    if (v) out.push(v);
  }
  return out;
}

function parseIso8601ToSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso.trim());
  if (!m) throw new Error(`Unrecognized ISO8601 duration: "${iso}"`);
  const h = m[1] ? Number(m[1]) : 0;
  const min = m[2] ? Number(m[2]) : 0;
  const sec = m[3] ? Number(m[3]) : 0;
  return h * 3600 + min * 60 + sec;
}

interface VideosApiResponse {
  items?: Array<{ contentDetails?: { duration?: string }; statistics?: { likeCount?: string } }>;
  error?: { message?: string };
}

export interface VideoStats {
  duration: number;
  likeCount: number | null;
}

export async function fetchVideoStats(apiKey: string, videoId: string): Promise<VideoStats> {
  const params = new URLSearchParams({ part: "contentDetails,statistics", id: videoId, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!res.ok) {
    let apiMessage = res.statusText || "request failed";
    try {
      const body = (await res.json()) as VideosApiResponse;
      if (body.error?.message) apiMessage = body.error.message;
    } catch {
      // keep fallback message
    }
    throw new Error(`YouTube video fetch failed (HTTP ${res.status}): ${apiMessage}`);
  }
  const data = (await res.json()) as VideosApiResponse;
  const item = data.items?.[0];
  const iso = item?.contentDetails?.duration;
  if (!iso) throw new Error(`No duration found for video "${videoId}"`);
  const rawLikes = item?.statistics?.likeCount;
  const likeCount = rawLikes !== undefined && rawLikes !== "" && Number.isFinite(Number(rawLikes))
    ? Number(rawLikes)
    : null;
  return { duration: parseIso8601ToSeconds(iso), likeCount };
}

export async function fetchDuration(apiKey: string, videoId: string): Promise<number> {
  return (await fetchVideoStats(apiKey, videoId)).duration;
}
