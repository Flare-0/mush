import { useEffect, useState } from 'react';
import { LYRICS_PROVIDER_OPTIONS } from '../lyrics/api/providers';
import type { LyricsProviderId } from '../lyrics/api/providers';
import type { PlayerStore, RepeatMode } from '../../state/player';
import './SettingsScreen.css';

export interface SettingsScreenProps {
  /** Shared player store (App passes session.store so toggles go live). */
  store?: PlayerStore;
  /** Controlled lyrics provider (App passes session.lyricsProps.provider). */
  provider?: LyricsProviderId;
  onProviderChange?: (p: LyricsProviderId) => void;
}

const YT_API_KEY = 'yt_api_key';
const LY_PROVIDER_KEY = 'ly_provider';
const MP_SHUFFLE_KEY = 'mp_shuffle';
const MP_REPEAT_KEY = 'mp_repeat';

function isProviderId(v: string | null): v is LyricsProviderId {
  return v === 'auto' || v === 'betterlyrics' || v === 'unison' || v === 'lrc.red' || v === 'lrclib';
}

function readApiKey(): string {
  try {
    return localStorage.getItem(YT_API_KEY) ?? '';
  } catch {
    return '';
  }
}

function readProvider(): LyricsProviderId {
  try {
    const v = localStorage.getItem(LY_PROVIDER_KEY);
    if (v !== null && isProviderId(v)) return v;
  } catch {
    // ignore
  }
  return 'auto';
}

function readShuffle(): boolean {
  try {
    return localStorage.getItem(MP_SHUFFLE_KEY) === '1';
  } catch {
    return false;
  }
}

function readRepeat(): RepeatMode {
  try {
    const v = localStorage.getItem(MP_REPEAT_KEY);
    if (v === 'all' || v === 'one' || v === 'off') return v;
  } catch {
    // ignore
  }
  return 'off';
}

function providerHint(id: LyricsProviderId): string {
  const opt = LYRICS_PROVIDER_OPTIONS.find((o) => o.id === id);
  return opt ? opt.hint : '';
}

/**
 * Settings screen: Appearance (fixed dark theme note), Playback
 * (shuffle/repeat defaults mirroring the player store), Lyrics (provider
 * select reusing LYRICS_PROVIDER_OPTIONS, persisted to ly_provider), Data
 * (YouTube API key persisted to yt_api_key, clear-cache stub).
 * Renders standalone; App wires store + provider for live sync.
 */
