import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitDiagram, naturalWidthOf } from '../src/preview/fit.ts';

describe('fitDiagram', () => {
  it('leaves a diagram narrower than the column alone', () => {
    const result = fitDiagram(400, 1044, 0.55);
    assert.equal(result.width, 400);
    assert.equal(result.scrolls, false);
    assert.equal(result.scale, 1);
  });

  it('shrinks to the column when the result is still readable', () => {
    const result = fitDiagram(1200, 1044, 0.55);
    assert.equal(result.width, 1044);
    assert.equal(result.scrolls, false);
    assert.ok(result.scale > 0.55);
  });

  it('stops shrinking at the floor and scrolls instead', () => {
    // The real numbers measured from the native preview: a 2263px flowchart squeezed
    // into a 1044px column lands at 0.46x, well under the readability floor.
    const result = fitDiagram(2263, 1044, 0.55);
    assert.equal(result.scrolls, true);
    assert.equal(result.scale, 0.55);
    assert.equal(Math.round(result.width), Math.round(2263 * 0.55));
    assert.ok(result.width > 1044, 'must overflow the column so it can scroll');
  });

  it('treats the boundary case as fitting', () => {
    const result = fitDiagram(1000, 550, 0.55);
    assert.equal(result.scrolls, false);
    assert.equal(result.width, 550);
  });

  it('never shrinks when the floor is 1', () => {
    const result = fitDiagram(2263, 1044, 1);
    assert.equal(result.scrolls, true);
    assert.equal(result.width, 2263);
  });

  it('clamps a nonsensical floor rather than exploding', () => {
    // A floor of 0 clamps to 0.1, so shrinking to 0.5 is permitted and it still fits.
    const permissive = fitDiagram(2000, 1000, 0);
    assert.equal(permissive.scale, 0.5);
    assert.equal(permissive.scrolls, false);
    assert.equal(fitDiagram(2000, 1000, 42).width, 2000);
    assert.equal(fitDiagram(2000, 1000, Number.NaN).scale, 0.55);
  });

  it('is a no-op when sizes are unknown', () => {
    assert.deepEqual(fitDiagram(0, 1044, 0.55), { width: 0, scrolls: false, scale: 1 });
    assert.deepEqual(fitDiagram(800, 0, 0.55), { width: 800, scrolls: false, scale: 1 });
  });

  it('is idempotent, because the preview re-renders on every keystroke', () => {
    const first = fitDiagram(2263, 1044, 0.55);
    const second = fitDiagram(2263, 1044, 0.55);
    assert.deepEqual(first, second);
  });
});

describe('naturalWidthOf', () => {
  it('prefers the viewBox', () => {
    assert.equal(naturalWidthOf(2263, 900, 1044), 2263);
  });

  it('falls back to the width attribute, then the layout box', () => {
    assert.equal(naturalWidthOf(0, 900, 1044), 900);
    assert.equal(naturalWidthOf(0, 0, 1044), 1044);
    assert.equal(naturalWidthOf(0, 0, 0), 0);
  });
});
