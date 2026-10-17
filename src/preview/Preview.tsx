import { useEffect, useRef, useState } from 'react';
import type { LyricLine, LyricWord } from '../lib/lyrics/types';
import LyricsView from '../components/LyricsView';

function w(text: string, start: number, end: number, roman?: string): LyricWord {
  return roman === undefined ? { text, start, end } : { text, start, end, roman };
}

function line(text: string, words: LyricWord[], end: number): LyricLine {
  return { start: words[0]?.start ?? 0, end, text, words };
}

/** Hand-written Yellow-style fixture: ~0.3s word steps, one >=7s gap, one ja line. */
const LINES: LyricLine[] = [
  line('Look at the stars', [w('Look', 0.5, 0.8), w('at', 0.8, 1.0), w('the', 1.0, 1.2), w('stars', 1.2, 1.7)], 2.0),
  line('Look how they shine for you', [w('Look', 2.4, 2.7), w('how', 2.7, 3.0), w('they', 3.0, 3.3), w('shine', 3.3, 3.7), w('for', 3.7, 3.9), w('you', 3.9, 4.4)], 4.7),
  line('And everything you do', [w('And', 5.1, 5.4), w('everything', 5.4, 5.9), w('you', 5.9, 6.1), w('do', 6.1, 6.6)], 6.9),
  line('Yeah they were all yellow', [w('Yeah', 7.3, 7.7), w('they', 7.7, 7.9), w('were', 7.9, 8.1), w('all', 8.1, 8.4), w('yellow', 8.4, 9.0)], 9.3),
  // 8.2s instrumental gap (9.3 -> 17.5) renders the dot row.
  line('I came along', [w('I', 17.5, 17.7), w('came', 17.7, 18.1), w('along', 18.1, 18.6)], 18.9),
  line('I wrote a song for you', [w('I', 19.3, 19.5), w('wrote', 19.5, 19.9), w('a', 19.9, 20.0), w('song', 20.0, 20.4), w('for', 20.4, 20.6), w('you', 20.6, 21.1)], 21.4),
  line('And all the things you do', [w('And', 21.8, 22.1), w('all', 22.1, 22.4), w('the', 22.4, 22.6), w('things', 22.6, 23.0), w('you', 23.0, 23.2), w('do', 23.2, 23.7)], 24.0),
  line('And it was called yellow', [w('And', 24.4, 24.7), w('it', 24.7, 24.9), w('was', 24.9, 25.2), w('called', 25.2, 25.6), w('yellow', 25.6, 26.2)], 26.5),
  line('黄色に染まる空を見上げて', [w('黄色', 28.0, 28.5, 'kiiro'), w('に', 28.5, 28.7, 'ni'), w('染まる', 28.7, 29.2, 'somaru'), w('空', 29.2, 29.5, 'sora'), w('を', 29.5, 29.6, 'wo'), w('見上げて', 29.6, 30.2, 'miagete')], 30.5),
];

const LOOP = 35;

function startOffset(): number {
  const m = /preview(?:=(\d+(?:\.\d+)?))?/.exec(window.location.search);
  return m?.[1] !== undefined && m[1] !== '' ? Number(m[1]) : 0;
}

/**
 * DEV-ONLY lyric preview (zero prod impact: only mounted when
 * `import.meta.env.DEV && location.search.includes('preview')`).
 * Drives LyricsView with a hand-written fixture on an rAF clock.
 */
export default function Preview() {
  const [initial] = useState(startOffset);
  const [now, setNow] = useState(initial);
  /** Live proof that word-synced lines animate per word (dev-only). */
  const [animInfo, setAnimInfo] = useState('');
  const tRef = useRef(initial);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const probeRef = useRef(0);

  useEffect(() => {
    lastRef.current = performance.now();
    const tick = (t: number): void => {
      const dt = Math.min(0.1, (t - lastRef.current) / 1000);
      lastRef.current = t;
      tRef.current += dt;
      if (tRef.current > LOOP) tRef.current -= LOOP;
      setNow(tRef.current);
      // Throttled self-check: every live word of the active line must own
      // running WAAPI animations (one clip-path wipe + letter ripples).
      if (t - probeRef.current > 500) {
        probeRef.current = t;
        const active = document.querySelector('.lv-group.is-active');
        if (active) {
          const words = active.querySelectorAll('.lv-word');
          let live = 0;
          let wipes = 0;
          words.forEach((w) => {
            const lit = w.querySelector(':scope > .lv-word-lit') as HTMLSpanElement | null;
            const targets: Element[] = lit
              ? [lit, ...Array.from(lit.querySelectorAll('.lv-letter'))]
              : [];
            targets.forEach((el) => {
              const anims = (el as HTMLSpanElement).getAnimations();
              live += anims.length;
              anims.forEach((a) => {
                try {
                  const kf = (a.effect as KeyframeEffect | null)?.getKeyframes() as
                    | Array<Record<string, unknown>>
                    | null;
                  if (kf?.some((k) => k && '--p' in k)) wipes += 1;
                } catch {
                  // unreadable effect — ignore
                }
              });
            });
          });
          setAnimInfo(`${words.length} words / ${wipes} wipe anims / ${live} total anims`);
        } else {
          setAnimInfo('no active line');
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const jump = (t: number): void => {
    tRef.current = t;
    setNow(t);
  };

  return (
    <div style={{ background: '#0a0a0c', color: '#fff', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, alignItems: 'center', fontFamily: 'monospace', fontSize: 13 }}>
        <span data-testid="pv-time">{now.toFixed(2)}s</span>
        <span data-testid="pv-anims" style={{ opacity: 0.7 }}>{animInfo}</span>
        <button type="button" data-testid="pv-jump-wipe" onClick={() => jump(3.5)}>wipe</button>
        <button type="button" data-testid="pv-jump-gap" onClick={() => jump(12.0)}>gap</button>
        <button type="button" data-testid="pv-jump-romaji" onClick={() => jump(29.0)}>romaji</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, maxWidth: 720 }}>
        <LyricsView lines={LINES} currentTime={now} showRoman showTranslation onSeek={jump} leadSec={0.02} />
      </div>
    </div>
  );
}
