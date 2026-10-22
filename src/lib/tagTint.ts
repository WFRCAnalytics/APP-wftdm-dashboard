import type { CSSProperties } from 'react'

/** A tag coloured with a scenario colour (the one set in Settings): a tint of it behind ink text, with a hairline ring. */
export function tagTintStyle(color: string, strength = 22): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${strength}%, transparent)`,
    color: 'var(--ink)',
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 50%, transparent)`,
  }
}
