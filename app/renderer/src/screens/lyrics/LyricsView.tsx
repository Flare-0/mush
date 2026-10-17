import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate } from './animate';
import type { InstrumentalGap, LyricLine } from './engine/types';
import './LyricsView.css';

interface LyricsViewProps {
  lines: LyricLine[];
  currentTime: number;
  showRoman: boolean;
  showTranslation: boolean;
  onSeek: (sec: number) => void;
  disabled?: boolean;
  /** Pauses/resumes the off-main-thread wipe animations. Defaults to true. */
  playing?: boolean;
  /**
   * Lookahead added to the clock before line lookup (ArchiveTune-style:
   * ~0 for word-synced, ~0.3 for line-synced so the eye lands early).
   */
  leadSec?: number;
}

type Row =
  | { kind: 'line'; key: string; lineIndex: number; start: number }
  | (InstrumentalGap & { kind: 'gap' });

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Last row with start <= t, or -1 if none. Sequential fast-path via hint, binary search otherwise. */
function findRowIndex(rows: Row[], t: number, hint: number): number {
  const len = rows.length;
  if (len === 0) return -1;
  if (hint >= 0 && hint < len) {
    if (rows[hint].start <= t) {
      let h = hint;
      while (h + 1 < len && rows[h + 1].start <= t) h++;
      return h;
    }
    if (hint > 0) {
      let h = hint;
      while (h - 1 >= 0 && rows[h].start > t) h--;
      return rows[h].start <= t ? h : -1;
    }
    return -1;
  }
  let lo = 0;
  let hi = len - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Fraction of the container height the active group sits from the top. */
const ACTIVE_OFFSET_RATIO = 0.5;
/** User scroll pauses auto-scroll for this long. */
const AUTOSCROLL_PAUSE_MS = 3000;
/** Window in which scroll events from a programmatic scrollTo are ignored. */
const AUTO_SCROLL_GRACE_MS = 500;

/** Highlight leads the audio so the eye lands before the syllable. */
const LEAD_SEC = 0.12;

/** A row jump bigger than this snaps instead of tweening (seeks). */
const FAR_JUMP_ROWS = 8;

/** Silence of at least this long synthesizes an instrumental gap row. */
const GAP_MIN_SEC = 7.0;
/** Gap opens this far after the previous line ends (hands the tail to the line). */
const GAP_START_PAD = 0.31;
/** Gap closes this far before the next line starts (hands the attack to the line). */
const GAP_END_LEAD = 0.8;
/** Delay before a deactivated gap collapses, letting its hide animation play. */
const GAP_CLOSE_DELAY_MS = 850;
/** Dots per gap row. */
const GAP_DOTS = 3;

function buildRows(lines: LyricLine[]): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.start >= GAP_MIN_SEC) {
      const end = line.start - GAP_END_LEAD;
      if (end > 0) rows.push({ kind: 'gap', key: 'gap-lead', start: 0, end });
    }
    rows.push({ kind: 'line', key: `line-${i}`, lineIndex: i, start: line.start });
    const next = lines[i + 1];
    if (next && next.start - line.end >= GAP_MIN_SEC) {
      const gs = line.end + GAP_START_PAD;
      const ge = next.start - GAP_END_LEAD;
      if (ge > gs) rows.push({ kind: 'gap', key: `gap-${i}`, start: gs, end: ge });
    }
    // No gap after the last line: trailing silence never synthesizes a row.
  }
  return rows;
}

function setWordState(el: HTMLSpanElement, state: 'past' | 'future' | 'live'): void {
  el.classList.remove('is-live', 'is-sung', 'is-past-word', 'is-future-word');
  if (state === 'live') {
    el.classList.add('is-live');
    el.classList.add('is-sung');
  } else if (state === 'past') {
    el.classList.add('is-past-word');
  } else {
    el.classList.add('is-future-word');
  }
}

function clearWordState(el: HTMLSpanElement): void {
  el.classList.remove('is-live', 'is-sung', 'is-past-word', 'is-future-word');
}

