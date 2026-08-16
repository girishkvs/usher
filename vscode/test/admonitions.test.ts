import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import MarkdownItFactory from 'markdown-it';
import { admonitionsPlugin, configPlugin } from '../src/admonitions.ts';

const md = MarkdownItFactory({ html: false }).use(admonitionsPlugin);

describe('admonition containers', () => {
  it('renders a note callout', () => {
    const html = md.render(':::note\nBe careful.\n:::\n');
    assert.match(html, /class="usher-admonition usher-admonition-note"/);
    assert.match(html, /class="usher-admonition-title">\s*Note</);
    assert.match(html, /<p>Be careful\.<\/p>/);
  });

  it('accepts a space after the colons', () => {
    assert.match(md.render('::: tip\nDo this.\n:::\n'), /usher-admonition-tip/);
  });

  it('uses trailing text as the title', () => {
    const html = md.render(':::warning Watch out\nBody.\n:::\n');
    assert.match(html, /class="usher-admonition-title">\s*Watch out</);
  });

  it('maps aliases onto a shared colour', () => {
    assert.match(md.render(':::info\nx\n:::\n'), /usher-admonition-note/);
    assert.match(md.render(':::danger\nx\n:::\n'), /usher-admonition-caution/);
    assert.match(md.render(':::error\nx\n:::\n'), /usher-admonition-caution/);
  });

  it('parses the body as markdown', () => {
    const html = md.render(':::note\n- one\n- two\n:::\n');
    assert.match(html, /<ul>/);
    assert.match(html, /<li>one<\/li>/);
  });

  it('supports nesting without closing early', () => {
    const html = md.render('::::warning Outer\n:::note\nInner.\n:::\nStill outer.\n::::\n');
    assert.match(html, /usher-admonition-warning/);
    assert.match(html, /usher-admonition-note/);
    assert.match(html, /Still outer\./);
  });

  it('auto-closes an unterminated block', () => {
    const html = md.render(':::note\nNo closing marker.\n');
    assert.match(html, /usher-admonition-note/);
    assert.match(html, /No closing marker\./);
  });
});

describe('containers the built-in renderers own', () => {
  for (const name of ['mermaid', 'mmd', 'math', 'katex', 'latex', 'tex']) {
    it(`leaves :::${name} untouched`, () => {
      const html = md.render(`:::${name}\ngraph TD;\n  A-->B;\n:::\n`);
      assert.doesNotMatch(html, /usher-admonition/, `Usher must not claim :::${name}`);
    });
  }

  it('leaves unknown container names untouched', () => {
    const html = md.render(':::video\nhttps://example.com/v\n:::\n');
    assert.doesNotMatch(html, /usher-admonition/);
  });

  it('ignores fewer than three colons', () => {
    assert.doesNotMatch(md.render('::note\nx\n::\n'), /usher-admonition/);
  });
});

describe('configPlugin', () => {
  it('prefixes the document with the settings the webview needs', () => {
    const configured = MarkdownItFactory();
    configPlugin(configured, () => ({ fitToWidth: true, minimumScale: 0.55 }));
    const html = configured.render('# Title\n');
    assert.match(html, /<span id="usher-config" aria-hidden="true" data-config="/);
    assert.match(html, /&quot;minimumScale&quot;:0\.55/);
    assert.match(html, /<h1>Title<\/h1>/);
  });

  it('escapes the payload so it cannot break out of the attribute', () => {
    const configured = MarkdownItFactory();
    configPlugin(configured, () => ({ evil: '"><script>alert(1)</script>' }));
    const html = configured.render('x\n');
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('survives VS Code rendering through md.renderer.render directly', () => {
    // VS Code parses and renders in two steps, so a wrapper on md.render alone never
    // runs and the webview silently falls back to defaults.
    const configured = MarkdownItFactory();
    configPlugin(configured, () => ({ minimumScale: 0.55 }));
    const tokens = configured.parse('# Title\n', {});
    const html = configured.renderer.render(tokens, configured.options, {});
    assert.match(html, /<span id="usher-config"/);
  });
});
