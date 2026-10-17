import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Check,
  DotsThree,
  Link as LinkIcon,
  MusicNotes,
  Pause,
  Play,
  Repeat,
  RepeatOnce,
  Shuffle,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  ThumbsDown,
  ThumbsUp,
  YoutubeLogo,
} from '@phosphor-icons/react';
import IconButton from './IconButton';
import Slider from './Slider';

export type RepeatMode = 'off' | 'all' | 'one';

export type PlayerBarProps = {
  thumbnail: string;
  title: string;
  artist: string;
  album?: string;
  currentTime: number;
  duration: number;
  /** Buffered seconds, when known. Renders a subtle under-fill on the rail. */
  buffered?: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (v: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  shuffle: boolean;
  repeat: RepeatMode;
  onShuffle: () => void;
  onRepeat: () => void;
  /** Current video id: resets the vote and keys the overflow menu links. */
  trackId: string;
  videoId: string;
  /** Real like count from the API, or null when unknown (count hidden). */
  likeCount: number | null;
};

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/**
 * Bottom player bar. The top-edge rail is the ONLY seek control.
 * Space = play/pause is handled by the parent (global key handler);
 * here we only expose labelled, focusable controls via callbacks.
 */
export default function PlayerBar({
  thumbnail,
  title,
  artist,
  album,
  currentTime,
  duration,
  buffered = 0,
  playing,
  volume,
  muted,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onMute,
  shuffle,
  repeat,
  onShuffle,
  onRepeat,
  trackId,
  videoId,
  likeCount,
}: PlayerBarProps) {
  const safeDuration = duration > 0 ? duration : 0;
  const bufferedPct = safeDuration > 0 ? Math.min(100, Math.max(0, (buffered / safeDuration) * 100)) : 0;
  const VolumeIcon = muted || volume === 0 ? SpeakerSlash : volume < 50 ? SpeakerLow : SpeakerHigh;
  const subtitle = album ? `${artist} · ${album}` : artist;
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
  // Shell-only presentational vote state (no rating backend): resets per track.
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    setVote(null);
  }, [trackId]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setCopied(false);
  }, [trackId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const copyLink = (): void => {
    if (!watchUrl) return;
    const done = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    try {
      const result = navigator.clipboard?.writeText(watchUrl);
      if (result && typeof result.then === 'function') result.then(done, () => setCopied(false));
      else done();
    } catch {
      setCopied(false);
    }
  };

  const repeatLabel = repeat === 'one' ? 'Repeat one (on)' : repeat === 'all' ? 'Repeat all (on)' : 'Repeat (off)';

  return (
    <footer className="mp-player">
      <div className="mp-seek">
        <div
          className="mp-seek__buffer"
          aria-hidden="true"
          style={{ '--mp-buffered': `${bufferedPct}%` } as CSSProperties}
        />
        <Slider value={currentTime} max={safeDuration} step={0.1} label="Seek" onChange={onSeek} tone="accent" />
      </div>

      <div className="mp-player__grid">
        <div className="mp-player__left">
          {thumbnail ? (
            <img className="mp-player__thumb" src={thumbnail} alt="" />
          ) : (
            <span className="mp-player__thumb-fallback" aria-hidden="true">
              <MusicNotes size={24} aria-hidden="true" />
            </span>
          )}
          <div className="mp-player__meta">
            <div className="mp-player__title" title={title || 'Nothing playing'}>
              {title || 'Nothing playing'}
            </div>
            {subtitle ? (
              <div className="mp-player__subtitle" title={subtitle}>
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mp-player__center">
          <IconButton
            label={shuffle ? 'Shuffle (on)' : 'Shuffle (off)'}
            size={24}
            active={shuffle}
            onClick={onShuffle}
          >
            <Shuffle size={24} weight={shuffle ? 'fill' : 'regular'} aria-hidden="true" />
          </IconButton>
          <IconButton label="Previous track" onClick={onPrev} size={28}>
            <SkipBack size={28} weight="fill" aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            className="mp-play-btn"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={onPlayPause}
          >
            {playing ? (
              <Pause size={32} weight="fill" aria-hidden="true" />
            ) : (
              <Play size={32} weight="fill" aria-hidden="true" />
            )}
          </button>
          <IconButton label="Next track" onClick={onNext} size={28}>
            <SkipForward size={28} weight="fill" aria-hidden="true" />
          </IconButton>
          <span className="mp-repeat-wrap">
            <IconButton label={repeatLabel} size={24} active={repeat !== 'off'} onClick={onRepeat}>
              {repeat === 'one' ? (
                <RepeatOnce size={24} weight="fill" aria-hidden="true" />
              ) : (
                <Repeat size={24} weight={repeat === 'all' ? 'fill' : 'regular'} aria-hidden="true" />
              )}
            </IconButton>
          </span>
        </div>

        <div className="mp-player__right">
          <span className="mp-time">
            {fmt(currentTime)} / {fmt(safeDuration)}
          </span>
          <span className="mp-like-pill" role="group" aria-label="Rate this track">
            <button
              type="button"
              className={vote === 'up' ? 'mp-like-pill__btn mp-like-pill__btn--active' : 'mp-like-pill__btn'}
              aria-pressed={vote === 'up'}
              aria-label="Like"
              onClick={() => setVote((v) => (v === 'up' ? null : 'up'))}
            >
              <ThumbsUp size={20} weight={vote === 'up' ? 'fill' : 'regular'} aria-hidden="true" />
              {likeCount !== null ? (
                <span className="mp-like-pill__count">{fmtCount(likeCount)}</span>
              ) : null}
            </button>
            <span className="mp-like-pill__divider" aria-hidden="true" />
            <button
              type="button"
              className={vote === 'down' ? 'mp-like-pill__btn mp-like-pill__btn--active' : 'mp-like-pill__btn'}
              aria-pressed={vote === 'down'}
              aria-label="Dislike"
              onClick={() => setVote((v) => (v === 'down' ? null : 'down'))}
            >
              <ThumbsDown size={20} weight={vote === 'down' ? 'fill' : 'regular'} aria-hidden="true" />
            </button>
          </span>
          <span className="mp-volume">
            <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={onMute} size={20}>
              <VolumeIcon size={20} aria-hidden="true" />
            </IconButton>
            <span className="mp-volume__slider">
              <Slider
                value={muted ? 0 : volume}
                max={100}
                step={1}
                label="Volume"
                onChange={onVolume}
                tone="white"
              />
            </span>
          </span>
          <div className="mp-menu-wrap" ref={menuRef}>
            <IconButton
              label="More options"
              size={20}
              active={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <DotsThree size={20} weight="bold" aria-hidden="true" />
            </IconButton>
            {menuOpen ? (
              <div className="mp-menu" role="menu" aria-label="Track options">
                <button
                  type="button"
                  role="menuitem"
                  className="mp-menu__item"
                  disabled={!watchUrl}
                  onClick={copyLink}
                >
                  {copied ? (
                    <Check size={18} weight="bold" aria-hidden="true" />
                  ) : (
                    <LinkIcon size={18} aria-hidden="true" />
                  )}
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="mp-menu__item"
                  disabled={!watchUrl}
                  onClick={() => {
                    if (watchUrl) window.open(watchUrl, '_blank', 'noopener,noreferrer');
                    setMenuOpen(false);
                  }}
                >
                  <YoutubeLogo size={18} aria-hidden="true" />
                  Open in YouTube
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
