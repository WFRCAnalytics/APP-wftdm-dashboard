// Deployment settings for tile export (index.json `export.footer`), plain module state set once at boot.
let footer: boolean | string = true
let title: string | undefined

export function configureExport(opts: { footer?: boolean | string; title?: string }): void {
  footer = opts.footer ?? true
  title = opts.title
}

/** The line under an exported image, or undefined when the deployment turned it off. */
export function exportFooter(parts: { scenarios: string; year?: number }): string | undefined {
  if (footer === false) return undefined
  if (typeof footer === 'string') return footer
  const date = new Date().toISOString().slice(0, 10)
  return ['Source: ' + (title ?? 'Calibration dashboard'), parts.scenarios, parts.year ? String(parts.year) : undefined, `exported ${date}`]
    .filter(Boolean)
    .join(' · ')
}
