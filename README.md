# Usher

[![Microsoft Edge Add-ons](https://img.shields.io/badge/Edge%20Add--ons-install-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/aeepoobopfolppmebnhihgogcplnfjhe)

> Renders **Markdown** — from local files, from web pages, or from anything you paste — with **Mermaid** diagrams, syntax highlighting, and a live table of contents. Chrome and Edge, Manifest V3.

Open a `.md` file and Usher takes over the tab. No server, no upload, no round trip: everything renders locally inside the browser.

## Documentation

| Doc | Covers |
|-----|--------|
| [docs/usage.md](docs/usage.md) | Install, enable local files, every setting, keyboard shortcuts, troubleshooting |
| [docs/design.md](docs/design.md) | Architecture, the detection pipeline, why the network rules exist, security model, code map |
| [docs/store-listing.md](docs/store-listing.md) | Listing copy, permission justifications, and the asset checklist for submission |
| [vscode/README.md](vscode/README.md) | The companion VS Code extension: readable wide diagrams and `:::` admonitions |
| [docs/releasing.md](docs/releasing.md) | How a change gets from a git tag into the Edge Add-ons store |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [PRIVACY.md](PRIVACY.md) | What Usher reads, stores, and sends. The short version: nothing leaves your machine |
| [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) | Licences for the 70 bundled open source packages |

## What it does

- **Local files** — `file:///C:/repo/README.md` renders in place, and re-renders automatically when you save the file.
- **Web pages** — anything served as `text/markdown`, `text/plain`, or as a `.md` download. The download is intercepted and shown as a page instead.
- **Anything else** — paste, drop, or open a file in the built-in viewer, or right-click a selection on any page and render just that.
- **Mermaid** — flowcharts, sequence, class, state, ER, gantt, pie, journey. Both ` ```mermaid ` code fences and `:::mermaid` container fences (Azure DevOps wiki, GitLab, Docusaurus). Wide diagrams stay readable: they fit to width down to a floor, then scroll and zoom, with a full-screen view.
- **GitHub Flavored Markdown** — tables, task lists, strikethrough, autolinks, footnotes, definition lists, emoji shortcodes, `[!NOTE]` style alerts, and `:::note` / `:::warning` container admonitions.
- **Syntax highlighting** — 36 languages, with aliases for the ones people actually write in day to day (`powershell`, `pwsh`, `csharp`, `kql`, `tsql`, `yaml`, `csproj`).
- **Reading tools** — sticky table of contents with scroll spy, reading progress bar, word count, heading anchors, per-block copy buttons, raw-source toggle, and a print stylesheet that drops the chrome.
- **Six themes** — auto, light, dark, GitHub, sepia, high contrast — plus content width, font size, and custom CSS.

## Install

From the store, on Edge:

**[Get Usher from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/aeepoobopfolppmebnhihgogcplnfjhe)**

Chrome is supported by the same package but is not published to the Chrome Web
Store, so on Chrome use the unpacked build below.

After installing, open the extension's details page and turn on **Allow access
to file URLs**. Without it, `file://` documents are invisible to every
extension, so local `.md` files will not render.

## Install (unpacked)

```powershell
npm install
npm run build
```

Then in **Edge** (`edge://extensions`) or **Chrome** (`chrome://extensions`):

1. Turn on **Developer mode**.
2. **Load unpacked** → pick the `dist` folder in this repository.
3. Open the extension's details page and turn on **Allow access to file URLs**. Without this, `file://` documents are invisible to every extension.

`npm run pack` produces `artifacts/usher-<version>.zip` for Edge Add-ons. Chrome
Web Store submission is deferred because it charges a registration fee; the same
package works there unchanged if that ever changes.

## Commands

| Command | What it does |
|---------|--------------|
| `npm run build` | Production bundle into `dist/`, then regenerate the third-party notices |
| `npm run build:dev` | Unminified bundle with inline source maps |
| `npm run watch` | Rebuild on change; reload the extension to pick up changes |
| `npm test` | Unit tests for detection, slugs, front matter, and the markdown pipeline |
| `npm run test:e2e` | Browser suite: loads `dist/` into Chrome or Edge and runs 47 checks |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run licenses` | Fail if any dependency falls outside the permissive allowlist |
| `npm run verify` | Typecheck, test, licence gate, build, and bundle checks |
| `npm run icons` | Regenerate the PNG icons |
| `npm run screenshots` | Regenerate the store screenshots, promo tiles, and logo into `build/store/` |
| `npm run pack` | Zip `dist/` into `artifacts/` |

## Keyboard

| Key | Action |
|-----|--------|
| `t` | Toggle the table of contents |
| `r` | Toggle rendered / raw source |
| `Shift` + `P` | Print |
| `Alt` + `Shift` + `M` | Toggle rendering on the current page |
| `Alt` + `Shift` + `V` | Open the viewer |

## Notes

- **Everything is local.** No network calls, no analytics, no remote code. Mermaid and KaTeX are bundled and loaded from disk, only when a document actually needs them.
- **Pages stay cheap.** The script that runs on every page is 5 KB and exits in about a millisecond on anything that is not markdown. The 400 KB renderer and the 3.3 MB Mermaid bundle are injected on demand.
- **Output is sanitised.** Markdown may contain raw HTML, so everything is run through DOMPurify before it reaches the DOM. Scripts, event handlers, and `foreignObject` do not survive.
