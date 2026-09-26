import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Shape,
  SphereGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROULETTE_SEGMENTS, ROULETTE_SEGMENT_COUNT, ROULETTE_SEGMENT_DEG, finalWheelAngleDeg } from '@/core/game/roulette';
import type { RollPlan } from '@/core/game/types';
import { H_BOARD } from './layout';
import type { Materials, Quality } from './materials';
import { FONT_SANS, finishTexture, makeCanvas } from './textures';

export interface RouletteView {
  readonly group: Group;
  /** 回転盤の現在角（度・時計回り） */
  angleDeg(): number;
  /** 指針の振れ（ラジアン。+ は時計回り） */
  flapRad(): number;
  /** plan の出目まで回す。instant なら演出なしで角度だけ合わせる。 */
  spin(plan: RollPlan, instant: boolean): Promise<void>;
  /** 毎フレーム。動いていたら true。 */
  update(dt: number): boolean;
  isBusy(): boolean;
  dispose(): void;
}

/** 飴玉のような色。[面の色, 文字のふち（同系の濃い色）] */
const SEGMENT_COLORS: Record<number, readonly [string, string]> = {
  1: ['#ff8fba', '#d94585'],
  2: ['#ffd84a', '#d99a00'],
  3: ['#5fdcab', '#1f9c72'],
  4: ['#5cb9ff', '#2b7fd4'],
};

const deg = (d: number): number => (d * Math.PI) / 180;
const mod360 = (d: number): number => ((d % 360) + 360) % 360;