interface RowListProps {
  rows: Row[];
  lines: LyricLine[];
  activeRow: number;
  showRoman: boolean;
  showTranslation: boolean;
  disabled: boolean;
  onSelect: (sec: number) => void;
  registerGroup: (key: string) => (el: HTMLDivElement | null) => void;
  registerWord: (rowKey: string, wi: number) => (el: HTMLSpanElement | null) => void;
  registerGapFill: (gapKey: string, di: number) => (el: HTMLSpanElement | null) => void;
}

const dotIndices = Array.from({ length: GAP_DOTS }, (_, d) => d);

const RowList = memo(function RowList({
  rows,
  lines,
  activeRow,
  showRoman,
  showTranslation,
  disabled,
  onSelect,
  registerGroup,
  registerWord,
  registerGapFill,
}: RowListProps) {
  return (
    <>
      {rows.map((row, ri) => {
        if (row.kind === 'gap') {
          // Open/active classes are owned by the rAF loop via DOM (never re-rendered here).
          return (
            <div key={row.key} ref={registerGroup(row.key)} className="lv-gap" aria-hidden="true">
              <div className="lv-gap-inner">
                {dotIndices.map((d) => (
                  <span key={d} className="lv-gap-dot">
                    •
                    <span ref={registerGapFill(row.key, d)} className="lv-gap-fill" />
                  </span>
                ))}
              </div>
            </div>
          );
        }
        const line = lines[row.lineIndex];
        if (!line) return null;
        const dist = ri - activeRow;
        const isActive = dist === 0;
        const isNext = dist === 1;
        const isPast = dist < 0;
        const isFar = activeRow >= 0 && Math.abs(dist) >= 2;
        const tier = dist === 0 ? '' : dist < 0 ? `is-d${Math.min(-dist, 4)}` : `is-b${Math.min(dist, 4)}`;
        const className = [
          'lv-group',
          isActive ? 'is-active' : '',
          isNext ? 'is-next' : '',
          isPast ? 'is-past' : '',
          isFar ? 'is-far' : '',
          tier,
        ]
          .filter(Boolean)
          .join(' ');
        const seek = disabled ? undefined : () => onSelect(line.start + 0.01);
        return (
          <div
            key={row.key}
            ref={registerGroup(row.key)}
            role="button"
            tabIndex={disabled ? -1 : 0}
            data-dist={dist}
            aria-current={isActive ? 'true' : undefined}
            aria-disabled={disabled || undefined}
            aria-label={line.text}
            className={className}
            onClick={seek}
            onKeyDown={
              seek
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      seek();
                    }
                  }
                : undefined
            }
          >
            <div className="lv-words">
              {line.words.map((w, wi) => (
                <span key={wi} className="lv-word-wrap">
                  <span ref={registerWord(row.key, wi)} className="lv-word">
                    <span className="lv-word-base" aria-hidden="false">
                      {Array.from(w.text).map((ch, ci) => (
                        <span key={ci} className="lv-letter">
                          {ch === ' ' ? String.fromCharCode(160) : ch}
                        </span>
                      ))}
                    </span>
                    <span className="lv-word-lit" aria-hidden="true">
                      {Array.from(w.text).map((ch, ci) => (
                        <span key={ci} className="lv-letter">
                          {ch === ' ' ? String.fromCharCode(160) : ch}
                        </span>
                      ))}
                    </span>
                  </span>
                  {showRoman && w.roman ? <span className="lv-roman">{w.roman}</span> : null}
                </span>
              ))}
            </div>
            {showTranslation && line.translation ? (
              <div className="lv-translation">{line.translation}</div>
            ) : null}
          </div>
        );
      })}
    </>
  );
});

/** A seek is any clock jump bigger than this — resync via currentTime. */
const SEEK_JUMP_SEC = 0.6;

/** Catch-up flourish for words that are already sung when their line
    activates (seek landing, late mount): a quick staggered fill instead of
    an instant snap to bright. */
const CATCHUP_MS = 300;
const CATCHUP_STAGGER_MS = 45;

