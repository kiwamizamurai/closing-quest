import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Path,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
  type BufferAttribute,
  type Texture,
} from 'three';
import type { Square } from '@/core/game/types';
import { PERIOD_MONTHS } from '@/core/types';
import { ART_GRID, gridCellUv, type ArtName } from './art';
import {
  GeometryBatch,
  bakePlanarUv1,
  insetKeyhole,
  keyholeOutline,
  layFlat,
  paintVertices,
  ribbonOutline,
  roundedRectShape,
  shapeFromXZ,
  slabGeometry,
  type BatchRange,
  type KeyholeParams,
} from './geometry';
import {
  BAND_HALF,
  H_BOARD,
  MARGIN,
  PAPER_H,
  PLATE_H,
  SECTOR_H,
  TILE_TOP_Y,
  buildLayout,
  type BoardLayout,
} from './layout';
import { buildLandmarks } from './landmarks';
import type { Materials, Quality } from './materials';
import { finishTexture, makeCanvas } from './textures';
import {
  TILE_PLATE_COLOR,
  buildLabelAtlas,
  cellOrigin,
  insideTitleSpec,
  monthLabelSpec,
  paintTile,
  planTileAtlas,
  roadTitleSpec,
  type AtlasPlan,
  type KindIcons,
  type LabelSpec,
  type LabelUv,
} from './tileArt';

export interface BoardOptions {
  readonly quality: Quality;
  readonly maxTexture: number;
  readonly maxAniso: number;
  /** 非同期の描画（フォント待ちなど）が終わって再描画が必要なとき */
  readonly onDirty?: () => void;
  /** すでに読み込み済みのイラスト素材 */
  readonly art?: Partial<Record<ArtName, Texture>>;
}

export interface BoardView {
  readonly group: Group;
  readonly layout: BoardLayout;
  /** マス上面の世界座標（月の持ち上げ込み）。存在しない index は null。 */
  squareTop(index: number, out: Vector3): Vector3 | null;
  periodOf(index: number): number;
  setCurrentPeriod(period: number, immediate: boolean): void;
  markDone(index: number, done: boolean, immediate: boolean): void;
  /** アニメーション更新。見た目が動いたら true。 */
  update(dt: number): boolean;
  /** イラスト素材が読み込めたとき（board_ground / month_icons / kind_icons）。 */
  applyArt(name: ArtName, tex: Texture): void;
  /** カメラ・フィット用の外形の点（世界座標） */
  fitPoints(): Vector3[];
  dispose(): void;
}

const LIFT = 0.12;
const HIGHLIGHT_RATE = 5; // 1 秒あたりの遷移割合

/** 月ごとの色（隣どうしで見分けがつくポップなパステル）。キーは月。 */
const MONTH_COLOR: Record<number, string> = {
  4: '#ff9fc8',
  5: '#56d6a4',
  6: '#7cc4ff',
  7: '#ffd95c',
  8: '#ff8a80',
  9: '#b9a4ff',
  10: '#ffb066',
  11: '#5fd8d8',
  12: '#ff7fa8',
  1: '#b5e26a',
  2: '#8fa6ff',
  3: '#ffc0a0',
};
const ROAD_COLOR = ['#ffe07a', '#ffc95a', '#ffb44a'];

const sectorColor = (period: number): Color => {
  if (period >= 12) return new Color(ROAD_COLOR[(period - 12) % 3] ?? '#ffe07a');
  return new Color(MONTH_COLOR[PERIOD_MONTHS[period] ?? 4] ?? '#ff9fc8');
};

/** 強調されていない月をこの色へ寄せる（リニア）。 */
const DIM = new Color('#d9dcea');
const LABEL_DIM = new Color('#62a3a1');
const LABEL_ON = new Color('#ff4b6e');
const LABEL_STATIC = new Color('#59a0a3');
const ICON_DIM = new Color('#c9d3d6');
const WHITE = new Color('#ffffff');

