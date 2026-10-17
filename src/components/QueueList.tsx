import { memo } from 'react';
import { MusicNotes } from '@phosphor-icons/react';
import './QueueList.css';
import '../styles/panel.css';

export interface QueueItem {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

interface QueueListProps {
  items: QueueItem[];
  currentVideoId: string | null;
  playing: boolean;
  onSelect: (index: number) => void;
}

function fmtDuration(total: number | undefined): string {
  if (total === undefined || !isFinite(total) || total < 0) return '';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function QueueList({ items, currentVideoId, playing, onSelect }: QueueListProps) {
  if (items.length === 0) {
    return <div className="queue-empty">Queue is empty.</div>;
  }

  return (
    <div className="queue-list" role="list" aria-label="Up next">
      {items.map((item, i) => {
        const isCurrent = item.videoId === currentVideoId;
        const duration = fmtDuration(item.duration);
        return (
          <button
            key={item.videoId}
            type="button"
            role="listitem"
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`${item.title} by ${item.artist}`}
            className={isCurrent ? 'queue-row is-current' : 'queue-row'}
            onClick={() => onSelect(i)}
          >
            {item.thumbnail ? (
              <img className="queue-thumb" src={item.thumbnail} alt="" loading="lazy" />
            ) : (
              <span className="queue-thumb queue-thumb-fallback" aria-hidden="true">
                <MusicNotes size={24} />
              </span>
            )}
            <span className="queue-text">
              <span className="queue-title">{item.title}</span>
              <span className="queue-artist">{item.artist}</span>
            </span>
            {isCurrent ? (
              <span className={playing ? 'eq' : 'eq is-paused'} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            {duration ? <span className="queue-duration">{duration}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default memo(QueueList);
