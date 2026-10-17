# ArchiveTune — Android Feature Inventory (Electron Port Reference)

- **Source (read-only):** `E:\mush\archivetune-ref` — commit `57732a18` (2026-10-12), 691 Kotlin files
- **Package:** `moe.rukamori.archivetune` · License GPL-3.0 · Lineage: InnerTune/Metrolist/SimpMusic-descendant (branding "Koiverse"/Rukamori)
- **Path convention:** `app/...` = `E:\mush\archivetune-ref\app\src\main\kotlin\moe\rukamori\archivetune\...`; `app/src/{automotive,tv,foss,gms,...}` = flavor/source-set dirs.
- **Repo modules** (`settings.gradle.kts`): `:app`, `:core` (InnerTube/YouTube Music API — **submodule NOT checked out, empty**), `:lyrics:{kugou,lrclib,simpmusic,paxsenix,betterlyrics,unison,youlyplus}` (**all empty**), `:lastfm`, `:canvas`, `:shazamkit`, `:spotifycore`, `:morideobfuscator` (empty). Internals of missing modules marked *(unverified)*.
- **Labels:** `MUST-PORT` = core product value on desktop · `NICE` = valuable but optional · `ANDROID-ONLY` = no meaningful desktop equivalent (or conceptual port only). **Complexity:** S / M / L.

---

## 1. Navigation & Screens

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Bottom navigation shell | 3 main tabs: Home / Search / Library, plus extras (Mood & Genres); back stack via Navigation Compose | `app/ui/screens/Screens.kt`, `app/ui/screens/NavigationBuilder.kt` | M | MUST-PORT |
| Route graph | ~20 top-level routes + full settings subroute tree (`home, search, library, mood_and_genres, account, new_release, charts_screen, spotify_liked_songs, local_songs, history, stats, news, MusicRecognition*, settings/*`) | `app/ui/screens/NavigationBuilder.kt` | M | MUST-PORT |
| Home screen | Personalised feed: home category chips, account playlists, Quick Picks, Speed Dial, Keep Listening, Forgotten Favorites, similar recommendations, YouTube Music home sections | `app/ui/screens/HomeScreen.kt(+Components)` | L | MUST-PORT |
| Search screen | Tabs **Explore / Suggestions**; query input for YT Music; search filters (Songs/Albums/Artists/Playlists/Videos); search history | `app/ui/screens/search/SearchScreen.kt`, `OnlineSearchScreen.kt`, `LocalSearchScreen.kt` | L | MUST-PORT |
| Explore tab | Mood & genres entry, new releases, charts, curated shelves | `app/ui/screens/ExploreScreen.kt`, `MoodAndGenresScreen.kt` | M | MUST-PORT |
| Library screen | Tabbed library: Songs / Albums / Artists / Playlists / Podcasts / Spotify playlists / Mixes / Local songs; sort + filter (incl. tag filter); grid/list card modes; pull-to-refresh feedback | `app/ui/screens/library/*` (14 files) | L | MUST-PORT |
| Local songs screen | Device audio library (scanned files), local search, hidden-format handling | `app/ui/screens/library/LocalSongScreen.kt` | M | NICE (desktop = folder scan port) |
| Artist screens | Artist page + tabs for songs/albums/items | `app/ui/screens/artist/*` | M | MUST-PORT |
| Album screen | Album page with track list, actions | `app/ui/screens/AlbumScreen.kt` | M | MUST-PORT |
| Song/album context menus | Play, play next, add to queue, download, like, share, radio, edit metadata (local), etc. | `app/ui/menu/*` (AlbumMenu, ArtistMenu, SongMenu, YouTube*Menu, PlaylistMenu, PlayerMenu) | L | MUST-PORT |
| Playlist screens | Local playlist, Online (YT) playlist, Top playlist, Cache playlist, Auto playlist, Spotify playlist + liked songs | `app/ui/screens/playlist/*` (12 files) | L | MUST-PORT |
| Podcast screen | YT podcast browse + podcast library | `app/ui/screens/podcast/PodcastScreen.kt`, `library/LibraryPodcastsScreen.kt` | M | NICE |
| Browse/YouTube browse | Generic YT browse/catalog pages | `app/ui/screens/BrowseScreen.kt`, `YouTubeBrowseScreen.kt` | M | NICE |
| Charts screen | YT Music charts catalog | `app/ui/screens/ChartsScreen.kt` | S | NICE |
| New release screen | New album/single feed | `app/ui/screens/NewReleaseScreen.kt` | S | NICE |
| History screen | Local + remote listen history (Today/Yesterday/This week/Last week groups) | `app/ui/screens/HistoryScreen.kt` | M | MUST-PORT |
| Stats screen | Listening statistics (top songs/albums/artists, unique counts) | `app/ui/screens/StatsScreen.kt`, `app/privacy/ListeningStatsRepository.kt` | M | MUST-PORT |
| Year in Music | Annual recap screen | `app/ui/screens/YearInMusicScreen.kt` | M | NICE |
| News screen | In-app news feed from GitHub repo (`koiverse/ArchiveTuneNewsRepository`) + article viewer | `app/ui/screens/NewsScreen.kt`, `ViewNewsScreen.kt`, `repository/NewsRepository.kt` | S | NICE |
| Account screen | Multi-account management, quick switch, channel list, login | `app/ui/screens/AccountScreen.kt`, `utils/SavedAccounts.kt` | M | MUST-PORT |
| Login screen | Google/YouTube login via WebView cookies (`InnerTubeCookieKey`), advanced token login | `app/ui/screens/LoginScreen.kt`, `app/auth/YouTubeLoginRepository.kt` | L | MUST-PORT (desktop webview login) |
| Music recognition screens | Shazam-like recognition page + result details | `app/ui/screens/musicrecognition/*` | M | NICE |
| Download library screen | Downloaded songs manager | `app/ui/screens/downloads/DownloadLibraryScreen.kt` | M | MUST-PORT |
| Onboarding | 4-step flow: WELCOME → PERMISSIONS → LOGIN → COMMUNITY (+ donate link) | `app/ui/screens/onboarding/OnboardingScreen.kt`, `app/onboarding/` | S | NICE (adapted) |
| Player UIs | Mini player, bottom-sheet player, full player (V4/V9 styles), Queue sheet, Lyrics screen, immersive landscape player, AOD player, canvas artwork player | `app/ui/player/*` (Player.kt 2399 ln, Queue.kt 1294, LyricsScreen.kt 984, immersive/ImmersivePlayerScreen.kt 806, CanvasArtworkPlayer.kt, AodPlayerScreen.kt, MiniPlayer.kt, V9AnimatedPlaybackControls.kt) | L | MUST-PORT |
| Deep links & share intents | `https://music.youtube.com|youtube.com`, `archivetune://` scheme, `vnd.youtube`, NFC, `SEND text/plain`, `SEND audio/*`, media buttons | `app/src/main/AndroidManifest.xml`, `MainActivity.kt` (`handleDeepLinkIntent`, `handleExternalAudioIntent`) | M | NICE (protocol handler + file assoc) |
| TV & Automotive layouts | TV screens (TvMainScreens) and Android Automotive source sets | `app/ui/screens/Screens.kt`, `app/src/tv/`, `app/src/automotive/` | S | ANDROID-ONLY |

