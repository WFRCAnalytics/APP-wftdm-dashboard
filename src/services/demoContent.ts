// 070-demo-build-flag: whether the demo content (public/demo-*) exists and is read. Set by vite.config.ts: on for the dev server and for
// `vite build --mode demo` (npm run build:pages, npm run build:demo), off for every other build, so a deployment is neutral by default.
// Unit tests (vitest) have no such define and read it as off.
export const DEMO_CONTENT: boolean = import.meta.env.VITE_WFTDM_DEMO === '1'
