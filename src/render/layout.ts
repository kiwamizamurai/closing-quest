import type { Square, SquareType } from '@/core/game/types';

/**
 * 盤面の幾何配置（three に依存しない純粋な計算）。
 * 単位はおよそ cm。Y が上、机の天板が y=0、盤面の上面が y=H_BOARD。
 * 画面では x が右、z が手前（カメラ側）。上から見て時計回りに 4月→翌3月と進む。
 */
export const H_BOARD = 1.2;
export const SECTOR_H = 0.2; // 月ごとのプレートの厚み
export const PLATE_H = 0.2; // マスの台紙（縁取り色）の厚み
export const PAPER_H = 0.16; // 伝票（紙）の厚み
export const TILE_TOP_Y = H_BOARD + SECTOR_H + PLATE_H + PAPER_H;
export const MONTH_GAP = 1.7; // 月と月のあいだ
export const RING_GAP = 17; // 輪の出口（スタートと最終マスのあいだ）の弧長
export const BAND_HALF = 2.85; // 月プレートの半幅
export const MARGIN = 9.2; // 中心線から盤の縁まで（ここに月名ラベルを印刷する）
export const LABEL_OFFSET = BAND_HALF + 3.25;
export const RING_ASPECT = 1.32; // 輪の縦横比 A:B
export const RING_CORNER = 0.44; // 角丸半径 / B（大きめの丸み）

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface PathSample {
  readonly x: number;
  readonly z: number;
  /** 進行方向（時計回り） */
  readonly tx: number;
  readonly tz: number;
  /** 外向き法線 */
  readonly nx: number;
  readonly nz: number;
}

export type PathFn = (s: number) => PathSample;

interface Seg {
  readonly kind: 'line' | 'arc';
  readonly len: number;
  readonly x: number;
  readonly z: number;
  readonly dx: number;
  readonly dz: number;
  readonly nx: number;
  readonly nz: number;
  readonly a0: number;
}

/**
 * 丸めた長方形の周回路。原点 (A,0)（右辺の中央）から下向き（画面手前）に時計回りで進む。
 * 直線部が多いので、マスの文字をほぼ正立させられる。
 */
export class RingPath {
  readonly length: number;
  private readonly segs: Seg[] = [];

  constructor(
    readonly A: number,
    readonly B: number,
    readonly rc: number,
  ) {
    const q = Math.PI / 2;
    const line = (x: number, z: number, dx: number, dz: number, nx: number, nz: number, len: number): void => {
      this.segs.push({ kind: 'line', len, x, z, dx, dz, nx, nz, a0: 0 });
    };
    const arc = (cx: number, cz: number, a0: number): void => {
      this.segs.push({ kind: 'arc', len: rc * q, x: cx, z: cz, dx: 0, dz: 0, nx: 0, nz: 0, a0 });
    };
    line(A, 0, 0, 1, 1, 0, B - rc);
    arc(A - rc, B - rc, 0);
    line(A - rc, B, -1, 0, 0, 1, 2 * A - 2 * rc);
    arc(-A + rc, B - rc, q);
    line(-A, B - rc, 0, -1, -1, 0, 2 * B - 2 * rc);
    arc(-A + rc, -B + rc, 2 * q);
    line(-A + rc, -B, 1, 0, 0, -1, 2 * A - 2 * rc);
    arc(A - rc, -B + rc, 3 * q);
    line(A, -B + rc, 0, 1, 1, 0, B - rc);
    this.length = this.segs.reduce((a, s) => a + s.len, 0);
  }

  readonly at: PathFn = (s: number): PathSample => {
    const L = this.length;
    let u = ((s % L) + L) % L;
    for (const g of this.segs) {
      if (u <= g.len) {
        if (g.kind === 'line') {
          return { x: g.x + g.dx * u, z: g.z + g.dz * u, tx: g.dx, tz: g.dz, nx: g.nx, nz: g.nz };
        }
        const a = g.a0 + u / this.rc;
        const c = Math.cos(a);
        const s2 = Math.sin(a);
        return { x: g.x + this.rc * c, z: g.z + this.rc * s2, tx: -s2, tz: c, nx: c, nz: s2 };
      }
      u -= g.len;
    }
    return { x: this.A, z: 0, tx: 0, tz: 1, nx: 1, nz: 0 };
  };
}

