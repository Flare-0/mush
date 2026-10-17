import type { LyricLine, LyricsResult, SongMeta } from "../engine/types";
import { parseLRC, parsePlain, parseTTML } from "../engine/parsers";

const TIMEOUT_MS = 8000;

function emptyResult(): LyricsResult {
  return { type: "plain", lines: [], source: "none" };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json() as unknown;
  } catch {
    return null;
  }
}

async function readText(res: Response): Promise<string | null> {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Classify parsed lines: word timing > line timing > plain. */
function toResult(lines: LyricLine[], source: string): LyricsResult | null {
  if (lines.length === 0) return null;
  if (lines.some((l) => l.words.length > 1)) return { type: "word", lines, source };
  if (lines.some((l) => l.start >= 0)) return { type: "line", lines, source };
  return { type: "plain", lines, source };
}

function sniffFormat(lyrics: string, hint: string): "ttml" | "lrc" | "plain" {
  const h = hint.toLowerCase();
  if (h.includes("ttml") || h.includes("xml")) return "ttml";
  if (h.includes("lrc") || h.includes("enhanced") || h.includes("synced")) return "lrc";
  if (h.includes("plain") || h.includes("text")) return "plain";
  const trimmed = lyrics.trimStart();
  if (trimmed.startsWith("<tt") || trimmed.startsWith("<?xml")) return "ttml";
  if (/\[(\d{1,3}):(\d{2})(?:[.:]\d{1,3})?\]/.test(lyrics)) return "lrc";
  return "plain";
}

async function tryBetterLyrics(title: string, artist: string, album: string, duration: number): Promise<LyricsResult | null> {
  try {
    const url =
      `https://api.betterlyrics.org/getLyrics?s=${encodeURIComponent(title)}` +
      `&a=${encodeURIComponent(artist)}&al=${encodeURIComponent(album)}&d=${encodeURIComponent(String(duration))}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = asRecord(await readJson(res));
    if (!json) return null;
    const ttml = asString(json["ttml"]) ?? asString(asRecord(json["data"])?.["ttml"]);
    if (!ttml) return null;
    const lines = parseTTML(ttml);
    return lines.length > 0 ? { type: "word", lines, source: "BetterLyrics" } : null;
  } catch {
    return null;
  }
}

async function tryUnison(title: string, artist: string, videoId: string): Promise<LyricsResult | null> {
  try {
    const url = videoId !== ""
      ? `https://unison.boidu.dev/lyrics?v=${encodeURIComponent(videoId)}`
      : `https://unison.boidu.dev/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = asRecord(await readJson(res));
    if (!json) return null;
    const data = asRecord(json["data"]);
    const lyrics = asString(data?.["lyrics"]) ?? asString(json["lyrics"]);
    if (!lyrics) return null;
    const formatHint = asString(data?.["format"]) ?? asString(json["format"]) ?? "";
    const format = sniffFormat(lyrics, formatHint);
    if (format === "ttml") {
      const lines = parseTTML(lyrics);
      return lines.length > 0 ? { type: "word", lines, source: "Unison" } : null;
    }
    if (format === "lrc") {
      return toResult(parseLRC(lyrics), "Unison");
    }
    const lines = parsePlain(lyrics);
    return lines.length > 0 ? { type: "plain", lines, source: "Unison" } : null;
  } catch {
    return null;
  }
}

async function tryLrcRed(title: string, artist: string, album: string, duration: number): Promise<LyricsResult | null> {
  try {
    const matchUrl =
      `https://lrc.red/match.json?title=${encodeURIComponent(title)}` +
      `&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}` +
      `&duration=${encodeURIComponent(String(duration))}`;
    const matchRes = await fetchWithTimeout(matchUrl);
    if (!matchRes.ok) return null;
    const matchJson = asRecord(await readJson(matchRes));
    if (!matchJson) return null;
    const isrc = asString(matchJson["isrc"]) ?? asString(asRecord(matchJson["data"])?.["isrc"]);
    if (!isrc) return null;
    const ttmlRes = await fetchWithTimeout(`https://lrc.red/s/${encodeURIComponent(isrc)}.ttml`);
    if (!ttmlRes.ok) return null;
    const ttml = await readText(ttmlRes);
    if (!ttml || ttml.trim() === "") return null;
    const lines = parseTTML(ttml);
    return lines.length > 0 ? { type: "word", lines, source: "lrc.red" } : null;
  } catch {
    return null;
  }
}

function lrclibLines(synced: string | null, plain: string | null, source: string): LyricsResult | null {
  if (synced) {
    const lines = parseLRC(synced);
    if (lines.length > 0) {
      return lines.some((l) => l.words.length > 1)
        ? { type: "word", lines, source }
        : { type: "line", lines, source };
    }
  }
  if (plain) {
    const lines = parsePlain(plain);
    if (lines.length > 0) return { type: "plain", lines, source };
  }
  return null;
}

async function tryLrclib(title: string, artist: string, album: string, duration: number): Promise<LyricsResult | null> {
  const base =
    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}` +
    `&track_name=${encodeURIComponent(title)}&album_name=${encodeURIComponent(album)}` +
    `&duration=${encodeURIComponent(String(duration))}`;
  try {
    const res = await fetchWithTimeout(base);
    if (res.ok) {
      const json = asRecord(await readJson(res));
      if (json) {
        const hit = lrclibLines(asString(json["syncedLyrics"]), asString(json["plainLyrics"]), "LRCLIB");
        if (hit) return hit;
      }
      return null;
    }
    if (res.status !== 404) return null;
  } catch {
    return null;
  }
  // 404 fallthrough: search then fetch the first synced hit by id.
  try {
    const q = `${title} ${artist}`.trim();
    const searchRes = await fetchWithTimeout(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
    if (!searchRes.ok) return null;
    const items = await readJson(searchRes);
    if (!Array.isArray(items)) return null;
    let fallbackPlain: { id: string; plain: string } | null = null;
    for (const item of items) {
      const rec = asRecord(item);
      if (!rec) continue;
      const id = rec["id"];
      const idStr = typeof id === "number" && Number.isFinite(id)
        ? String(id)
        : typeof id === "string" && id.trim() !== ""
          ? id
          : null;
      if (!idStr) continue;
      const synced = asString(rec["syncedLyrics"]);
      if (synced) {
        try {
          const got = await fetchWithTimeout(`https://lrclib.net/api/get/${encodeURIComponent(idStr)}`);
          if (!got.ok) continue;
          const detail = asRecord(await readJson(got));
          if (!detail) continue;
          const hit = lrclibLines(asString(detail["syncedLyrics"]) ?? synced, asString(detail["plainLyrics"]), "LRCLIB");
          if (hit) return hit;
        } catch {
          continue;
        }
      } else if (!fallbackPlain) {
        const plain = asString(rec["plainLyrics"]);
        if (plain) fallbackPlain = { id: idStr, plain };
      }
    }
    if (fallbackPlain) {
      return lrclibLines(null, fallbackPlain.plain, "LRCLIB");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cascade through lyric providers in order (BetterLyrics -> Unison ->
 * lrc.red -> LRCLIB), each guarded by an 8s timeout. Never throws: returns
 * an empty `{type:'plain', lines:[], source:'none'}` result when every
 * provider fails, letting the caller fall back to a YouTube captions note.
 */
export async function fetchLyricsCascade(meta: SongMeta): Promise<LyricsResult> {
  try {
    const title = meta.title.trim();
    const artist = meta.artist.trim();
    const album = (meta.album ?? "").trim();
    const duration = Math.round(meta.duration ?? 0);
    const videoId = (meta.videoId ?? "").trim();

    const fromBetter = await tryBetterLyrics(title, artist, album, duration);
    if (fromBetter) return fromBetter;

    const fromUnison = await tryUnison(title, artist, videoId);
    if (fromUnison) return fromUnison;

    const fromLrcRed = await tryLrcRed(title, artist, album, duration);
    if (fromLrcRed) return fromLrcRed;

    const fromLrclib = await tryLrclib(title, artist, album, duration);
    if (fromLrclib) return fromLrclib;

    return emptyResult();
  } catch {
    return emptyResult();
  }
}

export type LyricsProviderId = "auto" | "betterlyrics" | "unison" | "lrc.red" | "lrclib";

export const LYRICS_PROVIDER_OPTIONS: { id: LyricsProviderId; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Cascade: BetterLyrics → Unison → lrc.red → LRCLIB" },
  { id: "betterlyrics", label: "BetterLyrics", hint: "Apple-style word timings (TTML)" },
  { id: "unison", label: "Unison", hint: "Video-matched lyrics (TTML/LRC/plain)" },
  { id: "lrc.red", label: "lrc.red", hint: "ISRC-matched word timings (TTML)" },
  { id: "lrclib", label: "LRCLIB", hint: "Community LRC (enhanced → word, plain → line)" },
];

/**
 * Fetch from one specific provider (or the full cascade for "auto").
 * Never throws: returns an empty result when the provider has no match,
 * so the caller can show which provider came up empty.
 */
export async function fetchLyricsFromProvider(
  provider: LyricsProviderId,
  meta: SongMeta,
): Promise<LyricsResult> {
  if (provider === "auto") return fetchLyricsCascade(meta);
  try {
    const title = meta.title.trim();
    const artist = meta.artist.trim();
    const album = (meta.album ?? "").trim();
    const duration = Math.round(meta.duration ?? 0);
    const videoId = (meta.videoId ?? "").trim();
    let hit: LyricsResult | null = null;
    if (provider === "betterlyrics") hit = await tryBetterLyrics(title, artist, album, duration);
    else if (provider === "unison") hit = await tryUnison(title, artist, videoId);
    else if (provider === "lrc.red") hit = await tryLrcRed(title, artist, album, duration);
    else hit = await tryLrclib(title, artist, album, duration);
    return hit ?? emptyResult();
  } catch {
    return emptyResult();
  }
}
