import { ArrowCircleUp, Books, Compass, House } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

export type SidebarProps = {
  open: boolean;
  active: string;
  onNavigate: (id: string) => void;
};

type NavItem = {
  /** Label shown in the rail (reference screenshot vocabulary). */
  label: string;
  /** Existing app feature this entry maps to — no invented pages. */
  target: string;
  icon: Icon;
};

/**
 * 76px icon rail: Home / Explore / Library / Upgrade, top-aligned under
 * the top bar. Each entry maps to an EXISTING app feature (now playing,
 * related results, up next, focus) so every button stays functional.
 * All navigation is passthrough via `onNavigate` — no logic lives here.
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', target: 'lyrics', icon: House },
  { label: 'Explore', target: 'related', icon: Compass },
  { label: 'Library', target: 'upnext', icon: Books },
  { label: 'Upgrade', target: 'focus', icon: ArrowCircleUp },
];

export default function Sidebar({ open, active, onNavigate }: SidebarProps) {
  return (
    <aside className={open ? 'mp-sidebar mp-sidebar--open' : 'mp-sidebar'} aria-label="Primary">
      <nav className="mp-sidebar__nav" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const isActive = item.target === active;
          const ItemIcon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className={isActive ? 'mp-sidebar__item mp-sidebar__item--active' : 'mp-sidebar__item'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.target)}
            >
              <ItemIcon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="mp-sidebar__caption">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
