/**
 * Minimal `motion`-compatible `animate()` helper for the lyrics auto-scroll
 * tween. The desktop shell has no `motion` dependency by design, so this
 * rAF tween covers the exact call-site used by LyricsView:
 * `animate(from, target, { duration, ease, onUpdate, onComplete, onStop })`.
 * Duration is seconds (motion convention). Ease accepts motion's cubic-bezier
 * array; anything else falls back to easeOutCubic.
 */

interface AnimateOptions {
  duration?: number;
  ease?: number[] | string;
  onUpdate?: (v: number) => void;
  onComplete?: () => void;
  onStop?: () => void;
}

export interface AnimateControls {
  stop: () => void;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // Standard cubic-bezier solver (Newton + bisection fallback).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-4) return sampleY(t);
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-4) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-4) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function animate(from: number, to: number, opts: AnimateOptions = {}): AnimateControls {
  const durationMs = Math.max((opts.duration ?? 0.3) * 1000, 1);
  const easeFn =
    Array.isArray(opts.ease) && opts.ease.length === 4
      ? cubicBezier(opts.ease[0], opts.ease[1], opts.ease[2], opts.ease[3])
      : easeOutCubic;
  const { onUpdate, onComplete, onStop } = opts;
  let raf = 0;
  let stopped = false;
  const start = performance.now();

  const frame = (now: number): void => {
    if (stopped) return;
    const t = Math.min((now - start) / durationMs, 1);
    try {
      onUpdate?.(from + (to - from) * easeFn(t));
    } catch {
      // A throwing onUpdate must not wedge the tween.
    }
    if (t >= 1) {
      try {
        onComplete?.();
      } catch {
        // ignore
      }
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        onStop?.();
      } catch {
        // ignore
      }
    },
  };
}
