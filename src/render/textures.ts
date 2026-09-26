import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

/**
 * 手続き生成テクスチャ（外部ファイルなし）。
 * 後で CC0 の実写テクスチャ（Poly Haven など）に差し替える場合は materials.ts の
 * `TextureSource` だけ入れ替えればよい。ここはあくまで「差し替えるまでの仮の絵」。
 */

export const FONT_SANS = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
export const FONT_SERIF = "'Hiragino Mincho ProN','Noto Serif JP','Yu Mincho',serif";

/** 決定的な乱数（見た目を毎回そろえる）。 */
export const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const makeCanvas = (w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
};

export const finishTexture = (
  tex: CanvasTexture,
  opts: { color?: boolean; repeat?: boolean; anisotropy?: number },
): CanvasTexture => {
  tex.colorSpace = opts.color ? SRGBColorSpace : NoColorSpace;
  if (opts.repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/** 端をまたぐ描画（タイルしても継ぎ目が出ない）。 */
const wrapped = (size: number, x: number, y: number, r: number, draw: (ox: number, oy: number) => void): void => {
  const xs = [0];
  const ys = [0];
  if (x < r) xs.push(size);
  if (x > size - r) xs.push(-size);
  if (y < r) ys.push(size);
  if (y > size - r) ys.push(-size);
  for (const ox of xs) for (const oy of ys) draw(ox, oy);
};

/**
 * 紙・厚紙の繊維（グレー、バンプ用・タイル可）。
 * 中間グレー 0.5 が基準で、明暗が凹凸になる。
 */
export const makeFiberTexture = (size = 512, seed = 3, anisotropy = 8): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(size, size);
  const R = seeded(seed);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  // ゆるい濃淡
  for (let i = 0; i < 70; i++) {
    const x = R() * size;
    const y = R() * size;
    const r = 30 + R() * 90;
    wrapped(size, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = 0.05 + R() * 0.05;
      const c = R() < 0.5 ? '0,0,0' : '255,255,255';
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  // 繊維
  const nFiber = Math.round((size * size) / 90);
  for (let i = 0; i < nFiber; i++) {
    const x = R() * size;
    const y = R() * size;
    const len = 6 + R() * 26;
    const ang = R() * Math.PI * 2;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    const light = R() < 0.5;
    const a = 0.05 + R() * 0.12;
    wrapped(size, x, y, len, (ox, oy) => {
      ctx.strokeStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.lineWidth = 0.6 + R() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + dx * 0.5 + (R() - 0.5) * 4, y + oy + dy * 0.5 + (R() - 0.5) * 4, x + ox + dx, y + oy + dy);
      ctx.stroke();
    });
  }
  // 粒
  const nDot = Math.round((size * size) / 40);
  for (let i = 0; i < nDot; i++) {
    ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(R() * size, R() * size, 1, 1);
  }
  return finishTexture(new CanvasTexture(canvas), { repeat: true, anisotropy });
};

/**
 * 印刷紙の色ムラ（タイル可）。base の色にゆるい濃淡と繊維を乗せる。
 */
export const makePaperColorTexture = (
  base: string,
  size = 512,
  seed = 5,
  variance = 0.06,
  anisotropy = 8,
): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(size, size);
  const R = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = R() * size;
    const y = R() * size;
    const r = 40 + R() * 110;
    wrapped(size, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = variance * (0.4 + R() * 0.8);
      const c = R() < 0.5 ? '0,0,0' : '255,255,255';
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  const nFiber = Math.round((size * size) / 160);
  for (let i = 0; i < nFiber; i++) {
    const x = R() * size;
    const y = R() * size;
    const len = 5 + R() * 18;
    const ang = R() * Math.PI * 2;
    const light = R() < 0.55;
    wrapped(size, x, y, len, (ox, oy) => {
      ctx.strokeStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
      ctx.stroke();
    });
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, repeat: true, anisotropy });
};

/** 帳簿の方眼（タイル可）。 */
export const makeLedgerTexture = (base: string, minor: string, major: string, anisotropy = 8): CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.lineWidth = 1;
  ctx.strokeStyle = minor;
  for (let i = 0; i <= size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = major;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(1, size);
  ctx.moveTo(0, 1);
  ctx.lineTo(size, 1);
  ctx.stroke();
  return finishTexture(new CanvasTexture(canvas), { color: true, repeat: true, anisotropy });
};

/**
 * 机の天板（明るい白木・ビーチ材の木目）。板目の長い筋・道管・板の継ぎ目。x 方向にタイル可。
 * map と bumpMap に同じテクスチャを使う（赤チャンネルの明暗が凹凸になる）。
 */
export const makeWoodTexture = (size = 2048, seed = 11, anisotropy = 8): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(size, size);
  const R = seeded(seed);
  const sc = size / 2048;
  const planks = 6;
  const ph = size / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const hue = 34 + (R() - 0.5) * 6;
    const sat = 58 + R() * 8;
    const light = 74 + (R() - 0.5) * 5;
    ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
    ctx.fillRect(0, y0, size, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, size, ph);
    ctx.clip();
    // 板ごとの明暗の帯（x に周期的）
    const bands = 2 + Math.floor(R() * 3);
    for (let b = 0; b < bands; b++) {
      const k = 1 + Math.floor(R() * 2);
      const phase = R() * Math.PI * 2;
      const cy = y0 + R() * ph;
      const hh = ph * (0.4 + R() * 0.5);
      for (let x = 0; x < size; x += 16) {
        const a = 0.04 + 0.04 * Math.sin((2 * Math.PI * k * x) / size + phase);
        ctx.fillStyle = `rgba(${R() < 0.5 ? '200,140,80' : '255,246,228'},${a})`;
        ctx.fillRect(x, cy - hh / 2, 16, hh);
      }
    }
    // 長い木目の筋
    const nGrain = Math.round(240 * sc);
    for (let i = 0; i < nGrain; i++) {
      const y = y0 + R() * ph;
      const amp = (1 + R() * 9) * sc;
      const k = 1 + Math.floor(R() * 3);
      const phase = R() * Math.PI * 2;
      const drift = (R() - 0.5) * 6 * sc;
      const dark = R() < 0.6;
      const a = dark ? 0.05 + R() * 0.11 : 0.05 + R() * 0.09;
      ctx.strokeStyle = dark ? `rgba(176,116,62,${a})` : `rgba(255,244,222,${a})`;
      ctx.lineWidth = (0.5 + R() * 2.2) * sc;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 32) {
        const yy = y + amp * Math.sin((2 * Math.PI * k * x) / size + phase) + drift * Math.sin((2 * Math.PI * x) / size);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // 山形（板目）の年輪
    const nArch = 2 + Math.floor(R() * 3);
    for (let i = 0; i < nArch; i++) {
      const cx = R() * size;
      const cy = y0 + ph * (0.25 + R() * 0.5);
      const rx = (120 + R() * 380) * sc;
      const ry = ph * (0.1 + R() * 0.22);
      const rings = 6 + Math.floor(R() * 6);
      for (let g = 0; g < rings; g++) {
        const t = (g + 1) / rings;
        ctx.strokeStyle = `rgba(178,120,66,${0.04 + R() * 0.05})`;
        ctx.lineWidth = (0.8 + R() * 1.6) * sc;
        wrapped(size, cx, cy, rx, (ox, oy) => {
          ctx.beginPath();
          ctx.ellipse(cx + ox, cy + oy, rx * t, ry * t, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    }
    // 道管（短い筋）
    const nPore = Math.round(1800 * sc);
    for (let i = 0; i < nPore; i++) {
      const x = R() * size;
      const y = y0 + R() * ph;
      const len = (4 + R() * 20) * sc;
      ctx.strokeStyle = `rgba(160,104,56,${0.06 + R() * 0.1})`;
      ctx.lineWidth = (0.5 + R() * 0.8) * sc;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (R() - 0.5) * 1.5 * sc);
      ctx.stroke();
    }
    ctx.restore();
    // 継ぎ目（やわらかい）
    ctx.fillStyle = 'rgba(176,124,74,0.55)';
    ctx.fillRect(0, y0 - 1.2 * sc, size, 2.4 * sc);
    ctx.fillStyle = 'rgba(255,250,238,0.45)';
    ctx.fillRect(0, y0 + 1.2 * sc, size, 2 * sc);
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, repeat: true, anisotropy });
};

/**
 * パステルのデスクマット（水玉と縫い目のステッチ）。矩形に 1 枚貼る（UV 0..1）。
 */
export const makeDeskMatTexture = (
  aspect: number,
  base: string,
  dot: string,
  stitch: string,
  anisotropy = 8,
): CanvasTexture => {
  const w = 2048;
  const h = Math.max(256, Math.round(w / aspect));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // 水玉（ずらし格子）
  const pitch = 96;
  ctx.fillStyle = dot;
  for (let r = 0, y = pitch / 2; y < h; y += pitch * 0.5, r++) {
    for (let x = (r % 2 ? pitch / 2 : 0) + pitch / 2; x < w; x += pitch) {
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // ステッチ
  ctx.strokeStyle = stitch;
  ctx.lineWidth = 7;
  ctx.setLineDash([26, 20]);
  ctx.lineCap = 'round';
  const inset = 42;
  const rr = 80;
  ctx.beginPath();
  ctx.moveTo(inset + rr, inset);
  ctx.lineTo(w - inset - rr, inset);
  ctx.arcTo(w - inset, inset, w - inset, inset + rr, rr);
  ctx.lineTo(w - inset, h - inset - rr);
  ctx.arcTo(w - inset, h - inset, w - inset - rr, h - inset, rr);
  ctx.lineTo(inset + rr, h - inset);
  ctx.arcTo(inset, h - inset, inset, h - inset - rr, rr);
  ctx.lineTo(inset, inset + rr);
  ctx.arcTo(inset, inset, inset + rr, inset, rr);
  ctx.closePath();
  ctx.stroke();
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy });
};

/** 象牙・牛角風のたて筋（印鑑の軸）。u が円周方向、v が高さ方向。 */
export const makeIvoryTexture = (anisotropy = 8): CanvasTexture => {
  const w = 256;
  const h = 128;
  const { canvas, ctx } = makeCanvas(w, h);
  const R = seeded(41);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#efe3c6');
  g.addColorStop(0.5, '#f4ead0');
  g.addColorStop(1, '#efe3c6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = R() * w;
    const wd = 0.6 + R() * 2.2;
    ctx.fillStyle = R() < 0.55 ? `rgba(150,110,60,${0.03 + R() * 0.07})` : `rgba(255,255,245,${0.05 + R() * 0.1})`;
    ctx.fillRect(x, 0, wd, h);
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, repeat: true, anisotropy });
};

/** ぼかし影（駒の足元）。 */
export const makeBlobTexture = (): CanvasTexture => {
  const s = 128;
  const { canvas, ctx } = makeCanvas(s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return finishTexture(new CanvasTexture(canvas), { color: false });
};
