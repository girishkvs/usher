import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, glyphDistance, roundedRectDistance } from './lib/png.mjs';

/**
 * Generates the extension icons: a rounded indigo tile with the Usher "S",
 * drawn straight into an RGBA buffer so the build needs no image dependency.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '..', 'public', 'assets');
const SIZES = [16, 32, 48, 128];

// Teal rather than indigo: a white mark on blue-violet sits in crowded territory
// (Stripe's #635BFF, and "white glyph on blue" reads as Skype, a Microsoft mark).
const BACKGROUND_TOP = [0x14, 0xb8, 0xa6];
const BACKGROUND_BOTTOM = [0x0d, 0x76, 0x80];
const FOREGROUND = [0xff, 0xff, 0xff];

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const tileHalf = size * 0.46;
  const tileRadius = size * 0.22;
  const samples = size <= 32 ? 4 : 2;
  const step = 1 / samples;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let tileCoverage = 0;
      let glyphCoverage = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px + (sx + 0.5) * step - half;
          const y = py + (sy + 0.5) * step - half;
          if (roundedRectDistance(x, y, tileHalf, tileHalf, tileRadius) <= 0) {
            tileCoverage += 1;
          }
          if (glyphDistance(x, y, size) <= 0) {
            glyphCoverage += 1;
          }
        }
      }
      const total = samples * samples;
      const tileAlpha = tileCoverage / total;
      const glyphAlpha = Math.min(glyphCoverage / total, tileAlpha);

      const gradient = py / (size - 1 || 1);
      const background = BACKGROUND_TOP.map((channel, index) =>
        Math.round(channel + (BACKGROUND_BOTTOM[index] - channel) * gradient),
      );
      const colour = background.map((channel, index) =>
        Math.round(channel + (FOREGROUND[index] - channel) * (glyphAlpha / (tileAlpha || 1))),
      );

      const offset = (py * size + px) * 4;
      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = Math.round(tileAlpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(outputDir, { recursive: true });
for (const size of SIZES) {
  const file = resolve(outputDir, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`icon ${size}x${size} -> ${file}`);
}
