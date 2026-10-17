import type { CSSProperties } from 'react';
import type { ReactNode } from 'react';

export type IconButtonProps = {
  label: string;
  onClick?: () => void;
  active?: boolean;
  /** Glyph size for the wrapped icon (Phosphor scale: 16 / 20 / 24 / 28 / 32). */
  size?: number;
  disabled?: boolean;
  children: ReactNode;
};

/**
 * 40px ghost icon button. Visual only — all behavior comes from props,
 * so parent logic is never changed.
 */
export default function IconButton({
  label,
  onClick,
  active = false,
  size = 20,
  disabled = false,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'mp-icon-btn mp-icon-btn--active' : 'mp-icon-btn'}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{ '--mp-icon-size': `${size}px` } as CSSProperties}
    >
      {children}
    </button>
  );
}
