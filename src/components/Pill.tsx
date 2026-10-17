import type { ReactNode } from 'react';

export type PillProps = {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
};

/** 36px tall pill toggle. Visual only — state and handlers are passthrough. */
export default function Pill({ active = false, onClick, icon, children }: PillProps) {
  return (
    <button
      type="button"
      className={active ? 'mp-pill mp-pill--active' : 'mp-pill'}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon ? <span className="mp-pill__icon" aria-hidden="true">{icon}</span> : null}
      <span className="mp-pill__label">{children}</span>
    </button>
  );
}