/** 頂点属性を書き換えられる統合メッシュ。月ごとに持ち上げ・色を変える。 */
class LiftableBatch {
  readonly mesh: Mesh;
  private readonly pos: BufferAttribute;
  private readonly col: BufferAttribute;
  private readonly baseY: Float32Array;
  private readonly baseCol: Float32Array;

  constructor(
    geometry: BufferGeometry,
    private readonly ranges: ReadonlyMap<number, BatchRange>,
    material: Mesh['material'],
  ) {
    this.mesh = new Mesh(geometry, material);
    this.pos = geometry.getAttribute('position') as BufferAttribute;
    this.col = geometry.getAttribute('color') as BufferAttribute;
    this.pos.setUsage(DynamicDrawUsage);
    this.col.setUsage(DynamicDrawUsage);
    const n = this.pos.count;
    this.baseY = new Float32Array(n);
    for (let i = 0; i < n; i++) this.baseY[i] = this.pos.getY(i);
    this.baseCol = new Float32Array(this.col.array as Float32Array);
  }

  /** lift だけ持ち上げ、色を mix（0..1）だけ DIM へ寄せる。 */
  apply(group: number, lift: number, mix: number): void {
    const r = this.ranges.get(group);
    if (!r) return;
    const k = 1 - mix;
    for (let i = r.start; i < r.end; i++) {
      this.pos.setY(i, this.baseY[i]! + lift);
      this.col.setXYZ(
        i,
        this.baseCol[i * 3]! * k + DIM.r * mix,
        this.baseCol[i * 3 + 1]! * k + DIM.g * mix,
        this.baseCol[i * 3 + 2]! * k + DIM.b * mix,
      );
    }
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  /** 色そのものを指定（ラベル・アイコン用。ベースは白）。 */
  applyColor(group: number, c: Color): void {
    const r = this.ranges.get(group);
    if (!r) return;
    for (let i = r.start; i < r.end; i++) this.col.setXYZ(i, c.r, c.g, c.b);
    this.col.needsUpdate = true;
  }
}

interface TileTemplate {
  readonly plate: BufferGeometry;
  readonly paper: BufferGeometry;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export const buildBoard = (squares: readonly Square[], mats: Materials, opt: BoardOptions): BoardView => {
  const layout = buildLayout(squares);
  const group = new Group();
  group.name = 'board';
  const owned: BufferGeometry[] = [];
  const own = <T extends BufferGeometry>(g: T): T => {
    owned.push(g);
    return g;
  };
  const ppu = opt.quality === 'high' ? 72 : 44;
  const ring = layout.ring;

  // ---- 盤（厚紙）本体: ぷっくりした大きな面取り --------------------------------------
  const outline: KeyholeParams = {
    ax: ring.A + MARGIN,
    bz: ring.B + MARGIN,
    rc: ring.rc + MARGIN,
    strip: layout.hasRoad ? { hw: MARGIN, xEnd: layout.roadEnd, rEnd: 7, fillet: 5 } : null,
  };
  {
    const shape = new Shape();
    keyholeOutline(outline, shape);
    const g = own(layFlat(slabGeometry(shape, H_BOARD, 0.5, 4, 14)));
    const slab = new Mesh(g, [mats.boardTop, mats.boardSide]);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  }

  // ---- 飾りの線（レモンイエロー）---------------------------------------------
  const decor: Mesh[] = [];
  const inlay = (params: KeyholeParams, inset: number, width: number): void => {
    const outer = new Shape();
    keyholeOutline(insetKeyhole(params, inset), outer);
    const hole = new Path();
    keyholeOutline(insetKeyhole(params, inset + width), hole);
    outer.holes.push(hole);
    const g = own(layFlat(new ShapeGeometry(outer, 12)));
    const m = new Mesh(g, mats.gold);
    m.position.y = H_BOARD + 0.012;
    m.receiveShadow = true;
    group.add(m);
    decor.push(m);
  };
  inlay(outline, 1.6, 0.22);
  const innerRing: KeyholeParams = { ax: ring.A - 3.4, bz: ring.B - 3.4, rc: ring.rc - 3.4, strip: null };
  inlay(innerRing, 0, 0.2);

  // ---- 中央の方眼紙（輪の内側） --------------------------------------------
  const ledgerMesh: Mesh = (() => {
    const shape = new Shape();
    keyholeOutline({ ax: ring.A - 3.6, bz: ring.B - 3.6, rc: ring.rc - 3.6, strip: null }, shape);
    const g = own(layFlat(new ShapeGeometry(shape, 12)));
    const m = new Mesh(g, mats.ledger);
    m.position.y = H_BOARD + 0.008;
    m.receiveShadow = true;
    group.add(m);
    return m;
  })();
  {
    const r0 = layout.roulette.radius;
    for (const [r, w] of [
      [r0 + 1.5, 0.22],
      [r0 + 2.1, 0.08],
    ] as const) {
      const g = own(layFlat(new RingGeometry(r, r + w, 160)));
      const m = new Mesh(g, mats.gold);
      m.position.set(layout.roulette.x, H_BOARD + 0.014, layout.roulette.z);
      m.receiveShadow = true;
      group.add(m);
      decor.push(m);
    }
  }

  // ---- 盤面の下地イラスト（board_ground.png があるときだけ表示） -------------------
  const groundSide = 2 * Math.max(ring.A + MARGIN, ring.B + MARGIN);
  const groundMesh: Mesh = (() => {
    const shape = new Shape();
    keyholeOutline(insetKeyhole({ ...outline, strip: null }, 0.65), shape);
    const g = own(layFlat(new ShapeGeometry(shape, 14)));
    const m = new Mesh(g, mats.ground);
    m.position.y = H_BOARD + 0.004;
    m.receiveShadow = true;
    m.visible = false;
    group.add(m);
    return m;
  })();

  // ---- 月ごとのプレート -----------------------------------------------------
  const sectorBatch = new GeometryBatch();
  for (const sec of layout.sectors) {
    const pts = ribbonOutline(sec.path, sec.s0 - 0.5, sec.s1 + 0.5, BAND_HALF, 1.5);
    const g = layFlat(slabGeometry(shapeFromXZ(pts), SECTOR_H, 0.08, 3, 6));
    g.translate(0, H_BOARD, 0);
    const c = sectorColor(sec.period);
    paintVertices(g, c.r, c.g, c.b);
    sectorBatch.add(g, sec.period);
  }
  let sectors: LiftableBatch | null = null;
  if (sectorBatch.size > 0) {
    const built = sectorBatch.build();
    own(built.geometry);
    sectors = new LiftableBatch(built.geometry, built.ranges, mats.sector);
    sectors.mesh.receiveShadow = true;
    group.add(sectors.mesh);
  }

  // ---- マス（台紙 + 伝票）: ぷっくり --------------------------------------------
  const sqByIndex = new Map<number, Square>();
  for (const sq of squares) sqByIndex.set(sq.index, sq);
  const plan: AtlasPlan = planTileAtlas(
    Math.max(1, layout.squares.length),
    ppu,
    Math.min(opt.maxTexture, 8192),
  );
  const templates = new Map<string, TileTemplate>();
  const templateOf = (lw: number, ld: number): TileTemplate => {
    const key = `${lw.toFixed(2)}x${ld.toFixed(2)}`;
    let t = templates.get(key);
    if (!t) {
      t = {
        plate: slabGeometry(roundedRectShape(lw + 0.36, ld + 0.36, 0.66), PLATE_H, 0.075, 3, 8),
        paper: slabGeometry(roundedRectShape(lw, ld, 0.5), PAPER_H, 0.065, 3, 8),
      };
      templates.set(key, t);
    }
    return t;
  };
  const plateBatch = new GeometryBatch();
  const paperBatch = new GeometryBatch();
  const tmpM = new Matrix4();
  layout.squares.forEach((L, i) => {
    const t = templateOf(L.lw, L.ld);
    const { ox, oy } = cellOrigin(plan, i);
    // 台紙
    const pl = layFlat(t.plate.clone());
    const c = new Color(TILE_PLATE_COLOR[L.type]);
    paintVertices(pl, c.r, c.g, c.b);
    tmpM.makeRotationY(L.rotY).setPosition(L.x, H_BOARD + SECTOR_H, L.z);
    pl.applyMatrix4(tmpM);
    plateBatch.add(pl, L.period);
    // 伝票: UV はアトラスのセルに合わせる（外周は端の画素にクランプ）
    const pa = t.paper.clone();
    const p = pa.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    const hx = L.lw / 2 - 0.02;
    const hy = L.ld / 2 - 0.02;
    for (let k = 0; k < p.count; k++) {
      const x = clamp(p.getX(k), -hx, hx);
      const y = clamp(p.getY(k), -hy, hy);
      uv[k * 2] = (ox + (x + L.lw / 2) * ppu) / plan.width;
      uv[k * 2 + 1] = 1 - (oy + (L.ld / 2 - y) * ppu) / plan.height;
    }
    pa.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    layFlat(pa);
    tmpM.makeRotationY(L.rotY).setPosition(L.x, H_BOARD + SECTOR_H + PLATE_H, L.z);
    pa.applyMatrix4(tmpM);
    bakePlanarUv1(pa, 0.09);
    paperBatch.add(pa, L.period);
  });
  for (const t of templates.values()) {
    t.plate.dispose();
    t.paper.dispose();
  }
  let plates: LiftableBatch | null = null;
  let papers: LiftableBatch | null = null;
  if (plateBatch.size > 0) {
    const b1 = plateBatch.build();
    own(b1.geometry);
    plates = new LiftableBatch(b1.geometry, b1.ranges, mats.tilePlate);
    plates.mesh.receiveShadow = true;
    group.add(plates.mesh);
    const b2 = paperBatch.build();
    own(b2.geometry);
    papers = new LiftableBatch(b2.geometry, b2.ranges, mats.tilePaper);
    papers.mesh.receiveShadow = true;
    group.add(papers.mesh);
  }

  // ---- 押印（完了したマス） -------------------------------------------------
  const nSq = layout.squares.length;
  const stampGeo = own(layFlat(new PlaneGeometry(1, 1)));
  const stamps = new InstancedMesh(stampGeo, mats.stamp, Math.max(1, nSq));
  stamps.instanceMatrix.setUsage(DynamicDrawUsage);
  stamps.frustumCulled = false;
  stamps.renderOrder = 3;
  stamps.count = nSq;
  const zeroM = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < nSq; i++) stamps.setMatrixAt(i, zeroM);
  group.add(stamps);
  const stampTarget = new Float32Array(nSq); // 0 | 1
  const stampT = new Float32Array(nSq); // 0..1 のアニメーション進行
  const stampJitter = new Float32Array(nSq * 3);
  const posInLayout = new Map<number, number>();
  layout.squares.forEach((L, i) => {
    posInLayout.set(L.index, i);
    // 決定的なばらつき（回転・位置）
    const h = Math.sin(L.index * 12.9898) * 43758.5453;
    const f = h - Math.floor(h);
    const h2 = Math.sin(L.index * 78.233) * 12345.6789;
    const f2 = h2 - Math.floor(h2);
    stampJitter[i * 3] = (f - 0.5) * 0.5;
    stampJitter[i * 3 + 1] = (f2 - 0.5) * 0.3;
    stampJitter[i * 3 + 2] = (f * f2 - 0.25) * 0.4;
  });

