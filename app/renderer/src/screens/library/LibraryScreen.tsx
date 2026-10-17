import { useMemo, useState } from 'react';
import { useLibrary, type LibraryVideoInput } from '../../state/library';
import './LibraryScreen.css';

const TABS = ['Liked', 'Playlists', 'Artists', 'Albums', 'Songs'] as const;

type LibraryTab = (typeof TABS)[number];

export interface LibraryScreenProps {
  /** Optional play target (screens-1 wires session.playVideo here via App). */
  onPlay?: (video: LibraryVideoInput) => void;
}

const EMPTY_COPY: Record<LibraryTab, string> = {
  Liked: 'No liked songs yet. Like a song and it will show up here.',
  Playlists: 'No playlists yet. Playlists you create will show up here.',
  Artists: 'No artists saved yet. Artists from your library will show up here.',
  Albums: 'No albums saved yet. Albums from your library will show up here.',
  Songs: 'No songs saved yet. Songs you play will show up here.',
};

function formatLastPlayed(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

function Thumb({ video, size }: { video: LibraryVideoInput; size?: number }) {
  if (!video.thumbnail) {
    return (
      <span
        className="at-lib__thumb at-lib__thumb--fallback"
        aria-hidden="true"
        style={size ? { width: size, height: size } : undefined}
      >
        ♪
      </span>
    );
  }
  return (
    <img
      className="at-lib__thumb"
      src={video.thumbnail}
      alt=""
      loading="lazy"
      style={size ? { width: size, height: size } : undefined}
    />
  );
}

/**
 * Library screen: Liked / Playlists / Artists / Albums / Songs wired to the
 * real `useLibrary()` store. Honest empty states remain for truly-empty cases.
 */
export default function LibraryScreen({ onPlay }: LibraryScreenProps) {
  const lib = useLibrary();
  const [tab, setTab] = useState<LibraryTab>('Playlists');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [addPick, setAddPick] = useState<Record<string, string>>({});

  const allKnownVideos = useMemo<LibraryVideoInput[]>(() => {
    const byId = new Map<string, LibraryVideoInput>();
    for (const l of lib.liked) byId.set(l.videoId, l);
    for (const p of lib.plays) {
      if (!byId.has(p.videoId)) byId.set(p.videoId, p.video);
    }
    return [...byId.values()];
  }, [lib.liked, lib.plays]);

  const handlePlay = (video: LibraryVideoInput) => {
    lib.recordPlay(video.videoId, video);
    onPlay?.(video);
  };

  const handleCreate = () => {
    const created = lib.createPlaylist(newPlaylistName);
    if (created) {
      setNewPlaylistName('');
      setExpandedId(created.id);
    }
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameDraft(current);
  };

  const commitRename = () => {
    if (renamingId) lib.renamePlaylist(renamingId, renameDraft);
    setRenamingId(null);
    setRenameDraft('');
  };

  return (
    <div className="at-library" data-testid="library-screen">
      <header className="at-library__header">
        <h1 className="at-library__title">Your Library</h1>
        <p className="at-library__sub">
          {lib.liked.length + lib.plays.length + lib.playlists.length === 0
            ? 'Like songs and build playlists — they live here.'
            : `${lib.liked.length} liked · ${lib.playlists.length} playlists · ${lib.plays.length} played`}
        </p>
      </header>

      <div className="at-library__tabs" role="tablist" aria-label="Library categories">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'at-library__tab at-library__tab--active' : 'at-library__tab'}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === 'Liked' ? (
          lib.liked.length === 0 ? (
            <p className="at-empty" role="status">
              {EMPTY_COPY.Liked}
            </p>
          ) : (
            <ul className="at-lib__list">
              {lib.recentlyLiked.map((v) => (
                <li key={v.videoId} className="at-lib__row">
                  <Thumb video={v} size={48} />
                  <div className="at-lib__meta">
                    <p className="at-lib__name">{v.title}</p>
                    <p className="at-lib__sub">{v.artist}</p>
                  </div>
                  <div className="at-lib__actions">
                    <button
                      type="button"
                      className="at-btn"
                      onClick={() => handlePlay(v)}
                      aria-label={`Play ${v.title}`}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="at-btn at-btn--ghost"
                      onClick={() => lib.toggleLike(v)}
                      aria-label={`Unlike ${v.title}`}
                      title="Unlike"
                    >
                      ♥
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'Playlists' ? (
          <div className="at-lib__playlists">
            <div className="at-lib__create" role="form" aria-label="Create playlist">
              <input
                className="at-lib__input"
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="New playlist name…"
                aria-label="New playlist name"
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
              <button
                type="button"
                className="at-btn"
                onClick={handleCreate}
                disabled={newPlaylistName.trim() === ''}
              >
                Create
              </button>
            </div>

            {lib.playlists.length === 0 ? (
              <p className="at-empty" role="status">
                {EMPTY_COPY.Playlists}
              </p>
            ) : (
              <ul className="at-lib__list">
                {lib.playlists.map((p) => {
                  const expanded = expandedId === p.id;
                  const addable = allKnownVideos.filter(
                    (v) => !p.videos.some((pv) => pv.videoId === v.videoId),
                  );
                  return (
                    <li key={p.id} className="at-lib__card">
                      <div className="at-lib__card-head">
                        {renamingId === p.id ? (
                          <span className="at-lib__rename">
                            <input
                              className="at-lib__input"
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              aria-label="Playlist name"
                              maxLength={80}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                            />
                            <button type="button" className="at-btn" onClick={commitRename}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="at-btn at-btn--ghost"
                              onClick={() => setRenamingId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="at-lib__card-title"
                            onClick={() => setExpandedId(expanded ? null : p.id)}
                            aria-expanded={expanded}
                          >
                            {p.name}
                            <span className="at-lib__count">
                              {p.videos.length} {p.videos.length === 1 ? 'song' : 'songs'}
                            </span>
                          </button>
                        )}
                        <div className="at-lib__actions">
                          {renamingId !== p.id ? (
                            <button
                              type="button"
                              className="at-btn at-btn--ghost"
                              onClick={() => startRename(p.id, p.name)}
                              aria-label={`Rename ${p.name}`}
                            >
                              Rename
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="at-btn at-btn--ghost at-btn--danger"
                            onClick={() => lib.deletePlaylist(p.id)}
                            aria-label={`Delete ${p.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="at-lib__card-body">
                          {p.videos.length === 0 ? (
                            <p className="at-lib__hint">
                              Empty playlist — add songs from your liked songs or history below.
                            </p>
                          ) : (
                            <ul className="at-lib__list at-lib__list--nested">
                              {p.videos.map((v) => (
                                <li key={v.videoId} className="at-lib__row">
                                  <Thumb video={v} size={40} />
                                  <div className="at-lib__meta">
                                    <p className="at-lib__name">{v.title}</p>
                                    <p className="at-lib__sub">{v.artist}</p>
                                  </div>
                                  <div className="at-lib__actions">
                                    <button
                                      type="button"
                                      className="at-btn"
                                      onClick={() => handlePlay(v)}
                                      aria-label={`Play ${v.title}`}
                                    >
                                      Play
                                    </button>
                                    <button
                                      type="button"
                                      className="at-btn at-btn--ghost"
                                      onClick={() => lib.removeFromPlaylist(p.id, v.videoId)}
                                      aria-label={`Remove ${v.title} from ${p.name}`}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          {addable.length > 0 ? (
                            <div className="at-lib__add">
                              <select
                                className="at-lib__input"
                                value={addPick[p.id] ?? ''}
                                onChange={(e) =>
                                  setAddPick((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                                aria-label={`Add song to ${p.name}`}
                              >
                                <option value="">Add a song…</option>
                                {addable.slice(0, 100).map((v) => (
                                  <option key={v.videoId} value={v.videoId}>
                                    {v.title} — {v.artist}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="at-btn"
                                disabled={!addPick[p.id]}
                                onClick={() => {
                                  const vid = addPick[p.id];
                                  const found = addable.find((v) => v.videoId === vid);
                                  if (found) {
                                    lib.addToPlaylist(p.id, found);
                                    setAddPick((prev) => ({ ...prev, [p.id]: '' }));
                                  }
                                }}
                              >
                                Add
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'Artists' ? (
          lib.artists.length === 0 ? (
            <p className="at-empty" role="status">
              {EMPTY_COPY.Artists}
            </p>
          ) : (
            <ul className="at-lib__list">
              {lib.artists.map((a) => (
                <li key={a.name.toLowerCase()} className="at-lib__row">
                  {a.thumbnail ? (
                    <img
                      className="at-lib__thumb at-lib__thumb--round"
                      src={a.thumbnail}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="at-lib__thumb at-lib__thumb--fallback" aria-hidden="true">
                      ♪
                    </span>
                  )}
                  <div className="at-lib__meta">
                    <p className="at-lib__name">{a.name}</p>
                    <p className="at-lib__sub">
                      {a.count} {a.count === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                  <div className="at-lib__actions">
                    <button
                      type="button"
                      className="at-btn"
                      onClick={() => {
                        if (a.videos[0]) handlePlay(a.videos[0]);
                      }}
                      aria-label={`Play top song by ${a.name}`}
                    >
                      Play
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'Albums' ? (
          lib.albums.length === 0 ? (
            <p className="at-empty" role="status">
              {EMPTY_COPY.Albums}
            </p>
          ) : (
            <ul className="at-lib__list">
              {lib.albums.map((a) => (
                <li key={a.id} className="at-lib__row">
                  <Thumb video={a} size={48} />
                  <div className="at-lib__meta">
                    <p className="at-lib__name">{a.title}</p>
                    <p className="at-lib__sub">{a.artist}</p>
                  </div>
                  <div className="at-lib__actions">
                    <button
                      type="button"
                      className="at-btn"
                      onClick={() => handlePlay(a)}
                      aria-label={`Play ${a.title}`}
                    >
                      Play
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'Songs' ? (
          lib.history.length === 0 ? (
            <p className="at-empty" role="status">
              {EMPTY_COPY.Songs}
            </p>
          ) : (
            <ul className="at-lib__list">
              {lib.history.map((h) => (
                <li key={h.videoId} className="at-lib__row">
                  <Thumb video={h.video} size={48} />
                  <div className="at-lib__meta">
                    <p className="at-lib__name">{h.video.title}</p>
                    <p className="at-lib__sub">
                      {h.video.artist} · {h.count} {h.count === 1 ? 'play' : 'plays'}
                      {h.lastPlayed ? ` · ${formatLastPlayed(h.lastPlayed)}` : ''}
                    </p>
                  </div>
                  <div className="at-lib__actions">
                    <button
                      type="button"
                      className="at-btn"
                      onClick={() => handlePlay(h.video)}
                      aria-label={`Play ${h.video.title}`}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className={
                        lib.isLiked(h.videoId) ? 'at-btn at-btn--ghost is-liked' : 'at-btn at-btn--ghost'
                      }
                      onClick={() => lib.toggleLike(h.video)}
                      aria-label={
                        lib.isLiked(h.videoId)
                          ? `Unlike ${h.video.title}`
                          : `Like ${h.video.title}`
                      }
                      title={lib.isLiked(h.videoId) ? 'Unlike' : 'Like'}
                    >
                      ♥
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
