import type { LyricLine } from './lyrics/types';
import { toRomaji } from 'wanakana';

export type Lang = 'ja' | 'ko' | 'zh' | 'other';

const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/;
const HANGUL_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const KANJI_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;

export function detectLang(text: string): Lang {
  if (!text) return 'other';
  if (KANA_RE.test(text)) return 'ja';
  if (HANGUL_RE.test(text)) return 'ko';
  if (CJK_RE.test(text)) return 'zh';
  return 'other';
}

/**
 * Song-aware language: pure-kanji lines (no kana) misdetect as Chinese.
 * If any line in the song has kana, pure-CJK lines inherit 'ja'.
 */
export function langOfText(text: string, hasJa: boolean): Lang {
  const lang = detectLang(text);
  if (lang === 'zh' && hasJa) return 'ja';
  return lang;
}

// Revised-Romanization-ish tables for naive Hangul mapping.
const CHO = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '',
  'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];
const JUNG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
const JONG = [
  '', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb',
  'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't',
  'k', 't', 'p', 'h',
];

function romanizeSyllable(code: number): string {
  const s = code - 0xac00;
  const jong = s % 28;
  const jung = Math.floor(s / 28) % 21;
  const cho = Math.floor(s / (28 * 21));
  if (cho < 0 || cho >= CHO.length || jung < 0 || jung >= JUNG.length) return '';
  return `${CHO[cho]}${JUNG[jung]}${JONG[jong] ?? ''}`;
}

function romanizeKo(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      try {
        out += romanizeSyllable(code);
      } catch {
        out += ch;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

type PinyinFn = (text: string, opts?: Record<string, unknown>) => string | string[];

let cachedPinyin: PinyinFn | null = null;
let pinyinFailed = false;

async function getPinyin(): Promise<PinyinFn | null> {
  if (cachedPinyin) return cachedPinyin;
  if (pinyinFailed) return null;
  try {
    const mod = await import('pinyin-pro');
    const fn = (mod as unknown as { pinyin: PinyinFn }).pinyin;
    if (typeof fn !== 'function') {
      pinyinFailed = true;
      return null;
    }
    cachedPinyin = fn;
    return fn;
  } catch {
    pinyinFailed = true;
    return null;
  }
}

type KuroshiroInst = {
  init: (a: unknown) => Promise<void>;
  convert: (s: string, o: unknown) => Promise<string>;
};

const KUROSHIRO_URL = 'https://esm.sh/kuroshiro@1.2.0';
const ANALYZER_URL = 'https://esm.sh/kuroshiro-analyzer-kuromoji@1.1.0';
const KUROMOJI_DICT_PATH = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/';

const wordCache = new Map<string, string>();
let kuroshiroPromise: Promise<KuroshiroInst | null> | null = null;

function getKuroshiro(): Promise<KuroshiroInst | null> {
  if (kuroshiroPromise) return kuroshiroPromise;
  kuroshiroPromise = loadKuroshiro();
  return kuroshiroPromise;
}

async function loadKuroshiro(): Promise<KuroshiroInst | null> {
  try {
    const kuroMod = (await import(/* @vite-ignore */ KUROSHIRO_URL)) as unknown as {
      default: new () => KuroshiroInst;
    };
    const analyzerMod = (await import(/* @vite-ignore */ ANALYZER_URL)) as unknown as {
      default: new (opts: unknown) => unknown;
    };
    const KuroCtor = kuroMod.default;
    const AnalyzerCtor = analyzerMod.default;
    if (typeof KuroCtor !== 'function' || typeof AnalyzerCtor !== 'function') return null;
    const inst = new KuroCtor();
    const analyzer = new AnalyzerCtor({ dictPath: KUROMOJI_DICT_PATH });
    await inst.init(analyzer);
    return inst;
  } catch {
    return null;
  }
}

function convertWithTimeout(kuro: KuroshiroInst, word: string): Promise<string | null> {
  const conv = kuro
    .convert(word, { to: 'romaji', mode: 'spaced', romajiSystem: 'hepburn' })
    .then((r) => (typeof r === 'string' && r.length > 0 ? r : null))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 4000);
  });
  return Promise.race([conv, timeout]);
}

async function romanizeLines(lines: LyricLine[]): Promise<LyricLine[]> {
  let pinyin: PinyinFn | null = null;
  // Song-level language vote: pure-kanji lines (no kana) are otherwise
  // misdetected as Chinese. If any line has kana, the song is Japanese
  // and pure-CJK lines inherit 'ja' (kuroshiro reads kanji correctly).
  const hasJa = lines.some((l) => KANA_RE.test(l.text));
  const langOf = (text: string): Lang => langOfText(text, hasJa);
  if (lines.some((l) => langOf(l.text) === 'zh')) {
    pinyin = await getPinyin();
  }

  const needsKuro = lines.some(
    (l) => langOf(l.text) === 'ja' && l.words.some((w) => !w.roman && KANJI_RE.test(w.text)),
  );

  let kuro: KuroshiroInst | null = null;
  if (needsKuro) {
    const pending = getKuroshiro();
    const giveUp = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 4000);
    });
    kuro = await Promise.race([pending, giveUp]);
  }

  return Promise.all(
    lines.map(async (line) => {
      const lang = langOf(line.text);
      const words = await Promise.all(
        line.words.map(async (w) => {
          if (w.roman) return w;
          try {
            if (lang === 'ja') {
              const hit = wordCache.get(w.text);
              if (hit) return { ...w, roman: hit };
              if (kuro && KANJI_RE.test(w.text)) {
                const r = await convertWithTimeout(kuro, w.text);
                if (r) {
                  wordCache.set(w.text, r);
                  return { ...w, roman: r };
                }
              }
              const fallback = toRomaji(w.text);
              wordCache.set(w.text, fallback);
              return { ...w, roman: fallback };
            }
            if (lang === 'ko') {
              return { ...w, roman: romanizeKo(w.text) };
            }
            if (lang === 'zh') {
              if (!pinyin) return w;
              const r = pinyin(w.text, { toneType: 'none' });
              const roman = Array.isArray(r) ? r.join(' ') : r;
              return { ...w, roman };
            }
            return w;
          } catch {
            return w;
          }
        }),
      );
      return { ...line, words };
    }),
  );
}

export async function ensureRomanization(lines: LyricLine[]): Promise<LyricLine[]> {
  try {
    if (lines.every((l) => l.words.every((w) => !!w.roman))) return lines;
    const hasJa = lines.some((l) => KANA_RE.test(l.text));
    const needsKuro = lines.some(
      (l) => langOfText(l.text, hasJa) === 'ja' && l.words.some((w) => !w.roman && KANJI_RE.test(w.text)),
    );
    const budget = needsKuro ? 4000 : 500;
    const work = romanizeLines(lines);
    const timeout = new Promise<LyricLine[]>((resolve) => {
      setTimeout(() => resolve(lines), budget);
    });
    return await Promise.race([work, timeout]);
  } catch {
    return lines;
  }
}
