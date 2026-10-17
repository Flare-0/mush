import { CornersOut, Key, List, MagnifyingGlass, MonitorPlay, User, X } from '@phosphor-icons/react';
import IconButton from './IconButton';
import Pill from './Pill';

export type TopBarProps = {
  query: string;
  onQuery: (q: string) => void;
  onSearch: () => void;
  searching: boolean;
  apiKey: string;
  onApiKey: (k: string) => void;
  focusMode: boolean;
  onFocus: () => void;
  onMenu: () => void;
};

/**
 * 72px top bar: menu ghost + wordmark left, absolute-centered search pill,
 * compact API-key field + Focus pill right. Every control is a passthrough
 * to parent handlers — no fetching, state, or logic changes here.
 */
export default function TopBar({
  query,
  onQuery,
  onSearch,
  searching,
  apiKey,
  onApiKey,
  focusMode,
  onFocus,
  onMenu,
}: TopBarProps) {
  return (
    <header className="mp-topbar">
      <div className="mp-topbar__left">
        <IconButton label="Menu" onClick={onMenu} size={24}>
          <List size={24} aria-hidden="true" />
        </IconButton>
        <div className="mp-wordmark" aria-label="mushplayer">
          mushplayer
          <span className="mp-wordmark__dot" aria-hidden="true" />
        </div>
      </div>

      <form
        className="mp-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <MagnifyingGlass size={20} className="mp-search__icon" aria-hidden="true" />
        <input
          className="mp-search__input"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search songs"
          aria-label="Search songs"
        />
        {query ? (
          <IconButton label="Clear search" onClick={() => onQuery('')} size={20}>
            <X size={20} aria-hidden="true" />
          </IconButton>
        ) : null}
        <IconButton label={searching ? 'Searching' : 'Search'} onClick={onSearch} size={20}>
          <MagnifyingGlass size={20} weight="bold" aria-hidden="true" />
        </IconButton>
      </form>

      <div className="mp-topbar__right">
        <label className="mp-key-field">
          <Key size={16} weight="bold" aria-hidden="true" />
          <span className="mp-key-field__caption">API key</span>
          <input
            className="mp-key-field__input"
            type="password"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            placeholder="YT API key"
            aria-label="YouTube Data API key"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Pill active={focusMode} onClick={onFocus} icon={<CornersOut size={20} weight={focusMode ? 'fill' : 'regular'} aria-hidden="true" />}>
          Focus
        </Pill>
        <IconButton label="Cast" size={20}>
          <MonitorPlay size={20} aria-hidden="true" />
        </IconButton>
        <button type="button" className="mp-avatar" aria-label="Account">
          <User size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
