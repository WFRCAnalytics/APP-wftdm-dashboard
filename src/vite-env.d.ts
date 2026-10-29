/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 070-demo-build-flag: '1' when the demo content is on (dev server, `--mode demo` builds); set by vite.config.ts. */
  readonly VITE_WFTDM_DEMO?: string
}
