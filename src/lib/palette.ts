/* DESIGN.md §12.2 + §5 — cover palette extraction and accent picking.
   Every public function is total: it never throws, falling back to safe
   defaults when the image is missing, tainted (CORS), or degenerate. */

export const ACCENT_FALLBACK = '#FF4D5E';

const FALLBACK_HEX = ['#2a1a3d', '#5b1f3a', '#1b2a5c', '#7a2433', '#12122a'] as const;

export const FALLBACK_PALETTE: Array<[number, number, number]> =
  FALLBACK_HEX.map(hexToRgb01);

/* Cluster sizes from the most recent extractPalette call, aligned with the
   returned palette entries. Lets pickAccent weight by saturation*size in the
   normal extract -> pick flow; ignored when lengths do not match. */
let lastClusterSizes: number[] = [];

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.16, 0.1, 0.24];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function copyPalette(p: Array<[number, number, number]>): Array<[number, number, number]> {
  return p.map((c) => [c[0], c[1], c[2]]);
}

/** RGB (0-1) -> HSL with h in 0-1, s/l in 0-1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const tc = [(h + 1 / 3) % 1, h, (h + 2 / 3) % 1];
  const [r, g, b] = tc.map((t) => {
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  });
  return [r, g, b];
}

interface KMeansResult {
  centroids: Array<[number, number, number]>;
  sizes: number[];
}

/** Deterministic k-means (evenly spaced seed pixels, fixed iterations). */
function kmeans(pixels: Array<[number, number, number]>, k: number, iters: number): KMeansResult {
  const n = pixels.length;
  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < k; i += 1) {
    const src = pixels[Math.floor(((i + 0.5) * n) / k)];
    centroids.push([src[0], src[1], src[2]]);
  }
  const assign = new Array<number>(n).fill(0);
  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < n; i += 1) {
      const p = pixels[i];
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let c = 0; c < k; c += 1) {
        const cc = centroids[c];
        const dr = p[0] - cc[0];
        const dg = p[1] - cc[1];
        const db = p[2] - cc[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sums: Array<[number, number, number]> = [];
    const counts = new Array<number>(k).fill(0);
    for (let c = 0; c < k; c += 1) sums.push([0, 0, 0]);
    for (let i = 0; i < n; i += 1) {
      const c = assign[i];
      const p = pixels[i];
      sums[c][0] += p[0];
      sums[c][1] += p[1];
      sums[c][2] += p[2];
      counts[c] += 1;
    }
    for (let c = 0; c < k; c += 1) {
      if (counts[c] > 0) {
        centroids[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
      }
    }
  }
  const sizes = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i += 1) sizes[assign[i]] += 1;
  return { centroids, sizes };
}

function fallbackCopy(): Array<[number, number, number]> {
  lastClusterSizes = [];
  return copyPalette(FALLBACK_PALETTE);
}

/**
 * Extract 5 palette colors (RGB floats 0-1) from a loaded cover image.
 * 48x48 canvas, k-means k=6 x 8 iters, near-black/white dropped, HSL
 * clamped to s .45-.85 / l .22-.58, sorted by cluster size (strongest
 * repeated if fewer than 5 survive). Never throws.
 */
export function extractPalette(img: HTMLImageElement): Array<[number, number, number]> {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return fallbackCopy();
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackCopy();
    ctx.drawImage(img, 0, 0, 48, 48);
    // Throws on tainted (non-CORS) canvases -> caught below -> fallback.
    const data = ctx.getImageData(0, 0, 48, 48).data;
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      pixels.push([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);
    }
    if (pixels.length === 0) return fallbackCopy();

    const { centroids, sizes } = kmeans(pixels, 6, 8);
    const ranked = centroids
      .map((c, i) => ({ c, size: sizes[i] }))
      .filter(({ c }) => {
        const [, , l] = rgbToHsl(c[0], c[1], c[2]);
        return l >= 0.12 && l <= 0.92;
      })
      .map(({ c, size }) => {
        const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
        return { c: hslToRgb(h, clamp(s, 0.45, 0.85), clamp(l, 0.22, 0.58)), size };
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    if (ranked.length === 0) return fallbackCopy();
    const palette = ranked.map((r) => r.c);
    const outSizes = ranked.map((r) => r.size);
    while (palette.length < 5) {
      palette.push([...palette[0]] as [number, number, number]);
      outSizes.push(outSizes[0]);
    }
    lastClusterSizes = outSizes;
    return palette;
  } catch {
    return fallbackCopy();
  }
}

/**
 * Pick the accent CSS color: highest saturation*size swatch, with lightness
 * clamped to .50-.65 and saturation to .6-.9. Never throws.
 */
export function pickAccent(palette: Array<[number, number, number]>): string {
  try {
    if (palette.length === 0) return ACCENT_FALLBACK;
    const useSizes = lastClusterSizes.length === palette.length;
    const total = useSizes ? lastClusterSizes.reduce((a, b) => a + b, 0) : 0;
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < palette.length; i += 1) {
      const c = palette[i];
      const [, s] = rgbToHsl(c[0], c[1], c[2]);
      const weight = useSizes && total > 0 ? lastClusterSizes[i] / total : 1;
      const score = s * weight;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const [h, s, l] = rgbToHsl(palette[best][0], palette[best][1], palette[best][2]);
    const [r, g, b] = hslToRgb(((h % 1) + 1) % 1, clamp(s, 0.6, 0.9), clamp(l, 0.5, 0.65));
    const R = Math.round(clamp(r, 0, 1) * 255);
    const G = Math.round(clamp(g, 0, 1) * 255);
    const B = Math.round(clamp(b, 0, 1) * 255);
    return `rgb(${R}, ${G}, ${B})`;
  } catch {
    return ACCENT_FALLBACK;
  }
}
