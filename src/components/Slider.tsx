import type { CSSProperties } from 'react';

export type SliderTone = 'accent' | 'white';

export type SliderProps = {
  value: number;
  max: number;
  step?: number;
  label: string;
  onChange: (v: number) => void;
  /** 'accent' for seek rails, 'white' for volume. */
  tone?: SliderTone;
};

/**
 * Thin accessible range slider. The wrapper provides the 16px hit area;
 * the visible rail is 4px (6px on hover) with the thumb appearing on
 * hover / keyboard focus. Fill is driven by `--mp-fill` (percent).
 */
export default function Slider({ value, max, step = 0.1, label, onChange, tone = 'accent' }: SliderProps) {
  const safeMax = max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const pct = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <span
      className={tone === 'white' ? 'mp-slider mp-slider--white' : 'mp-slider mp-slider--accent'}
      style={{ '--mp-fill': `${pct}%` } as CSSProperties}
    >
      <input
        type="range"
        className="mp-slider__input"
        aria-label={label}
        min={0}
        max={safeMax}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  );
}
