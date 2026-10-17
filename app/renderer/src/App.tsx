import { useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import SearchScreen from './screens/search/SearchScreen';
import LibraryScreen from './screens/library/LibraryScreen';
import PlayerScreen from './screens/player/PlayerScreen';
import LyricsScreen from './screens/lyrics/LyricsScreen';
import SettingsScreen from './screens/settings/SettingsScreen';
import { useSession } from './state/session';

/**
 * ArchiveTune Desktop shell. Session owns the ONE shared player store;
 * Search -> Player -> Lyrics play together through it:
 * - SearchScreen onPlay -> session.playVideo (enqueue + lyrics track)
 * - PlayerScreen store={session.store}
 * - LyricsScreen {...session.lyricsProps} (track + loader + transport)
 */

const TABS = ['Home', 'Search', 'Library', 'Player', 'Lyrics', 'Settings'] as const;
type Tab = (typeof TABS)[number];

const NAV_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 12,
  flex: 'none',
};

function navButton(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(255,255,255,.12)' : 'transparent',
    color: '#fff',
    border: 0,
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    textAlign: 'left',
  };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Home');
  const session = useSession();
  return (
    <div style={{ background: '#0a0a0c', color: '#fff', height: '100dvh', display: 'flex' }}>
      <nav style={NAV_STYLE} aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={navButton(tab === t)}>
            {t}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'Home' && <HomeScreen onPlay={session.playVideo} />}
        {tab === 'Search' && <SearchScreen onPlay={session.playVideo} />}
        {tab === 'Library' && <LibraryScreen onPlay={session.playVideo} />}
        {tab === 'Player' && <PlayerScreen store={session.store} />}
        {tab === 'Lyrics' && <LyricsScreen {...session.lyricsProps} />}
        {tab === 'Settings' && (
          <SettingsScreen
            store={session.store}
            provider={session.lyricsProps.provider}
            onProviderChange={session.lyricsProps.onProviderChange}
          />
        )}
      </main>
    </div>
  );
}
