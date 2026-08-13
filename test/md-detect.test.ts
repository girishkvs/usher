import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extensionOf,
  hasMarkdownExtension,
  isMarkdownContentType,
  isPlainTextContentType,
  looksLikeMarkdown,
  needsContentTypeProbe,
  shouldAutoRender,
  siteKeyFor,
  type DetectionInput,
} from '../src/shared/md-detect.ts';

function input(overrides: Partial<DetectionInput> = {}): DetectionInput {
  return {
    url: 'https://example.com/README.md',
    contentType: 'text/plain',
    isPlainTextDocument: true,
    text: '# Title\n\nSome text.',
    mode: 'extension',
    enabled: true,
    siteAllowList: [],
    siteDenyList: [],
    ...overrides,
  };
}

describe('extensionOf', () => {
  it('reads the extension without query or fragment', () => {
    assert.equal(extensionOf('https://example.com/docs/readme.MD?raw=1#top'), 'md');
    assert.equal(extensionOf('file:///C:/repo/notes.markdown'), 'markdown');
  });

  it('returns empty for paths without an extension', () => {
    assert.equal(extensionOf('https://example.com/docs/readme'), '');
    assert.equal(extensionOf('https://example.com/'), '');
  });

  it('does not treat a dotfile as an extension', () => {
    assert.equal(extensionOf('file:///repo/.gitignore'), '');
  });
});

describe('hasMarkdownExtension', () => {
  it('accepts every supported markdown extension', () => {
    for (const url of ['a.md', 'a.markdown', 'a.mdown', 'a.mkd', 'a.mmd', 'a.qmd']) {
      assert.equal(hasMarkdownExtension(`file:///${url}`), true, url);
    }
  });

  it('rejects non-markdown files', () => {
    for (const url of ['a.txt', 'a.html', 'a.json', 'a.mdx']) {
      assert.equal(hasMarkdownExtension(`file:///${url}`), false, url);
    }
  });
});

describe('isPlainTextContentType', () => {
  it('ignores charset parameters and casing', () => {
    assert.equal(isPlainTextContentType('TEXT/Plain; charset=UTF-8'), true);
    assert.equal(isPlainTextContentType('text/markdown'), true);
    assert.equal(isPlainTextContentType('application/octet-stream'), true);
  });

  it('rejects html', () => {
    assert.equal(isPlainTextContentType('text/html; charset=utf-8'), false);
  });
});

