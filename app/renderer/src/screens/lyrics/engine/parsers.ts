import type { LyricLine, LyricWord } from "./types";

/** Parse a TTML time expression into seconds. Returns NaN when unparseable. */
function parseTtmlTime(value: string | null | undefined): number {
  if (value == null) return NaN;
  const s = value.trim().replace(",", ".");
  if (s === "") return NaN;
  // Bare seconds with trailing "s", e.g. "12.34s"
  const secMatch = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(s);
  if (secMatch) return Number(secMatch[1]);
  // Clock time: [hh:]mm:ss.mmm or mm:ss
  if (s.includes(":")) {
    const parts = s.split(":");
    const last = Number(parts[parts.length - 1]);
    if (!Number.isFinite(last)) return NaN;
    let total = last;
    let factor = 60;
    for (let i = parts.length - 2; i >= 0; i--) {
      const n = Number(parts[i]);
      if (!Number.isFinite(n)) return NaN;
      total += n * factor;
      factor *= 60;
    }
    return total;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function getRole(el: Element): string {
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.toLowerCase().endsWith("role")) return attr.value;
  }
  return "";
}

function isTransliteration(el: Element): boolean {
  return /transliter|roman|kana|reading/i.test(getRole(el));
}

function isTranslation(el: Element): boolean {
  return /translat/i.test(getRole(el));
}

function localName(el: Element): string {
  return (el.localName ?? el.tagName).toLowerCase();
}

/** Text of a word span, excluding nested transliteration/translation spans. */
function wordText(span: Element): { text: string; roman?: string } {
  let text = "";
  let roman: string | undefined;
  for (let i = 0; i < span.childNodes.length; i++) {
    const node = span.childNodes[i];
    if (node.nodeType === 3) {
      text += node.textContent ?? "";
    } else if (node.nodeType === 1) {
      const child = node as Element;
      if (localName(child) === "span" && isTransliteration(child)) {
        const r = (child.textContent ?? "").trim();
        if (r !== "" && roman === undefined) roman = r;
      } else if (localName(child) === "span" && isTranslation(child)) {
        // skip translations inside word spans
      } else {
        text += child.textContent ?? "";
      }
    }
  }
  // Strip stray nested roman text that leaked in via textContent fallbacks.
  const cleaned = text.replace(/\s+/g, " ").trim();
  return roman === undefined ? { text: cleaned } : { text: cleaned, roman };
}

/**
 * Parse Apple / BetterLyrics TTML into timed lyric lines.
 * Handles <p begin/end> lines, <span begin/end|dur> words, and
 * transliteration-role spans mapped to word.roman.
 */
