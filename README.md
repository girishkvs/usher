# Usher

[![Microsoft Edge Add-ons](https://img.shields.io/badge/Edge%20Add--ons-install-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/aeepoobopfolppmebnhihgogcplnfjhe)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-install-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=girishkvs.usher)

> Renders **Markdown** — from local files, from web pages, or from anything you paste — with **Mermaid** diagrams, syntax highlighting, and a live table of contents.

Two extensions share one renderer:

| | Where | Status |
|---|---|---|
| **Browser extension** | Chrome and Edge, Manifest V3 | [published to Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/aeepoobopfolppmebnhihgogcplnfjhe) |
| **[VS Code extension](vscode/)** | A Markdown preview panel inside the editor | [published to the Marketplace](https://marketplace.visualstudio.com/items?itemName=girishkvs.usher) |

The rendering pipeline, themes, and diagram handling live in
[`src/core`](src/core) and are compiled into both, so the two cannot drift apart.
Everything renders locally: no server, no upload, no round trip.

## Documentation

| Doc | Covers |
|-----|--------|
| [docs/usage.md](docs/usage.md) | Install, enable local files, every setting, keyboard shortcuts, troubleshooting |
| [docs/design.md](docs/design.md) | Architecture, the detection pipeline, why the network rules exist, security model, code map |
| [docs/store-listing.md](docs/store-listing.md) | Listing copy, permission justifications, and the asset checklist for submission |
| [vscode/README.md](vscode/README.md) | The VS Code extension: a preview panel with a table of contents, reading themes and readable diagrams |
| [docs/releasing.md](docs/releasing.md) | How a change gets from a git tag into the Edge Add-ons store |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [PRIVACY.md](PRIVACY.md) | What Usher reads, stores, and sends. The short version: nothing leaves your machine |
| [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) | Licences for the 70 bundled open source packages |

## What the browser extension does

- **Local files** — `file:///C:/repo/README.md` renders in place, and re-renders automatically when you save the file.
- **Web pages** — anything served as `text/markdown`, `text/plain`, or as a `.md` download. The download is intercepted and shown as a page instead.
- **Anything else** — paste, drop, or open a file in the built-in viewer, or right-click a selection on any page and render just that.
- **Mermaid** — flowcharts, sequence, class, state, ER, gantt, pie, journey. Both ` ```mermaid ` code fences and `:::mermaid` container fences (Azure DevOps wiki, GitLab, Docusaurus). Wide diagrams stay readable: they fit to width down to a floor, then scroll and zoom, with a full-screen view.
- **GitHub Flavored Markdown** — tables, task lists, strikethrough, autolinks, footnotes, definition lists, emoji shortcodes, `[!NOTE]` style alerts, and `:::note` / `:::warning` container admonitions.
- **Syntax highlighting** — 36 languages, with aliases for the ones people actually write in day to day (`powershell`, `pwsh`, `csharp`, `kql`, `tsql`, `yaml`, `csproj`).
- **Reading tools** — sticky table of contents with scroll spy, reading progress bar, word count, heading anchors, per-block copy buttons, raw-source toggle, and a print stylesheet that drops the chrome.
- **Six themes** — auto, light, dark, GitHub, sepia, high contrast — plus content width, font size, and custom CSS.

## Install the browser extension

From the store, on Edge:

**[Get Usher from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/aeepoobopfolppmebnhihgogcplnfjhe)**

Chrome is supported by the same package but is not published to the Chrome Web
Store, so on Chrome use the unpacked build below.

After installing, open the extension's details page and turn on **Allow access
to file URLs**. Without it, `file://` documents are invisible to every
extension, so local `.md` files will not render.

### Unpacked, for development

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

## The VS Code extension

**[Get Usher from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=girishkvs.usher)**

A Markdown preview panel that runs the same renderer inside the editor:
`Ctrl+Shift+U`, or **Usher: Open Preview to the Side**. It brings the table of
contents, the reading themes, word count, source toggle, copy as rich HTML and
print with it, and keeps wide Mermaid diagrams readable.

It also fixes two things in VS Code's own preview without replacing it: wide
diagrams stop shrinking past legibility, and `:::note` style callouts render
instead of appearing as literal marker lines. It never adds a second Mermaid
renderer there, because two renderers in one preview leave the diagrams blank.

```powershell
npm install            # the renderer is shared, so install the root first
cd vscode
npm install
npm run verify         # typecheck, unit tests, build
npm run package        # vscode/usher-<version>.vsix
```

Details in [vscode/README.md](vscode/README.md).

## Commands

Run from the repository root; these build and test the browser extension. The VS
Code extension has its own set, listed above.

| Command | What it does |
|---------|--------------|
| `npm run build` | Production bundle into `dist/`, then regenerate the third-party notices |
| `npm run build:dev` | Unminified bundle with inline source maps |
| `npm run watch` | Rebuild on change; reload the extension to pick up changes |
| `npm test` | Unit tests for detection, slugs, front matter, and the markdown pipeline |
| `npm run test:e2e` | Browser suite: loads `dist/` into Chrome or Edge and runs 52 checks |
| `npm run bench` | Time the markdown pipeline across document sizes |
| `npm run bench:browser` | Time the whole render, including sanitising, highlighting and Mermaid |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run licenses` | Fail if any dependency falls outside the permissive allowlist |
| `npm run verify` | Typecheck, test, licence gate, build, and bundle checks |
| `npm run icons` | Regenerate the PNG icons |
| `npm run screenshots` | Regenerate the store screenshots, promo tiles, and logo into `build/store/` |
| `npm run pack` | Zip `dist/` into `artifacts/` |

## Keyboard

In the browser extension. The VS Code panel opens with `Ctrl+Shift+U`.

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
- **Long documents scale linearly**, so there is no chunked rendering to go wrong. Measured with `npm run bench` and `npm run bench:browser` on a mid-range laptop:

  | Words | Markdown pipeline | Whole render, with diagrams |
  |---|---|---|
  | 2,000 | 2 ms | 0.55 s |
  | 8,000 | 8 ms | 1.1 s |
  | 16,000 | 26 ms | 1.5 s |
  | 32,000 | 57 ms | 2.6 s |
  | 62,000 | 122 ms | — |

  Cost per word is flat across that range. Parsing is a small fraction of the total;
  the rest is sanitising, highlighting, building the DOM, and Mermaid.
- **Output is sanitised.** Markdown may contain raw HTML, so everything is run through DOMPurify before it reaches the DOM. Scripts, event handlers, and `foreignObject` do not survive.
