import { CanvasTexture } from 'three';
import type { SquareType } from '@/core/game/types';
import type { CardKind } from '@/core/tasks/types';
import { formatDate, monthOf } from '@/core/types';
import { FONT_SANS, FONT_SERIF, finishTexture, makeCanvas, seeded } from './textures';

/** カード種別の色（UI の --kind-* と同じ）と、印の中に入れる 1 文字。 */
export const KIND_COLOR: Record<CardKind, string> = {
  JOURNAL: '#2b5fb4',
  DEADLINE: '#b8262f',
  CALC: '#6b3fa0',
  AUDIT: '#9a5a10',
  DECISION: '#23724a',
  REPORT: '#0b6f7a',
  CHANCE: '#7a4f26',
};
const KIND_GLYPH: Record<CardKind, string> = {
  JOURNAL: '仕',
  DEADLINE: '期',
  CALC: '計',
  AUDIT: '突',
  DECISION: '判',
  REPORT: '報',
  CHANCE: '運',
};

export interface TileTheme {
  /** 伝票の紙色 */
  readonly paper: string;
  /** 台紙（縁取り）の色 = 3D の台紙・印刷の枠線の色 */
  readonly frame: string;
  readonly frameW: number;
  readonly double: boolean;
  readonly tag: string | null;
  readonly label: number;
}

export const TILE_THEME: Record<SquareType, TileTheme> = {
  normal: { paper: '#fffdf6', frame: '#e3dccb', frameW: 0.045, double: false, tag: null, label: 0.5 },
  routine: { paper: '#fbf9ff', frame: '#c4b5fd', frameW: 0.05, double: false, tag: null, label: 0.42 },
  deadline: { paper: '#ffecea', frame: '#ff5a5f', frameW: 0.085, double: false, tag: 'DEADLINE', label: 0.5 },
  monthend: { paper: '#fff6cc', frame: '#ffbe1f', frameW: 0.09, double: true, tag: 'MONTH END', label: 0.56 },
  event: { paper: '#e4f3ff', frame: '#3d9bff', frameW: 0.07, double: false, tag: 'EVENT', label: 0.5 },
  special: { paper: '#e2faee', frame: '#22c08a', frameW: 0.07, double: false, tag: 'SPECIAL', label: 0.5 },
  start: { paper: '#ffe6f1', frame: '#ff5f9e', frameW: 0.1, double: true, tag: 'START', label: 0.7 },
  goal: { paper: '#fff2c2', frame: '#ffbe1f', frameW: 0.1, double: true, tag: 'GOAL', label: 0.7 },
};

/** 3D の台紙（縁取り）の色。normal は白い縁でぷっくり見せる。 */
export const TILE_PLATE_COLOR: Record<SquareType, string> = {
  normal: '#ffffff',
  routine: '#ece6ff',
  deadline: '#ff5a5f',
  monthend: '#ffbe1f',
  event: '#3d9bff',
  special: '#22c08a',
  start: '#ff5f9e',
  goal: '#ffbe1f',
};

/** カード種別アイコンのシート（kind_icons.png）。 */
export interface KindIcons {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
}

const KIND_ICON_INDEX: Partial<Record<CardKind, number>> = {
  JOURNAL: 0,
  DEADLINE: 1,
  CALC: 2,
  AUDIT: 3,
  DECISION: 4,
  REPORT: 5,
};

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

const setSpacing = (ctx: CanvasRenderingContext2D, v: string): void => {
  // 新しめのブラウザだけ。無ければ字間なしで描く。
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = v;
};

export interface TileArtItem {
  readonly type: SquareType;
  readonly label: string;
  readonly date: number;
  readonly cardKind: CardKind | undefined;
  /** ローカル x（文字の向き）方向 / 直交方向の寸法 */
  readonly lw: number;
  readonly ld: number;
}

