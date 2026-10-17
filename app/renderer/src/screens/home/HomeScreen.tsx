import { useMemo } from 'react';
import { useHomeFeed, type FeedVideo } from '../../state/feed';
import { useLibrary, type LibraryVideoInput } from '../../state/library';
import './HomeScreen.css';

export interface HomeScreenProps {
  /** Optional play target (screens-1 wires session.playVideo here via App). */
  onPlay?: (video: LibraryVideoInput) => void;
}

/**
 * Home screen: greeting header, quick-pick grid, section rows.
 * Real library data: quick picks from most-played, keep-listening from
 * last-played, recently-liked row. Greeting stays. Honest empty states
 * when the library is empty (first-run).
 */
export default function HomeScreen({ onPlay }: HomeScreenProps) {
  const { greeting, loading, hasSource } = useHomeFeed();
  const lib = useLibrary();

  const quickPicks = useMemo(
    () =>
      lib.mostPlayed.slice(0, 6).map((p) => ({
        id: p.videoId,
        title: p.video.title,
        subtitle: `${p.video.artist} · ${p.count} ${p.count === 1 ? 'play' : 'plays'}`,
        thumbnail: p.video.thumbnail,
        video: p.video,
      })),
    [lib.mostPlayed],
  );

  const keepListening: FeedVideo[] = useMemo(
    () =>
      lib.history.slice(0, 10).map((p) => ({
        videoId: p.videoId,
        title: p.video.title,
        artist: p.video.artist,
        thumbnail: p.video.thumbnail,
      })),
    [lib.history],
  );

  const recentlyLiked: FeedVideo[] = useMemo(
    () =>
      lib.recentlyLiked.slice(0, 10).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        artist: v.artist,
        thumbnail: v.thumbnail,
      })),
    [lib.recentlyLiked],
  );

  const sections = useMemo(() => {
    const out: { id: string; title: string; items: FeedVideo[] }[] = [];
    if (keepListening.length > 0) {
      out.push({ id: 'keep-listening', title: 'Keep listening', items: keepListening });
    }
    if (recentlyLiked.length > 0) {
      out.push({ id: 'recently-liked', title: 'Recently liked', items: recentlyLiked });
    }
    return out;
  }, [keepListening, recentlyLiked]);

  const videoById = useMemo(() => {
    const byId = new Map<string, LibraryVideoInput>();
    for (const p of lib.history) byId.set(p.videoId, p.video);
    for (const v of lib.recentlyLiked) {
      if (!byId.has(v.videoId)) byId.set(v.videoId, v);
    }
    return byId;
  }, [lib.history, lib.recentlyLiked]);

  const handlePlay = (item: FeedVideo) => {
    const full = videoById.get(item.videoId) ?? {
      videoId: item.videoId,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
    };
    lib.recordPlay(full.videoId, full);
    onPlay?.(full);
  };

  return (
    <div className="at-home" data-testid="home-screen">
      <header className="at-home__header">
        <p className="at-home__eyebrow">ArchiveTune</p>
        <h1 className="at-home__greeting">{greeting}</h1>
        <p className="at-home__sub">
          {hasSource
            ? 'Pick up where you left off.'
            : 'Search is unavailable: no search source. In a browser, add a YouTube API key in Settings.'}
        </p>
      </header>

      <section className="at-home__block" aria-label="Quick picks">
        <h2 className="at-home__title">Quick picks</h2>
        {loading ? (
          <div className="at-home__grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="at-card at-card--skeleton">
                <div className="at-card__thumb" />
                <div className="at-card__lines">
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        ) : quickPicks.length === 0 ? (
          <p className="at-empty">
            Nothing here yet. Your quick picks will appear once you play something.
          </p>
        ) : (
          <div className="at-home__grid">
            {quickPicks.map((q) => (
              <div key={q.id} className="at-card at-card--playable">
                {q.thumbnail ? (
                  <img className="at-card__thumb" src={q.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="at-card__thumb at-card__thumb--fallback" aria-hidden="true" />
                )}
                <div className="at-card__meta">
                  <p className="at-card__name">{q.title}</p>
                  <p className="at-card__sub">{q.subtitle}</p>
                </div>
                <button
                  type="button"
                  className="at-home__play"
                  onClick={() =>
                    handlePlay({
                      videoId: q.video.videoId,
                      title: q.video.title,
                      artist: q.video.artist,
                      thumbnail: q.video.thumbnail,
                    })
                  }
                  aria-label={`Play ${q.title}`}
                >
                  ▶
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? (
        <section className="at-home__block" aria-label="Loading sections">
          {[0, 1].map((r) => (
            <div key={r} className="at-row">
              <div className="at-row__bar" />
              <div className="at-row__strip">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="at-tile at-tile--skeleton" />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : sections.length === 0 ? (
        <section className="at-home__block" aria-label="Sections">
          <h2 className="at-home__title">Made for you</h2>
          <p className="at-empty">No history yet. Play something and it will show up here.</p>
        </section>
      ) : (
        sections.map((s) => (
          <section key={s.id} className="at-home__block" aria-label={s.title}>
            <h2 className="at-home__title">{s.title}</h2>
            <div className="at-row__strip">
              {s.items.map((v) => (
                <div key={v.videoId} className="at-tile at-tile--playable">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" loading="lazy" />
                  ) : null}
                  <p className="at-tile__name">{v.title}</p>
                  <p className="at-tile__sub">{v.artist}</p>
                  <button
                    type="button"
                    className="at-home__play at-home__play--tile"
                    onClick={() => handlePlay(v)}
                    aria-label={`Play ${v.title}`}
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