export default function SettingsScreen({ store, provider: providerProp, onProviderChange }: SettingsScreenProps) {
  const [apiKey, setApiKey] = useState<string>(() => readApiKey());
  const [showKey, setShowKey] = useState(false);
  const [providerInner, setProviderInner] = useState<LyricsProviderId>(() => readProvider());
  const [shuffleInner, setShuffleInner] = useState<boolean>(() => readShuffle());
  const [repeatInner, setRepeatInner] = useState<RepeatMode>(() => readRepeat());
  const [cacheNote, setCacheNote] = useState<string | null>(null);

  // Persist API key (mirrors web App.tsx: stored locally, never validated here).
  useEffect(() => {
    try {
      localStorage.setItem(YT_API_KEY, apiKey);
    } catch {
      // Storage unavailable — key still works for this session.
    }
  }, [apiKey]);

  // Persist fallback provider only when uncontrolled (controlled path is
  // persisted by state/session).
  useEffect(() => {
    if (providerProp !== undefined) return;
    try {
      localStorage.setItem(LY_PROVIDER_KEY, providerInner);
    } catch {
      // ignore
    }
  }, [providerInner, providerProp]);

  // Persist fallback playback prefs only when no live store is wired.
  useEffect(() => {
    if (store) return;
    try {
      localStorage.setItem(MP_SHUFFLE_KEY, shuffleInner ? '1' : '0');
    } catch {
      // ignore
    }
  }, [shuffleInner, store]);

  useEffect(() => {
    if (store) return;
    try {
      localStorage.setItem(MP_REPEAT_KEY, repeatInner);
    } catch {
      // ignore
    }
  }, [repeatInner, store]);

  const effectiveProvider = providerProp ?? providerInner;
  const effectiveShuffle = store ? store.shuffle : shuffleInner;
  const effectiveRepeat = store ? store.repeat : repeatInner;
  const hasKey = apiKey.trim().length > 0;
  const hasEngine = typeof window !== 'undefined' && typeof window.archivetune?.searchMusic === 'function';

  const handleProvider = (p: LyricsProviderId): void => {
    onProviderChange?.(p);
    if (providerProp === undefined) setProviderInner(p);
  };

  const handleShuffle = (): void => {
    if (store) store.toggleShuffle();
    else setShuffleInner((v) => !v);
  };

  const handleRepeat = (mode: RepeatMode): void => {
    if (store) store.setRepeatMode(mode);
    else setRepeatInner(mode);
  };

  const handleClearCache = (): void => {
    // Stub: downloads/file cache lands with backend-1 (electron/services).
    setCacheNote('Nothing to clear yet — the downloads cache lands with the persistence workstream.');
  };

  return (
    <div className="at-settings" data-testid="settings-screen">
      <header className="at-settings__header">
        <h1 className="at-settings__title">Settings</h1>
        <p className="at-settings__sub">Stored locally in this app (localStorage). No account, no sync.</p>
      </header>

      <section className="at-settings__section" aria-label="Appearance">
        <h2 className="at-settings__section-title">Appearance</h2>
        <p className="at-settings__text">
          Dark theme only (near-black <code>#0a0a0c</code> with glow). Light and pure-black variants from
          the web app are out of scope for this port.
        </p>
        <p className="at-settings__note">Theme follows the app — no switch yet.</p>
      </section>

      <section className="at-settings__section" aria-label="Playback">
        <h2 className="at-settings__section-title">Playback</h2>
        <p className="at-settings__text">
          Defaults for the player queue. {store ? 'Wired to the shared player — changes apply now.' : 'No live player wired — changes apply on next launch.'}
        </p>
        <label className="at-settings__row">
          <input type="checkbox" checked={effectiveShuffle} onChange={handleShuffle} aria-label="Shuffle" />
          <span>
            <span className="at-settings__label">Shuffle</span>
            <span className="at-settings__desc">Random order (persisted as <code>mp_shuffle</code>).</span>
          </span>
        </label>
        <label className="at-settings__row">
          <span className="at-settings__label">Repeat</span>
          <select
            className="at-settings__select"
            value={effectiveRepeat}
            onChange={(e) => handleRepeat(e.target.value as RepeatMode)}
            aria-label="Repeat mode"
          >
            <option value="off">Off — stop at queue end</option>
            <option value="all">All — loop queue</option>
            <option value="one">One — repeat track</option>
          </select>
        </label>
        <p className="at-settings__note">Persisted as <code>mp_repeat</code> (off / all / one).</p>
      </section>

      <section className="at-settings__section" aria-label="Lyrics">
        <h2 className="at-settings__section-title">Lyrics</h2>
        <p className="at-settings__text">Which provider the lyrics loader tries first.</p>
        <label className="at-settings__row">
          <span className="at-settings__label">Provider</span>
          <select
            className="at-settings__select"
            value={effectiveProvider}
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
        <p className="at-settings__note" role="status">
          {providerHint(effectiveProvider)} (persisted as <code>ly_provider</code>).
        </p>
      </section>

      <section className="at-settings__section" aria-label="Data">
        <h2 className="at-settings__section-title">Data</h2>
        {hasEngine ? (
          <p className="at-settings__text">
            Search uses the built-in YouTube Music engine (innertube, same approach as ArchiveTune /
            InnerTune) — no API key required.
          </p>
        ) : (
          <>
            <p className="at-settings__text">
              Browser mode: a YouTube Data API v3 key enables Search. Stored locally only. (The
              desktop app needs no key.)
            </p>
            <label className="at-settings__row" htmlFor="at-settings-api-key">
              <span className="at-settings__label">API key</span>
            </label>
            <div className="at-settings__key-row">
              <input
                id="at-settings-api-key"
                className="at-settings__input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste YouTube Data v3 key…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="at-btn at-btn--ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="at-btn at-btn--ghost"
                onClick={() => setApiKey('')}
                disabled={!hasKey}
                aria-label="Clear API key"
              >
                Clear
              </button>
            </div>
            <p className="at-settings__note" role="status">
              {hasKey ? 'Key saved (localStorage yt_api_key) — search enabled.' : 'No key set — search shows an empty state.'}
            </p>
          </>
        )}
        <div className="at-settings__key-row">
          <button type="button" className="at-btn at-btn--ghost" onClick={handleClearCache}>
            Clear cache
          </button>
        </div>
        {cacheNote ? (
          <p className="at-settings__note" role="status">
            {cacheNote}
          </p>
        ) : null}
      </section>
    </div>
  );
}
