export interface LyricWord { text: string; start: number; end: number; roman?: string }
export interface LyricLine { start: number; end: number; text: string; words: LyricWord[]; translation?: string }
/** Instrumental silence synthesized by LyricsView (rendered as `• • •`). Never emitted after the last line. */
export interface InstrumentalGap { key: string; start: number; end: number }
export interface LyricsResult { type: 'word'|'line'|'plain'; lines: LyricLine[]; source: string }
export interface SongMeta { title: string; artist: string; album?: string; duration?: number; videoId?: string }