## 2. Playback & Audio

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Core playback engine | media3 `MediaSessionService` (MusicService, 7912 lines): ExoPlayer-based streaming, from YT Music/InnerTube streams; media session, audio focus, resume/pause, persistent state | `app/playback/MusicService.kt`, `app/playback/PlayerConnection.kt` | L | MUST-PORT |
| Queue system | Media3 playlist queues with per-source queue builders: YouTubeQueue, YouTubeAlbumRadio, LocalAlbumRadio, LocalMixQueue, ListQueue; explicit/video/blocked-artist filters (`Status`); move items, play next, add to queue, remove | `app/playback/queues/*` | L | MUST-PORT |
| Persistent queue | Queue restored across restarts; `PlaybackResumptionPlanner` resolves persisted vs current items/index/position (incl. radio "single-item" resume) | `app/playback/PlaybackResumptionPlanner.kt`, `PersistentQueueKey` | M | MUST-PORT |
| Shuffle & repeat | Shuffle/repeat with permanent-shuffle option | `MusicService.kt`, `PreferenceKeys.PermanentShuffleKey` | S | MUST-PORT |
| Crossfade / gapless | Crossfade (enable + duration) with gapless hand-off policy; separate gapless toggle | `CrossfadeEnabledKey`, `CrossfadeDurationKey`, `CrossfadeGaplessKey`, `app/playback/CrossfadeHandoffPolicy.kt` | M | MUST-PORT |
| Sleep timer | Timer in minutes + "pause at end of song" (-1); suppresses resume when triggered | `app/playback/SleepTimer.kt`, UI in `Player.kt`, `QueueComponents.kt` | S | MUST-PORT |
| Playback speed & pitch | Tempo 0.25–2.0x + pitch (semitone presets) via `PlaybackParameters` | `app/ui/menu/PlayerMenu.kt` (1436 ln) | S | MUST-PORT |
| Volume control | In-app volume slider | `PlayerMenu.kt` | S | MUST-PORT |
| Loudness / normalization | `LoudnessEnhancer` + audio normalization key; loudness dB from stream metadata | `MusicService.kt`, `AudioNormalizationKey` | S | NICE (Electron: ReplayGain-ish via Web Audio) |
| Equalizer | 8-band EQ profile model (band freqs/levels, output gain, bass boost, virtualizer, auto headroom) + repository/use-cases; system audio-effect panel hook (`DISPLAY_AUDIO_EFFECT_CONTROL_PANEL` in manifest) | `app/playback/EqualizerModels.kt`, `app/playback/EqualizerPlaybackController.kt`, `app/equalizer/EqualizerRepository.kt`, `EqualizerUseCases.kt` | M | NICE (Web Audio filter graph) |
| Audio quality & format selection | `AudioQuality` AUTO/HIGH/HIGHEST/LOW; pinned format id (itag); metered-network aware; codec/bitrate/sample-rate in resolved stream model; persists "preferred format" | `app/playback/DownloadUtil.kt` (696 ln), `app/playback/stream/AudioStreamModels.kt`, `PreferenceKeys.PreferredFormatKey(-s)` | M | MUST-PORT |
| Stream resolution pipeline | InnerTube stream resolve (YouTubei) → request headers/url/expiry/authFingerprint; PlaybackAuthState; runtime version; tracker URLs | `app/playback/stream/*` (AudioStreamRepository, YoutubeiStreamRepository, ResolveAudioStreamUseCase) — innertube internals *(unverified, core submodule)* | L | MUST-PORT |
| PoToken / BotGuard auth | WebView-based BotGuard token generation (+ challenge parser) for authenticated/guest playback | `app/utils/potoken/*` (BotGuardTokenGenerator, ChallengeParser, PoTokenResult) | L | MUST-PORT (hard: desktop PoToken strategy) |
| Track preloading | Preload next stream (network/perf settings) to reduce gaps | `app/playback/preload/NextStreamPreloader`, performance keys | M | NICE |
| Stream recovery | Retry tracker for failed streams; safe track selector; auto-skip-on-error optional | `app/playback/PlaybackStreamRecoveryTracker.kt`, `SafeTrackSelector` *(referenced)*, `AutoSkipNextOnErrorKey` | M | NICE |
| Downloads | Download manager (parallel, per-song, artwork), `DownloadManager`-based `ExoDownloadService`, resuming downloader, chunked data source, stream chunk resolver; storage location selectable; download-all in playlist | `app/playback/DownloadUtil.kt`, `app/playback/ExoDownloadService.kt`, `app/downloads/DownloadRepository.kt`, `ManageDownloadsUseCase.kt`, `DownloadedArtworkRepository.kt` | L | MUST-PORT |
| Auto-download & smart trimmer | Auto-download liked songs; smart trimmer (cache maintenance) | `AutoDownloadOnLikeKey`, `StorageSettings.kt` (smart trimmer) | M | NICE |
| Scrobble timing | Scrobble delay percent/seconds + minimum song duration before scrobbling | `ScrobbleDelayPercentKey`, `ScrobbleDelaySecondsKey`, `ScrobbleMinSongDurationKey` in `PreferenceKeys.kt`; `utils/ScrobbleManager.kt` (156 ln) | S | MUST-PORT |
| Radio / autoplay | Start radio seamlessly from any song (`startRadioSeamlessly`), local album radio, mix queues | `MusicService.kt`, `playback/queues/*` | M | MUST-PORT |
| Voice search playback | Media session `playFromVoiceSearch()` (Android Auto/assistant) | `MusicService.kt`, `MediaLibrarySessionCallback.kt` | S | ANDROID-ONLY |
| Audio output routing | Bluetooth/connected device selection, output device models | `app/playback/AudioOutputResolver.kt`, `models/PlayerOutputDevice` | S | ANDROID-ONLY |
| Media notification | Custom media notification provider (ArchiveTuneMediaNotificationProvider) | `app/playback/ArchiveTuneMediaNotificationProvider.kt`, `constants/MediaSessionConstants.kt` | M | NICE (desktop tray/media keys) |
| Local file playback | Plays scanned local audio (incl. external `audio/*` intents) | `app/localmedia/*`, `MusicService.kt` | M | MUST-PORT |
| Video handling | "Hide video" preference; music-video playback filtered/converted | `HideVideoKey`, queue `Status.filterVideo` | S | NICE |
| Proxy for streams | Optional stream bypass of proxy (per-server) | `StreamBypassProxyKey`, `app/utils/ProxyUtils.kt` | S | NICE |

