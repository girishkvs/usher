// Minimal PNG encoder. Kept dependency-free so the build needs no image library.
import { deflateSync } from 'node:zlib';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encodes a raw RGBA buffer (width * height * 4 bytes) as a PNG. */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Signed distance to the Usher mark: two rounded nodes joined by a diagonal edge,
 * i.e. the smallest readable diagram. Shared by the icon and the promotional tiles
 * so the mark is identical at every size. A letterform was deliberately avoided --
 * a plain letter on a coloured tile is crowded trade dress, and a flow glyph says
 * what the product does. Coordinates are relative to the centre; `size` sets scale.
 */
export function glyphDistance(x, y, size) {
  const nodeHalf = size * 0.145;
  const nodeRadius = size * 0.05;
  const edgeThickness = size * 0.06;
  const offset = size * 0.205;

  const first = { x: -offset, y: offset };
  const second = { x: offset, y: -offset };

  const segmentDistance = (a, b) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lengthSquared = vx * vx + vy * vy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / lengthSquared));
    return Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
  };

  return Math.min(
    roundedRectDistance(x - first.x, y - first.y, nodeHalf, nodeHalf, nodeRadius),
    roundedRectDistance(x - second.x, y - second.y, nodeHalf, nodeHalf, nodeRadius),
    segmentDistance(first, second) - edgeThickness / 2,
  );
}

/** Signed distance from a point to a rounded rectangle, used for anti-aliased edges. */
export function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x) - (halfWidth - radius);
  const dy = Math.abs(y) - (halfHeight - radius);
  const outsideX = Math.max(dx, 0);
  const outsideY = Math.max(dy, 0);
  const outside = Math.sqrt(outsideX * outsideX + outsideY * outsideY);
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}