export function parseTTML(ttml: string): LyricLine[] {
  if (!ttml || ttml.trim() === "") return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(ttml, "application/xml");
  } catch {
    return [];
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return [];

  const pNodes = Array.from(doc.getElementsByTagNameNS("*", "p"));
  const lines: LyricLine[] = [];

  for (const p of pNodes) {
    const pBegin = parseTtmlTime(p.getAttribute("begin"));
    const pEndRaw = parseTtmlTime(p.getAttribute("end"));
    const pDur = parseTtmlTime(p.getAttribute("dur"));
    const lineStart = Number.isFinite(pBegin) ? pBegin : 0;
    let lineEnd = Number.isFinite(pEndRaw)
      ? pEndRaw
      : Number.isFinite(pDur)
        ? lineStart + pDur
        : NaN;

    // Line-level translation: first translation-role span's text.
    let translation: string | undefined;
    const spans = Array.from(p.getElementsByTagNameNS("*", "span"));
    for (const s of spans) {
      if (isTranslation(s) && s.parentElement === p) {
        const t = (s.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t !== "") {
          translation = t;
          break;
        }
      }
    }

    const words: LyricWord[] = [];
    let pendingRoman: string | undefined;

    const isWordSpan = (s: Element): boolean => {
      if (s.parentElement !== p && !(s.parentElement && s.parentElement.parentElement === p)) {
        // Only consider spans directly under <p> or nested one level (ruby-style).
      }
      if (isTranslation(s)) return false;
      if (isTransliteration(s)) return false;
      // Skip inner spans already consumed as part of a parent word span.
      const parent = s.parentElement;
      if (parent && localName(parent) === "span" && parent !== p && !isTranslation(parent) && !isTransliteration(parent)) {
        return false;
      }
      if (s.hasAttribute("begin") || s.hasAttribute("end") || s.hasAttribute("dur")) return true;
      // Untimed direct-child spans with real text are still words (joinable lyrics).
      if (s.parentElement === p) {
        const t = (s.textContent ?? "").trim();
        return t !== "";
      }
      return false;
    };

    for (const s of spans) {
      if (isTranslation(s)) continue;
      if (isTransliteration(s)) {
        const r = (s.textContent ?? "").replace(/\s+/g, " ").trim();
        if (r === "") continue;
        // Ruby-style: transliteration nested in (or preceding) a word span.
        const parent = s.parentElement;
        if (parent && localName(parent) === "span" && words.length > 0) {
          const last = words[words.length - 1];
          // Attribute to the word whose span contains this transliteration
          // when it is the most recent word; otherwise hold for the next word.
          if (last.roman === undefined) last.roman = r;
          else pendingRoman = r;
        } else if (words.length > 0 && words[words.length - 1].roman === undefined) {
          words[words.length - 1].roman = r;
        } else {
          pendingRoman = r;
        }
        continue;
      }
      if (!isWordSpan(s)) continue;
      const { text, roman: innerRoman } = wordText(s);
      if (text === "") {
        if (innerRoman !== undefined) pendingRoman = innerRoman;
        continue;
      }
      let wStart = parseTtmlTime(s.getAttribute("begin"));
      let wEnd = parseTtmlTime(s.getAttribute("end"));
      const wDur = parseTtmlTime(s.getAttribute("dur"));
      // TTML span times may be relative to the parent <p>; absolutize.
      if (Number.isFinite(wStart) && wStart < lineStart) wStart += lineStart;
      if (Number.isFinite(wEnd) && wEnd < lineStart) wEnd += lineStart;
      if (!Number.isFinite(wEnd) && Number.isFinite(wStart) && Number.isFinite(wDur)) {
        wEnd = wStart + wDur;
      }
      if (!Number.isFinite(wStart)) {
        const prev = words.length > 0 ? words[words.length - 1].end : lineStart;
        wStart = Number.isFinite(prev) ? prev : lineStart;
      }
      const roman = innerRoman ?? pendingRoman;
      pendingRoman = undefined;
      const word: LyricWord = Number.isFinite(wEnd) && wEnd > wStart
        ? { text, start: wStart, end: wEnd }
        : { text, start: wStart, end: NaN };
      if (roman !== undefined) word.roman = roman;
      words.push(word);
    }

    if (words.length === 0 && translation === undefined) continue;

    // Fill word ends from the next word / line end.
    if (!Number.isFinite(lineEnd)) {
      const lastTimed = [...words].reverse().find((w) => Number.isFinite(w.end));
      lineEnd = lastTimed ? lastTimed.end : lineStart + 3;
    }
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!Number.isFinite(w.end) || w.end <= w.start) {
        const next = words[i + 1];
        w.end = next && Number.isFinite(next.start) && next.start > w.start
          ? next.start
          : lineEnd > w.start
            ? lineEnd
            : w.start + 1;
      }
      if (w.end > lineEnd) lineEnd = w.end;
    }

    const text = words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
    if (text === "" && translation === undefined) continue;
    const line: LyricLine = {
      start: lineStart,
      end: lineEnd,
      text: text === "" ? (translation ?? "") : text,
      words,
    };
    if (translation !== undefined) line.translation = translation;
    lines.push(line);
  }

  lines.sort((a, b) => a.start - b.start);
  // Repair missing/inverted line ends from neighboring lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!Number.isFinite(line.end) || line.end <= line.start) {
      const next = lines[i + 1];
      line.end = next && next.start > line.start ? next.start : line.start + 3;
    }
  }
  return lines;
}

function lrcToSeconds(min: string, sec: string, frac: string | undefined): number {
  const m = Number(min);
  const s = Number(sec);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return NaN;
  let total = m * 60 + s;
  if (frac !== undefined) {
    const digits = frac.slice(0, 3);
    total += Number(`0.${digits}`);
  }
  return total;
}

const LRC_LINE_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_ENHANCED_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g;
const LRC_OFFSET_TAG = /\[offset:\s*([+-]?\d+)\]/i;