describe('looksLikeMarkdown', () => {
  it('detects documents with several markdown signals', () => {
    assert.equal(looksLikeMarkdown('# Heading\n\n- one\n- two\n'), true);
    assert.equal(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'), true);
  });

  it('accepts a single strong signal', () => {
    assert.equal(looksLikeMarkdown('# Title\n\nSome text.'), true);
    assert.equal(looksLikeMarkdown('```js\nconst a = 1;\n```'), true);
  });

  it('needs more than one weak signal', () => {
    assert.equal(looksLikeMarkdown('- a stray bullet in an otherwise plain log line'), false);
    assert.equal(looksLikeMarkdown('- one\n- two'), false);
  });

  it('rejects prose and structured data', () => {
    assert.equal(looksLikeMarkdown('Just a sentence of ordinary text without structure.'), false);
    assert.equal(looksLikeMarkdown(''), false);
    assert.equal(looksLikeMarkdown('   \n  \n'), false);
  });
});

describe('siteKeyFor', () => {
  it('collapses all local files to one key', () => {
    assert.equal(siteKeyFor('file:///C:/repo/a.md'), 'file://');
    assert.equal(siteKeyFor('file:///home/user/b.md'), 'file://');
  });

  it('uses the origin for web pages', () => {
    assert.equal(siteKeyFor('https://example.com/docs/a.md?x=1'), 'https://example.com');
  });
});

describe('shouldAutoRender', () => {
  it('renders markdown files served as plain text', () => {
    assert.deepEqual(shouldAutoRender(input()), { render: true, reason: 'markdown-extension' });
  });

  it('honours the global switch', () => {
    assert.deepEqual(shouldAutoRender(input({ enabled: false })), { render: false, reason: 'disabled' });
  });

  it('honours the deny list ahead of everything else', () => {
    const result = shouldAutoRender(input({ siteDenyList: ['https://example.com'] }));
    assert.deepEqual(result, { render: false, reason: 'site-denied' });
  });

  it('skips rendered HTML pages', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/page', contentType: 'text/html', isPlainTextDocument: false }),
    );
    assert.deepEqual(result, { render: false, reason: 'not-plain-text' });
  });

  it('skips unsupported schemes', () => {
    const result = shouldAutoRender(input({ url: 'chrome://extensions/' }));
    assert.deepEqual(result, { render: false, reason: 'unsupported-scheme' });
  });

  it('does not guess in extension mode', () => {
    const result = shouldAutoRender(input({ url: 'https://example.com/notes' }));
    assert.deepEqual(result, { render: false, reason: 'no-markdown-signal' });
  });

  it('guesses in smart mode when the content looks like markdown', () => {
    const result = shouldAutoRender(input({ url: 'https://example.com/notes', mode: 'smart' }));
    assert.deepEqual(result, { render: true, reason: 'markdown-heuristic' });
  });

  it('still declines in smart mode for ordinary text', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/notes', mode: 'smart', text: 'plain sentence only' }),
    );
    assert.deepEqual(result, { render: false, reason: 'no-markdown-signal' });
  });

  it('renders allow-listed origins even without a markdown extension', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/notes', mode: 'never', siteAllowList: ['https://example.com'] }),
    );
    assert.deepEqual(result, { render: true, reason: 'site-allowed' });
  });

  it('never guesses in manual mode', () => {
    const result = shouldAutoRender(input({ url: 'https://example.com/notes', mode: 'never' }));
    assert.deepEqual(result, { render: false, reason: 'mode-never' });
  });

  it('manual mode also suppresses markdown file extensions', () => {
    const result = shouldAutoRender(input({ url: 'https://example.com/README.md', mode: 'never' }));
    assert.deepEqual(result, { render: false, reason: 'mode-never' });
  });

  it('manual mode also suppresses a declared markdown content type', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/api/doc', mode: 'never', serverDeclaredMarkdown: true }),
    );
    assert.deepEqual(result, { render: false, reason: 'mode-never' });
  });

  it('an allow-listed site still renders in manual mode', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/README.md', mode: 'never', siteAllowList: ['https://example.com'] }),
    );
    assert.deepEqual(result, { render: true, reason: 'markdown-extension' });
  });

  it('renders local markdown files', () => {
    const result = shouldAutoRender(input({ url: 'file:///C:/repo/docs/design.md' }));
    assert.deepEqual(result, { render: true, reason: 'markdown-extension' });
  });

  it('renders when the server declared a markdown content type', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/api/doc', mode: 'extension', serverDeclaredMarkdown: true }),
    );
    assert.deepEqual(result, { render: true, reason: 'markdown-content-type' });
  });

  it('still respects the deny list for server-declared markdown', () => {
    const result = shouldAutoRender(
      input({ url: 'https://example.com/api/doc', serverDeclaredMarkdown: true, siteDenyList: ['https://example.com'] }),
    );
    assert.deepEqual(result, { render: false, reason: 'site-denied' });
  });
});

describe('isMarkdownContentType', () => {
  it('recognises the markdown media types', () => {
    assert.equal(isMarkdownContentType('text/markdown; charset=utf-8'), true);
    assert.equal(isMarkdownContentType('TEXT/X-MARKDOWN'), true);
    assert.equal(isMarkdownContentType('application/markdown'), true);
  });

  it('rejects plain text and html', () => {
    assert.equal(isMarkdownContentType('text/plain'), false);
    assert.equal(isMarkdownContentType('text/html'), false);
  });
});

describe('needsContentTypeProbe', () => {
  it('probes an extensionless plain-text page', () => {
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/api/doc' })), true);
  });

  it('does not probe when the extension already answers the question', () => {
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/README.md' })), false);
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/app.log' })), false);
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/data.json' })), false);
  });

  it('does not probe local files or unsupported schemes', () => {
    assert.equal(needsContentTypeProbe(input({ url: 'file:///C:/notes/scratch' })), false);
    assert.equal(needsContentTypeProbe(input({ url: 'chrome://version' })), false);
  });

  it('does not probe when the decision is already settled', () => {
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/doc', enabled: false })), false);
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/doc', mode: 'never' })), false);
    assert.equal(
      needsContentTypeProbe(input({ url: 'https://example.com/doc', siteAllowList: ['https://example.com'] })),
      false,
    );
    assert.equal(
      needsContentTypeProbe(input({ url: 'https://example.com/doc', siteDenyList: ['https://example.com'] })),
      false,
    );
    assert.equal(needsContentTypeProbe(input({ url: 'https://example.com/doc', serverDeclaredMarkdown: true })), false);
  });

  it('does not probe rendered html pages', () => {
    assert.equal(
      needsContentTypeProbe(input({ url: 'https://example.com/doc', contentType: 'text/html', isPlainTextDocument: false })),
      false,
    );
  });
});
