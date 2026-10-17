import type { LyricLine } from './types';

const cache = new Map<string, string>();
const BATCH_SIZE = 8;
const TIMEOUT_MS = 6000;

function batchOf<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function extractText(data: unknown): string | null {
  try {
    const root = data as Array<{ 0: Array<{ 0: string }> }>;
    const sentences = root?.[0];
    if (!Array.isArray(sentences)) return null;
    const joined = sentences
      .map((s) => (typeof s?.[0] === 'string' ? s[0] : ''))
      .join('');
    return joined || null;
  } catch {
    return null;
  }
}

async function fetchOne(text: string, target: string): Promise<string | null> {
  const key = `${target}:${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}` +
      `&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const out = extractText(data);
    if (out) cache.set(key, out);
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function translateLines(lines: LyricLine[], target = 'en'): Promise<LyricLine[]> {
  try {
    const batches = batchOf(lines, BATCH_SIZE);
    const translated: LyricLine[] = [];
    for (const batch of batches) {
      const results = await Promise.all(batch.map((l) => fetchOne(l.text, target)));
      batch.forEach((line, i) => {
        const t = results[i];
        translated.push(t ? { ...line, translation: t } : line);
      });
    }
    return translated;
  } catch {
    return lines;
  }
}
