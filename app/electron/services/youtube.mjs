// YouTube Music (innertube) search — main process, no API key required.
// Mirrors the InnerTune/ArchiveTune approach: POST to WEB_REMIX
// /youtubei/v1/search and parse musicResponsiveListItemRenderer rows.
// CORS does not apply here (Node fetch), which is why the desktop app can
// drop the YouTube Data API v3 key that the browser-only web app needed.

const SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241127.01.00',
    gl: 'US',
    hl: 'en',
  },
};
const TIMEOUT_MS = 10_000;
const MAX_LIMIT = 50;

const TYPE_TOKENS = new Set([
  'Song',
  'Video',
  'Single',
  'Album',
  'EP',
  'Playlist',
  'Artist',
  'Profile',
  'Podcast',
  'Episode',
]);

const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

/** "3:44" / "1:02:11" -> seconds. Null when not a timestamp. */
function parseDuration(text) {
  if (typeof text !== 'string' || !TIME_RE.test(text.trim())) return null;
  const parts = text.trim().split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec > 0 ? sec : null;
}

/** Upgrade yt3 thumbnail =w120-h120-... to a card-sized render. */
function upgradeThumb(url) {
  if (typeof url !== 'string' || !url) return '';
  return url.replace(/=w\d+-h\d+/, '=w544-h544');
}

function runsText(runs) {
  if (!Array.isArray(runs)) return '';
  return runs
    .map((r) => (r && typeof r.text === 'string' ? r.text : ''))
    .join('')
    .trim();
}

/** Depth-first collect every musicResponsiveListItemRenderer. */
function collectRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    if (key === 'musicResponsiveListItemRenderer') {
      out.push(node[key]);
    } else {
      collectRenderers(node[key], out);
    }
  }
}

function pickThumbnail(r) {
  const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbs) || thumbs.length === 0) return '';
  for (let i = thumbs.length - 1; i >= 0; i -= 1) {
    const url = thumbs[i]?.url;
    if (typeof url === 'string' && url) return upgradeThumb(url);
  }
  return '';
}

function flexColumnText(r, index) {
  const col = r?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer;
  if (!col?.text) return '';
  const runs = col.text.runs;
  if (Array.isArray(runs)) {
    return runs
      .map((x) => (x && typeof x.text === 'string' ? x.text : ''))
      .filter((t) => t.trim() !== ' • ' && t.trim() !== '•')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (typeof col.text.simpleText === 'string') {
    return col.text.simpleText
      .split(' • ')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return '';
}

/**
 * Top-result rows omit the artist from flexColumns; the play-button
 * accessibility label carries it: "Play {title} - {artist}".
 */
function artistFromOverlay(r, title) {
  const play =
    r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
  const label = play?.accessibilityPlayData?.accessibilityData?.label;
  if (typeof label !== 'string' || !label) return '';
  const prefix = `Play ${title} - `;
  if (label.startsWith(prefix)) return label.slice(prefix.length).trim();
  const parts = label.replace(/^Play\s+/, '').split(' - ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

/** Renderer -> { videoId, title, artist, thumbnail, duration? } | null. */
function toSearchItem(r) {
  const videoId = r?.playlistItemData?.videoId;
  if (typeof videoId !== 'string' || !videoId) return null;
  const titleParts = flexColumnText(r, 0);
  const title = Array.isArray(titleParts) ? titleParts.join(' ').trim() : '';
  if (!title) return null;

  const meta = flexColumnText(r, 1);
  const metaParts = Array.isArray(meta) ? meta : [];
  let artist = '';
  let duration = null;
  if (metaParts.length > 0) {
    const rest = TYPE_TOKENS.has(metaParts[0]) ? metaParts.slice(1) : metaParts;
    const last = rest[rest.length - 1];
    duration = parseDuration(last);
    const artistCandidates = duration !== null ? rest.slice(0, -1) : rest;
    artist = artistCandidates.length > 0 ? artistCandidates.join(' & ') : '';
  }
  if (!artist) artist = artistFromOverlay(r, title);

  const item = {
    videoId,
    title,
    artist: artist || 'Unknown artist',
    thumbnail: pickThumbnail(r),
  };
  if (duration !== null) item.duration = duration;
  return item;
}

/**
 * Search YouTube Music. Resolves to a list of playable items; throws
 * Error with a user-readable message on network/HTTP failure.
 */
export async function searchMusic(query, limit = 20) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return [];
  const capped = q.slice(0, 200);
  const max = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 20, 1), MAX_LIMIT);

  let res;
  try {
    res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: CONTEXT, query: capped }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`YouTube Music search failed (network): ${e instanceof Error ? e.message : 'unreachable'}`);
  }
  if (!res.ok) {
    throw new Error(`YouTube Music search failed (HTTP ${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('YouTube Music search failed: malformed response');
  }

  const renderers = [];
  collectRenderers(data, renderers);

  const out = [];
  const seen = new Set();
  for (const r of renderers) {
    const item = toSearchItem(r);
    if (!item || seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export default { searchMusic };