## 3. Lyrics

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Multi-provider lyrics fetch | Provider chain: LrcLib, KuGou, BetterLyrics (+Portato), YouLyPlus, SimpMusic, Megalobiz, Paxsenix (Apple Music / Musixmatch / Spotify), Unison, YouTube lyrics + subtitles; per-provider enable toggles (all default on) | `app/lyrics/*Provider.kt` (13 files), `LyricsHelper.kt`, `LyricsProvider.kt`; module impls `:lyrics:*` *(unverified)* | L | MUST-PORT |
| Sync model | `LyricsSyncType` PLAIN/LINE/WORD; source formats PLAIN/LRC/QRC/TTML; word-level timing, phonetics, translations, romanized text, instrumental flag | `app/lyrics/LyricsRenderingModels.kt`, `LyricsEntry.kt` | L | MUST-PORT |
| Rendering & animation | Scroll-to-line, click-to-seek, auto-scroll, line blur, text size, line spacing, animated lyrics modes, background styles | `app/ui/player/LyricsScreen.kt` (984 ln), `ui/screens/settings/LyricsAnimationSettings.kt` | L | MUST-PORT |
| Romanization | ja/ko/zh/hi + other-language romanization prefs (default on) | `app/lyrics/LyricsUtils.kt` (`LyricsRomanizationPreferences`), keys `LyricsRomanize*Key` | M | MUST-PORT |
| Translation | Lyric translation via providers + AI; translated-lyrics repositories & use case | `app/lyrics/translation/*` | M | MUST-PORT |
| AI lyric translation | AI-service-backed translation with custom prompt/provider | `app/ai/AiLyricsTranslator.kt`, `AiLyricsDocument.kt` | M | MUST-PORT |
| Lyrics settings screen | Provider toggles, romanization, animation, translation, blur, click behavior | `app/ui/screens/settings/LyricsSettings.kt` (1076 ln) | M | MUST-PORT |
| Embedded lyrics for local songs | Extract embedded lyrics from local files | `app/localmedia/EmbeddedLyricsExtractor.kt` | S | NICE |
| Provider order & customization | Custom provider ordering/priority *(in settings UI)* | `LyricsSettings.kt`, `LyricsProviderKey` | S | NICE |

