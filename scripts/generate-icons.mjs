/**
 * Generates the PWA icon set from a single vector-ish description, so the app
 * ships real PNGs without adding an image dependency. Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const BG = [0x0f, 0x12, 0x16]
const BG_EDGE = [0x1a, 0x1e, 0x25]
const BRASS = [0xe2, 0xb4, 0x6a]

/** Shape predicates in a normalised 0..1 box. */
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1
const inRing = (x, y, cx, cy, rOuter, rInner) => {
  const d = Math.hypot(x - cx, y - cy)
  return d <= rOuter && d >= rInner
}

function roundedRect(x, y, x0, y0, x1, y1, r) {
  if (!inRect(x, y, x0, y0, x1, y1)) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return Math.hypot(x - cx, y - cy) <= r || inRect(x, y, x0 + r, y0, x1 - r, y1) || inRect(x, y, x0, y0 + r, x1, y1 - r)
}

/** The "HD" monogram, scaled around the centre so maskable icons keep a safe zone. */
function monogram(x, y, scale) {
  const sx = (x - 0.5) / scale + 0.5
  const sy = (y - 0.5) / scale + 0.5
  const bar = 0.085
  // H
  if (inRect(sx, sy, 0.17, 0.3, 0.17 + bar, 0.7)) return true
  if (inRect(sx, sy, 0.38, 0.3, 0.38 + bar, 0.7)) return true
  if (inRect(sx, sy, 0.17, 0.5 - bar / 2, 0.38 + bar, 0.5 + bar / 2)) return true
  // D
  if (inRect(sx, sy, 0.55, 0.3, 0.55 + bar, 0.7)) return true
  if (sx >= 0.55 + bar && inRing(sx, sy, 0.55 + bar, 0.5, 0.2, 0.2 - bar)) return true
  return false
}

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const samples = 3
  const glyphScale = maskable ? 0.66 : 0.86

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let glyph = 0
      let plate = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (pxi + (sx + 0.5) / samples) / size
          const y = (py + (sy + 0.5) / samples) / size
          if (monogram(x, y, glyphScale)) glyph++
          if (maskable || roundedRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) plate++
        }
      }
      const total = samples * samples
      const g = glyph / total
      const p = plate / total

      // Vertical sheen keeps the plate from looking flat at large sizes.
      const t = py / size
      const base = BG.map((c, i) => Math.round(c + (BG_EDGE[i] - c) * t))
      const rgb = base.map((c, i) => Math.round(c + (BRASS[i] - c) * g))
      const o = (py * size + pxi) * 4
      px[o] = rgb[0]
      px[o + 1] = rgb[1]
      px[o + 2] = rgb[2]
      px[o + 3] = Math.round(255 * Math.min(1, p + g))
    }
  }
  return px
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const targets = [
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  ['public/icons/icon-maskable-512.png', 512, { maskable: true }],
  ['public/icons/apple-touch-icon.png', 180, { maskable: true }],
  ['public/icons/favicon-32.png', 32, {}],
]

for (const [path, size, opts] of targets) {
  writeFileSync(path, png(size, render(size, opts)))
  console.log(`wrote ${path} (${size}px)`)
}
