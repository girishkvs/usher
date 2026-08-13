# Store listing

Everything needed to submit Usher to **Microsoft Edge Add-ons**. Submission to the
Chrome Web Store is deferred: it charges a one-off registration fee, and Edge Add-ons
does not. The package is a plain MV3 extension, so the same `dist/` works in both if
that changes later.

Source and privacy policy are published on GitHub, which also supplies the public
privacy policy URL the store form requires.

| Field | Value |
|---|---|
| Publisher | girishkvs |
| Repository | `https://github.com/girishkvs/usher` |
| Privacy policy URL | `https://github.com/girishkvs/usher/blob/main/PRIVACY.md` |
| Support URL | `https://github.com/girishkvs/usher/issues` |
| Licence | MIT |
| Package | `artifacts/usher-<version>.zip` from `npm run pack` |

## Assets

`npm run screenshots` regenerates all of these into `build/store/`.

| Asset | Size | File | Store |
|---|---|---|---|
| Screenshots (up to 10, at least 1) | 1366 x 768 | `build/store/edge-screenshot-1..5.png` | Edge |
| Store logo | 300 x 300 | `build/store/logo-300.png` | Edge |
| Small promo tile | 440 x 280 | `build/store/promo-440x280.png` | Edge, optional |
| Large promo tile | 1400 x 560 | `build/store/promo-1400x560.png` | Edge, optional |
| Screenshots | 1280 x 800 | `build/store/screenshot-1..5.png` | Chrome, if ever submitted |
| Extension icon | 128 x 128 | `dist/assets/icon-128.png` | Both |

Screenshot captions, in order:

1. Any Markdown file becomes a readable page, with a table of contents that follows you.
2. Mermaid diagrams render inline. Zoom, pan, expand, and export.
3. Local files render straight from disk and reload when you save.
4. Paste, drop, or type Markdown in the built-in viewer.
5. Six themes, adjustable width, and your own CSS if you want it.

## Single purpose

> Usher renders Markdown documents as formatted pages. It converts Markdown from
> local files, web URLs, and pasted text into readable HTML with diagrams, syntax
> highlighting, and a table of contents.

## Short description (132 characters max)

> Renders Markdown from local files and web pages, with Mermaid diagrams, syntax highlighting, and a table of contents.

117 characters.

## Detailed description

> Open a Markdown file and read it, instead of staring at raw text or watching it
> download.
>
> Usher turns any Markdown document into a proper page: headings, tables, task
> lists, footnotes, callouts, syntax-highlighted code, and Mermaid diagrams. It
> works on files stored on your computer, on Markdown served from the web, and on
> anything you paste or drop into the built-in viewer.
>
> WHAT IT HANDLES
>
> - Local files. Point the browser at a .md file on disk and it renders in place.
>   Edit the file in your editor and the view updates when you save.
> - Web pages. Markdown served as text/markdown, as plain text, or as a forced
>   download is displayed instead of downloaded.
> - Anything else. Paste, drop, or open a file in the viewer, or right-click a
>   selection on any page and render just that.
>
> MERMAID DIAGRAMS
>
> Flowcharts, sequence, class, state, entity relationship, gantt, pie, and journey
> diagrams render inline. Both ```mermaid code fences and :::mermaid container
> fences are supported, so documents from Azure DevOps wikis, GitLab, and
> Docusaurus work as written. Wide diagrams stay readable: they fit to the column,
> then scroll and zoom, and expand to the full window. Export any diagram as SVG
> or PNG.
>
> BUILT FOR READING
>
> - A table of contents that highlights where you are as you scroll.
> - Reading progress, word count, and estimated reading time.
> - Six themes: match system, light, dark, GitHub, sepia, and high contrast.
> - Adjustable content width and font size, plus your own custom CSS.
> - Copy buttons on code blocks and anchor links on headings.
> - Flip to the raw source with one key, and print or save as PDF cleanly.
> - 36 languages highlighted, including PowerShell, SQL, C#, TypeScript, and YAML.
> - GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks,
>   footnotes, definition lists, emoji shortcodes, and [!NOTE] style alerts.
> - YAML front matter shown as a table.
> - Optional math rendering with KaTeX.
>
> PRIVACY
>
> Usher collects nothing. There is no server, no analytics, and no telemetry.
> Documents are rendered inside your browser and never uploaded. Mermaid, KaTeX,
> and every stylesheet are bundled in the extension, so nothing is fetched from a
> content delivery network. Your settings are stored by the browser and synced
> only if you have extension sync switched on.
>
> Usher is open source under the MIT licence.
>
> NOTE ON LOCAL FILES
>
> Chrome and Edge hide file:// pages from every extension until you allow it. To
> read Markdown files from your own computer, open the extension's details page
> and turn on "Allow access to file URLs". Usher's popup links you straight
> there.

## Category

Productivity. Secondary: Developer Tools.

## Permission justifications

Submitted per permission. Keep these exact.

**storage**

> Saves the user's own settings: theme, layout, rendering options, the per-site
> "always render" and "never render" lists, and any custom CSS they enter. No
> document content and no browsing data is stored.

**scripting**

> The renderer is a large bundle, and Mermaid is larger still. Running that on
> every page would slow down all browsing, so a 5 KB detector runs first and the
> renderer is inserted with chrome.scripting only after a tab is confirmed to hold
> a Markdown document. Mermaid is inserted only when a document actually contains
> a diagram.

**contextMenus**

> Adds three entries: "Render selection as Markdown", "Render this page as
> Markdown", and "Open Usher viewer". These are the manual entry points for
> documents that are not detected automatically.

**declarativeNetRequest**

> Browsers download a file served as text/markdown instead of displaying it, so a
> Markdown link produces a download rather than a readable page. Three static
> rules relabel such responses as text/plain for top-level documents only, so the
> browser shows the file and the extension can render it. The rules are shipped in
> the package and cannot be changed at runtime. They only modify Content-Type and
> Content-Disposition response headers, and are limited to responses that already
> declare a Markdown or plain-text content type. The extension does not read,
> record, block, or redirect any request.

**host permissions (all sites)**

> A Markdown file can be served from any address, and there is no way to know
> which sites a user keeps documentation on. The detector script therefore has to
> be able to run anywhere in order to notice one. It examines only the document's
> content type and structure, stops immediately on anything that is not a
> plain-text document, and transmits nothing. The extension contacts no server of
> its own.

**Remote code**

> No. All code is bundled in the package. Mermaid, KaTeX, markdown-it,
> highlight.js, and DOMPurify are compiled into the extension's own files. Nothing
> is loaded from a content delivery network or evaluated from a string.

## Data usage disclosures

Answer "No" to every collection category. The declarations to tick:

- Not being sold to third parties.
- Not being used or transferred for purposes unrelated to the item's single purpose.
- Not being used or transferred to determine creditworthiness or for lending purposes.

Privacy policy URL: point at the raw or rendered `PRIVACY.md` in the repository.

## Before submitting

1. `npm run verify` is green.
2. `npm run test:e2e` is green on Edge.
3. `npm run pack` produces `artifacts/usher-<version>.zip`.
4. `THIRD-PARTY-NOTICES.txt` is present inside the zip.
5. The GitHub repository is public, so the privacy policy URL resolves.
6. Version in `package.json` matches the release.
7. The extension name does not collide with an existing Edge Add-ons listing.
