import { useYouTubeSearch, type FeedVideo } from '../../state/feed';
import { formatTime } from '../../state/player';
import './SearchScreen.css';

export interface SearchPlayTarget {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

interface SearchScreenProps {
  onPlay?: (v: SearchPlayTarget) => void;
}

/** Search screen: search box + results wired to the feed hook. */
export default function SearchScreen({ onPlay }: SearchScreenProps) {
  const { query, setQuery, results, loading, error, hasSource, retry } = useYouTubeSearch();

  const handlePlay = (v: FeedVideo) => {
    onPlay?.({
      videoId: v.videoId,
      title: v.title,
      artist: v.artist,
      thumbnail: v.thumbnail,
      duration: v.duration,
    });
  };

  return (
    <div className="at-search" data-testid="search-screen">
      <header className="at-search__header">
        <h1 className="at-search__title">Search</h1>
        <div className="at-search__box" role="search">
          <span className="at-search__icon" aria-hidden="true">⌕</span>
          <input
            className="at-search__input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Songs, artists, videos…"
            aria-label="Search music"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="at-search__clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </div>
      </header>

      {!hasSource ? (
        <p className="at-empty" role="status">
          Search is unavailable: no search source. The desktop app ships a built-in YouTube Music
          engine; in a plain browser, add a YouTube Data API v3 key in Settings.
        </p>
      ) : loading ? (
        <div className="at-search__list" aria-label="Loading results">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="at-result at-result--skeleton" aria-hidden="true">
              <div className="at-result__thumb" />
              <div className="at-result__lines">
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="at-empty" role="alert">
          <p className="at-empty__text">{error}</p>
          <button type="button" className="at-btn" onClick={retry}>
            Retry
          </button>
        </div>
      ) : query.trim() === '' ? (
        <p className="at-empty" role="status">
          Type to search YouTube Music videos. Results appear here.
        </p>
      ) : results.length === 0 ? (
        <p className="at-empty" role="status">
          No results for “{query.trim()}”. Try a different song or artist.
        </p>
      ) : (
        <ul className="at-search__list">
          {results.map((v) => (
            <li key={v.videoId} className="at-result">
              {v.thumbnail ? (
                <img className="at-result__thumb" src={v.thumbnail} alt="" loading="lazy" />
              ) : (
                <div className="at-result__thumb at-result__thumb--fallback" aria-hidden="true" />
              )}
              <div className="at-result__meta">
                <p className="at-result__name">{v.title}</p>
                <p className="at-result__sub">
                  {v.artist}
                  {v.duration ? ` · ${formatTime(v.duration)}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="at-btn"
                onClick={() => handlePlay(v)}
                aria-label={`Play ${v.title}`}
              >
                Play
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