## 4. Library & Data

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Room database | `InternalDatabase` (schema v33; 33 migration versions) with DAOs for all entities | `app/db/MusicDatabase.kt`, `DatabaseDao.kt`, `app/schemas/moe.rukamori.archivetune.db.InternalDatabase/33.json` | L | MUST-PORT (SQLite) |
| Entities | song, artist, album, playlist, maps (song_artist, song_album, album_artist, playlist_song, playlist_tag, related_song, top_mix_song), search_history, format, lyrics, event (play events), playCount, tag, set_video_id, library_top_mix | `app/db/entities/*` | L | MUST-PORT |
| YT Music library sync | Liked songs/albums/artists/playlists from account; force-sync on account switch | `MusicDatabase.kt`, `ForceSyncOnSwitchAccountKey`, viewmodels | L | MUST-PORT |
| Local media indexing | MediaStore scan, metadata reader, supported formats, YouTube-matching for local tracks (aliases) | `app/localmedia/*` (8 files: LocalMediaIndexer, LocalSongScanner, ScanLocalMusicUseCase, LocalAudioMetadataReader, LocalMusicIdentity, ...) | L | MUST-PORT (desktop folder scan) |
| Playlists | Local playlist create/edit, playlist covers, tags + tag filter, cache playlist, auto playlist, "you might like" suggestion section (source: title/content/both) | `app/ui/screens/playlist/*`, `repository/PlaylistCreationRepository.kt`, `PlaylistCoverRepository.kt`, `PlaylistTagsRepository.kt` | L | MUST-PORT |
| Playlist import/export | Export CSV (`Title, Artist, Album, Media ID`, formula-injection-escaped); M3U import (online + local), replacement search for missing tracks, import resolver | `app/repository/PlaylistExportRepository.kt`, `app/playlistimport/*` (ImportSongResolver, ImportReplacementSearcher, PlaylistSongSourceReplacement) | M | MUST-PORT |
| Spotify import | Import Spotify liked songs/playlists into library (mapped to YT) | `app/spotify/*`, `ui/screens/playlist/SpotifyLikedSongsScreen.kt` | M | NICE |
| Listening history | Local play history (event table) + remote YT history; grouped views | `app/db`, `HistoryScreen.kt`, viewmodels | M | MUST-PORT |
| Listening stats | Play counts, top items, unique stats, reset capability | `app/privacy/ListeningStatsRepository.kt`, `ResetListeningStatsUseCase.kt` | M | MUST-PORT |
| Top Mix / mixes | Local library "top mix" generated mixes | `db/library_top_mix`, `repository/LibraryTopMixRepository.kt`, `LibraryMixScreen.kt` | M | NICE |
| Quick Picks / Forgotten favorites / Keep Listening | Home personalization features based on local stats | `HomeScreen.kt`, `QuickPicksKey`, `QuickPicksDisplayMode` | M | MUST-PORT |
| Speed Dial pins | Pin songs/playlists to home speed dial | `SpeedDialSongIdsKey`, `app/utils/SpeedDialPins*` | S | NICE |
| Hidden playlists | Hide playlists from library view (management screen) | `ui/screens/settings/HiddenPlaylistsScreen.kt` | S | NICE |
| Search history | Persisted search queries, pause/clear | `db.entities.SearchHistory`, `PrivacySettings.kt` | S | MUST-PORT |
| Backup & restore | Local zip archive of DataStore prefs + DB checkpoint; scheduled backups (worker); restore UI | `app/backup/BackupArchiveRepository.kt` (240 ln), `ScheduledBackup*`, `ui/screens/settings/BackupAndRestore.kt` (852 ln) | L | MUST-PORT |
| Google Drive backup | gms-flavor only: Drive backup/restore with auth | `app/src/gms/backup/drive/*`, `app/src/gms/` (DriveBackup*) | M | NICE (Dropbox/OneDrive alt) |
| Multi-account saved accounts | Save/switch multiple YouTube accounts; channel picker | `utils/SavedAccounts.kt`, `AccountScreen.kt`, `AccountSessionPolicy.kt` | M | MUST-PORT |