function LyricsView({ lines, currentTime, showRoman, showTranslation, onSeek, disabled = false, playing = true, leadSec = LEAD_SEC }: LyricsViewProps) {
  // Synced during render: the lightweight rAF loop reads these, React never
  // re-renders per frame — it only flips activeRow on line changes.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const leadRef = useRef(leadSec);
  leadRef.current = leadSec;
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;

  const rows = useMemo(() => buildRows(lines), [lines]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [activeRow, setActiveRow] = useState(() => findRowIndex(rows, currentTime + leadSec, 0));
  const activeRowRef = useRef(activeRow);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const groupEls = useRef(new Map<string, HTMLDivElement>());
  const wordEls = useRef(new Map<string, Array<HTMLSpanElement | null>>());
  const gapFills = useRef(new Map<string, Array<HTMLSpanElement | null>>());
  const groupCbCache = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const wordCbCache = useRef(new Map<string, (el: HTMLSpanElement | null) => void>());
  const gapCbCache = useRef(new Map<string, (el: HTMLSpanElement | null) => void>());
  const openGaps = useRef(new Set<string>());
  const gapTimers = useRef(new Map<string, number>());
  /** Live WAAPI animations per row key — the wipe interpolates on the
      compositor; JS only creates them on line change and resyncs on
      seek / play-state flips. */
  const rowAnims = useRef(new Map<string, Animation[]>());
  const hintRef = useRef(activeRow);
  const lastTRef = useRef(currentTime + LEAD_SEC);
  const pausedUntil = useRef(0);
  const autoScrolling = useRef(false);
  const graceTimer = useRef<number | null>(null);
  const userScrollTimer = useRef<number | null>(null);
  const scrollControls = useRef<{ stop: () => void } | null>(null);

  const cancelRowAnims = useCallback((rowKey: string): void => {
    const anims = rowAnims.current.get(rowKey);
    if (anims) {
      for (const a of anims) {
        try {
          a.cancel();
        } catch {
          // already finished — ignore
        }
      }
      rowAnims.current.delete(rowKey);
    }
  }, []);

  const cancelAllAnims = useCallback((): void => {
    for (const key of Array.from(rowAnims.current.keys())) cancelRowAnims(key);
  }, [cancelRowAnims]);

  // Reset caches/timers/animations when the song (rows) changes; ref callbacks self-clean maps on unmount.
  useEffect(() => {
    groupCbCache.current.clear();
    wordCbCache.current.clear();
    gapCbCache.current.clear();
    for (const t of gapTimers.current.values()) window.clearTimeout(t);
    gapTimers.current.clear();
    openGaps.current.clear();
    cancelAllAnims();
    for (const arr of wordEls.current.values()) for (const el of arr) if (el) clearWordState(el);
    const idx = findRowIndex(rows, timeRef.current + leadRef.current, 0);
    hintRef.current = idx;
    lastTRef.current = timeRef.current + leadRef.current;
    activeRowRef.current = idx;
    setActiveRow(idx);
  }, [rows, cancelAllAnims]);

  useEffect(() => {
    return () => {
      if (graceTimer.current !== null) window.clearTimeout(graceTimer.current);
      if (userScrollTimer.current !== null) window.clearTimeout(userScrollTimer.current);
      scrollControls.current?.stop();
    };
  }, []);

  // Wipe engine: one WAAPI animation per live word on the --p custom
  // property. The browser interpolates --p off the main thread at display
  // refresh rate; JS only (re)creates animations on line change and resyncs
  // via animation.currentTime on seeks, plus pause()/play() on play-state.
  // At rest (past/future words) there is no animation and no paint cost.
  useEffect(() => {
    let raf = 0;

    const cancelGapTimer = (key: string): void => {
      const t = gapTimers.current.get(key);
      if (t !== undefined) {
        window.clearTimeout(t);
        gapTimers.current.delete(key);
      }
    };

    const openGap = (key: string): void => {
      cancelGapTimer(key);
      if (openGaps.current.has(key)) return;
      const el = groupEls.current.get(key);
      if (!el) return;
      el.classList.remove('is-leaving');
      el.classList.add('is-open');
      openGaps.current.add(key);
    };

    const scheduleGapClose = (key: string): void => {
      if (!openGaps.current.has(key) || gapTimers.current.has(key)) return;
      const el = groupEls.current.get(key);
      if (el) {
        el.classList.remove('is-active');
        el.classList.add('is-leaving');
      }
      gapTimers.current.set(
        key,
        window.setTimeout(() => {
          gapTimers.current.delete(key);
          const node = groupEls.current.get(key);
          if (node) node.classList.remove('is-open', 'is-leaving', 'is-active');
          openGaps.current.delete(key);
        }, GAP_CLOSE_DELAY_MS),
      );
    };

    /** (Re)create the wipe animations for a line, anchored at clock t. */
    const syncLine = (key: string, lineIndex: number, t: number): void => {
      cancelRowAnims(key);
      const line = linesRef.current[lineIndex];
      const els = wordEls.current.get(key);
      if (!line || !els) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const anims: Animation[] = [];
      for (let i = 0; i < line.words.length; i++) {
        const w = line.words[i];
        const el = els[i];
        if (!w || !el) continue;
        const lit = el.querySelector(':scope > .lv-word-lit') as HTMLSpanElement | null;
        if (w.end <= t) {
          if (reduceMotion || !lit) {
            setWordState(el, 'past');
            continue;
          }
          // Already sung, but never snap: quick staggered catch-up fill so
          // the word still arrives via animation (seek landings, late mount).
          setWordState(el, 'live');
          try {
            const c = lit.animate([{ '--p': '0' }, { '--p': '1' }] as unknown as Keyframe[], {
              duration: CATCHUP_MS,
              delay: i * CATCHUP_STAGGER_MS,
              fill: 'both',
              easing: 'ease-out',
            });
            if (!playingRef.current) c.pause();
            anims.push(c);
            const letters = lit.querySelectorAll('.lv-letter');
            const n = letters.length;
            const seg = n > 0 ? CATCHUP_MS / n : CATCHUP_MS;
            for (let li = 0; li < n; li++) {
              const lel = letters[li] as HTMLSpanElement;
              try {
                const r = lel.animate(
                  [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.28)', offset: 0.5 },
                    { transform: 'scale(1)' },
                  ] as unknown as Keyframe[],
                  {
                    duration: Math.max(seg * 2.5, 60),
                    delay: i * CATCHUP_STAGGER_MS + seg * li,
                    fill: 'both',
                    easing: 'linear',
                  },
                );
                if (!playingRef.current) r.pause();
                anims.push(r);
              } catch {
                // wipe carries the word on its own
              }
            }
          } catch {
            setWordState(el, 'past');
          }
          continue;
        }
        if (reduceMotion) {
          setWordState(el, w.start <= t ? 'past' : 'future');
          continue;
        }
        setWordState(el, 'live');
        // Two-layer wipe: the bright overlay is revealed left-to-right by
        // an animated gradient mask (--p, soft 32px edge, ArchiveTune's
        // DstIn recipe). The mask applies to the element's composited
        // output, so transformed letter children can't break it.
        // Same timeline as the ripple.
        if (!lit) {
          setWordState(el, 'future');
          continue;
        }
        const dur = Math.max((w.end - w.start) * 1000, 1);
        const delay = (w.start - t) * 1000;
        try {
          const a = (lit as HTMLSpanElement).animate(
            [{ '--p': '0' }, { '--p': '1' }] as unknown as Keyframe[],
            {
              duration: dur,
              delay,
              fill: 'both',
              easing: 'linear',
            },
          );
          if (!playingRef.current) a.pause();
          anims.push(a);
          // Letter-by-letter emphasis ripple: the wave travels through the
          // sung word's overlay letters on the wipe's exact timeline — each
          // letter swells and settles in turn instead of the whole word popping.
          const letters = (lit as HTMLSpanElement).querySelectorAll('.lv-letter');
          const n = letters.length;
          if (n > 0) {
            const seg = dur / n;
            for (let li = 0; li < n; li++) {
              const lel = letters[li] as HTMLSpanElement;
              try {
                const r = lel.animate(
                  [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.28)', offset: 0.5 },
                    { transform: 'scale(1)' },
                  ] as unknown as Keyframe[],
                  {
                    duration: Math.max(seg * 2.5, 60),
                    delay: delay + seg * li,
                    fill: 'both',
                    easing: 'linear',
                  },
                );
                if (!playingRef.current) r.pause();
                anims.push(r);
              } catch {
                // wipe carries the word on its own
              }
            }
          }
        } catch {
          setWordState(el, 'future');
        }
      }
      if (anims.length > 0) rowAnims.current.set(key, anims);
    };

    /** (Re)create the dot-fill animations for a gap, anchored at clock t. */
    const syncGap = (key: string, start: number, end: number, t: number): void => {
      cancelRowAnims(key);
      const fills = gapFills.current.get(key);
      if (!fills) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        const p = clamp01((t - start) / Math.max(end - start, 1e-6));
        fills.forEach((f, i) => {
          if (f) f.style.opacity = clamp01(p * GAP_DOTS - i).toFixed(3);
        });
        return;
      }
      const anims: Animation[] = [];
      const seg = Math.max(end - start, 1e-6) / GAP_DOTS;
      for (let i = 0; i < GAP_DOTS; i++) {
        const f = fills[i];
        if (!f) continue;
        try {
          const a = f.animate([{ opacity: '0' }, { opacity: '1' }] as unknown as Keyframe[], {
            duration: Math.max(seg * 1000, 1),
            delay: (start + seg * i - t) * 1000,
            fill: 'both',
            easing: 'linear',
          });
          if (!playingRef.current) a.pause();
          anims.push(a);
        } catch {
          // static fallback below
        }
      }
      if (anims.length > 0) rowAnims.current.set(key, anims);
    };

    /** Seek resync: shift every live animation's clock, no recreation. */
    const resyncRowClock = (rowKey: string, t: number): void => {
      const anims = rowAnims.current.get(rowKey);
      if (!anims || anims.length === 0) {
        const row = rowsRef.current[activeRowRef.current];
        if (row?.key === rowKey) {
          if (row.kind === 'gap') syncGap(row.key, row.start, row.end, t);
          else syncLine(row.key, row.lineIndex, t);
        }
        return;
      }
      // Word wipes are per-word timelines; the cheapest exact resync is a
      // rebuild anchored at t (line changes are rare — only on seeks).
      const row = rowsRef.current[activeRowRef.current];
      if (row?.key === rowKey) {
        if (row.kind === 'gap') syncGap(row.key, row.start, row.end, t);
        else syncLine(row.key, row.lineIndex, t);
      }
    };

    /** Line flip without a snap: freeze the wipe masks in place, fade the
        live overlays out together, then reset. A re-sync arriving mid-fade
        cancels everything via rowAnims and rebuilds. */
    const fadeTeardownRow = (rowKey: string): void => {
      const live = rowAnims.current.get(rowKey) ?? [];
      const els = wordEls.current.get(rowKey);
      if (!els) {
        cancelRowAnims(rowKey);
        return;
      }
      const lits: HTMLSpanElement[] = [];
      for (const el of els) {
        if (!el || !el.classList.contains('is-live')) continue;
        const lit = el.querySelector(':scope > .lv-word-lit') as HTMLSpanElement | null;
        if (lit) lits.push(lit);
      }
      if (live.length === 0 || lits.length === 0) {
        for (const el of els) if (el) clearWordState(el);
        return;
      }
      // Pause (never cancel): the frozen mask keeps the exact mid-wipe
      // frame visible while opacity fades it out.
      for (const a of live) {
        try {
          a.pause();
        } catch {
          // finished animations hold their end frame — ignore
        }
      }
      const done = (): void => {
        cancelRowAnims(rowKey);
        for (const el of els) if (el) clearWordState(el);
      };
      try {
        const fades = lits.map((lit) =>
          lit.animate([{ opacity: '1' }, { opacity: '0' }], {
            duration: 250,
            easing: 'ease-out',
            fill: 'both',
          }),
        );
        // Re-sync cancels via rowAnims; finished rejections are swallowed.
        rowAnims.current.set(rowKey, [...live, ...fades]);
        fades[0].finished.then(done).catch(() => {});
      } catch {
        done();
      }
    };

    // Dead-reckoning clock, ArchiveTune LyricsEnhanced-style: the polled
    // player clock only arrives ~15fps, so extrapolate locally every frame
    // while playing, then ease toward the poll (snap past 250ms drift,
    // otherwise 8% correction capped at 2ms/frame). Row flips and wipe
    // anchors use this smooth time — no 66ms stair-stepping.
    const smoothRef = { current: timeRef.current + leadRef.current };
    let lastFrameMs = 0;

    // Lightweight detection loop: active-row flips only (React re-renders on
    // those). Seeks are detected as clock jumps and resynced via currentTime.
    // No DOM writes per frame — the wipe lives on the compositor.
    const tick = (nowMs: number): void => {
    // Mount: the initial active row never passes through the change branch
    // above, so sync it once here (refs are attached before effects run).
    {
      const all = rowsRef.current;
      const row = activeRowRef.current >= 0 ? all[activeRowRef.current] : undefined;
      const t = timeRef.current + leadRef.current;
      if (row) {
        if (row.kind === 'gap') {
          const el = groupEls.current.get(row.key);
          if (el) {
            openGap(row.key);
            el.classList.add('is-active');
          }
          syncGap(row.key, row.start, row.end, t);
        } else {
          syncLine(row.key, row.lineIndex, t);
        }
      }
    }

    raf = requestAnimationFrame(tick);
      const all = rowsRef.current;
      if (all.length === 0) return;
      const raw = timeRef.current + leadRef.current;
      if (lastFrameMs === 0) {
        lastFrameMs = nowMs;
        smoothRef.current = raw;
      }
      const dtSec = Math.min(Math.max((nowMs - lastFrameMs) / 1000, 0), 0.25);
      lastFrameMs = nowMs;
      if (playingRef.current) smoothRef.current += dtSec;
      const drift = raw - smoothRef.current;
      if (Math.abs(drift) > 0.25) smoothRef.current = raw;
      else smoothRef.current += Math.max(-0.002, Math.min(0.002, drift * 0.08));
      const t = smoothRef.current;
      if (Math.abs(t - lastTRef.current) > SEEK_JUMP_SEC) {
        const cur = all[activeRowRef.current];
        if (cur) resyncRowClock(cur.key, t);
      }
      lastTRef.current = t;
      const idx = findRowIndex(all, t, hintRef.current);
      hintRef.current = idx;
      if (idx !== activeRowRef.current) {
        const prev = all[activeRowRef.current];
        if (prev) {
          if (prev.kind === 'gap') scheduleGapClose(prev.key);
          else fadeTeardownRow(prev.key);
        }
        activeRowRef.current = idx;
        setActiveRow(idx);
        if (idx >= 0) {
          const row = all[idx];
          if (row.kind === 'gap') {
            const el = groupEls.current.get(row.key);
            if (el) {
              openGap(row.key);
              el.classList.add('is-active');
            }
            openGaps.current.forEach((k) => {
              if (k !== row.key) scheduleGapClose(k);
            });
            syncGap(row.key, row.start, row.end, t);
          } else {
            openGaps.current.forEach((k) => scheduleGapClose(k));
            syncLine(row.key, row.lineIndex, t);
          }
        }
      } else if (idx >= 0) {
        // Same row: keep gap open-state warm without touching fills.
        const row = all[idx];
        if (row.kind === 'gap') {
          const el = groupEls.current.get(row.key);
          if (el && !openGaps.current.has(row.key)) {
            openGap(row.key);
            el.classList.add('is-active');
            syncGap(row.key, row.start, row.end, t);
          }
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cancelAllAnims();
      for (const t of gapTimers.current.values()) window.clearTimeout(t);
      gapTimers.current.clear();
    };
  }, [cancelAllAnims, cancelRowAnims]);

  // Play / pause: freeze or resume the compositor clock, never rebuild.
  useEffect(() => {
    const row = rowsRef.current[activeRowRef.current];
    if (!row) return;
    const anims = rowAnims.current.get(row.key);
    if (!anims) return;
    for (const a of anims) {
      try {
        if (playing) a.play();
        else a.pause();
      } catch {
        // finished animations ignore play() — harmless
      }
    }
  }, [playing]);

  // Auto-scroll: the active line lives at true center. Motion drives a
  // single cancellable eased tween (stops any in-flight scroll first), so
  // rapid line changes never stack competing smooth-scrolls. Far jumps
  // (seeks) snap directly. If the line already sits comfortably in view,
  // leave it alone — no yanking. User scroll still pauses 3s.
  const lastScrolledRow = useRef(activeRow);
  useEffect(() => {
    if (activeRow < 0) return;
    if (Date.now() < pausedUntil.current) return;
    const row = rows[activeRow];
    if (!row) return;
    const container = containerRef.current;
    const el = groupEls.current.get(row.key);
    if (!container || !el) return;
    const jumpedFar = Math.abs(activeRow - lastScrolledRow.current) > FAR_JUMP_ROWS;
    lastScrolledRow.current = activeRow;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const target = container.scrollTop + (elRect.top - containerRect.top) - container.clientHeight * ACTIVE_OFFSET_RATIO;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Already centered enough: don't touch the scroll.
    const elTop = elRect.top - containerRect.top;
    const viewH = container.clientHeight;
    if (!jumpedFar && elTop > viewH * 0.3 && elTop + elRect.height < viewH * 0.7) return;
    autoScrolling.current = true;
    if (graceTimer.current !== null) window.clearTimeout(graceTimer.current);
    scrollControls.current?.stop();
    scrollControls.current = null;
    if (reduceMotion || jumpedFar || Math.abs(target - container.scrollTop) < 2) {
      container.scrollTop = target;
      autoScrolling.current = false;
    } else {
      const from = container.scrollTop;
      scrollControls.current = animate(from, target, {
        duration: 0.9,
        ease: [0.2, 0.8, 0.2, 1],
        onUpdate: (v) => {
          container.scrollTop = v;
        },
        onComplete: () => {
          autoScrolling.current = false;
        },
        onStop: () => {
          autoScrolling.current = false;
        },
      });
      graceTimer.current = window.setTimeout(() => {
        graceTimer.current = null;
      }, AUTO_SCROLL_GRACE_MS);
    }
  }, [activeRow, rows]);

  const handleScroll = useCallback(() => {
    if (autoScrolling.current) return;
    pausedUntil.current = Date.now() + AUTOSCROLL_PAUSE_MS;
    const c = containerRef.current;
    if (c) c.classList.add('user-scrolling');
    if (userScrollTimer.current !== null) window.clearTimeout(userScrollTimer.current);
    userScrollTimer.current = window.setTimeout(() => {
      userScrollTimer.current = null;
      containerRef.current?.classList.remove('user-scrolling');
    }, AUTOSCROLL_PAUSE_MS);
  }, []);

  const handleSelect = useCallback((sec: number) => {
    seekRef.current(sec);
  }, []);

  const registerGroup = useCallback((key: string) => {
    let cb = groupCbCache.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) groupEls.current.set(key, el);
        else groupEls.current.delete(key);
      };
      groupCbCache.current.set(key, cb);
    }
    return cb;
  }, []);

  const registerWord = useCallback((rowKey: string, wi: number) => {
    const k = `${rowKey}:${wi}`;
    let cb = wordCbCache.current.get(k);
    if (!cb) {
      cb = (el: HTMLSpanElement | null) => {
        let arr = wordEls.current.get(rowKey);
        if (!arr) {
          arr = [];
          wordEls.current.set(rowKey, arr);
        }
        arr[wi] = el;
      };
      wordCbCache.current.set(k, cb);
    }
    return cb;
  }, []);

  const registerGapFill = useCallback((gapKey: string, di: number) => {
    const k = `${gapKey}:${di}`;
    let cb = gapCbCache.current.get(k);
    if (!cb) {
      cb = (el: HTMLSpanElement | null) => {
        let arr = gapFills.current.get(gapKey);
        if (!arr) {
          arr = [];
          gapFills.current.set(gapKey, arr);
        }
        arr[di] = el;
      };
      gapCbCache.current.set(k, cb);
    }
    return cb;
  }, []);

  if (rows.length === 0) {
    return (
      <div ref={containerRef} className="lv-container" aria-busy="true" aria-label="Loading lyrics">
        <div className="lv-skeleton" />
        <div className="lv-skeleton" />
        <div className="lv-skeleton" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="lv-container" onScroll={handleScroll}>
      <RowList
        rows={rows}
        lines={lines}
        activeRow={activeRow}
        showRoman={showRoman}
        showTranslation={showTranslation}
        disabled={disabled}
        onSelect={handleSelect}
        registerGroup={registerGroup}
        registerWord={registerWord}
        registerGapFill={registerGapFill}
      />
    </div>
  );
}

export default memo(LyricsView);
