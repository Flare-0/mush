import { useState } from 'react';
import LyricsView from './LyricsView';
import type { LyricLine } from './engine/types';
import { LYRICS_PROVIDER_OPTIONS } from './api/providers';
import type { LyricsProviderId } from './api/providers';
import './LyricsScreen.css';
import './LyricsView.css';

export interface TrackMeta {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  videoId?: string;
}

export type LyricsSyncType = 'word' | 'line' | 'plain' | '';

export interface LyricsLoaderResult {
  lines: LyricLine[];
  source: string;
  type: LyricsSyncType;
  loading: boolean;
}

/**
 * Standalone loader stub. Returns an empty result so the screen renders its
 * empty state on its own; the orchestrator wires real provider fetching
 * (api/providers cascade + engine romanize/translate) in a later pass.
 */
export function useLyricsLoader(_track?: TrackMeta | null): LyricsLoaderResult {
  return { lines: [], source: 'none', type: '', loading: false };
}

export interface LyricsScreenProps {
  lines?: LyricLine[];
  currentTime?: number;
  playing?: boolean;
  showRoman?: boolean;
  showTranslation?: boolean;
  source?: string;
  syncType?: LyricsSyncType;
  loading?: boolean;
  provider?: LyricsProviderId;
  onProviderChange?: (p: LyricsProviderId) => void;
  onSeek?: (sec: number) => void;
  track?: TrackMeta | null;
  /** Lookahead added before line lookup (word-synced ~0, line-synced ~0.3). */
  leadSec?: number;
}

function badgeTitle(loading: boolean, syncType: LyricsSyncType, src: string): string {
  if (loading) return 'Searching lyric providers…';
  if (syncType === 'word') return `Word-synced via ${src} — every word animates on time`;
  if (syncType === 'line') return `Line-synced via ${src} — one wipe per line`;
  if (syncType === 'plain') return `Unsynced text via ${src} — no timings`;
  return 'No lyrics found';
}

function badgeLabel(loading: boolean, syncType: LyricsSyncType, src: string): string {
  if (loading) return 'Searching…';
  if (syncType === 'word') return `Word-synced · ${src}`;
  if (syncType === 'line') return `Line-synced · ${src}`;
  if (syncType === 'plain') return `Unsynced · ${src}`;
  return 'No lyrics';
}

/**
 * Lyrics screen: toolbar (sync badge + Source select + Romaji/English
 * toggles, folded PanelTabs lyrics-row pattern) over the ported LyricsView
 * karaoke engine (dead-reckoning clock, two-layer word wipe, letter ripple,
 * line breath, center-lock scroll, gap rows, reduced-motion).
 * Renders standalone with no props (empty state).
 */
export default function LyricsScreen({
  lines,
  currentTime = 0,
  playing = false,
  showRoman: showRomanProp,
  showTranslation: showTranslationProp,
  source: sourceProp,
  syncType: syncTypeProp,
  loading: loadingProp,
  provider: providerProp,
  onProviderChange,
  onSeek,
  track = null,
  leadSec,
}: LyricsScreenProps) {
  const loader = useLyricsLoader(track);
  const effectiveLines = lines ?? loader.lines;
  const effectiveSource = sourceProp ?? loader.source;
  const effectiveType = syncTypeProp ?? loader.type;
  const effectiveLoading = loadingProp ?? loader.loading;

  const [romanInner, setRomanInner] = useState(false);
  const [translationInner, setTranslationInner] = useState(false);
  const [providerInner, setProviderInner] = useState<LyricsProviderId>('auto');

  const showRoman = showRomanProp ?? romanInner;
  const showTranslation = showTranslationProp ?? translationInner;
  const provider = providerProp ?? providerInner;

  const handleProvider = (p: LyricsProviderId): void => {
    if (onProviderChange) onProviderChange(p);
    if (providerProp === undefined) setProviderInner(p);
  };

  const handleToggleRoman = (): void => {
    if (showRomanProp === undefined) setRomanInner((v) => !v);
  };

  const handleToggleTranslation = (): void => {
    if (showTranslationProp === undefined) setTranslationInner((v) => !v);
  };

  const handleSeek = (sec: number): void => {
    if (onSeek) onSeek(sec);
  };

  const trackLabel =
    track && (track.title || track.artist)
      ? [track.title, track.artist].filter(Boolean).join(' — ')
      : null;

  return (
    <section className="lyrics-screen" aria-label="Lyrics">
      <div className="lyrics-toolbar">
        <span
          className={effectiveType === 'word' ? 'sync-badge is-word' : 'sync-badge'}
          data-sync={effectiveType || 'none'}
          title={badgeTitle(effectiveLoading, effectiveType, effectiveSource)}
        >
          <span className="sync-badge__dot" aria-hidden="true" />
          {badgeLabel(effectiveLoading, effectiveType, effectiveSource)}
        </span>
        <label className="provider-field" title="Choose which lyric provider to fetch from">
          <span className="provider-field__caption">Source</span>
          <select
            className="provider-select"
            value={provider}
            onChange={(e) => handleProvider(e.target.value as LyricsProviderId)}
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
          <span aria-hidden="true">✓</span>
          Original
        </button>
        <button
          type="button"
          className={showRoman ? 'pill is-active' : 'pill'}
          aria-pressed={showRoman}
          onClick={handleToggleRoman}
        >
          {showRoman ? <span aria-hidden="true">✓</span> : null}
          Romaji
        </button>
        <button
          type="button"
          className={showTranslation ? 'pill is-active' : 'pill'}
          aria-pressed={showTranslation}
          onClick={handleToggleTranslation}
        >
          {showTranslation ? <span aria-hidden="true">✓</span> : null}
          English
        </button>
      </div>
      {trackLabel ? <p className="lyrics-track" title={trackLabel}>{trackLabel}</p> : null}
      <div className="lyrics-body">
        {effectiveLines.length === 0 && !effectiveLoading ? (
          <div className="lyrics-empty" role="status">
            <p className="lyrics-empty__title">No lyrics yet</p>
            <p className="lyrics-empty__hint">Play a track or pick a source — synced words will wipe in here.</p>
          </div>
        ) : (
          <LyricsView
            lines={effectiveLines}
            currentTime={currentTime}
            showRoman={showRoman}
            showTranslation={showTranslation}
            onSeek={handleSeek}
            playing={playing}
            leadSec={leadSec}
          />
        )}
      </div>
    </section>
  );
}