## 5. Search & Discovery

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Online search | InnerTube YT Music search with filters: Song/Album/Artist/Playlist/Video (`SearchFilter.*`) | `app/viewmodels/OnlineSearchViewModel.kt`, innertube `YouTube` *(core unverified)* | M | MUST-PORT |
| Search suggestions | Query autocomplete/suggestions | `app/viewmodels/OnlineSearchSuggestionViewModel.kt` | S | MUST-PORT |
| Local search | Search device/local library (songs/albums/artists/playlists) | `app/ui/screens/search/LocalSearchScreen.kt`, `LocalSearchViewModel.kt` | M | MUST-PORT |
| Search result screens | Typed result pages + navigation | `ui/screens/search/OnlineSearchResult.kt`, `OnlineSearchNavigation.kt` | M | MUST-PORT |
| Discovery repository | Explore/suggestions data (charts, moods, new releases, quick picks sources) | `app/repository/SearchDiscoveryRepository.kt`, `viewmodels/SearchDiscoveryTab` | M | NICE |
| YouTube search history | Remote search history sync | YT search history API via innertube *(core unverified)* | S | NICE |
| Pause search history | Privacy toggle for search history recording | `PauseSearchHistoryKey` | S | MUST-PORT |

## 6. Settings

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Settings root | Grouped list: account, stats, appearance, player, canvas, lyrics, content, privacy, integration, android_auto, ai_integration, internet, storage, backup_restore, misc, update, about | `ui/screens/settings/SettingsScreen.kt`, `SettingsDataBuilders.kt`, `SettingsModels.kt` | M | MUST-PORT |
| Appearance | Theme(ing) controls: dynamic color, custom theme color, dark mode (AUTO/DARK/LIGHT), pure black, blur/backdrop, player design style (V4…), player background style, lyrics/mini-player background style, fonts (system/custom file), player buttons style, slider style, grid size, nav tab default, swipe controls, library filter default, quick-picks display | `ui/screens/settings/AppearanceSettings.kt` (1187 ln) | L | MUST-PORT |
| Player settings | Playback prefs: audio quality, crossfade/gapless, normalization, skip silence, persistent queue, permanent shuffle, auto-download-on-like, scrobble timers, auto-skip-on-error | `ui/screens/settings/PlayerSettings.kt`, `app/constants/PreferenceKeys.kt` | M | MUST-PORT |
| Content settings | Content language/country, playlist suggestion source, hide explicit, hide video, app language, top length, quick picks mode, **AI content filter** (remote blocklist of channels: enable, moderate-confidence, update, source) | `ui/screens/settings/ContentSettings.kt`, `app/aicontentfilter/*` | M | MUST-PORT (filter UI NICE) |
| Privacy settings | Pause/clear listen history, pause/clear search history, haptics, disable screenshot, reset listening stats | `ui/screens/settings/PrivacySettings.kt` | S | MUST-PORT |
| Storage settings | Clear downloads/song cache/image cache/canvas cache; max cache sizes (0=disable, -1=unlimited); storage folder pick + migration; smart trimmer; free-space display | `ui/screens/settings/StorageSettings.kt` (791 ln), `app/storage/StorageLocationRepository.kt` | M | MUST-PORT |
| Internet settings | DNS-over-HTTPS (provider/custom URL), Proxy (type/host/port/auth, bypass for streaming, connection test), network warnings | `ui/screens/settings/InternetSettings.kt`, `app/utils/ProxyUtils.kt` | M | MUST-PORT |
| Integration settings | Discord, Spotify connect, Last.fm, ListenBrainz entry points | `ui/screens/settings/IntegrationScreen.kt` (705 ln) | M | MUST-PORT |
| AI settings | AI provider (ChatGPT/Gemini/OpenRouter/Custom/None), custom endpoint, API key, model fetch/select, custom translation prompt, API test | `ui/screens/settings/AiIntegrationSettings.kt`, `app/ai/*` | M | MUST-PORT |
| Account settings | Login/logout, advanced token login, saved accounts, YT sync, force-sync toggle, integrations summary, hidden playlists | `ui/screens/settings/AccountSettings.kt` | M | MUST-PORT |
| Android Auto settings | AA-specific options | `ui/screens/settings/AndroidAutoSettings.kt`, `app/androidauto/*` | S | ANDROID-ONLY |
| Canvas settings | Canvas (Apple Music-style looping artwork) enable/policy options | `ui/screens/settings/CanvasSettings.kt` | S | NICE |
| Lyrics settings | See domain 3 | `ui/screens/settings/LyricsSettings.kt`, `LyricsAnimationSettings.kt` | M | MUST-PORT |
| Backup & restore settings | See domain 4 | `BackupAndRestore.kt` | L | MUST-PORT |
| Update screen | Update channels (stable/nightly), check/download/install; update worker + notification | `ui/screens/settings/UpdateScreen.kt`, `app/updates/*`, `utils/Updater.kt` | M | MUST-PORT (electron-updater) |
| About screen | Lead dev, team, translators, license, contributors (fetched from GitHub) | `ui/screens/settings/AboutScreen.kt` | S | NICE |
| Changelog screen | Release notes viewer | `ui/screens/settings/ChangelogScreen.kt` | S | NICE |
| Icon screen | Launcher icon variants picker | `ui/screens/settings/IconScreen.kt`, `app/appicon/*` | S | NICE (tray icons; IconPack submodule empty) |
| Palette picker / theme creator | Tonal palette picker + custom theme creator | `ui/screens/settings/PalettePickerScreen.kt`, `ui/theme/palette/TonalPalettes.kt` | M | NICE (browser theme option) |
| AOD customization | AOD clock/widget options | `ui/screens/settings/AodCustomizedScreen.kt` | S | ANDROID-ONLY |
| Discord settings | Discord RPC options: login (OAuth), activity customization, show when paused, experimental features | `ui/screens/settings/DiscordSettings.kt` (1408 ln), `DiscordExperimental.kt` | M | NICE |
| Customize background | Custom player background image/color | `ui/screens/settings/CustomizeBackground.kt` | S | NICE |
| Debug & Logcat | Debug settings + logcat viewer | `ui/screens/settings/DebugSettings.kt`, `LogcatScreen.kt`, `app/logcat/*` | S | NICE |
| Music Together screen | Listening-party host/join UI | `ui/screens/settings/MusicTogetherScreen.kt`, `app/together/*` | M | NICE |

