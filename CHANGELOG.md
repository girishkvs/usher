# Changelog

All notable changes to Usher are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-08-19

### Added

- **Jump to bottom.** There was no way to reach the end of a long document
  without dragging the scrollbar.

### Changed

- The scroll controls moved out of the header and now float against the right
  edge, next to the scrollbar. Back to top used to sit at the end of the header
  among the buttons that act on the document rather than move through it. The
  pair hides itself when the document is too short to scroll, and whichever arrow
  would do nothing at the current position fades back.

## [1.1.0] — 2026-08-16

### Fixed

- The table of contents could disappear for the rest of a session. Rendering a
  document with fewer than two headings switched the sidebar off permanently, so
  it stayed hidden even after a document with plenty of headings was opened.
  Too few headings is now treated as a presentation decision and no longer
  overwrites what the reader asked for.

### Changed

- The `:::` container scanner moved to `src/core/container-scan.ts` so the
  browser extension and the VS Code extension resolve block boundaries with one
  implementation instead of two.
- The renderer accepts a callback for storing the chosen theme, so hosts without
  `chrome.storage` can persist it their own way. Browser behaviour is unchanged.
- The version is no longer duplicated in `public/manifest.json`; the build
  injects it from `package.json` and fails if the field reappears.

## [1.0.0] — 2026-08-13

First public release.

### Added

- **Local files.** `file://` Markdown documents render in place, and re-render
  when the file changes on disk, keeping the scroll position.
- **Web pages.** Markdown served as `text/markdown`, as plain text, or as a
  forced download is displayed rather than downloaded. A URL with no file
  extension is resolved with a single `HEAD` request.
- **Viewer.** A built-in page that accepts a file picker, drag and drop, a paste,
  or typing directly, with a live preview. Reachable from the popup, the context
  menu, and `Alt` + `Shift` + `V`.
- **Mermaid.** Flowchart, sequence, class, state, ER, gantt, pie, and journey
  diagrams, from both ` ```mermaid ` code fences and `:::mermaid` container
  fences. Wide diagrams fit to width down to a readability floor, then scroll and
  zoom, with a full-screen view and SVG or PNG export.
- **Markdown.** GitHub Flavored Markdown, footnotes, definition lists, emoji
  shortcodes, `[!NOTE]` alerts, `:::note` container admonitions, YAML front
  matter shown as a table, and optional KaTeX math.
- **Reading.** Table of contents with scroll spy, reading progress, word count,
  heading anchors, per-block copy buttons, a raw source toggle, and a print
  stylesheet.
- **Appearance.** Six themes, adjustable content width and font size, custom CSS,
  and per-site always/never rules.

### Security

- Markdown is sanitised with DOMPurify before it reaches the DOM. Scripts, event
  handlers, `javascript:` and `data:` document URLs, and every form control other
  than task-list checkboxes are removed. Relative links and image sources are
  preserved.
- Mermaid labels are rendered as SVG text, so `foreignObject` never has to be
  allowed through the sanitiser.
- The network rules that relabel Markdown responses are scoped to responses that
  already declare a Markdown or plain-text content type, so an HTML file named
  `.md` cannot be turned into a rendered page.
- `viewer.html` is not web-accessible and does not accept a URL parameter, so no
  page can use the extension's host permissions to fetch on its own behalf.

### Notes

- Requires Chrome or Edge 128 or newer: the network rules use response-header
  conditions.
- Nothing is collected or transmitted. See [PRIVACY.md](PRIVACY.md).
