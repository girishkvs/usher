import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Slugger, slugify } from '../src/shared/slug.ts';
import { formatFrontMatterValue, splitFrontMatter } from '../src/shared/frontmatter.ts';

describe('slugify', () => {
  it('matches GitHub anchor style', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
    assert.equal(slugify('What is `Usher`?'), 'what-is-usher');
    assert.equal(slugify('C# and .NET: a guide'), 'c-and-net-a-guide');
    assert.equal(slugify('  Trim   me  '), 'trim-me');
  });

  it('keeps unicode letters', () => {
    assert.equal(slugify('Überschrift'), 'überschrift');
  });
});

describe('Slugger', () => {
  it('de-duplicates repeated headings', () => {
    const slugger = new Slugger();
    assert.equal(slugger.slug('Setup'), 'setup');
    assert.equal(slugger.slug('Setup'), 'setup-1');
    assert.equal(slugger.slug('Setup'), 'setup-2');
  });

  it('falls back to a stable name for empty headings', () => {
    const slugger = new Slugger();
    assert.equal(slugger.slug('***'), 'section');
    assert.equal(slugger.slug('!!!'), 'section-1');
  });
});

describe('splitFrontMatter', () => {
  it('parses YAML front matter and strips it from the body', () => {
    const result = splitFrontMatter('---\ntitle: Design\ntags:\n  - a\n  - b\n---\n# Heading\n');
    assert.deepEqual(result.data, { title: 'Design', tags: ['a', 'b'] });
    assert.equal(result.body, '# Heading\n');
    assert.equal(result.error, null);
  });

  it('leaves documents without front matter untouched', () => {
    const source = '# Heading\n\nBody text.';
    const result = splitFrontMatter(source);
    assert.equal(result.data, null);
    assert.equal(result.body, source);
  });

  it('does not treat a mid-document rule as front matter', () => {
    const source = '# Heading\n\n---\n\nMore.';
    assert.equal(splitFrontMatter(source).body, source);
  });

  it('strips TOML front matter without parsing it', () => {
    const result = splitFrontMatter('+++\ntitle = "x"\n+++\nBody');
    assert.equal(result.data, null);
    assert.equal(result.body, 'Body');
    assert.equal(result.raw, 'title = "x"');
  });

  it('reports malformed YAML instead of throwing', () => {
    const result = splitFrontMatter('---\na: [1, 2\n---\nBody');
    assert.equal(result.data, null);
    assert.equal(result.body, 'Body');
    assert.ok(result.error);
  });

  it('handles a UTF-8 byte order mark', () => {
    const result = splitFrontMatter('\ufeff---\ntitle: X\n---\nBody');
    assert.deepEqual(result.data, { title: 'X' });
  });

  it('ignores front matter that is not a mapping', () => {
    const result = splitFrontMatter('---\n- one\n- two\n---\nBody');
    assert.equal(result.data, null);
    assert.equal(result.body, 'Body');
  });
});

describe('formatFrontMatterValue', () => {
  it('flattens arrays and objects to one line', () => {
    assert.equal(formatFrontMatterValue(['a', 'b']), 'a, b');
    assert.equal(formatFrontMatterValue({ owner: 'docs-team', team: 'platform' }), 'owner: docs-team, team: platform');
    assert.equal(formatFrontMatterValue(null), '');
    assert.equal(formatFrontMatterValue(42), '42');
  });
});