/** マス 1 枚分の伝票を (ox, oy) のセルに描く。単位 1 = ppu ピクセル。 */
export const paintTile = (
  ctx: CanvasRenderingContext2D,
  it: TileArtItem,
  ox: number,
  oy: number,
  cw: number,
  ch: number,
  ppu: number,
  icons: KindIcons | null = null,
): void => {
  const th = TILE_THEME[it.type];
  const W = it.lw * ppu;
  const H = it.ld * ppu;
  ctx.save();
  ctx.translate(ox, oy);
  // セル全体を紙色で塗る（ミップマップで隣のセルの色が混ざらないように）
  ctx.fillStyle = th.paper;
  ctx.fillRect(0, 0, cw, ch);
  // ごく薄いグラデーション（紙のたわみ）
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,214,196,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const inset = 0.15 * ppu;
  ctx.strokeStyle = th.frame;
  ctx.lineWidth = th.frameW * ppu;
  roundRectPath(ctx, inset, inset, W - 2 * inset, H - 2 * inset, 0.28 * ppu);
  ctx.stroke();
  if (th.double) {
    ctx.lineWidth = 0.022 * ppu;
    roundRectPath(ctx, inset + 0.12 * ppu, inset + 0.12 * ppu, W - 2 * inset - 0.24 * ppu, H - 2 * inset - 0.24 * ppu, 0.18 * ppu);
    ctx.stroke();
  }

  // 左上: カード種別の印（アイコンシートがあればそれを使う）
  const topY = 0.58 * ppu;
  if (it.cardKind) {
    const r = 0.3 * ppu;
    const cx = 0.6 * ppu;
    const col = KIND_COLOR[it.cardKind];
    const iconIdx = KIND_ICON_INDEX[it.cardKind];
    if (icons && iconIdx !== undefined) {
      // 白いぷっくりした円 + 種別色のふち + アイコン
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, topY, r + 0.02 * ppu, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.055 * ppu;
      ctx.beginPath();
      ctx.arc(cx, topY, r, 0, Math.PI * 2);
      ctx.stroke();
      const cellW = icons.width / icons.cols;
      const cellH = icons.height / icons.rows;
      const c = iconIdx % icons.cols;
      const rr = Math.floor(iconIdx / icons.cols);
      const s = r * 1.55;
      ctx.drawImage(icons.image, c * cellW, rr * cellH, cellW, cellH, cx - s / 2, topY - s / 2, s, s);
    } else {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, topY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.03 * ppu;
      ctx.beginPath();
      ctx.arc(cx, topY, r - 0.05 * ppu, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${0.36 * ppu}px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(KIND_GLYPH[it.cardKind], cx, topY + 0.015 * ppu);
    }
  }
  // 右上: 種別タグ（印刷の見出し風）
  if (th.tag) {
    ctx.fillStyle = th.frame;
    ctx.font = `700 ${0.19 * ppu}px ${FONT_SANS}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setSpacing(ctx, `${0.03 * ppu}px`);
    ctx.fillText(th.tag, W - 0.36 * ppu, topY + 0.01 * ppu);
    setSpacing(ctx, '0px');
  }

  // 下段: 罫線と日付
  const ruleY = H - 0.72 * ppu;
  ctx.strokeStyle = 'rgba(90,100,140,0.22)';
  ctx.lineWidth = 0.016 * ppu;
  ctx.beginPath();
  ctx.moveTo(0.34 * ppu, ruleY);
  ctx.lineTo(W - 0.34 * ppu, ruleY);
  ctx.stroke();
  ctx.fillStyle = '#7b809c';
  ctx.font = `600 ${0.3 * ppu}px ${FONT_SANS}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatDate(it.date), W - 0.34 * ppu, H - 0.4 * ppu);

  // 中央: ラベル（長ければ 2 行）
  const areaTop = 0.92 * ppu;
  const cy = (areaTop + ruleY) / 2 + 0.02 * ppu;
  const maxW = W - 0.55 * ppu;
  ctx.fillStyle = '#2a3050';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...it.label];
  const fit = (text: string, base: number): number => {
    ctx.font = `700 ${base}px ${FONT_SANS}`;
    const wd = ctx.measureText(text).width;
    return wd > maxW ? (base * maxW) / wd : base;
  };
  if (chars.length > 6) {
    const half = Math.ceil(chars.length / 2);
    const l1 = chars.slice(0, half).join('');
    const l2 = chars.slice(half).join('');
    const fs = Math.min(fit(l1, 0.44 * ppu), fit(l2, 0.44 * ppu));
    ctx.font = `700 ${fs}px ${FONT_SANS}`;
    ctx.fillText(l1, W / 2, cy - fs * 0.56);
    ctx.fillText(l2, W / 2, cy + fs * 0.56);
  } else {
    const fs = fit(it.label, th.label * ppu);
    ctx.font = `700 ${fs}px ${FONT_SANS}`;
    ctx.fillText(it.label, W / 2, cy);
  }
  ctx.restore();
};

export interface AtlasPlan {
  readonly cols: number;
  readonly rows: number;
  readonly cw: number;
  readonly ch: number;
  readonly width: number;
  readonly height: number;
  readonly ppu: number;
}

export const planTileAtlas = (count: number, ppu: number, maxDim: number): AtlasPlan => {
  const cw = Math.ceil(4.9 * ppu);
  const ch = Math.ceil(4.9 * ppu);
  const cols = Math.max(1, Math.min(count, Math.floor(maxDim / cw)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, cw, ch, width: cols * cw, height: rows * ch, ppu };
};

export const cellOrigin = (plan: AtlasPlan, i: number): { ox: number; oy: number } => ({
  ox: (i % plan.cols) * plan.cw,
  oy: Math.floor(i / plan.cols) * plan.ch,
});

/** 円形の認印の押し跡（かすれ・にじみつき）。 */
export const makeStampTexture = (): CanvasTexture => {
  const s = 256;
  const { canvas, ctx } = makeCanvas(s, s);
  const R = seeded(77);
  const ink = '#f0453f';
  ctx.translate(s / 2, s / 2);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 99, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `800 138px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('済', 0, 8);
  // かすれ: ランダムな点を抜く
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * 118;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.7})`;
    const sz = 0.8 + R() * 2.6;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, sz, sz);
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse((R() - 0.5) * 200, (R() - 0.5) * 200, 5 + R() * 14, 3 + R() * 8, R() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 8 });
};

