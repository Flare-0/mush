import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLineUp, CaretDown, CornersOut, Quotes } from '@phosphor-icons/react';
import AmbientBackground from './components/AmbientBackground';
import LyricsView from './components/LyricsView';
import PanelTabs from './components/PanelTabs';
import PlayerBar from './components/PlayerBar';
import QueueList from './components/QueueList';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { fetchVideoStats, searchYouTube } from './lib/youtube';
import type { VideoItem } from './lib/youtube';
import { fetchLyricsFromProvider } from './lib/lyrics/providers';
import type { LyricsProviderId } from './lib/lyrics/providers';
import type { LyricLine } from './lib/lyrics/types';
import { ensureRomanization } from './lib/romanize';
import { translateLines } from './lib/translate';
import './styles/shell.css';
import './App.css';

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('yt_api_key') ?? '');
  const [query, setQuery] = useState('Ado Odo');
  const [results, setResults] = useState<VideoItem[]>([]);
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [lyricSource, setLyricSource] = useState('none');
  const [lyricType, setLyricType] = useState<'word' | 'line' | 'plain' | ''>('');
  const [lyricLoading, setLyricLoading] = useState(false);
  const [provider, setProvider] = useState<LyricsProviderId>(() => {
    const saved = localStorage.getItem('ly_provider');
    return saved === 'betterlyrics' || saved === 'unison' || saved === 'lrc.red' || saved === 'lrclib'
      ? saved
      : 'auto';
  });
  const [showRoman, setShowRoman] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translated, setTranslated] = useState<LyricLine[] | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [tab, setTab] = useState('lyrics');
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shuffle, setShuffle] = useState(() => localStorage.getItem('mp_shuffle') === '1');
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>(() => {
    const saved = localStorage.getItem('mp_repeat');
    return saved === 'all' || saved === 'one' ? saved : 'off';
  });
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const prevVol = useRef(80);
  const historyRef = useRef<number[]>([]);
  const statsCacheRef = useRef(new Map<string, number | null>());
  const translatedFor = useRef('');
  const panelContentRef = useRef<HTMLDivElement | null>(null);

  const player = useYouTubePlayer({ onEnded: () => onEndedRef.current() });
  const current: VideoItem | null = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  // Fresh mirrors for end-of-track / prev-restart decisions inside callbacks.
  const timeMirror = useRef(0);
  timeMirror.current = player.currentTime;
  const onEndedRef = useRef(() => {});

  const displayLines = useMemo(
    () => (showTranslation && translated ? translated : lines),
    [showTranslation, translated, lines],
  );

  useEffect(() => {
    localStorage.setItem('yt_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('ly_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('mp_shuffle', shuffle ? '1' : '0');
  }, [shuffle]);

  useEffect(() => {
    localStorage.setItem('mp_repeat', repeat);
  }, [repeat]);

  useEffect(() => {
    player.setVolume(muted ? 0 : volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted]);

  // Space = play/pause (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (player.playing) player.pause();
        else player.play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.playing]);

  const doSearch = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Paste your YouTube Data v3 API key first (top-right).');
      return;
    }
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const items = await searchYouTube(apiKey.trim(), query.trim(), 12);
      setResults(items);
      setTab('related');
      if (items.length === 0) setError('No results. Try another query.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [apiKey, query]);

  const playTrack = useCallback((item: VideoItem) => {
    setQueue((q) => {
      const idx = q.findIndex((v) => v.videoId === item.videoId);
      if (idx === -1) {
        setCurrentIndex((prev) => {
          if (prev >= 0) {
            historyRef.current.push(prev);
            if (historyRef.current.length > 100) historyRef.current.shift();
          }
          return q.length;
        });
        return [...q, item];
      }
      setCurrentIndex((prev) => {
        if (prev >= 0 && prev !== idx) {
          historyRef.current.push(prev);
          if (historyRef.current.length > 100) historyRef.current.shift();
        }
        return idx;
      });
      return q;
    });
    setTab('lyrics');
    setFocusMode(false);
  }, []);

  // Load player + fetch lyrics whenever current track changes.
  // Switching provider refetches for the same track via fetchLyricsFromProvider.
  useEffect(() => {
    if (!current) return;
    player.load(current.videoId);
    let cancelled = false;
    setLyricLoading(true);
    setTranslated(null);
    translatedFor.current = '';
    (async () => {
      try {
        let dur = current.duration;
        let likes: number | null = statsCacheRef.current.get(current.videoId) ?? null;
        setLikeCount(likes);
        if ((!dur || likes === null) && apiKey.trim()) {
          try {
            const stats = await fetchVideoStats(apiKey.trim(), current.videoId);
            if (!dur) dur = stats.duration;
            likes = stats.likeCount;
            statsCacheRef.current.set(current.videoId, likes);
            if (cancelled) return;
            setLikeCount(likes);
          } catch {
            dur = dur ?? undefined;
          }
        }
        const res = await fetchLyricsFromProvider(provider, {
          title: current.title,
          artist: current.artist,
          duration: dur,
          videoId: current.videoId,
        });
        if (cancelled) return;
        const withRoman = await ensureRomanization(res.lines);
        if (cancelled) return;
        setLines(withRoman);
        setLyricSource(res.source);
        setLyricType(res.lines.length > 0 ? res.type : '');
      } catch {
        if (!cancelled) {
          setLines([]);
          setLyricSource('none');
          setLyricType('');
        }
      } finally {
        if (!cancelled) setLyricLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.videoId, provider]);

  // Lazy translation when toggled on
  useEffect(() => {
    if (!showTranslation || translated || lines.length === 0 || !current) return;
    const key = current.videoId;
    if (translatedFor.current === key) return;
    translatedFor.current = key;
    translateLines(lines, 'en').then((t) => setTranslated(t));
  }, [showTranslation, translated, lines, current]);

  // Floating panel buttons: DOM-only scroll helpers, no state/logic changes.
  const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const scrollToLive = useCallback(() => {
    const root = panelContentRef.current;
    root?.querySelector('.lv-group.is-active')?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, []);

  const scrollPanelDown = useCallback(() => {
    panelContentRef.current?.scrollBy({ top: 400, behavior: scrollBehavior() });
  }, []);

  const seek = useCallback((sec: number) => player.seekTo(sec), [player]);

  const next = useCallback(() => {
    if (queue.length === 0) return;
    if (currentIndex >= 0) {
      historyRef.current.push(currentIndex);
      if (historyRef.current.length > 100) historyRef.current.shift();
    }
    if (shuffle && queue.length > 1) {
      // Random pick that avoids repeating the same track back-to-back.
      let idx = Math.floor(Math.random() * (queue.length - 1));
      if (idx >= currentIndex) idx += 1;
      setCurrentIndex(idx);
    } else {
      setCurrentIndex((i) => (i + 1) % queue.length);
    }
  }, [queue.length, currentIndex, shuffle]);

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    // Standard transport behavior: restart the song when well into it.
    if (timeMirror.current > 3) {
      player.seekTo(0);
      return;
    }
    const h = historyRef.current.pop();
    if (h !== undefined && h >= 0 && h < queue.length) setCurrentIndex(h);
    else setCurrentIndex((i) => (i - 1 + queue.length) % queue.length);
  }, [queue.length, player]);

  // End of track: repeat-one replays, repeat-off stops at the queue end,
  // otherwise the queue keeps rolling (shuffle stays shuffled).
  const handleTrackEnded = useCallback(() => {
    if (queue.length === 0) return;
    if (repeat === 'one') {
      player.seekTo(0);
      player.play();
      return;
    }
    const atEnd = !shuffle && (currentIndex < 0 || currentIndex >= queue.length - 1);
    if (repeat === 'off' && atEnd) return;
    next();
  }, [queue.length, currentIndex, shuffle, repeat, player, next]);

  useEffect(() => {
    onEndedRef.current = handleTrackEnded;
  });

  const onMute = useCallback(() => {
    if (muted) {
      setMuted(false);
      setVolume(prevVol.current || 80);
    } else {
      prevVol.current = volume;
      setMuted(true);
    }
  }, [muted, volume]);

  const onNavigate = useCallback((id: string) => {
    if (id === 'focus') {
      setFocusMode(true);
      return;
    }
    setFocusMode(false);
    setTab(id);
  }, []);

  return (
    <div className={sidebarOpen ? 'mp-shell mp-shell--nav-open' : 'mp-shell'}>
      <AmbientBackground coverUrl={current?.thumbnail ?? null} playing={player.playing} />
      <div ref={player.playerRefDiv} aria-hidden="true" />

      <div className="mp-shell__sidebar">
        <Sidebar
          open={sidebarOpen}
          active={focusMode ? 'focus' : tab}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mp-shell__topbar">
        <TopBar
          query={query}
          onQuery={setQuery}
          onSearch={() => void doSearch()}
          searching={searching}
          apiKey={apiKey}
          onApiKey={setApiKey}
          focusMode={focusMode}
          onFocus={() => setFocusMode((f) => !f)}
          onMenu={() => setSidebarOpen((o) => !o)}
        />
      </div>

      <main className="mp-shell__main">
        {error && (
          <div className="stage-error" role="alert">
            {error}
          </div>
        )}
        {!focusMode ? (
          <div className="stage">
            <section className="hero" aria-label="Now playing">
              <div className="art-frame">
                {current ? (
                  <img
                    className="art"
                    src={current.thumbnail}
                    alt={`${current.title} cover art`}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="art art--empty">Search and pick a track to start</div>
                )}
                {current && (
                  <div className="art-actions">
                    <button
                      type="button"
                      className="art-expand"
                      aria-label="Show lyrics"
                      onClick={() => {
                        setFocusMode(false);
                        setTab('lyrics');
                      }}
                    >
                      <Quotes size={20} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="art-expand"
                      aria-label="Open focus mode"
                      onClick={() => setFocusMode(true)}
                    >
                      <CornersOut size={20} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="panel" aria-label="Panel">
              <PanelTabs
                tab={tab}
                onTab={setTab}
                showRoman={showRoman}
                showTranslation={showTranslation}
                onToggleRoman={() => setShowRoman((v) => !v)}
                onToggleTranslation={() => setShowTranslation((v) => !v)}
                provider={provider}
                onProvider={setProvider}
                lyricSource={lyricSource}
                syncType={lyricType}
                lyricsLoading={lyricLoading}
              />
              <div className="panel-content" ref={panelContentRef}>
                {tab === 'lyrics' && (
                  <>
                    {!lyricLoading && displayLines.length === 0 && (
                      <p className="panel-note">
                        {lyricSource === 'none'
                          ? `No lyrics from ${provider === 'auto' ? 'any provider (BetterLyrics → Unison → lrc.red → LRCLIB)' : provider} — try another source above.`
                          : `No synced lyrics found yet (via ${lyricSource} · ${lyricType || 'no timing'}).`}
                      </p>
                    )}
                    {(lyricLoading || displayLines.length > 0) && (
                      <LyricsView
                        lines={lyricLoading ? [] : displayLines}
                        currentTime={player.currentTime}
                        showRoman={showRoman}
                        showTranslation={showTranslation}
                        onSeek={seek}
                        playing={player.playing}
                        leadSec={lyricType === 'word' ? 0.02 : 0.3}
                      />
                    )}
                  </>
                )}
                {tab === 'upnext' && (
                  <QueueList
                    items={queue}
                    currentVideoId={current?.videoId ?? null}
                    playing={player.playing}
                    onSelect={setCurrentIndex}
                  />
                )}
                {tab === 'related' && (
                  <>
                    {results.length === 0 ? (
                      <p className="panel-empty">No related results yet — search for a track</p>
                    ) : (
                      <QueueList
                        items={results}
                        currentVideoId={current?.videoId ?? null}
                        playing={player.playing}
                        onSelect={(i) => {
                          const item = results[i];
                          if (item) playTrack(item);
                        }}
                      />
                    )}
                  </>
                )}
                {tab === 'comments' && (
                  <p className="panel-empty">Comments are turned off for this track</p>
                )}
              </div>
              <div className="panel-float">
                <button type="button" className="panel-float-btn" aria-label="Jump to current line" title="Jump to current line" onClick={scrollToLive}>
                  <ArrowLineUp size={20} aria-hidden="true" />
                </button>
                <button type="button" className="panel-float-btn" aria-label="Scroll panel down" title="Scroll panel down" onClick={scrollPanelDown}>
                  <CaretDown size={20} aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="stage stage--focus">
            <section className="hero" aria-label="Now playing">
              <div className="art-frame">
                {current && (
                  <img
                    className="art"
                    src={current.thumbnail}
                    alt={`${current.title} cover art`}
                    crossOrigin="anonymous"
                  />
                )}
              </div>
            </section>
            <section className="panel" aria-label="Lyrics">
              <div className="panel-content">
                <LyricsView
                  lines={displayLines}
                  currentTime={player.currentTime}
                  showRoman={showRoman}
                  showTranslation={showTranslation}
                  onSeek={seek}
                  playing={player.playing}
                  leadSec={lyricType === 'word' ? 0.02 : 0.3}
                />
              </div>
            </section>
          </div>
        )}
      </main>

      <div className="mp-shell__player">
        <PlayerBar
          thumbnail={current?.thumbnail ?? ''}
          title={current?.title ?? 'Nothing playing'}
          artist={current?.artist ?? 'Search above to start'}
          currentTime={player.currentTime}
          duration={player.duration}
          playing={player.playing}
          volume={muted ? 0 : volume}
          muted={muted}
          onPlayPause={() => (player.playing ? player.pause() : player.play())}
          onNext={next}
          onPrev={prev}
          onSeek={seek}
          onVolume={(v) => {
            setMuted(false);
            setVolume(v);
          }}
          onMute={onMute}
          shuffle={shuffle}
          repeat={repeat}
          onShuffle={() => setShuffle((v) => !v)}
          onRepeat={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))}
          trackId={current?.videoId ?? ''}
          videoId={current?.videoId ?? ''}
          likeCount={likeCount}
          buffered={player.buffered > 0 && player.duration > 0 ? player.buffered * player.duration : 0}
        />
      </div>
    </div>
  );
}