## 7. Integrations

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Last.fm scrobbling | Auth + scrobble (now-playing/scrobble), settings UI, models | `:lastfm` module (`moe.rukamori.archivetune.lastfm.LastFM`, `models/Authentication.kt`), `app/scrobbling/*` (LastFmSettingsRepository, UseCases), `ui/screens/settings/LastFMSettings.kt` (635 ln), `utils/ScrobbleManager.kt` | M | MUST-PORT |
| ListenBrainz scrobbling | Token-based scrobbling via HTTP; embed in Integration screen | `ui/screens/settings/ListenBrainzManager.kt` (202 ln), `IntegrationScreen.kt` | S | MUST-PORT |
| Discord Rich Presence | OAuth login + local Gateway client, presence builder, policies, asset registration; option "show when paused" | `app/discord/*` (DiscordOAuthRepository, GatewayClient, DiscordPresenceModels, DiscordSocialPresenceClient, DiscordAssetRegistrar, DiscordOAuthCallbackActivity), `utils/DiscordRPC.kt` (400 ln), `DiscordPresencePolicy.kt` | L | NICE (Electron: discord-rpc) |
| Spotify connect | OAuth (PKCE/hash provider), library/liked/playlists read, playback resolver into YT queue, playlist downloads; token models | `:spotifycore` (`Spotify.kt`, `SpotifyAuth.kt`, `SpotifyHashProvider.kt`, `SpotifyInternalToken`), `app/spotify/*` (SpotifyLibraryRepository, SpotifyPlaybackResolver, SpotifyPlaylistQueue, viewmodels) | L | NICE |
| Music recognition (ShazamKit) | Audio fingerprint: capture activity, QS tile, background service, notification, history; ShazamKit module + signature generator | `:shazamkit` (`moe.koiverse.rukamori.shazamkit.Shazam`, `ShazamSignatureGenerator`), `app/musicrecognition/*` (BackgroundMusicRecognitionService, MusicRecognitionCaptureActivity, MusicRecognitionTileService, Repository, NotificationManager) | L | NICE (desktop mic capture) |
| Music Together (listening party) | Host/guest synchronized playback: LAN server + online API via Koiverse; playback sync + guest planner; repository | `app/together/*` (TogetherClient, TogetherServer, TogetherOnlineApi/Host/Endpoint, MusicTogetherRepository, TogetherPlaybackSync, TogetherGuestPlaybackPlanner), `ArchiveTuneKoiverseServer.txt` | L | NICE |
| Canvas artwork | Apple Music-style looping video artwork: provider chain AppleMusic/Spotify/Tidal via artwork.boidu.dev API, request policy, health tracking; player overlay | `:canvas` (`ArchiveTuneCanvas.kt`, AppleMusicProvider, AppleMusicWebToken, SpotifyCanvasProvider, TidalCanvasProvider, CanvasRequestPolicy), `app/canvas/*` (CanvasArtworkRepository, CanvasPlaybackUseCase, CanvasModels), `ui/player/CanvasArtworkPlayer.kt` | L | NICE |
| AI provider service | Multi-provider AI client (ChatGPT/Gemini/OpenRouter/custom) with JSON utils, model listing, test; used for lyric translation | `app/ai/*` (AiTextService, AiLyricsTranslator, AiIntegrationSettingsRepository, AiModels, AiJsonUtils) | M | MUST-PORT |
| Gatekeeper | Server-side access control (feature gate) calling Koiverse network gatekeeper; repository | `app/gatekeeper/GatekeeperRepository.kt` (179 ln) | S | NICE |
| News | See domain 1 | `repository/NewsRepository.kt` | S | NICE |
| Google Cast | gms flavor: cast button, route picker, cast playback repo; foss fallback | `app/cast/*`, `app/src/gms/*` (ArchiveTuneCastOptionsProvider, CastRoutePickerViewModel) | M | ANDROID-ONLY (DLNA alt = NICE) |
| Koiverse links | Support/donate links (koiiverse.cloud), in onboarding and support sections | `OnboardingScreen.kt`, `app/src/foss/support/*` | S | NICE |

