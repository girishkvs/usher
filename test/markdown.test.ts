import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMarkdown, MATH_BLOCK_CLASS, MATH_INLINE_CLASS, MERMAID_CLASS } from '../src/core/markdown.ts';
import { highlightCode } from '../src/core/highlight.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/settings.ts';

function render(source: string, overrides: Partial<Settings> = {}): string {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return createMarkdown({ settings, highlight: highlightCode }).render(source);
}

describe('mermaid fences', () => {
  it('emits a pending block with the source kept as text', () => {
    const html = render('```mermaid\ngraph TD;\n  A-->B;\n```');
    assert.match(html, new RegExp(`<pre class="${MERMAID_CLASS}" data-usher-pending="1">`));
    assert.match(html, /graph TD;/);
    assert.doesNotMatch(html, /class="language-mermaid"/);
  });

  it('accepts the mmd alias', () => {
    assert.match(render('```mmd\ngraph TD;\n```'), new RegExp(MERMAID_CLASS));
  });

  it('escapes html inside a diagram', () => {
    const html = render('```mermaid\ngraph TD;\n  A["<img onerror=x>"]-->B;\n```');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  });
});

describe('code fences', () => {
  it('highlights a known language and labels it', () => {
    const html = render('```powershell\nGet-ChildItem -Path .\n```');
    assert.match(html, /data-language="powershell"/);
    assert.match(html, /class="hljs-built_in"|class="hljs-keyword"|hljs-/);
  });

  it('falls back to escaped text for unknown languages', () => {
    const html = render('```notalanguage\n<script>alert(1)</script>\n```');
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('maps kusto to the sql grammar', () => {
    assert.notEqual(highlightCode('Table | take 5', 'kusto'), null);
  });
});

describe('github alerts', () => {
  it('converts a note blockquote into a callout', () => {
    const html = render('> [!NOTE]\n> Useful information.');
    assert.match(html, /class="usher-alert usher-alert-note"/);
    assert.match(html, /class="usher-alert-title" data-kind="note"/);
    assert.match(html, /Useful information\./);
    assert.doesNotMatch(html, /\[!NOTE\]/);
  });

  it('supports every alert kind', () => {
    for (const kind of ['TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      const html = render(`> [!${kind}]\n> Body`);
      assert.match(html, new RegExp(`usher-alert-${kind.toLowerCase()}`), kind);
    }
  });

  it('leaves unknown markers alone', () => {
    const html = render('> [!SOMETHING]\n> Body');
    assert.doesNotMatch(html, /usher-alert/);
    assert.match(html, /\[!SOMETHING\]/);
  });
});

describe('container fences', () => {
  it('renders a :::mermaid block as a diagram', () => {
    const html = render(':::mermaid\nflowchart LR\n    A["One"] --> B["Two"];\n:::');
    assert.match(html, new RegExp(`<pre class="${MERMAID_CLASS}" data-usher-pending="1">`));
    assert.match(html, /flowchart LR/);
    assert.doesNotMatch(html, /:::/);
  });

  it('handles a space after the colons', () => {
    assert.match(render('::: mermaid\ngraph TD;\n:::'), new RegExp(MERMAID_CLASS));
  });

  it('auto-closes an unterminated container at the end of the document', () => {
    const html = render(':::mermaid\ngraph TD;\n  A-->B;');
    assert.match(html, new RegExp(MERMAID_CLASS));
    assert.match(html, /A--&gt;B;/);
  });

  it('keeps content that follows the closing fence separate', () => {
    const html = render(':::mermaid\ngraph TD;\n:::\n\n## After\n');
    assert.match(html, /<h2 id="after">After<\/h2>/);
  });

  it('maps admonition names onto alerts and parses the body as markdown', () => {
    const html = render(':::warning\nBe **careful** here.\n:::');
    assert.match(html, /class="usher-alert usher-alert-warning"/);
    assert.match(html, /<strong>careful<\/strong>/);
  });

  it('uses the trailing text as the admonition title', () => {
    const html = render(':::note Read this first\nBody.\n:::');
    assert.match(html, /Read this first/);
  });

  it('falls back to a plain container for unknown names', () => {
    const html = render(':::sidebar\nSome text.\n:::');
    assert.match(html, /class="usher-container usher-container-sidebar"/);
    assert.match(html, /<p>Some text\.<\/p>/);
  });

  it('supports nesting without closing early', () => {
    const html = render(':::note\nOuter start.\n\n::::tip\nInner.\n::::\n\nOuter end.\n:::');
    assert.match(html, /usher-alert-note/);
    assert.match(html, /usher-alert-tip/);
    assert.match(html, /Outer end\./);
  });

  it('supports the conventional longer-outer nesting', () => {
    const html = render('::::note\nOuter start.\n\n:::tip\nInner.\n:::\n\nOuter end.\n::::\n\n## After\n');
    assert.match(html, /usher-alert-note/);
    assert.match(html, /usher-alert-tip/);
    assert.match(html, /Outer end\./);
    assert.match(html, /<h2 id="after">After<\/h2>/);
    assert.doesNotMatch(html, /:::/);
  });

  it('does not swallow text after a nested container closes', () => {
    const html = render('::::note\n:::tip\nInner.\n:::\n::::\n\nPlain paragraph.\n');
    assert.match(html, /<p>Plain paragraph\.<\/p>/);
  });

  it('escapes html inside a container diagram', () => {
    const html = render(':::mermaid\ngraph TD;\n  A["<img onerror=x>"];\n:::');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  });

  it('leaves a lone colon run alone', () => {
    const html = render('Some text ::: with colons.');
    assert.doesNotMatch(html, /usher-container/);
  });
});

describe('gfm features', () => {
  it('wraps tables for horizontal scrolling', () => {
    const html = render('| a | b |\n| --- | --- |\n| 1 | 2 |');
    assert.match(html, /<div class="usher-table-wrap"><table>/);
    assert.match(html, /<\/table><\/div>/);
  });

  it('renders task lists with checkboxes', () => {
    const html = render('- [x] done\n- [ ] todo');
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked/);
  });

  it('adds heading ids that match github anchors', () => {
    const html = render('## What is `Usher`?');
    assert.match(html, /id="what-is-usher"/);
  });

  it('renders footnotes', () => {
    const html = render('Text[^1]\n\n[^1]: The note.');
    assert.match(html, /footnote-ref/);
    assert.match(html, /The note\./);
  });

  it('renders definition lists', () => {
    const html = render('Term\n:   Definition');
    assert.match(html, /<dt>Term<\/dt>/);
    assert.match(html, /<dd>Definition<\/dd>/);
  });

  it('converts emoji shortcodes when enabled', () => {
    assert.match(render(':tada: ship it'), /🎉/);
    assert.match(render(':tada: ship it', { emoji: false }), /:tada:/);
  });
});

describe('math', () => {
  it('is off unless enabled', () => {
    const html = render('The cost is $5 and $10.');
    assert.doesNotMatch(html, new RegExp(MATH_INLINE_CLASS));
  });

  it('marks inline and block math for lazy KaTeX rendering', () => {
    const html = render('Inline $E = mc^2$ and block:\n\n$$\n\\int_0^1 x\\,dx\n$$\n', { math: true });
    assert.match(html, new RegExp(`<code class="${MATH_INLINE_CLASS}">E = mc\\^2</code>`));
    assert.match(html, new RegExp(`<div class="${MATH_BLOCK_CLASS}">`));
    assert.match(html, /\\int_0\^1/);
  });

  it('ignores a lone dollar sign', () => {
    const html = render('It costs $5 today.', { math: true });
    assert.doesNotMatch(html, new RegExp(MATH_INLINE_CLASS));
  });
});

describe('inline html', () => {
  it('passes raw html through for the sanitiser to handle', () => {
    const html = render('<div class="custom">kept</div>');
    assert.match(html, /<div class="custom">kept<\/div>/);
  });
});