/** 回転盤の絵（上から見た図）。canvas の上が指針の位置、時計回りに区画 0..7。 */
const paintWheel = (size: number): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const R = size / 2;
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();
  const segR = R * 0.84;
  const segDeg = ROULETTE_SEGMENT_DEG;
  for (let i = 0; i < ROULETTE_SEGMENT_COUNT; i++) {
    const value = ROULETTE_SEGMENTS[i] ?? 1;
    const [base] = SEGMENT_COLORS[value] ?? ['#888888', '#444444'];
    const a0 = deg(i * segDeg - segDeg / 2 - 90);
    const a1 = deg(i * segDeg + segDeg / 2 - 90);
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, segR, a0, a1);
    ctx.closePath();
    ctx.fill();
    // 飴玉のつや: 外側にやわらかい白、中心側にほんのり影
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, segR, a0, a1);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createRadialGradient(c, c, R * 0.12, c, c, segR);
    g.addColorStop(0, 'rgba(120,40,80,0.16)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // 区画の中央に沿った細長いハイライト
    ctx.translate(c, c);
    ctx.rotate(deg(i * segDeg));
    const hl = ctx.createLinearGradient(0, -segR * 0.94, 0, -segR * 0.5);
    hl.addColorStop(0, 'rgba(255,255,255,0.0)');
    hl.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.ellipse(-R * 0.12, -segR * 0.72, R * 0.05, segR * 0.2, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 区切りの線と輪
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = R * 0.016;
  for (let i = 0; i < ROULETTE_SEGMENT_COUNT; i++) {
    const a = deg(i * segDeg + segDeg / 2 - 90);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.19, c + Math.sin(a) * R * 0.19);
    ctx.lineTo(c + Math.cos(a) * segR, c + Math.sin(a) * segR);
    ctx.stroke();
  }
  ctx.lineWidth = R * 0.022;
  ctx.beginPath();
  ctx.arc(c, c, segR, 0, Math.PI * 2);
  ctx.stroke();
  // 外周の帯（ピンの受け座）: パステルの水玉
  ctx.fillStyle = '#ffd3e2';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.985, 0, Math.PI * 2);
  ctx.arc(c, c, segR + R * 0.012, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 32; i++) {
    const a = deg(i * 11.25 + 5.6 - 90);
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.925, c + Math.sin(a) * R * 0.925, R * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  // 数字とドット（数字の上が外周側）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ROULETTE_SEGMENT_COUNT; i++) {
    const value = ROULETTE_SEGMENTS[i] ?? 1;
    const [, edge] = SEGMENT_COLORS[value] ?? ['#888888', '#444444'];
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(deg(i * segDeg));
    ctx.translate(0, -R * 0.56);
    ctx.font = `900 ${R * 0.34}px ${FONT_SANS}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = R * 0.075;
    ctx.strokeStyle = edge;
    ctx.strokeText(String(value), 0, R * 0.014);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(value), 0, R * 0.014);
    ctx.restore();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(deg(i * segDeg));
    ctx.translate(0, -R * 0.75);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let k = 0; k < value; k++) {
      ctx.beginPath();
      ctx.arc((k - (value - 1) / 2) * R * 0.07, 0, R * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 16 });
};

const lathe = (pts: readonly (readonly [number, number])[], segments: number): LatheGeometry =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

export const buildRoulette = (
  center: { x: number; z: number; radius: number },
  mats: Materials,
  quality: Quality,
  maxAniso: number,
): RouletteView => {
  const R0 = center.radius;
  const Rw = R0 - 4.8; // 回転盤の半径
  const faceR = Rw - 0.35;
  const rp = faceR * 0.92; // ピンの半径
  const Dp = Rw + 3.0; // 指針の支点までの距離（中心から）
  const tipR = rp - 0.4;
  const Lb = Dp - tipR; // 指針の長さ
  const seg = quality === 'high' ? 128 : 64;
  const group = new Group();
  group.name = 'roulette';
  group.position.set(center.x, H_BOARD, center.z);
  const geos: BufferGeometry[] = [];
  const disposables: { dispose(): void }[] = [];
  const g = <T extends BufferGeometry>(x: T): T => {
    geos.push(x);
    return x;
  };
  const add = (parent: Group, geo: BufferGeometry, mat: Mesh['material'], cast = true): Mesh => {
    const m = new Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ハウジング（成形プラスチックの皿）
  const shell = mats.prop('pink');
  const white = mats.prop('white');
  add(
    group,
    g(
      lathe(
        [
          [R0 - 0.2, 0],
          [R0, 0.3],
          [R0, 0.95],
          [R0 - 0.12, 1.4],
          [R0 - 0.5, 1.74],
          [R0 - 1.1, 1.9],
          [R0 - 2.5, 1.94],
          [R0 - 3.15, 1.86],
          [R0 - 3.65, 1.6],
          [R0 - 3.95, 1.28],
          [R0 - 4.1, 0.95],
          [R0 - 4.25, 0.78],
          [R0 - 4.4, 0.7],
        ],
        seg,
      ),
    ),
    shell,
  );
  // ハウジングの縁に並べた真珠のような飾り
  {
    const pearls: BufferGeometry[] = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = R0 - 1.75;
      const sph = new SphereGeometry(0.34, 12, 8);
      sph.translate(Math.sin(a) * r, 1.9, -Math.cos(a) * r);
      pearls.push(sph);
    }
    const merged = mergeGeometries(pearls);
    for (const p of pearls) p.dispose();
    if (merged) add(group, g(merged), white, false);
  }
  // 皿の底（スカイブルー）
  const floorMat = new MeshPhysicalMaterial({ color: '#8fd3ff', roughness: 0.6, clearcoat: 0.15 });
  disposables.push(floorMat);
  add(group, g(new CircleGeometry(R0 - 4.3, seg).rotateX(-Math.PI / 2)), floorMat, false).position.y = 0.69;

  // 回転盤
  const wheel = new Group();
  wheel.position.y = 0;
  group.add(wheel);
  add(wheel, g(new CylinderGeometry(Rw, Rw, 0.34, seg)), white).position.y = 0.94;
  add(
    wheel,
    g(
      lathe(
        [
          [Rw + 0.1, 0.78],
          [Rw + 0.12, 1.0],
          [Rw, 1.16],
          [Rw - 0.3, 1.22],
          [Rw - 0.7, 1.11],
        ],
        seg,
      ),
    ),
    white,
    false,
  );
  const faceTex = paintWheel(quality === 'high' ? 2048 : 1024);
  faceTex.anisotropy = Math.min(maxAniso, 16);
  disposables.push(faceTex);
  const faceMat = new MeshPhysicalMaterial({ map: faceTex, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  disposables.push(faceMat);
  add(wheel, g(new CircleGeometry(faceR, seg).rotateX(-Math.PI / 2)), faceMat, false).position.y = 1.112;
  // 中央のキャップ
  add(
    wheel,
    g(
      lathe(
        [
          [3.1, 1.1],
          [2.95, 1.5],
          [2.5, 1.98],
          [1.8, 2.42],
          [0.9, 2.66],
          [0, 2.7],
        ],
        64,
      ),
    ),
    mats.prop('lemonDeep'),
  );
  add(wheel, g(new SphereGeometry(0.62, 20, 14)), mats.prop('coralDeep')).position.y = 2.72;
  // 外周のピン（区画の境目）
  const pinGeos: BufferGeometry[] = [];
  for (let i = 0; i < ROULETTE_SEGMENT_COUNT; i++) {
    const a = deg(i * ROULETTE_SEGMENT_DEG + ROULETTE_SEGMENT_DEG / 2);
    const px = Math.sin(a) * rp;
    const pz = -Math.cos(a) * rp;
    const shaft = new CylinderGeometry(0.34, 0.4, 1.25, 14);
    shaft.translate(px, 1.1 + 0.62, pz);
    const cap = new SphereGeometry(0.46, 14, 10);
    cap.translate(px, 2.32, pz);
    pinGeos.push(shaft, cap);
  }
  const pins = mergeGeometries(pinGeos);
  for (const p of pinGeos) p.dispose();
  if (pins) add(wheel, g(pins), white);

  // 指針（フラッパー）。支点は中心から見て真上（-z）。
  const flapper = new Group();
  flapper.position.set(0, 0, -Dp);
  group.add(flapper);
  add(flapper, g(new CylinderGeometry(0.95, 1.05, 0.55, 24)), white).position.y = 2.15;
  add(flapper, g(new CylinderGeometry(0.62, 0.62, 0.32, 20)), mats.prop('coralDeep')).position.y = 2.55;
  {
    const s = new Shape();
    s.moveTo(-0.62, 0);
    s.lineTo(-0.16, -(Lb - 0.16));
    s.absarc(0, -(Lb - 0.16), 0.16, Math.PI, 2 * Math.PI, false);
    s.lineTo(0.62, 0);
    s.closePath();
    const blade = g(new ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }));
    blade.rotateX(-Math.PI / 2);
    // shape の -y 方向 = 中心向き。rotateX(-90°) で -y → +z
    blade.translate(0, 2.0, 0);
    add(flapper, blade, mats.prop('coralDeep'));
  }

  // ---- 動き --------------------------------------------------------------
  let angle = 0; // 度
  let flap = 0; // ラジアン（+ は時計回りに押された向き）
  let flapVel = 0;
  const pinAngles: number[] = [];
  for (let i = 0; i < ROULETTE_SEGMENT_COUNT; i++) pinAngles.push(deg(i * ROULETTE_SEGMENT_DEG + ROULETTE_SEGMENT_DEG / 2));

  const K = 720;
  const C = 11.5;
  /** ピンが指針を押せる最大の角速度。速く回っているときは押し切れず小さく震えるだけになる。 */
  const V_MAX = 26;
  const FLAP_LIMIT = 0.7;

  const stepFlapper = (thetaRad: number, h: number): void => {
    // ばね + 減衰
    flapVel += (-K * flap - C * flapVel) * h;
    flap += flapVel * h;
    // ピンが指針の側面に当たっている間は、指針がピンに沿って押し出される
    for (const p of pinAngles) {
      const al = p + thetaRad;
      const vx = rp * Math.sin(al);
      const vz = Dp - rp * Math.cos(al);
      if (vz <= 0) continue;
      if (Math.hypot(vx, vz) > Lb + 0.05) continue;
      const beta = Math.atan2(vx, vz);
      if (beta > flap) {
        const step = Math.min(beta - flap, V_MAX * h);
        flap += step;
        flapVel = Math.max(flapVel, step / h);
      }
    }
    if (flap > FLAP_LIMIT) {
      flap = FLAP_LIMIT;
      flapVel = Math.min(flapVel, 0);
    } else if (flap < -FLAP_LIMIT) {
      flap = -FLAP_LIMIT;
      flapVel = Math.max(flapVel, 0);
    }
  };

  const advanceFlapper = (from: number, to: number, dt: number): void => {
    // 高速時にピンが指針を飛び越えないよう、ピン通過の刻みに合わせて細かく進める
    const arcPerSec = Math.abs(deg(to - from)) * rp / Math.max(dt, 1e-4);
    const subs = Math.min(64, Math.max(4, Math.ceil((arcPerSec * dt) / 0.4)));
    const h = dt / subs;
    for (let i = 1; i <= subs; i++) {
      const a = from + ((to - from) * i) / subs;
      stepFlapper(deg(a), h);
    }
  };

  const applyPose = (): void => {
    wheel.rotation.y = -deg(angle);
    flapper.rotation.y = flap;
  };

  let active: {
    start: number;
    from: number;
    total: number;
    dur: number;
    tau: number;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null = null;

  const finish = (): void => {
    if (!active) return;
    const a = active;
    active = null;
    if (a.timer !== undefined) clearTimeout(a.timer);
    angle = mod360(a.from + a.total);
    applyPose();
    a.resolve();
  };

  const view: RouletteView = {
    group,
    angleDeg: () => angle,
    flapRad: () => flap,
    isBusy: () => active !== null || Math.abs(flap) > 1e-4 || Math.abs(flapVel) > 1e-3,
    spin(plan, instant) {
      finish();
      const base = mod360(finalWheelAngleDeg(plan));
      if (instant) {
        angle = base;
        flap = 0;
        flapVel = 0;
        applyPose();
        return new Promise<void>((resolve) => setTimeout(resolve, 120));
      }
      // 今の角度から数周まわして、最後に base（mod 360）へ合わせる
      const delta = (base - mod360(angle) + 360) % 360;
      return new Promise<void>((resolve) => {
        const dur = Math.max(0.6, plan.durationMs / 1000);
        active = {
          start: performance.now(),
          from: angle,
          total: plan.turns * 360 + delta,
          dur,
          tau: dur / 6,
          resolve,
          timer: undefined,
        };
        // タブが裏に回って描画が止まっても、時間が来たら必ず完了させる
        active.timer = setTimeout(finish, dur * 1000 + 120);
      });
    },
    update(dt) {
      let moving = false;
      if (active) {
        const t = Math.min(active.dur, (performance.now() - active.start) / 1000);
        const k = (1 - Math.exp(-t / active.tau)) / (1 - Math.exp(-active.dur / active.tau));
        const next = active.from + active.total * k;
        advanceFlapper(angle, next, dt);
        angle = next;
        moving = true;
        if (t >= active.dur) finish();
      } else if (Math.abs(flap) > 1e-4 || Math.abs(flapVel) > 1e-3) {
        // 止まったあとの指針の揺れ戻し
        const h = 1 / 240;
        const n = Math.max(1, Math.min(16, Math.round(dt / h)));
        for (let i = 0; i < n; i++) {
          flapVel += (-K * flap - C * flapVel) * h;
          flap += flapVel * h;
        }
        if (Math.abs(flap) < 1e-4 && Math.abs(flapVel) < 1e-3) {
          flap = 0;
          flapVel = 0;
        }
        moving = true;
      }
      applyPose();
      return moving;
    },
    dispose() {
      if (active?.timer !== undefined) clearTimeout(active.timer);
      active = null;
      for (const x of geos) x.dispose();
      for (const d of disposables) d.dispose();
    },
  };
  applyPose();
  return view;
};
