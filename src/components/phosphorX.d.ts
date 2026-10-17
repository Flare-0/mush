/**
 * The installed @phosphor-icons/react version ships the `X` icon at runtime
 * but omits its type declaration (no `csr/X.d.ts`), so the named import
 * fails under `verbatimModuleSyntax`. This augmentation restores the type
 * without touching node_modules or app logic.
 */
import type { Icon } from '@phosphor-icons/react/lib';

declare module '@phosphor-icons/react' {
  const X: Icon;
}
