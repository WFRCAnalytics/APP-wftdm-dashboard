# Data model: Demo content only when asked for

## The demo flag

| Where it is decided | Value |
|---|---|
| `vite` (dev server, any Playwright project) | on |
| `vite build --mode demo` (`build:pages`, `build:demo`) | on |
| `vite build` (`npm run build`, the package bundle) | off |
| `vitest` | off (the constant is undefined, read as off) |

Read through one constant, `DEMO_CONTENT` (`src/services/demoContent.ts`). Nothing else in the app or in `src/config` knows about the mode.

## What it gates

| Thing | Flag off | Flag on |
|---|---|---|
| Files in the build output | no `demo-*` folder | all four, as today |
| Site settings | the deployment's `dashboard-config/` only | deployment over demo, per setting (as today) |
| Pages | the deployment's pages | deployment's, then the demo's |
| Runs | `observed/`, `scenarios/` | plus `demo-scenarios/` |
| Zone boundaries | `geometry/` only | `geometry/`, then `demo-geometry/` |
| Rail file | `geometry/<file>` | `demo-geometry/<file>` |
| Boot skeleton tabs | the deployment's | deployment's then demo's |

## First-run state

Input: whether the deployment's site file was found, how many page files were loaded, the folder searched. Output (or none):

| State | When | Shown |
|---|---|---|
| `no_site` | site file absent and no pages loaded | "No site configuration was found" + folder searched + next steps |
| `no_pages` | site file present, `pages` empty or none loadable | "The site lists no pages" + the file + next step |
| `pages_unreadable` | pages are listed but none loaded | "None of the listed pages could be loaded" + the console hint |
| none | at least one page loaded | the normal app |

The existing problems note (`configProblems`) is unchanged and still lists unreadable files, wrong values and the like.

## Validation rules

- With the flag off, no request URL contains `demo-` (checked in the browser by the first-run spec).
- With the flag on, behaviour is identical to today (the existing suites).
