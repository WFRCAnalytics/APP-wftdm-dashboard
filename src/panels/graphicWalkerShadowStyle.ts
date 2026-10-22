// Graphic Walker renders into an OPEN shadow root (confirmed live), so the
// app's stylesheet can't reach its internals, but a <style> element
// appended to that root can. Colors and the chart palette go through
// graphicWalkerTheme.ts's `uiTheme`/`vizThemeConfig` props; this is for
// what those props can't express: the font, radius, scrollbars and
// spacing of GW's own chrome.
//
// CSS custom properties inherit through a shadow boundary, so the rules
// below reference the app's tokens (`var(--font-body)`, `var(--border)`)
// and follow theme/font changes live, with no re-injection.
//
// Selectors are GW's own class names (`.App` is its root element), which
// are internal and may change on upgrade — `@kanaries/graphic-walker` is
// pinned to an exact version for this reason (CLAUDE.md), and every rule
// here degrades to "GW's own default look", never to a broken layout.

const STYLE_ATTR = 'data-wftdm-gw-style'

const GRAPHIC_WALKER_SHADOW_CSS = `
.App,
.App button,
.App input,
.App select,
.App textarea {
  font-family: var(--font-body);
}

.App * {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

/* ── Main frame (the bordered box around the toolbar + shelves) ─────────── */
.App [class~="p-4"][class~="border-border"][class~="rounded-md"] {
  border-color: var(--glass-line);
  border-radius: 16px;
}

/* ── Data / Visualization tabs: a segmented pill, like the app's Segmented ── */
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] {
  width: fit-content;
  height: auto;
  margin: 12px 16px 4px;
  padding: 3px;
  gap: 2px;
  border-bottom: 0;
  border-radius: 9999px;
  background: var(--pill-track);
}
/* colours carry !important: Graphic Walker's own utility classes set text colour with higher specificity */
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button {
  margin: 0;
  padding: 4px 14px;
  border: 0;
  border-radius: 9999px;
  font-size: 13px;
  color: var(--pill-off-fg) !important;
}
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button:hover {
  color: var(--pill-hover-fg) !important;
}
.App [class~="border-b"][class~="h-9"][class~="space-x-8"] > button[data-state="active"] {
  /* same look as .pill-on in tokens.css */
  color: var(--pill-on-fg) !important;
  background: var(--pill-on-bg);
  box-shadow: var(--pill-on-shadow);
}

/* ── Chart tabs ("Chart 1", "+ New"): pills instead of folder tabs ───────── */
.App nav[role="tablist"][aria-label="Tabs"] {
  height: auto;
  margin-bottom: 8px;
  gap: 6px;
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"] {
  align-items: center;
  padding: 3px 12px;
  border-radius: 9999px;
  font-size: 13px;
  color: var(--pill-off-fg);
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"][class~="border"] {
  border: 1px solid transparent;
  background: var(--pill-on-bg);
  box-shadow: var(--pill-on-shadow);
  color: var(--pill-on-fg) !important;
}
.App nav[role="tablist"][aria-label="Tabs"] > [role="tab"]:not([class~="border"]):hover {
  background: var(--pill-track);
  color: var(--pill-hover-fg);
}

/* ── Toolbar: one soft rounded bar with round buttons ────────────────────── */
.App [class~="flex-wrap"][class~="border"][class~="my-1"][class~="rounded"] {
  padding: 4px;
  border-color: var(--glass-line);
  border-radius: 14px;
  background: var(--tile-hi);
}
.App [class~="flex-wrap"][class~="border"][class~="my-1"][class~="rounded"] button {
  border-radius: 9999px;
}

/* ── Shelves, field list and canvas: softer, rounder, with room between ──── */
.App [class~="my-0.5"][class~="border"] {
  margin: 4px;
  border-color: var(--glass-line);
  border-radius: 14px;
  overflow: hidden;
  background: var(--tile-hi);
}
.App [class~="my-0.5"][class~="border"][class~="flex-1"] {
  background: transparent;
}

/* Shelf titles: the app's small muted label style */
.App [class~="border-b"][class~="p-2"][class~="select-none"] {
  border-color: var(--glass-line);
  padding: 8px 12px;
}
.App .fl-header {
  border-color: var(--glass-line);
}
.App [class~="border-b"][class~="p-2"][class~="select-none"] h4,
.App .fl-header h4,
.App h4[class~="text-xs"] {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--mute);
}

/* Empty drop targets: dashed and quiet instead of a grey slab */
.App [class~="bg-muted"][class~="border"][class~="grow"] {
  border: 1px dashed var(--glass-line);
  border-radius: 10px;
  background: transparent;
  color: var(--mute);
}

/* Field pills in the lists and shelves */
.App [data-rbd-draggable-id] {
  border-radius: 8px;
}
`

function ensureStyle(host: Element): void {
  const root = host.shadowRoot
  if (!root || root.querySelector(`style[${STYLE_ATTR}]`)) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, '')
  style.textContent = GRAPHIC_WALKER_SHADOW_CSS
  // Last child, so it wins ties against GW's own earlier <style> blocks.
  root.appendChild(style)
}

/**
 * Keeps the app's style block present in the shadow root of whichever
 * element GraphicWalker currently renders directly inside `container`.
 * GW can replace that host element (e.g. on a dataset switch), so this
 * watches for it rather than injecting once. Returns a cleanup function.
 */
export function installGraphicWalkerShadowStyle(container: HTMLElement): () => void {
  let frame = 0
  let attempts = 0

  const apply = () => {
    const host = container.firstElementChild
    if (host?.shadowRoot) {
      ensureStyle(host)
      return
    }
    // The shadow root attaches just after the host element mounts; retry
    // briefly rather than assuming it exists on the first look.
    if (attempts++ < 60) frame = requestAnimationFrame(apply)
  }

  const observer = new MutationObserver(() => {
    attempts = 0
    cancelAnimationFrame(frame)
    apply()
  })
  observer.observe(container, { childList: true })
  apply()

  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