  // ---- 月の強調 -------------------------------------------------------------
  const periods = [...new Set(layout.squares.map((q) => q.period))];
  const tNow = new Map<number, number>();
  const tGoal = new Map<number, number>();
  for (const p of periods) {
    tNow.set(p, 1);
    tGoal.set(p, 1);
  }
  const membersByPeriod = new Map<number, number[]>();
  layout.squares.forEach((L, i) => {
    const arr = membersByPeriod.get(L.period);
    if (arr) arr.push(i);
    else membersByPeriod.set(L.period, [i]);
  });
  const liftOf = (period: number): number => LIFT * (tNow.get(period) ?? 1);

  const stampMatrix = (i: number, out: Matrix4): void => {
    const L = layout.squares[i]!;
    const a = stampT[i]!;
    if (a <= 0.001) {
      out.makeScale(0, 0, 0);
      return;
    }
    // 押す動き: 大きく浮いた状態から沈み込む
    const settle = Math.min(1, a);
    const pop = 1 + (1 - settle) * (1 - settle) * 0.9;
    const size = 1.4 * pop * Math.min(1, settle * 3.2);
    const jx = stampJitter[i * 3]!;
    const jz = stampJitter[i * 3 + 1]!;
    const tilt = stampJitter[i * 3 + 2]!;
    const lx = L.lw * 0.28 + jx * 0.3;
    const lz = L.ld * 0.29 + jz * 0.3;
    const cs = Math.cos(L.rotY);
    const sn = Math.sin(L.rotY);
    const wx = L.x + lx * cs + lz * sn;
    const wz = L.z - lx * sn + lz * cs;
    const y = TILE_TOP_Y + liftOf(L.period) + 0.012;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), L.rotY + tilt);
    out.compose(new Vector3(wx, y, wz), q, new Vector3(size, size, size));
  };

  let labels: LiftableBatch | null = null;
  let icons: LiftableBatch | null = null;

  const applyPeriodVisual = (period: number): void => {
    const t = tNow.get(period) ?? 1;
    const off = 1 - t;
    sectors?.apply(period, LIFT * t * 0.5, 0.4 * off);
    plates?.apply(period, LIFT * t, 0.28 * off);
    papers?.apply(period, LIFT * t, 0.22 * off);
    labels?.applyColor(period, LABEL_DIM.clone().lerp(LABEL_ON, t));
    icons?.applyColor(period, ICON_DIM.clone().lerp(WHITE, t));
    const m = new Matrix4();
    for (const i of membersByPeriod.get(period) ?? []) {
      if ((stampT[i] ?? 0) > 0) {
        stampMatrix(i, m);
        stamps.setMatrixAt(i, m);
      }
    }
    stamps.instanceMatrix.needsUpdate = true;
  };

  // ---- ラベル・伝票アトラス（フォントが使えるようになってから描く） --------------
  let tileTex: CanvasTexture | null = null;
  let tileCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  let labelTex: CanvasTexture | null = null;
  let disposed = false;
  let fontsReady = false;
  let kindIcons: KindIcons | null = null;

  const paintTiles = (): void => {
    if (disposed || !fontsReady) return;
    if (!tileCanvas) tileCanvas = makeCanvas(plan.width, plan.height);
    const { ctx } = tileCanvas;
    layout.squares.forEach((L, i) => {
      const sq = sqByIndex.get(L.index);
      if (!sq) return;
      const { ox, oy } = cellOrigin(plan, i);
      paintTile(
        ctx,
        { type: sq.type, label: sq.label, date: sq.date, cardKind: sq.cardKind, lw: L.lw, ld: L.ld },
        ox,
        oy,
        plan.cw,
        plan.ch,
        ppu,
        kindIcons,
      );
    });
    if (!tileTex) {
      tileTex = finishTexture(new CanvasTexture(tileCanvas.canvas), { color: true, anisotropy: opt.maxAniso });
      mats.setTileAtlas(tileTex);
    } else {
      tileTex.needsUpdate = true;
    }
    opt.onDirty?.();
  };

  const paintText = (): void => {
    if (disposed) return;
    fontsReady = true;
    paintTiles();
    // 月名など
    const specs: LabelSpec[] = [];
    const quads: { key: string; group: number; x: number; z: number; rotY: number; w: number; h: number }[] = [];
    for (const sec of layout.sectors) {
      specs.push(monthLabelSpec(sec.period, sec.label.w, sec.label.h));
      quads.push({ key: `m${sec.period}`, group: sec.period, ...sec.label });
    }
    if (layout.roadTitle) {
      specs.push(roadTitleSpec(layout.roadTitle.w, layout.roadTitle.h));
      quads.push({ key: 'roadTitle', group: -1, ...layout.roadTitle });
    }
    {
      const r0 = layout.roulette.radius;
      const zc = -(r0 + (ring.B - 3.6 - r0) / 2) - 0.6;
      const t = { x: 0, z: zc, rotY: 0, w: 21, h: 3.2 };
      specs.push(insideTitleSpec(t.w, t.h));
      quads.push({ key: 'title', group: -2, ...t });
    }
    const atlas = buildLabelAtlas(specs, ppu * (opt.quality === 'high' ? 1 : 0.9), Math.min(opt.maxTexture, 4096));
    labelTex = atlas.texture;
    mats.setLabelAtlas(labelTex);
    const batch = new GeometryBatch();
    for (const q of quads) {
      const uvr: LabelUv | undefined = atlas.uv.get(q.key);
      if (!uvr) continue;
      const g = layFlat(new PlaneGeometry(q.w, q.h));
      const uv = g.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, uvr.u0 + (uvr.u1 - uvr.u0) * uv.getX(k), uvr.v0 + (uvr.v1 - uvr.v0) * uv.getY(k));
      }
      g.rotateY(q.rotY);
      g.translate(q.x, H_BOARD + 0.02, q.z);
      batch.add(g, q.group);
    }
    const built = batch.build();
    own(built.geometry);
    labels = new LiftableBatch(built.geometry, built.ranges, mats.label);
    labels.mesh.renderOrder = 2;
    group.add(labels.mesh);
    labels.applyColor(-1, LABEL_STATIC);
    labels.applyColor(-2, LABEL_STATIC);
    for (const p of periods) applyPeriodVisual(p);
    opt.onDirty?.();
  };
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || fonts.status === 'loaded') paintText();
  else void fonts.ready.then(paintText, paintText);

  // ---- 月のアイコン（month_icons.png があるとき、月名ラベルの横に貼る） ---------------
  const buildIcons = (tex: Texture): void => {
    if (icons) {
      group.remove(icons.mesh);
      icons.mesh.geometry.dispose();
      icons = null;
    }
    mats.setIconTexture(tex);
    const batch = new GeometryBatch();
    for (const sec of layout.sectors) {
      const month = PERIOD_MONTHS[sec.period] ?? 4;
      const cell = (month + 8) % 12; // 4月 = 0, 5月 = 1, ..., 3月 = 11
      const uvr = gridCellUv(ART_GRID.month_icons, cell);
      const size = 3.7;
      const g = layFlat(new PlaneGeometry(size, size));
      const uv = g.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, uvr.u0 + (uvr.u1 - uvr.u0) * uv.getX(k), uvr.v0 + (uvr.v1 - uvr.v0) * uv.getY(k));
      }
      // ラベルの文字（数字 1〜2 桁 + 月）の左側に置く
      const digits = String(month).length;
      const offset = -(0.575 * digits + 1.03 + 0.5 + size / 2);
      g.rotateY(sec.label.rotY);
      const cs = Math.cos(sec.label.rotY);
      const sn = Math.sin(sec.label.rotY);
      g.translate(sec.label.x + offset * cs, H_BOARD + 0.022, sec.label.z - offset * sn);
      batch.add(g, sec.period);
    }
    if (batch.size === 0) return;
    const built = batch.build();
    own(built.geometry);
    icons = new LiftableBatch(built.geometry, built.ranges, mats.icons);
    icons.mesh.renderOrder = 2;
    group.add(icons.mesh);
    for (const p of periods) applyPeriodVisual(p);
    opt.onDirty?.();
  };

  const applyArt = (name: ArtName, tex: Texture): void => {
    if (disposed) return;
    switch (name) {
      case 'board_ground': {
        mats.prepareGround(tex, groundSide);
        groundMesh.visible = true;
        ledgerMesh.visible = false;
        for (const d of decor) d.visible = false;
        opt.onDirty?.();
        break;
      }
      case 'month_icons':
        buildIcons(tex);
        break;
      case 'kind_icons': {
        const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
        if (!img) break;
        kindIcons = { image: img, width: img.width, height: img.height, ...ART_GRID.kind_icons };
        paintTiles();
        break;
      }
      default:
        break;
    }
  };
  for (const [name, tex] of Object.entries(opt.art ?? {}) as [ArtName, Texture][]) applyArt(name, tex);

  // ---- 目印（スタート旗・決算棟） -------------------------------------------
  const landmarks = buildLandmarks(layout, mats, opt.quality);
  group.add(landmarks.group);

  // 初期状態を反映
  for (const p of periods) applyPeriodVisual(p);

  const outlinePts: Vector3[] = [];
  {
    const b = layout.bounds;
    for (const x of [b.minX, b.maxX]) {
      for (const z of [b.minZ, b.maxZ]) {
        outlinePts.push(new Vector3(x, H_BOARD, z));
      }
    }
    if (layout.building) {
      outlinePts.push(new Vector3(layout.building.x, 15, layout.building.z - 5));
      outlinePts.push(new Vector3(layout.building.x, 15, layout.building.z + 5));
    }
  }

  const tmp = new Matrix4();
  const view: BoardView = {
    group,
    layout,
    squareTop(index, out) {
      const L = layout.byIndex.get(index);
      if (!L) return null;
      return out.set(L.x, TILE_TOP_Y + liftOf(L.period), L.z);
    },
    periodOf(index) {
      return layout.byIndex.get(index)?.period ?? 0;
    },
    setCurrentPeriod(period, immediate) {
      const known = tNow.has(period);
      for (const p of periods) {
        const goal = !known || p === period ? 1 : 0;
        tGoal.set(p, goal);
        if (immediate) {
          tNow.set(p, goal);
          applyPeriodVisual(p);
        }
      }
    },
    markDone(index, done, immediate) {
      const i = posInLayout.get(index);
      if (i === undefined) return;
      stampTarget[i] = done ? 1 : 0;
      if (immediate) {
        stampT[i] = done ? 1 : 0;
        stampMatrix(i, tmp);
        stamps.setMatrixAt(i, tmp);
        stamps.instanceMatrix.needsUpdate = true;
      }
    },
    update(dt) {
      let moved = false;
      for (const p of periods) {
        const a = tNow.get(p) ?? 1;
        const b = tGoal.get(p) ?? 1;
        if (a !== b) {
          const step = HIGHLIGHT_RATE * dt;
          tNow.set(p, a < b ? Math.min(b, a + step) : Math.max(b, a - step));
          applyPeriodVisual(p);
          moved = true;
        }
      }
      let stampDirty = false;
      for (let i = 0; i < nSq; i++) {
        const goal = stampTarget[i]!;
        const cur = stampT[i]!;
        if (cur !== goal) {
          const speed = goal > cur ? 1 / 0.42 : 1 / 0.16;
          stampT[i] = goal > cur ? Math.min(goal, cur + dt * speed) : Math.max(goal, cur - dt * speed);
          stampMatrix(i, tmp);
          stamps.setMatrixAt(i, tmp);
          stampDirty = true;
        }
      }
      if (stampDirty) {
        stamps.instanceMatrix.needsUpdate = true;
        moved = true;
      }
      return moved;
    },
    applyArt,
    fitPoints: () => outlinePts.map((p) => p.clone()),
    dispose() {
      disposed = true;
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
      for (const g of owned) g.dispose();
      landmarks.dispose();
      stamps.dispose();
      if (tileTex) {
        if (mats.tilePaper.map === tileTex) mats.setTileAtlas(null);
        tileTex.dispose();
      }
      if (labelTex) {
        if (mats.label.map === labelTex) mats.setLabelAtlas(null);
        labelTex.dispose();
      }
    },
  };
  return view;
};
