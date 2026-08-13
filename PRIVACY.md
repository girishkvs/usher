# Privacy Policy for Usher

**Last updated: 13 August 2026**

Usher is a browser extension that renders Markdown documents as formatted pages.
It runs entirely inside your browser.

## The short version

Usher does not collect, transmit, sell, or share any data. There is no server,
no analytics, no telemetry, no crash reporting, and no advertising. Nothing you
open is uploaded anywhere.

## What Usher reads

To render a document, Usher reads the text of the page you are viewing when
that page is a Markdown document. That text is converted to HTML in the tab it
is already in and is never sent anywhere.

On every other page, Usher checks the page's structure and content type, finds
it is not a plain-text document, and stops. It does not read the contents of
ordinary web pages.

## What Usher stores

Your settings — theme, layout, rendering options, the per-site "always render"
and "never render" lists, and any custom CSS you enter — are saved with the
browser's own extension storage (`chrome.storage.sync`).

If you are signed in to Chrome or Edge and have extension sync turned on, your
browser syncs those settings between your own devices using your Google or
Microsoft account. That transfer is performed by the browser, not by Usher, and
is governed by your browser vendor's privacy policy. Turning off extension sync
keeps the settings on one device.

Usher stores no document content, no browsing history, and no list of files you
have opened. The scroll position of a rendered document is kept in that tab's
`sessionStorage` and is discarded when the tab closes.

## Network requests Usher makes

Usher contacts no server of its own. It makes exactly two kinds of request, both
to a location you have already navigated to:

1. **A content-type check.** When a plain-text page has no file extension, Usher
   sends a `HEAD` request to that same URL to see whether the server labelled it
   as Markdown. No new destination is contacted.
2. **A reload check for local files.** While a `file://` or `localhost` document
   is open, Usher re-reads that same file so the view updates when you save it.
   You can turn this off in Settings.

Mermaid, KaTeX, syntax highlighting, fonts, and stylesheets are all bundled
inside the extension. Usher loads no code, fonts, or styles from any content
delivery network.

Images and links inside a document are the document's own. If a Markdown file
references a remote image, your browser fetches it exactly as it would on any web
page. Usher does not add or rewrite these.

## Permissions

| Permission | Why Usher needs it |
|---|---|
| `storage` | Save your settings and per-site preferences. |
| `scripting` | Insert the renderer into a tab once that tab is known to hold Markdown. |
| `contextMenus` | Provide the right-click entries for rendering a selection or a page. |
| `declarativeNetRequest` | Apply fixed rules so a `.md` file is displayed instead of downloaded. The rules only relabel content types; they cannot read, log, or redirect your traffic. |
| Access to all sites | A Markdown file can live at any address, so the small detector script has to be able to run anywhere to notice one. It inspects the page's shape, stops on anything that is not a plain-text document, and sends nothing. |
| Access to file URLs (optional) | Render Markdown files stored on your own computer. This is off until you turn it on, and Chrome and Edge require you to enable it by hand. |

## Children

Usher is a document viewer, collects nothing, and is not directed at children.

## Changes

Any change to this policy will be published in this file in the extension's
repository, with an updated date at the top.

## Contact

Questions or concerns: open an issue at
<https://github.com/girishkvs/usher/issues>.