/**
 * Parse LRC: `[mm:ss.xx]` line tags plus enhanced `<mm:ss.xx>word` inline
 * tags. Word end = next word start, falling back to the line end; line end =
 * next line start, falling back to the last word end or start + 3s.
 */
export function parseLRC(lrc: string): LyricLine[] {
  if (!lrc || lrc.trim() === "") return [];
  const offsetMatch = LRC_OFFSET_TAG.exec(lrc);
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;

  interface RawLine { start: number; text: string; words: LyricWord[] }
  const raw: RawLine[] = [];

  for (const entry of lrc.split(/\r?\n/)) {
    const line = entry.trim();
    if (line === "") continue;
    if (LRC_OFFSET_TAG.test(line)) continue;
    LRC_LINE_TAG.lastIndex = 0;
    const tags = [...line.matchAll(LRC_LINE_TAG)];
    if (tags.length === 0) continue; // metadata ([ti:], [ar:], ...) or untimed prose
    const remainder = line.replace(LRC_LINE_TAG, "");
    if (remainder.trim() === "") continue;

    LRC_ENHANCED_TAG.lastIndex = 0;
    const inline = [...remainder.matchAll(LRC_ENHANCED_TAG)];
    const plainText = remainder.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, "").trim();

    const starts = tags.map((t) => lrcToSeconds(t[1], t[2], t[3])).filter((n) => Number.isFinite(n));
    if (starts.length === 0) continue;

    if (inline.length > 0) {
      const baseWords = inline
        .map((m): { start: number; text: string } | null => {
          const start = lrcToSeconds(m[1], m[2], m[3]);
          const text = m[4].replace(/\s+/g, " ").trim();
          if (!Number.isFinite(start) || text === "") return null;
          return { start, text };
        })
        .filter((w): w is { start: number; text: string } => w !== null);
      if (baseWords.length === 0) continue;
      const firstWordStart = baseWords[0].start;
      for (const lineStartRaw of starts) {
        const delta = lineStartRaw - firstWordStart;
        const words: LyricWord[] = baseWords.map((w, i) => {
          const start = w.start + delta + offsetSec;
          const next = baseWords[i + 1];
          const end = next ? next.start + delta + offsetSec : NaN;
          return { text: w.text, start, end };
        });
        raw.push({ start: lineStartRaw + offsetSec, text: plainText, words });
      }
    } else {
      if (plainText === "") continue;
      for (const lineStartRaw of starts) {
        const start = lineStartRaw + offsetSec;
        raw.push({ start, text: plainText, words: [{ text: plainText, start, end: NaN }] });
      }
    }
  }

  raw.sort((a, b) => a.start - b.start);
  const lines: LyricLine[] = raw.map((r, i) => {
    const next = raw[i + 1];
    let end = next && next.start > r.start ? next.start : NaN;
    // Resolve word ends first so the line can fall back to the last word.
    const words: LyricWord[] = r.words.map((w) => ({ ...w }));
    for (let j = 0; j < words.length; j++) {
      if (!Number.isFinite(words[j].end) || words[j].end <= words[j].start) {
        const nxt = words[j + 1];
        if (nxt && Number.isFinite(nxt.start) && nxt.start > words[j].start) {
          words[j].end = nxt.start;
        }
      }
    }
    const lastWordEnd = words.length > 0 ? words[words.length - 1].end : NaN;
    if (!Number.isFinite(end) || end <= r.start) {
      end = Number.isFinite(lastWordEnd) && lastWordEnd > r.start ? lastWordEnd : r.start + 3;
    }
    for (let j = 0; j < words.length; j++) {
      if (!Number.isFinite(words[j].end) || words[j].end <= words[j].start) {
        words[j].end = end > words[j].start ? end : words[j].start + 1;
      }
      if (words[j].end > end) end = words[j].end;
    }
    return { start: r.start, end, text: r.text, words };
  });
  return lines;
}

/** Parse untimed plain-text lyrics: one line per non-empty row, start/end = -1. */
export function parsePlain(text: string): LyricLine[] {
  if (!text || text.trim() === "") return [];
  return text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== "")
    .map((row) => ({
      start: -1,
      end: -1,
      text: row,
      words: [{ text: row, start: -1, end: -1 }],
    }));
}
