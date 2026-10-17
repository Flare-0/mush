import { useEffect } from 'react';
import { formatTime, usePlayerStore } from '../../state/player';
import type { PlayerStore } from '../../state/player';
import './PlayerScreen.css';

export interface PlayerScreenProps {
  /** Injected store (tests / orchestrator wiring). Defaults to an internal usePlayerStore(). */
  store?: PlayerStore;
}

function repeatLabel(repeat: PlayerStore['repeat']): string {
  if (repeat === 'one') return 'Repeat one (on)';
  if (repeat === 'all') return 'Repeat all (on)';
  return 'Repeat (off)';
}

/**
 * Player view: backdrop art, title/artist, seek rail, transport row
 * (shuffle / prev / play / next / repeat-one), volume, Up-Next queue sheet.
 * Dark style, Poppins + SF Pro stacks. Honest empty states throughout.
 *
 * Pure view — the store is required and owned by the caller, so mounting this
 * never constructs a second player store (audit C3).
 */
export function PlayerScreenView({ store }: { store: PlayerStore }) {
  const s = store;
  const current = s.current;
  const hasTrack = current !== null;
  const durationKnown = s.duration > 0;

  // Space = play/pause (not while typing) — mirrors the web app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  return (
    <section className="at-player" aria-label="Player">
      {/* Backdrop art: blurred cover + scrim (layout refs Android player screen). */}
      <div className="at-player__backdrop" aria-hidden="true">
        {current?.thumbnail ? (
          <img className="at-player__backdrop-img" src={current.thumbnail} alt="" />
        ) : null}
        <div className="at-player__scrim" />
      </div>

      {/* Hidden playback stage: the real engine (hidden IFrame, cf.
          E:/mush/src/hooks/useYouTubePlayer.ts) mounts here later. */}
      <div className="at-player__stage" aria-hidden="true" />

      <div className="at-player__body">
        <div className="at-player__art-frame">
          {current?.thumbnail ? (
            <img
              className="at-player__art"
              src={current.thumbnail}
              alt={`${current.title} cover art`}
            />
          ) : (
            <div className="at-player__art at-player__art--empty">
              <span aria-hidden="true" className="at-player__art-glyph">
                ♪
              </span>
              <span>Nothing playing</span>
            </div>
          )}
        </div>

        <div className="at-player__meta">
          <div className="at-player__title" title={current?.title ?? 'Nothing playing'}>
            {current?.title ?? 'Nothing playing'}
          </div>
          <div className="at-player__artist" title={current?.artist ?? 'Pick a track to start'}>
            {current?.artist ?? 'Pick a track to start'}
          </div>
        </div>

        <div className="at-player__seek-row">
          <span className="at-player__time">{formatTime(s.currentTime)}</span>
          <input
            type="range"
            className="at-player__seek"
            aria-label="Seek"
            min={0}
            max={durationKnown ? s.duration : 0}
            step={0.1}
            value={Math.min(s.currentTime, durationKnown ? s.duration : 0)}
            disabled={!hasTrack || !durationKnown}
            onChange={(e) => s.seek(Number(e.target.value))}
          />
          <span className="at-player__time">{durationKnown ? formatTime(s.duration) : '0:00'}</span>
        </div>
        {!durationKnown && hasTrack ? (
          <p className="at-player__note">Duration unknown for this track — seek unavailable.</p>
        ) : null}

        <div className="at-player__transport" role="group" aria-label="Transport controls">
          <button
            type="button"
            className={s.shuffle ? 'at-tbtn is-active' : 'at-tbtn'}
            aria-pressed={s.shuffle}
            aria-label={s.shuffle ? 'Shuffle (on)' : 'Shuffle (off)'}
            title={s.shuffle ? 'Shuffle (on)' : 'Shuffle (off)'}
            onClick={s.toggleShuffle}
          >
            <span aria-hidden="true">⤨</span>
          </button>
          <button
            type="button"
            className="at-tbtn at-tbtn--large"
            aria-label="Previous track"
            title="Previous track (restarts if past 3s)"
            onClick={s.prev}
            disabled={!hasTrack}
          >
            <span aria-hidden="true">⏮</span>
          </button>
          <button
            type="button"
            className="at-play-btn"
            aria-label={s.playing ? 'Pause' : 'Play'}
            title={s.playing ? 'Pause' : 'Play'}
            onClick={s.togglePlay}
            disabled={!hasTrack}
          >
            <span aria-hidden="true">{s.playing ? '⏸' : '▶'}</span>
          </button>
          <button
            type="button"
            className="at-tbtn at-tbtn--large"
            aria-label="Next track"
            title="Next track"
            onClick={s.next}
            disabled={!hasTrack}
          >
            <span aria-hidden="true">⏭</span>
          </button>
          <button
            type="button"
            className={s.repeat !== 'off' ? 'at-tbtn is-active' : 'at-tbtn'}
            aria-pressed={s.repeat !== 'off'}
            aria-label={repeatLabel(s.repeat)}
            title={repeatLabel(s.repeat)}
            onClick={s.cycleRepeat}
          >
            <span aria-hidden="true">{s.repeat === 'one' ? '🔂' : '🔁'}</span>
          </button>
        </div>

        <div className="at-player__volume">
          <button
            type="button"
            className="at-tbtn"
            aria-label={s.muted || s.volume === 0 ? 'Unmute' : 'Mute'}
            title={s.muted || s.volume === 0 ? 'Unmute' : 'Mute'}
            onClick={s.toggleMute}
          >
            <span aria-hidden="true">{s.muted || s.volume === 0 ? '🔇' : s.volume < 50 ? '🔈' : '🔊'}</span>
          </button>
          <input
            type="range"
            className="at-player__vol-slider"
            aria-label="Volume"
            min={0}
            max={100}
            step={1}
            value={s.volume}
            onChange={(e) => s.setVolume(Number(e.target.value))}
          />
          <span className="at-player__vol-val">{s.volume}</span>
        </div>

        <div className="at-queue-sheet" aria-label="Up next">
          <h2 className="at-queue-sheet__title">Up Next</h2>
          {s.queue.length === 0 ? (
            <p className="at-queue-sheet__empty">
              Queue is empty — search and play something to fill Up Next.
            </p>
          ) : (
            <ol className="at-queue-sheet__list">
              {s.queue.map((item, i) => {
                const isCurrent = i === s.currentIndex;
                return (
                  <li key={item.videoId} className={isCurrent ? 'at-queue-row is-current' : 'at-queue-row'}>
                    <button
                      type="button"
                      className="at-queue-row__btn"
                      aria-current={isCurrent ? 'true' : undefined}
                      aria-label={`${item.title} by ${item.artist}${isCurrent ? ' (now playing)' : ''}`}
                      onClick={() => s.playIndex(i)}
                    >
                      {item.thumbnail ? (
                        <img className="at-queue-row__thumb" src={item.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <span className="at-queue-row__thumb at-queue-row__thumb--fallback" aria-hidden="true">
                          ♪
                        </span>
                      )}
                      <span className="at-queue-row__text">
                        <span className="at-queue-row__title">{item.title}</span>
                        <span className="at-queue-row__artist">{item.artist}</span>
                      </span>
                      {isCurrent ? (
                        <span
                          className={s.playing ? 'at-eq' : 'at-eq is-paused'}
                          aria-hidden="true"
                        >
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

/** Host that owns a store only for direct mounts with no injected store. */
function PlayerScreenWithFallback() {
  const store = usePlayerStore();
  return <PlayerScreenView store={store} />;
}

/**
 * Thin wrapper. App always passes `session.store` (the single shared store),
 * so on the normal path this never calls `usePlayerStore()` and the fallback
 * host below is never mounted.
 */
export default function PlayerScreen({ store }: PlayerScreenProps) {
  if (store) return <PlayerScreenView store={store} />;
  return <PlayerScreenWithFallback />;
}
