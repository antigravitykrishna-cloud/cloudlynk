#!/usr/bin/env node
/**
 * Generates Cloudlynk brand assets using only Node.js built-ins (no canvas/sharp).
 * Run: node assets/generate-placeholders.js
 *
 * Outputs:
 *   icon.png          1024×1024   App icon (Play Store + iOS)
 *   adaptive-icon.png 1024×1024   Android adaptive foreground layer
 *   splash.png        1284×2778   Splash screen (portrait)
 *   favicon.png         32×32     Web favicon
 */

'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Colours ──────────────────────────────────────────────────
const BG  = [0x0d, 0x11, 0x17, 0xff]; // #0d1117
const RED = [0xe5, 0x09, 0x14, 0xff]; // #E50914
const WHT = [0xff, 0xff, 0xff, 0xff]; // #ffffff
const CLR = [0x00, 0x00, 0x00, 0x00]; // transparent

// ── PNG encoder ──────────────────────────────────────────────
function crc32(buf) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crc32._t[i] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crc32._t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
}

function encodePNG(w, h, pixels) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    row[0] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = 1 + x * 4;
      row[dst]   = pixels[src];
      row[dst+1] = pixels[src+1];
      row[dst+2] = pixels[src+2];
      row[dst+3] = pixels[src+3];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing primitives ────────────────────────────────────────
function px(pixels, w, x, y, col) {
  if (x < 0 || y < 0 || x >= w || y * w + x >= pixels.length / 4) return;
  const i = (y * w + x) * 4;
  pixels[i]=col[0]; pixels[i+1]=col[1]; pixels[i+2]=col[2]; pixels[i+3]=col[3];
}

function fillAll(pixels, col) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i]=col[0]; pixels[i+1]=col[1]; pixels[i+2]=col[2]; pixels[i+3]=col[3];
  }
}

function fillCircle(pixels, w, h, cx, cy, r, col) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx-r)), x1 = Math.min(w-1, Math.ceil(cx+r));
  const y0 = Math.max(0, Math.floor(cy-r)), y1 = Math.min(h-1, Math.ceil(cy+r));
  for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) {
    const dx=x-cx, dy=y-cy;
    if (dx*dx+dy*dy <= r2) px(pixels, w, x, y, col);
  }
}

function fillRoundRect(pixels, w, h, rx, ry, rw, rh, radius, col) {
  for (let y=ry; y<ry+rh; y++) for (let x=rx; x<rx+rw; x++) {
    const inH = x >= rx+radius && x <= rx+rw-radius;
    const inV = y >= ry+radius && y <= ry+rh-radius;
    if (inH || inV) { px(pixels, w, x, y, col); continue; }
    const corners = [[rx+radius,ry+radius],[rx+rw-radius,ry+radius],
                     [rx+radius,ry+rh-radius],[rx+rw-radius,ry+rh-radius]];
    for (const [cx,cy] of corners) {
      const dx=x-cx, dy=y-cy;
      if (dx*dx+dy*dy <= radius*radius) { px(pixels, w, x, y, col); break; }
    }
  }
}

function fillTriangle(pixels, imgW, imgH, ax, ay, bx, by, cx, cy, col) {
  const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx)));
  const maxX=Math.min(imgW-1,Math.ceil(Math.max(ax,bx,cx)));
  const minY=Math.max(0,Math.floor(Math.min(ay,by,cy)));
  const maxY=Math.min(imgH-1,Math.ceil(Math.max(ay,by,cy)));
  for (let y=minY; y<=maxY; y++) for (let x=minX; x<=maxX; x++) {
    const d1=(x-bx)*(ay-by)-(ax-bx)*(y-by);
    const d2=(x-cx)*(by-cy)-(bx-cx)*(y-cy);
    const d3=(x-ax)*(cy-ay)-(cx-ax)*(y-ay);
    const neg=(d1<0)||(d2<0)||(d3<0), pos=(d1>0)||(d2>0)||(d3>0);
    if (!(neg&&pos)) px(pixels, imgW, x, y, col);
  }
}

// ── Asset recipes ─────────────────────────────────────────────
function drawIcon(w, h, transparent) {
  const pixels = new Uint8Array(w * h * 4);
  fillAll(pixels, transparent ? CLR : BG);
  const cx=w/2, cy=h/2;
  const sq=Math.round(w*0.72), rad=Math.round(sq*0.22);
  const sx=Math.round(cx-sq/2), sy=Math.round(cy-sq/2);
  fillRoundRect(pixels, w, h, sx, sy, sq, sq, rad, RED);
  const tw=sq*0.38, th=sq*0.46, tx=cx-tw*0.28;
  fillTriangle(pixels, w, h,
    Math.round(tx-tw*0.5), Math.round(cy-th*0.5),
    Math.round(tx-tw*0.5), Math.round(cy+th*0.5),
    Math.round(tx+tw*0.72), Math.round(cy), WHT);
  return pixels;
}

function drawSplash(w, h) {
  const pixels = new Uint8Array(w * h * 4);
  fillAll(pixels, BG);
  const cx=w/2, cy=Math.round(h*0.43);
  // subtle glow
  fillCircle(pixels, w, h, cx, cy, Math.round(w*0.22), [0x5a,0x04,0x08,0x55]);
  const r=Math.round(w*0.16);
  fillCircle(pixels, w, h, cx, cy, r, RED);
  const tw=r*0.85, th=r, tx=cx-tw*0.15;
  fillTriangle(pixels, w, h,
    Math.round(tx-tw*0.5), Math.round(cy-th*0.5),
    Math.round(tx-tw*0.5), Math.round(cy+th*0.5),
    Math.round(tx+tw*0.7), Math.round(cy), WHT);
  return pixels;
}

function drawFavicon(w, h) {
  const pixels = new Uint8Array(w * h * 4);
  fillAll(pixels, BG);
  const cx=w/2, cy=h/2;
  fillCircle(pixels, w, h, cx, cy, Math.round(w*0.44), RED);
  const tw=w*0.28, th=w*0.32, tx=cx-tw*0.1;
  fillTriangle(pixels, w, h,
    Math.round(tx-tw*0.5), Math.round(cy-th*0.5),
    Math.round(tx-tw*0.5), Math.round(cy+th*0.5),
    Math.round(tx+tw*0.7), Math.round(cy), WHT);
  return pixels;
}

// ── Run ──────────────────────────────────────────────────────
const tasks = [
  { name: 'icon.png',          w: 1024, h: 1024, fn: (w,h) => drawIcon(w, h, false) },
  { name: 'adaptive-icon.png', w: 1024, h: 1024, fn: (w,h) => drawIcon(w, h, true)  },
  { name: 'splash.png',        w: 1284, h: 2778, fn: drawSplash },
  { name: 'favicon.png',       w: 32,   h: 32,   fn: drawFavicon },
];

for (const { name, w, h, fn } of tasks) {
  const pixels = fn(w, h);
  const png    = encodePNG(w, h, pixels);
  fs.writeFileSync(path.join(__dirname, name), png);
  console.log(`  ${name.padEnd(22)} ${String(w).padStart(4)}x${h}  ${(png.length/1024).toFixed(0)} KB`);
}
console.log('\nDone. Replace with designer assets before public launch.');
