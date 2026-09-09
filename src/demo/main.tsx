import React from 'react'
import ReactDOM from 'react-dom/client'

import '@/styles/tokens.css'
// 033-shadcn-default-theme: replaces DesignTokenDemo.tsx's own retired
// font-loading mount-effect call (T024, that module deleted) — this demo
// entry point now loads real fonts the same side-effecting-import way the
// real app's src/main.tsx does.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { DesignTokenDemo } from '@/demo/DesignTokenDemo'

// Bootstrap for demo.html — the separate Vite entry point kept out of
// index.html/main.ts's boot sequence (002-design-tokens, FR-009/SC-005).
const root = document.getElementById('demo-root')
if (!root) {
  throw new Error('demo.html is missing its #demo-root mount element')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DesignTokenDemo />
  </React.StrictMode>,
)
