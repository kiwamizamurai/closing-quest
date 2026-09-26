import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export type FocusMode = 'overview' | 'roulette' | 'token' | 'square';

/** UI パネルが開いたとき、画面右側で隠れる割合（画面幅の約 46%）。 */
export const PANEL_FRACTION = 0.46;

export interface CameraGoal {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  /** 水平回転（rad、0 = 手前から） */
  az: number;
  /** 仰角（rad） */
  el: number;
}

interface Damped {
  v: number;
  vel: number;
}

const damp = (s: Damped, goal: number, smoothTime: number, dt: number): void => {
  // 臨界減衰ばね（Game Programming Gems 4 の SmoothDamp）
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = s.v - goal;
  const temp = (s.vel + omega * change) * dt;
  s.vel = (s.vel - omega * temp) * e;
  s.v = goal + (change + temp) * e;
};

const SMOOTH = { target: 0.34, dist: 0.6, angle: 0.55, panel: 0.5 };

/**
 * カメラの補間（臨界減衰ばね）と、パネルが開いたときの描画中心のずらし（setViewOffset）。
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  reducedMotion = false;

  private w = 1;
  private h = 1;
  private readonly tx: Damped = { v: 0, vel: 0 };
  private readonly ty: Damped = { v: 0, vel: 0 };
  private readonly tz: Damped = { v: 0, vel: 0 };
  private readonly dist: Damped = { v: 120, vel: 0 };
  private readonly az: Damped = { v: 0, vel: 0 };
  private readonly el: Damped = { v: 0.95, vel: 0 };
  private readonly panel: Damped = { v: 0, vel: 0 };
  private goal: CameraGoal = { tx: 0, ty: 0, tz: 0, dist: 120, az: 0, el: 0.95 };
  private panelGoal = 0;
  private moving = true;
  private readonly scratch = new PerspectiveCamera(35, 1, 3, 2000);

  constructor(fov = 35) {
    this.camera = new PerspectiveCamera(fov, 1, 3, 2200);
    this.scratch.fov = fov;
  }

  get aspect(): number {
    return this.w / Math.max(1, this.h);
  }

  /** 現在の（補間中の）注視点 */
  get target(): Vector3 {
    return new Vector3(this.tx.v, this.ty.v, this.tz.v);
  }

  get panelAmount(): number {
    return this.panel.v;
  }

  get panelTarget(): number {
    return this.panelGoal;
  }

  setViewport(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.scratch.aspect = this.camera.aspect;
    this.scratch.updateProjectionMatrix();
    this.moving = true;
  }

  setPanel(open: boolean): void {
    this.panelGoal = open ? 1 : 0;
    if (this.reducedMotion) {
      this.panel.v = this.panelGoal;
      this.panel.vel = 0;
    }
    this.moving = true;
  }

  setGoal(g: CameraGoal): void {
    this.goal = g;
    if (this.reducedMotion) this.snap();
    this.moving = true;
  }

  snap(): void {
    for (const [d, v] of [
      [this.tx, this.goal.tx],
      [this.ty, this.goal.ty],
      [this.tz, this.goal.tz],
      [this.dist, this.goal.dist],
      [this.az, this.goal.az],
      [this.el, this.goal.el],
      [this.panel, this.panelGoal],
    ] as const) {
      d.v = v;
      d.vel = 0;
    }
    this.moving = true;
  }

  isMoving(): boolean {
    return this.moving;
  }

  /** 注視点・距離・角度から、指定の点列がすべて視野に収まる最小の距離を返す。 */
  fitDistance(
    points: readonly Vector3[],
    target: Vector3,
    az: number,
    el: number,
    marginX: number,
    marginY: number,
    panelAmount: number,
  ): number {
    const cam = this.scratch;
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const v = new Vector3();
    const fx = marginX * (1 - PANEL_FRACTION * panelAmount);
    const fits = (d: number): boolean => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      for (const p of points) {
        v.copy(p).project(cam);
        if (Math.abs(v.x) > fx || Math.abs(v.y) > marginY) return false;
      }
      return true;
    };
    let lo = 8;
    let hi = 1400;
    if (fits(lo)) return lo;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  update(dt: number): void {
    const g = this.goal;
    const before = this.dist.v + this.tx.v + this.ty.v + this.tz.v + this.az.v + this.el.v + this.panel.v;
    if (this.reducedMotion) {
      this.snap();
    } else {
      const h = Math.min(dt, 0.1);
      damp(this.tx, g.tx, SMOOTH.target, h);
      damp(this.ty, g.ty, SMOOTH.target, h);
      damp(this.tz, g.tz, SMOOTH.target, h);
      damp(this.dist, g.dist, SMOOTH.dist, h);
      damp(this.az, g.az, SMOOTH.angle, h);
      damp(this.el, g.el, SMOOTH.angle, h);
      damp(this.panel, this.panelGoal, SMOOTH.panel, h);
    }
    const cosEl = Math.cos(this.el.v);
    const cam = this.camera;
    cam.position.set(
      this.tx.v + Math.sin(this.az.v) * cosEl * this.dist.v,
      this.ty.v + Math.sin(this.el.v) * this.dist.v,
      this.tz.v + Math.cos(this.az.v) * cosEl * this.dist.v,
    );
    cam.lookAt(this.tx.v, this.ty.v, this.tz.v);
    // パネルが開く間、描画の中心を左へずらす（見えている左側の中央に注視点が来る）
    const shift = MathUtils.clamp(this.panel.v, 0, 1) * 0.5 * PANEL_FRACTION * this.w;
    if (shift > 0.25) cam.setViewOffset(this.w, this.h, shift, 0, this.w, this.h);
    else if (cam.view?.enabled) cam.clearViewOffset();
    cam.updateMatrixWorld(true);
    const after = this.dist.v + this.tx.v + this.ty.v + this.tz.v + this.az.v + this.el.v + this.panel.v;
    const speed =
      Math.abs(this.tx.vel) + Math.abs(this.ty.vel) + Math.abs(this.tz.vel) + Math.abs(this.dist.vel) +
      Math.abs(this.az.vel) * 10 + Math.abs(this.el.vel) * 10 + Math.abs(this.panel.vel) * 100;
    this.moving = Math.abs(after - before) > 1e-5 || speed > 1e-3 || this.needsGoal();
  }

  private needsGoal(): boolean {
    const g = this.goal;
    return (
      Math.abs(this.tx.v - g.tx) > 0.005 ||
      Math.abs(this.ty.v - g.ty) > 0.005 ||
      Math.abs(this.tz.v - g.tz) > 0.005 ||
      Math.abs(this.dist.v - g.dist) > 0.01 ||
      Math.abs(this.az.v - g.az) > 1e-4 ||
      Math.abs(this.el.v - g.el) > 1e-4 ||
      Math.abs(this.panel.v - this.panelGoal) > 1e-3
    );
  }
}
