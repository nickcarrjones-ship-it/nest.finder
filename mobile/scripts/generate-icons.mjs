/**
 * Regenerates the app icons from the Maloca 4b mark.
 *
 *   npm run icons
 *
 * Why this exists rather than an SVG + a converter: the macOS tools on hand
 * (qlmanage/sips) flatten SVG transparency onto white, which silently
 * shipped the Android adaptive foreground as a white square and the
 * monochrome layer as white-on-white. This draws the geometry analytically
 * and writes RGBA pixels straight into a PNG, so the alpha is real. No
 * dependencies — zlib is built in.
 *
 * Colours come from theme/index.ts (Node strips the TypeScript), so the
 * icons follow the app palette automatically. The GEOMETRY, however, is
 * duplicated from components/MalocaLogo.tsx — that one draws the same mark
 * out of React Native Views. Change the mark in one and change it here too;
 * the doc-unit numbers below are the shared source of truth.
 *
 * Mark geometry, 100-unit viewBox (Claude Design "Maloca app logo
 * concepts", Round 04 / 4b "the uneven span"): big arch centred (39,55)
 * r19, small arch (69,55) r11, both stroked 12 and cut at the baseline;
 * long leg x14-26 down to y71; short leg x74-86 down to y63 (half the
 * drop — the second stem that makes it read as a lowercase m); teal
 * counter fill (69,55) r5.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { colors } from '../theme/index.ts';

const BIG = { cx: 39, cy: 55, inner: 13, outer: 25 };
const SMALL = { cx: 69, cy: 55, inner: 5, outer: 17 };
const LEG_LONG = { x0: 14, x1: 26, y0: 55, y1: 71 };
const LEG_SHORT = { x0: 74, x1: 86, y0: 55, y1: 63 };
const COUNTER = { cx: 69, cy: 55, r: 5 };

/** Fraction of the tile the mark occupies on the Android adaptive layers —
 *  keeps it inside the safe zone the launcher may mask or animate. */
const SAFE_ZONE = 0.75;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function classify(x, y) {
  const inRect = (r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const inArch = (a) => {
    if (y > a.cy) return false; // arches are cut flat at the baseline
    const d = Math.hypot(x - a.cx, y - a.cy);
    return d >= a.inner && d <= a.outer;
  };
  if (inArch(BIG) || inArch(SMALL) || inRect(LEG_LONG) || inRect(LEG_SHORT)) return 'mark';
  if (y <= COUNTER.cy && Math.hypot(x - COUNTER.cx, y - COUNTER.cy) <= COUNTER.r) return 'counter';
  return null;
}

/** Renders straight-alpha RGBA pixels, 4x4 supersampled for smooth curves. */
function render({ size, scale = 1, bg = null, mark, counter = null }) {
  const SS = 4;
  const markRGB = hex(mark);
  const counterRGB = counter ? hex(counter) : null;
  const bgRGB = bg ? hex(bg) : null;
  const buf = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // subsample centre -> doc units, then undo the centre-scale
          const dx = ((px + (sx + 0.5) / SS) / size) * 100;
          const dy = ((py + (sy + 0.5) / SS) / size) * 100;
          const x = 50 + (dx - 50) / scale;
          const y = 50 + (dy - 50) / scale;
          const hit = classify(x, y);
          let c = null;
          if (hit === 'mark') c = markRGB;
          else if (hit === 'counter' && counterRGB) c = counterRGB;
          else if (bgRGB) c = bgRGB;
          if (c) { r += c[0]; g += c[1]; b += c[2]; hits++; }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const cov = hits / n;
      // averaged over covered subsamples only, so edges keep their colour
      buf[i] = hits ? Math.round(r / hits) : 0;
      buf[i + 1] = hits ? Math.round(g / hits) : 0;
      buf[i + 2] = hits ? Math.round(b / hits) : 0;
      buf[i + 3] = Math.round(cov * 255);
    }
  }
  return buf;
}

const CRC_TABLE = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodePng(pixels, size) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { ink, cream, teal } = colors;

const ASSETS = [
  // Store/home-screen icon and web favicon: opaque dark tile, light mark —
  // the design doc's own favicon colourway.
  { file: 'icon.png', size: 1024, bg: ink, mark: cream, counter: teal },
  { file: 'favicon.png', size: 48, bg: ink, mark: cream, counter: teal },
  // Android adaptive layers. The foreground MUST keep its alpha: the
  // launcher composites it over the background and masks the pair.
  { file: 'android-icon-foreground.png', size: 512, scale: SAFE_ZONE, mark: cream, counter: teal },
  { file: 'android-icon-background.png', size: 512, bg: ink, mark: ink },
  // Themed-icon layer: a silhouette the launcher tints itself, so only the
  // alpha channel matters and the fill colour is arbitrary.
  { file: 'android-icon-monochrome.png', size: 432, scale: SAFE_ZONE, mark: '#000000' },
];

for (const asset of ASSETS) {
  const out = new URL(`../assets/${asset.file}`, import.meta.url);
  writeFileSync(out, encodePng(render(asset), asset.size));
  console.log(`${asset.file.padEnd(30)} ${asset.size}px  ${asset.bg ? 'opaque' : 'transparent'}`);
}
