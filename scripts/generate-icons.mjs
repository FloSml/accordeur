// Generates PWA icons (tuning fork glyph) as raw PNGs, no external deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- SDF helpers ---
function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const x = Math.abs(px - cx) - hw + r;
  const y = Math.abs(py - cy) - hh + r;
  const ax = Math.max(x, 0), ay = Math.max(y, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(x, y), 0) - r;
}

function mix(a, b, t) { return a + (b - a) * t; }

function renderIcon(size, { padding = 0.14, maskableBg = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size;
  const bgHW = s / 2 - s * padding * 0.3;
  const cx = s / 2, cy = s / 2;
  const cornerR = s * 0.22;

  // Tuning fork geometry, centered, scaled to fit inside padded area
  const contentHalf = s / 2 - s * padding;
  const scale = (contentHalf * 2) / 100; // design space 100x100
  const toPx = (dx, dy) => [cx + (dx - 50) * scale, cy + (dy - 50) * scale];

  const prongR = 6.5 * scale;
  const stemR = 6.5 * scale;
  const [p1ax, p1ay] = toPx(32, 8);
  const [p1bx, p1by] = toPx(32, 52);
  const [p2ax, p2ay] = toPx(68, 8);
  const [p2bx, p2by] = toPx(68, 52);
  const [baseax, baseay] = toPx(50, 52);
  const [basebx, basebY] = toPx(50, 92);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x + 0.5, py = y + 0.5;
      const dBg = sdRoundedBox(px, py, cx, cy, bgHW, bgHW, cornerR);
      let bgAlpha = Math.min(1, Math.max(0, 0.5 - dBg));
      const t = Math.max(0, Math.min(1, (py) / s));
      const bgR = mix(0x0d, 0x0a, t);
      const bgG = mix(0x9b, 0x66, t);
      const bgB = mix(0x8a, 0xd9, t);

      let d = sdCapsule(px, py, p1ax, p1ay, p1bx, p1by, prongR);
      d = Math.min(d, sdCapsule(px, py, p2ax, p2ay, p2bx, p2by, prongR));
      d = Math.min(d, sdCapsule(px, py, baseax, baseay, basebx, basebY, stemR));
      const fgAlpha = Math.min(1, Math.max(0, 0.5 - d));

      let r, g, b, a;
      if (maskableBg) {
        // Full-bleed background for maskable icons (no rounded corner cut, safe-zone padding handles it)
        r = bgR; g = bgG; b = bgB; a = 255;
        r = mix(r, 255, fgAlpha);
        g = mix(g, 255, fgAlpha);
        b = mix(b, 255, fgAlpha);
      } else {
        // Non-premultiplied alpha: keep the true shape color in RGB and let
        // the alpha channel alone carry edge coverage, otherwise blending
        // both darkens semi-transparent edge pixels into a dark halo.
        r = bgR; g = bgG; b = bgB; a = 255 * bgAlpha;
        r = mix(r, 255, fgAlpha);
        g = mix(g, 255, fgAlpha);
        b = mix(b, 255, fgAlpha);
      }

      const i = (y * s + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a);
    }
  }
  return buf;
}

// Filenames carry a version suffix so that fixing the artwork also changes
// the URL — otherwise browsers/OSes that cached the old bitmap by URL (a
// common PWA install-icon pitfall) would keep showing it indefinitely.
const targets = [
  { name: 'icon-192-v2.png', size: 192, opts: { padding: 0.16 } },
  { name: 'icon-512-v2.png', size: 512, opts: { padding: 0.16 } },
  { name: 'maskable-192-v2.png', size: 192, opts: { padding: 0.24, maskableBg: true } },
  { name: 'maskable-512-v2.png', size: 512, opts: { padding: 0.24, maskableBg: true } },
  // iOS renders transparent PNG areas as black on the home screen icon and
  // applies its own corner rounding, so this one must be fully opaque and
  // edge-to-edge like the maskable icons, not a rounded shape with alpha.
  { name: 'apple-touch-icon-v3.png', size: 180, opts: { padding: 0.16, maskableBg: true } },
  { name: 'favicon-32-v2.png', size: 32, opts: { padding: 0.1 } },
  { name: 'favicon-16-v2.png', size: 16, opts: { padding: 0.05 } },
];

for (const t of targets) {
  const rgba = renderIcon(t.size, t.opts);
  const png = encodePNG(t.size, t.size, rgba);
  writeFileSync(new URL(`../public/icons/${t.name}`, import.meta.url), png);
  console.log('wrote', t.name);
}