## 8. Theming & Design

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Material 3 theming | Compose M3 theme with type, shapes; dark/light; AMOLED pure black | `ui/theme/Theme.kt`, `Type.kt` | M | MUST-PORT (CSS design system) |
| Dynamic color | Material You dynamic theme (Android) + custom theme color + random theme on startup | `DynamicThemeKey`, `CustomThemeColorKey`, `RandomThemeOnStartupKey` | M | NICE (custom theme color port) |
| Tonal palettes | Tonal palette generation for theme/creator | `ui/theme/palette/TonalPalettes.kt` | M | NICE |
| Artwork-derived player colors | Extract player UI colors from artwork; player background/color utils; slider colors | `ui/theme/PlayerColorExtractor.kt`, `PlayerBackgroundColorUtils.kt`, `PlayerSliderColors.kt` | M | MUST-PORT |
| Custom fonts | System font toggle, custom font file picker + loader | `CustomFontLoader.kt`, `UseSystemFontKey`, `FontPreferenceKey`, `CustomFontUriKey/NameKey` | S | NICE |
| Blur/backdrop | Backdrop blur effects, blur radius, disable blur | `DisableBlurKey`, `BlurRadiusKey`, `BackdropEnabledKey`, `BackdropBlurAmountKey` | S | MUST-PORT (CSS backdrop-filter) |
| UI component set | Shared components: navigation, menus, grids, buttons, preference components, snackbar, dialogs | `ui/component/*` (many files), `ui/menu/*` | L | MUST-PORT |
| Animations | Animations toggles (disable animations, animated player V9, transition utils) | `DisableAnimationsKey`, `V9AnimatedPlaybackControls.kt`, `ui/utils/*` | M | MUST-PORT |
| App icons / launcher aliases | Multiple launcher icons via activity-alias + LauncherEntryReceiver | `app/appicon/*`, `ui/screens/settings/IconScreen.kt` | S | NICE |

## 9. Platform Features (Android)

