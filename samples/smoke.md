---
title: Usher smoke test
author: girishkvs
tags: [markdown, mermaid, test]
version: 0.1.0
---

# Usher smoke test

This file exercises everything the extension is supposed to render. Open it from
`file://` after enabling **Allow access to file URLs**.

> [!NOTE]
> Alerts should render as coloured callouts with an icon and a bold title.

> [!WARNING]
> This one should be amber.

## Mermaid

```mermaid
flowchart LR
    A[Local .md file] --> D{Usher}
    B[Web page] --> D
    C[Paste or drop] --> D
    D --> E[Rendered HTML]
    D --> F[Mermaid diagrams]
```

```mermaid
sequenceDiagram
    participant P as Page
    participant W as Worker
    P->>W: render request
    W-->>P: inject renderer
```

```mermaid
pie title Where the markdown comes from
    "Local files" : 45
    "Web pages" : 35
    "Pasted" : 20
```

## Code

```powershell
$files = Get-ChildItem -Path . -Filter *.md -Recurse
foreach ($file in $files) {
    Write-Host "Found $($file.FullName)"
}
```

```csharp
public sealed class Renderer
{
    public string Render(string markdown) => Pipeline.Run(markdown);
}
```

```sql
SELECT TOP 10 CapacityId, State
FROM dbo.Capacities
WHERE State = 'Active';
```

Inline `code` and a [link](https://example.com) and **bold** and *italic* and ~~struck~~.

## Table

| Feature | Status | Notes |
| --- | --- | --- |
| GFM tables | Done | Scrollable wrapper |
| Task lists | Done | Checkboxes render |
| Footnotes | Done | Linked both ways |

## Lists

- [x] Render local files
- [x] Render web pages
- [ ] Something not done yet

1. First
2. Second
   - Nested
   - Items

Term
:   A definition list entry.

## Footnotes

Here is a claim that needs a source[^1].

[^1]: The supporting note.

## Escaping

<script>window.__pwned = true;</script>

<img src="x" onerror="window.__pwned = true;">

<div class="kept">Plain HTML should survive sanitising.</div>