export interface LabelSpec {
  readonly key: string;
  /** 単位（世界）での大きさ */
  readonly w: number;
  readonly h: number;
  /** 白抜き（白+アルファ）で描く。頂点カラーで色づけされる。 */
  readonly paint: (ctx: CanvasRenderingContext2D, wPx: number, hPx: number, ppu: number) => void;
}

export interface LabelUv {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** シェルフ詰めで月名などのラベルを 1 枚のアトラスにまとめる。 */
export const buildLabelAtlas = (
  specs: readonly LabelSpec[],
  ppu: number,
  maxWidth: number,
): { texture: CanvasTexture; uv: Map<string, LabelUv> } => {
  const pad = 4;
  const placed: { spec: LabelSpec; x: number; y: number; w: number; h: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let usedW = 0;
  for (const spec of specs) {
    const w = Math.ceil(spec.w * ppu) + pad * 2;
    const h = Math.ceil(spec.h * ppu) + pad * 2;
    if (x + w > maxWidth) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    placed.push({ spec, x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
    usedW = Math.max(usedW, x);
  }
  const width = Math.max(64, usedW);
  const height = Math.max(64, y + rowH);
  const { canvas, ctx } = makeCanvas(width, height);
  const uv = new Map<string, LabelUv>();
  for (const p of placed) {
    ctx.save();
    ctx.translate(p.x + pad, p.y + pad);
    p.spec.paint(ctx, p.w - pad * 2, p.h - pad * 2, ppu);
    ctx.restore();
    uv.set(p.spec.key, {
      u0: (p.x + pad) / width,
      u1: (p.x + p.w - pad) / width,
      v1: 1 - (p.y + pad) / height,
      v0: 1 - (p.y + p.h - pad) / height,
    });
  }
  return { texture: finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 16 }), uv };
};

const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** 月名ラベル（印刷風）。 */
export const monthLabelSpec = (period: number, w: number, h: number): LabelSpec => ({
  key: `m${period}`,
  w,
  h,
  paint: (ctx, wp, hp, ppu) => {
    const month = monthOf(period);
    const road = period >= 12;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // 大きな月名
    ctx.font = `800 ${2.05 * ppu}px ${FONT_SANS}`;
    setSpacing(ctx, `${0.06 * ppu}px`);
    ctx.fillText(`${month}月`, wp / 2, hp * 0.8);
    // 見出し（小さく字間をあけた欧文）
    ctx.font = `700 ${0.4 * ppu}px ${FONT_SANS}`;
    setSpacing(ctx, `${road ? 0.1 : 0.22}em`);
    ctx.globalAlpha = 0.85;
    ctx.fillText(road ? 'NEXT · CLOSING' : (MONTH_EN[month - 1] ?? ''), wp / 2, hp * 0.16);
    ctx.globalAlpha = 1;
    setSpacing(ctx, '0px');
    // 二重罫
    ctx.lineWidth = 0.05 * ppu;
    ctx.beginPath();
    ctx.moveTo(wp * 0.08, hp * 0.9);
    ctx.lineTo(wp * 0.92, hp * 0.9);
    ctx.stroke();
    ctx.lineWidth = 0.02 * ppu;
    ctx.beginPath();
    ctx.moveTo(wp * 0.08, hp * 0.97);
    ctx.lineTo(wp * 0.92, hp * 0.97);
    ctx.stroke();
  },
});

export const roadTitleSpec = (w: number, h: number): LabelSpec => ({
  key: 'roadTitle',
  w,
  h,
  paint: (ctx, wp, hp, ppu) => {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${1.5 * ppu}px ${FONT_SANS}`;
    setSpacing(ctx, `${0.5 * ppu}px`);
    ctx.fillText('決算ロード', wp / 2, hp * 0.5);
    setSpacing(ctx, '0px');
    ctx.font = `700 ${1.2 * ppu}px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('▶▶▶', wp * 0.04, hp * 0.52);
    ctx.textAlign = 'right';
    ctx.fillText('▶▶▶', wp * 0.96, hp * 0.52);
  },
});

export const insideTitleSpec = (w: number, h: number): LabelSpec => ({
  key: 'title',
  w,
  h,
  paint: (ctx, wp, hp, ppu) => {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${1.3 * ppu}px ${FONT_SANS}`;
    setSpacing(ctx, `${0.2 * ppu}px`);
    ctx.fillText('CLOSING QUEST', wp / 2, hp * 0.42);
    ctx.font = `700 ${0.7 * ppu}px ${FONT_SANS}`;
    setSpacing(ctx, `${0.3 * ppu}px`);
    ctx.globalAlpha = 0.85;
    ctx.fillText('経理の1年を歩む', wp / 2, hp * 0.88);
    setSpacing(ctx, '0px');
  },
});
