# Contract: the demo flag

## Scripts

| Command | Flag | Output | Contains demo |
|---|---|---|---|
| `npm run dev` | on | dev server | yes (as today) |
| `npm run build` | off | `dist/` (feeds `make build` and the packages) | no |
| `npm run build:demo` (new) | on | `dist/` | yes |
| `npm run build:pages` | on | `docs/` | yes (unchanged output) |
| `npm run preview`, `preview:pages` | whatever the build had | | |
| `npm run check -- <folder>` | not used | report | n/a |

To see the demo: run `npm run dev`, or `npm run build:demo` and `npm run preview`.

## What a normal build contains

`dist/` has the app (`index.html`, `assets/`, `asset-cache-serviceworker.js`, the basemap catalogue) and whatever else is in `public/` apart from `demo-*`. No `demo-dashboard-config`, `demo-geometry`, `demo-scenarios` or `demo-synthetic`.

## What a viewer sees

| Situation (normal build) | Screen |
|---|---|
| deployment folder with a site file and pages | the deployer's dashboard, nothing else |
| no site file | first-run screen: "No site configuration was found", the folder looked in, how to add `dashboard-config.yaml`, how to try the demo |
| site file, no pages | first-run screen: "The site lists no pages" |
| site file with only a title | the deployer's title, neutral defaults for everything else |

No request to a `demo-*` address is made. No uncaught error is logged.

## Compatibility

A deployer who relied on a demo value as a fallback (an unset logo, colour or map key) now gets the neutral default; this is intended (no backward compatibility, CONFIGURATION.md section 7).
