import { memo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Translate } from '@phosphor-icons/react';
import { LYRICS_PROVIDER_OPTIONS } from '../lib/lyrics/providers';
import type { LyricsProviderId } from '../lib/lyrics/providers';
import '../styles/panel.css';

interface PanelTabsProps {
  tab: string;
  onTab: (t: string) => void;
  showRoman: boolean;
  showTranslation: boolean;
  onToggleRoman: () => void;
  onToggleTranslation: () => void;
  provider: LyricsProviderId;
  onProvider: (p: LyricsProviderId) => void;
  /** Actual source that served the current lyrics (may differ from provider in Auto). */
  lyricSource: string;
  /** Sync granularity of the current lyrics: word = per-word wipe. */
  syncType: 'word' | 'line' | 'plain' | '';
  lyricsLoading: boolean;
}

const ORDER = ['upnext', 'lyrics', 'comments', 'related'] as const;
const LABELS: Record<string, string> = {
  upnext: 'Up next',
  lyrics: 'Lyrics',
  comments: 'Comments',
  related: 'Related',
};

function PanelTabs({
  tab,
  onTab,
  showRoman,
  showTranslation,
  onToggleRoman,
  onToggleTranslation,
  provider,
  onProvider,
  lyricSource,
  syncType,
  lyricsLoading,
}: PanelTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const setTabRef = (i: number) => (el: HTMLButtonElement | null) => {
    tabRefs.current[i] = el;
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: string) => {
    const idx = ORDER.indexOf(current as (typeof ORDER)[number]);
    if (idx === -1) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % ORDER.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + ORDER.length) % ORDER.length;
    else return;
    e.preventDefault();
    onTab(ORDER[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div className="panel-tabs">
        <div className="panel-tablist" role="tablist" aria-label="Panel">
          {ORDER.map((t, i) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                ref={setTabRef(i)}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? 'panel-tab is-active' : 'panel-tab'}
                onClick={() => onTab(t)}
                onKeyDown={(e) => handleTabKeyDown(e, t)}
              >
                {LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'lyrics' ? (
        <div className="panel-toggles-row">
        <span
          className={syncType === 'word' ? 'sync-badge is-word' : 'sync-badge'}
          data-sync={syncType || 'none'}
          title={
            lyricsLoading
              ? 'Searching lyric providers…'
              : syncType === 'word'
                ? `Word-synced via ${lyricSource} — every word animates on time`
                : syncType === 'line'
                  ? `Line-synced via ${lyricSource} — one wipe per line`
                  : syncType === 'plain'
                    ? `Unsynced text via ${lyricSource} — no timings`
                    : 'No lyrics found'
          }
        >
          <span className="sync-badge__dot" aria-hidden="true" />
          {lyricsLoading
            ? 'Searching…'
            : syncType === 'word'
              ? `Word-synced · ${lyricSource}`
              : syncType === 'line'
                ? `Line-synced · ${lyricSource}`
                : syncType === 'plain'
                  ? `Unsynced · ${lyricSource}`
                  : 'No lyrics'}
        </span>
        <label className="provider-field" title="Choose which lyric provider to fetch from">
          <span className="provider-field__caption">Source</span>
          <select
            className="provider-select"
            value={provider}
            onChange={(e) => onProvider(e.target.value as LyricsProviderId)}
            aria-label="Lyrics provider"
          >
            {LYRICS_PROVIDER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="pill is-active is-locked" disabled aria-disabled="true" title="Original lyrics always on">
          <Check size={16} weight="bold" />
          Original
        </button>
        <button
          type="button"
          className={showRoman ? 'pill is-active' : 'pill'}
          aria-pressed={showRoman}
          onClick={onToggleRoman}
        >
          {showRoman ? <Check size={16} weight="bold" /> : null}
          Romaji
        </button>
        <button
          type="button"
          className={showTranslation ? 'pill is-active' : 'pill'}
          aria-pressed={showTranslation}
          onClick={onToggleTranslation}
        >
          {showTranslation ? <Check size={16} weight="bold" /> : null}
          English
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={showTranslation}
          aria-label="Toggle translation"
          title="Toggle translation"
          onClick={onToggleTranslation}
        >
          <Translate size={20} />
        </button>
      </div>
      ) : null}
    </>
  );
}

export default memo(PanelTabs);