| Feature | Description | Source | Complexity | Port |
|---|---|---|---|---|
| Home-screen widgets (8) | MusicWidget, AlbumArtWidget, NowPlayingCardWidget, PlaybackDeckWidget, PlaybackCapsuleWidget, PlaybackSpotlightWidget, PlaybackCommandWidget, ListeningInsightsWidget (+widget design/insights repo) | `app/widget/*` | L | ANDROID-ONLY (tray/desktop widget alt = NICE) |
| AOD player | Always-On Display dream service (`android.service.dreams`), QS tile entry, fullscreen dark player, clock widget, touch-lock | `app/aod/*` (AodDreamService, AodModeTileService, AodModeEntryPoint), `ui/player/AodPlayerScreen.kt`, `AodClockWidget.kt`, `AodTouchLockOverlay.kt` | M | ANDROID-ONLY |
| Quick Settings tiles | AOD mode tile; Music-recognition tile (with TileActionActivity) | `app/aod/AodModeTileService.kt`, `app/musicrecognition/MusicRecognitionTileService.kt` | S | ANDROID-ONLY |
| Android Auto | Media library service callbacks, voice search, AA settings; automotive source set (AutomotiveSettingsActivity) | `app/androidauto/*`, `app/src/automotive/`, `MediaLibrarySessionCallback.kt` | M | ANDROID-ONLY |
| Android TV | TV source set with TvMainScreens and TV manifest/banner | `app/src/tv/*`, `Screens.kt` | S | ANDROID-ONLY |
| Immersive player | Fullscreen landscape immersive mode with canvas video | `ui/player/immersive/ImmersivePlayerScreen.kt` (806 ln), `app/domain/ObserveImmersivePlayerUseCase.kt` | M | NICE (desktop fullscreen) |
| Media info | Technical stream/file info display (codec, bitrate…) | `app/mediainfo/*` (MediaInfoRepository, Models, ObserveMediaInfoUseCase) | S | NICE |
| Screenshot protection | FLAG_SECURE option | `DisableScreenshotKey`, `PrivacySettings.kt` | S | ANDROID-ONLY |
| Haptics | Haptic feedback toggle throughout UI | `EnableHapticFeedbackKey`, `PrivacySettings.kt` | S | ANDROID-ONLY |
| OEM fixes | Device-specific workarounds | `app/utils/oem/*` | S | ANDROID-ONLY |
| External downloader | Launch external app to download a track URL | `app/utils/ExternalDownloaderLauncher.kt` | S | NICE |
| Share as image | Compose-to-image sharing (share card generation) | `app/utils/ComposeToImage.kt` | S | NICE |
| Update installer | APK install flow + update notification | `app/updates/AppUpdateInstaller.kt`, `utils/Updater.kt` | M | MUST-PORT (electron-updater) |
| Compression/obfuscation | `morideobfuscator` Gradle module for release obfuscation | `morideobfuscator/` *(empty)* | S | ANDROID-ONLY |

---

## Suggested Port Priority Tiers

**Tier 1 — Core client (MVP; parity with "music player" promise).** Playback engine with streaming/InnerTube resolution + PoToken strategy, persistent queue + shuffle/repeat + radio/autoplay, full player UI (mini/bottom-sheet/full) with sleep timer, speed/pitch and volume, search (online + local) with history and filters, Home feed, Library (songs/albums/artists/playlists/mixes) + local media scan, account login (cookie/webview) + multi-account, playlist CRUD + import/export (M3U/CSV), downloads (manager + library + cache policy), settings core (appearance, player, content, privacy, storage, internet), theming with artwork-extracted player colors, scrobbling timing hooks, update checker. This is the must-ship slice that makes the Electron app feel like ArchiveTune.

**Tier 2 — Signature differentiators.** Full lyrics stack (multi-provider fetch, word-sync QRC/TTML, rendering animations, romanization, translation + AI translation), music recognition (mic capture), canvas artwork, crossfade/gapless + equalizer (Web Audio), Last.fm/ListenBrainz + Discord RPC + Spotify connect, backup & restore (local), listening stats + Year in Music, history screens, AI integration settings, internet settings (DoH/proxy), playlists tags/filters, quick picks/speed dial, podcast screens, update channels. These are the features users specifically choose ArchiveTune for.

**Tier 3 — Platform-adjacent / optional.** Music Together (party sync), Google Drive cloud backup, media info panel, share-as-image, external downloader, hidden playlists, custom fonts/backdrop extras, palette/theme creator, icon variants, changelog/about, news feed, desktop integration variants of Android-only items (tray media controls, global shortcuts, OS media overlay as the MediaSession equivalent, folder download shortcut in place of widgets). Android-only features (widgets, AOD, QS tiles, Android Auto, TV, Cast, OEM fixes, haptics, screenshot protection) are out of scope except as noted desktop analogs.

---

### Evidence gaps
- `:core` (InnerTube API), `:lyrics:*` provider internals, `IconPack`, `morideobfuscator` are git submodules that are **not checked out** in the snapshot; all their internals are marked *(unverified)* and should be reviewed from the upstream repos before implementation (`github.com/rukamori/core` seen in `.gitmodules`).
- Some line-count/behavior claims derive from truncated greps; verified files are cited by exact path above.
