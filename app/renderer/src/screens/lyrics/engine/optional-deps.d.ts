/**
 * Ambient declarations for optional lyric-enhancement deps. The desktop shell
 * intentionally does NOT install wanakana / pinyin-pro (system stack only;
 * orchestrator wires deps later). Code reaches them through guarded dynamic
 * `import()` with runtime try/catch, so a missing package is a normal
 * fallback — these declarations only keep `tsc -b` quiet until then.
 */
declare module 'wanakana' {
  export function toRomaji(input: string): string;
  export function toHiragana(input: string): string;
  export function toKatakana(input: string): string;
}

declare module 'pinyin-pro' {
  export function pinyin(text: string, opts?: Record<string, unknown>): string | string[];
}