export interface TileSpec {
  /** 文字の向きに沿った寸法（輪では接線方向）と、それに直交する寸法。 */
  readonly w: number;
  readonly d: number;
  /** 経路上で占める長さ */
  readonly slot: number;
}

export const tileSpec = (type: SquareType): TileSpec => {
  switch (type) {
    case 'monthend':
      return { w: 4.0, d: 4.4, slot: 4.7 };
    case 'start':
    case 'goal':
      return { w: 4.6, d: 4.6, slot: 5.4 };
    default:
      return { w: 3.2, d: 3.4, slot: 3.7 };
  }
};

export interface SquareLayout {
  readonly index: number;
  readonly period: number;
  readonly type: SquareType;
  readonly x: number;
  readonly z: number;
  /** Y 軸まわりの回転。ローカル +x が文字のベースライン方向、ローカル -z が文字の「上」。 */
  readonly rotY: number;
  /** ローカル x / z 方向の寸法 */
  readonly lw: number;
  readonly ld: number;
}

export interface LabelLayout {
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly w: number;
  readonly h: number;
}

export interface SectorLayout {
  readonly period: number;
  readonly kind: 'ring' | 'road';
  /** 輪は弧長、道は x 座標 */
  readonly s0: number;
  readonly s1: number;
  readonly members: readonly number[];
  readonly path: PathFn;
  readonly label: LabelLayout;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface BoardLayout {
  readonly squares: readonly SquareLayout[];
  readonly byIndex: ReadonlyMap<number, SquareLayout>;
  readonly sectors: readonly SectorLayout[];
  readonly ring: RingPath;
  readonly hasRoad: boolean;
  /** 道の右端（盤の輪郭の右端）x */
  readonly roadEnd: number;
  readonly building: Vec2 | null;
  readonly startFlag: (Vec2 & { readonly rotY: number }) | null;
  readonly bounds: Bounds;
  readonly roulette: { readonly x: number; readonly z: number; readonly radius: number };
  readonly roadTitle: LabelLayout | null;
}

const RING_K = 4 + 4 / RING_ASPECT + ((2 * Math.PI - 8) * RING_CORNER) / RING_ASPECT;
const A_MIN = 38;
export const BUILDING_W = 12;
export const BUILDING_D = 9.5;

/** 4 つの向き（±接線, ±法線）のうち +x（画面右）にもっとも近い向きを文字のベースラインにする。 */
const pickBaseline = (
  tx: number,
  tz: number,
  nx: number,
  nz: number,
): { bx: number; bz: number; alongTangent: boolean } => {
  const cands = [
    { bx: tx, bz: tz, alongTangent: true, score: tx + 0.06 },
    { bx: -tx, bz: -tz, alongTangent: true, score: -tx + 0.06 },
    { bx: nx, bz: nz, alongTangent: false, score: nx },
    { bx: -nx, bz: -nz, alongTangent: false, score: -nx },
  ];
  let best = cands[0]!;
  for (const c of cands) if (c.score > best.score) best = c;
  return best;
};

const rotYOf = (bx: number, bz: number): number => Math.atan2(-bz, bx);

export const buildLayout = (squares: readonly Square[]): BoardLayout => {
  const sorted = [...squares].sort((a, b) => a.index - b.index);
  const groups = new Map<number, Square[]>();
  for (const sq of sorted) {
    const arr = groups.get(sq.period);
    if (arr) arr.push(sq);
    else groups.set(sq.period, [sq]);
  }
  const periods = [...groups.keys()].sort((a, b) => a - b);
  const ringPeriods = periods.filter((p) => p < 12);
  const roadPeriods = periods.filter((p) => p >= 12);

  // 輪の長さから寸法を決める。最後のマスの中心が原点（右辺の中央）に来るようにする。
  let sum = 0;
  let lastSlot = 0;
  for (const p of ringPeriods) {
    for (const sq of groups.get(p) ?? []) {
      lastSlot = tileSpec(sq.type).slot;
      sum += lastSlot;
    }
  }
  const nRing = ringPeriods.length;
  const need = nRing === 0 ? RING_K * A_MIN : RING_GAP + sum + MONTH_GAP * Math.max(0, nRing - 1) - lastSlot / 2;
  const A = Math.max(A_MIN, need / RING_K);
  const B = A / RING_ASPECT;
  const ring = new RingPath(A, B, RING_CORNER * B);
  const slack = Math.max(0, ring.length - need);
  const extraGap = nRing > 1 ? slack / (nRing - 1) : 0;

  const out: SquareLayout[] = [];
  const sectors: SectorLayout[] = [];

  let s = RING_GAP;
  for (const p of ringPeriods) {
    const s0 = s;
    const members: number[] = [];
    for (const sq of groups.get(p) ?? []) {
      const spec = tileSpec(sq.type);
      const sc = s + spec.slot / 2;
      const c = ring.at(sc);
      const base = pickBaseline(c.tx, c.tz, c.nx, c.nz);
      out.push({
        index: sq.index,
        period: p,
        type: sq.type,
        x: c.x,
        z: c.z,
        rotY: rotYOf(base.bx, base.bz),
        lw: base.alongTangent ? spec.w : spec.d,
        ld: base.alongTangent ? spec.d : spec.w,
      });
      members.push(sq.index);
      s += spec.slot;
    }
    const mid = ring.at((s0 + s) / 2);
    // ラベルは接線方向に沿わせる。下半分（画面手前）だけ 180 度返して読めるようにする。
    const flip = mid.tx < -0.35;
    const bx = flip ? -mid.tx : mid.tx;
    const bz = flip ? -mid.tz : mid.tz;
    sectors.push({
      period: p,
      kind: 'ring',
      s0,
      s1: s,
      members,
      path: ring.at,
      label: {
        x: mid.x + mid.nx * LABEL_OFFSET,
        z: mid.z + mid.nz * LABEL_OFFSET,
        rotY: rotYOf(bx, bz),
        w: 7.8,
        h: 3.4,
      },
    });
    s += MONTH_GAP + extraGap;
  }

  // 決算ロード（輪の出口から +x へまっすぐ）
  let x = A + BAND_HALF + MONTH_GAP + 0.5;
  const roadX0 = x;
  const roadPath: PathFn = (u) => ({ x: u, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 });
  for (const p of roadPeriods) {
    const x0 = x;
    const members: number[] = [];
    for (const sq of groups.get(p) ?? []) {
      const spec = tileSpec(sq.type);
      out.push({
        index: sq.index,
        period: p,
        type: sq.type,
        x: x + spec.slot / 2,
        z: 0,
        rotY: 0,
        lw: spec.w,
        ld: spec.d,
      });
      members.push(sq.index);
      x += spec.slot;
    }
    sectors.push({
      period: p,
      kind: 'road',
      s0: x0,
      s1: x,
      members,
      path: roadPath,
      label: { x: (x0 + x) / 2, z: -LABEL_OFFSET, rotY: 0, w: 7.8, h: 3.4 },
    });
    x += MONTH_GAP;
  }

  const hasRoad = roadPeriods.length > 0;
  const roadEndPlate = x - MONTH_GAP;
  const building = hasRoad ? { x: roadEndPlate + 1.4 + BUILDING_W / 2, z: 0 } : null;
  const roadEnd = building ? building.x + BUILDING_W / 2 + 5.5 : A + MARGIN;
  const roadTitle: LabelLayout | null = hasRoad
    ? { x: (roadX0 + roadEndPlate) / 2, z: LABEL_OFFSET, rotY: 0, w: 22, h: 3.4 }
    : null;

  const first = out.find((q) => q.type === 'start') ?? out[0];
  let startFlag: BoardLayout['startFlag'] = null;
  if (first) {
    // 出口の側（右辺の下）から見て外側に旗を立てる
    const c = ring.at(RING_GAP + tileSpec(first.type).slot / 2);
    startFlag = { x: c.x + c.nx * 5.0, z: c.z + c.nz * 5.0, rotY: 0 };
  }

  const byIndex = new Map<number, SquareLayout>();
  for (const q of out) byIndex.set(q.index, q);

  return {
    squares: out,
    byIndex,
    sectors,
    ring,
    hasRoad,
    roadEnd,
    building,
    startFlag,
    bounds: { minX: -(A + MARGIN), maxX: hasRoad ? roadEnd : A + MARGIN, minZ: -(B + MARGIN), maxZ: B + MARGIN },
    roulette: { x: 0, z: 0, radius: Math.min(23, B - 8) },
    roadTitle,
  };
};
