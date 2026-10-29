// 070-demo-build-flag: serves a NORMAL build (no demo) with no deployment folder, for tests/integration/firstRun.spec.ts.
// Builds into test-results/firstrun-dist, removes whatever deployment content `public/` had (config, scenarios, observed), then serves it.
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve('test-results/firstrun-dist')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const build = spawnSync(npx, ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (build.status !== 0) process.exit(build.status ?? 1)
for (const name of ['dashboard-config', 'scenarios', 'observed', 'geometry']) rmSync(resolve(out, name), { recursive: true, force: true })

const preview = spawn(npx, ['vite', 'preview', '--outDir', out, '--port', '5196', '--strictPort', '--host', '127.0.0.1'], { stdio: 'inherit', shell: process.platform === 'win32' })
preview.on('exit', (code) => process.exit(code ?? 0))
