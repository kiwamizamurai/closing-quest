import {
  Color,
  DirectionalLight,
  Fog,
  MathUtils,
  NeutralToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { RollPlan, Square } from '@/core/game/types';
import type { ArtName } from './art';
import { buildBoard, type BoardView } from './board';
import { CameraRig, type CameraGoal, type FocusMode } from './cameraRig';
import { buildDesk, type DeskView } from './desk';
import { H_BOARD } from './layout';
import { Materials, textureSource, type Quality } from './materials';
import { buildRoulette, type RouletteView } from './roulette';
import { makeStampTexture } from './tileArt';
import { buildToken, type TokenView } from './token';

export interface RendererOptions {
  quality?: 'low' | 'high';
  reducedMotion?: boolean;
}

export interface BoardRenderer {
  setBoard(squares: readonly Square[]): void;
  placeToken(index: number): void;
  moveToken(path: readonly number[]): Promise<void>;
  spinRoulette(plan: RollPlan): Promise<void>;
  setFocus(mode: 'overview' | 'roulette' | 'token' | 'square', index?: number): void;
  setPanelOpen(open: boolean): void;
  markSquareDone(index: number, done: boolean): void;
  setCurrentPeriod(period: number): void;
  setQuality(q: 'low' | 'high'): void;
  dispose(): void;
}

const deg = (d: number): number => (d * Math.PI) / 180;
const MOVE_BUDGET_S = 1.9;
const BG = '#ffe9dd';
const ART_NAMES: readonly ArtName[] = ['desk_wood', 'board_ground', 'month_icons', 'kind_icons'];

interface MoveState {
  readonly indices: number[];
  /** 現在のホップ（indices[hop] -> indices[hop+1]） */
  hop: number;
  t: number;
  readonly hopDur: number;
  finishing: number | null;
  readonly resolve: () => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

class BoardRendererImpl implements BoardRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rig: CameraRig;
  private materials: Materials;
  private readonly pmrem: PMREMGenerator;
  private envRT: WebGLRenderTarget | null = null;
  private readonly key: DirectionalLight;
  private readonly fill: DirectionalLight;
  private readonly keyOffset = new Vector3(-95, 190, 110);

  private board: BoardView | null = null;
  private roulette: RouletteView | null = null;
  private desk: DeskView | null = null;
  private token: TokenView | null = null;
  private squares: readonly Square[] = [];

  private quality: Quality;
  private reducedMotion: boolean;
  private width = 1;
  private height = 1;
  private disposed = false;
  private raf = 0;
  private last = 0;
  private idleFrames = 0;
  private dirty = true;
  private readonly ro: ResizeObserver;

  private focusMode: FocusMode = 'overview';
  private focusIndex: number | undefined;
  private currentPeriod: number | null = null;
  private readonly done = new Set<number>();

  private tokenIndex: number | null = null;
  private readonly tokenGround = new Vector3();
  private tokenLand = 10; // 直近の着地からの経過秒
  private move: MoveState | null = null;

  private readonly art: Partial<Record<ArtName, Texture>> = {};
  private fitOverview: [number, number] = [160, 200];
  private fitRoulette: [number, number] = [70, 90];
  private boardCenter = new Vector3(0, H_BOARD, 0);
  private shadowHalf = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: RendererOptions,
  ) {
    this.quality = opts.quality ?? 'high';
    this.reducedMotion = opts.reducedMotion ?? false;
    const high = this.quality === 'high';
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: high,
      powerPreference: 'high-performance',
    });
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.type = PCFShadowMap;
    r.setClearColor(new Color(BG));
    this.materials = this.makeMaterials();

    this.scene.background = new Color(BG);
    this.scene.fog = new Fog(BG, 330, 950);
    this.pmrem = new PMREMGenerator(r);
    this.envRT = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;

    // 暖色のキーライト 1 灯 + 弱い補助光
    this.key = new DirectionalLight(0xfff0dc, 2.6);
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.05;
    this.key.shadow.radius = 3;
    this.key.shadow.camera.near = 10;
    this.key.shadow.camera.far = 700;
    this.scene.add(this.key, this.key.target);
    this.fill = new DirectionalLight(0xcfe2ff, 0.6);
    this.fill.position.set(120, 90, 130);
    this.scene.add(this.fill);

    this.rig = new CameraRig(35);
    this.rig.reducedMotion = this.reducedMotion;
    this.scene.add(this.rig.camera);

    this.applyQuality();
    this.token = buildToken(this.materials);
    this.token.root.visible = false;
    this.scene.add(this.token.root);

    this.ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      this.resize(e.contentRect.width, e.contentRect.height);
    });
    this.ro.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    this.resize(rect.width || canvas.clientWidth || 800, rect.height || canvas.clientHeight || 600);

    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    // イラスト素材（あれば使う）。無ければ手続き生成のまま。
    for (const name of ART_NAMES) void this.loadArtFile(name);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- 初期化まわり ------------------------------------------------------------
  private makeMaterials(): Materials {
    const m = new Materials(this.renderer.capabilities.getMaxAnisotropy(), this.quality);
    m.setStampMap(makeStampTexture());
    const desk = this.art.desk_wood;
    if (desk) m.applyDeskArt(desk);
    return m;
  }

  private async loadArtFile(name: ArtName): Promise<void> {
    const tex = await textureSource.file(name);
    if (!tex) return;
    if (this.disposed) {
      tex.dispose();
      return;
    }
    this.art[name] = tex;
    if (name === 'desk_wood') this.materials.applyDeskArt(tex);
    else this.board?.applyArt(name, tex);
    this.wake();
  }

  private applyQuality(): void {
    const high = this.quality === 'high';
    this.renderer.shadowMap.enabled = high;
    this.key.castShadow = high;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.width, this.height, false);
    this.materials.refresh();
    this.wake();
  }

  private pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.quality === 'high' ? Math.min(dpr, 2) : 1;
  }

  private resize(w: number, h: number): void {
    if (this.disposed) return;
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.width, this.height, false);
    this.rig.setViewport(this.width, this.height);
    this.refit();
    this.wake();
  }

  private readonly onVisibility = (): void => {
    this.last = performance.now();
    this.wake();
  };

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private wake(): void {
    this.idleFrames = 0;
    this.dirty = true;
  }

  // ---- 盤面 -------------------------------------------------------------------
  setBoard(squares: readonly Square[]): void {
    if (this.disposed) return;
    this.squares = squares;
    this.disposeWorld();
    const maxTex = this.renderer.capabilities.maxTextureSize;
    const board = buildBoard(squares, this.materials, {
      quality: this.quality,
      maxTexture: maxTex,
      maxAniso: this.renderer.capabilities.getMaxAnisotropy(),
      onDirty: () => this.wake(),
      art: this.art,
    });
    this.board = board;
    this.scene.add(board.group);
    const lay = board.layout;
    this.roulette = buildRoulette(lay.roulette, this.materials, this.quality, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.roulette.group);
    this.desk = buildDesk(lay, this.materials, this.quality);
    this.scene.add(this.desk.group);
    const shadowCasters = (o: { traverse: (f: (c: import('three').Object3D) => void) => void }): void => {
      o.traverse((c) => {
        const m = c as import('three').Mesh;
        if (m.isMesh) m.frustumCulled = true;
      });
    };
    shadowCasters(this.scene);

    // 保持している状態を新しい盤面へ反映
    if (this.currentPeriod !== null) board.setCurrentPeriod(this.currentPeriod, true);
    for (const i of this.done) board.markDone(i, true, true);
    this.boardCenter.set((lay.bounds.minX + lay.bounds.maxX) / 2, H_BOARD, 0);
    this.refit();
    if (this.tokenIndex !== null) this.snapTokenToIndex(this.tokenIndex);
    this.rig.setGoal(this.computeGoal());
    this.rig.snap();
    this.wake();
  }

  private disposeWorld(): void {
    this.finishMove();
    if (this.board) {
      this.scene.remove(this.board.group);
      this.board.dispose();
      this.board = null;
    }
    if (this.roulette) {
      this.scene.remove(this.roulette.group);
      this.roulette.dispose();
      this.roulette = null;
    }
    if (this.desk) {
      this.scene.remove(this.desk.group);
      this.desk.dispose();
      this.desk = null;
    }
  }

  /** ビューポートや盤面が変わったときの、概観・ルーレットの距離の再計算。 */
  private refit(): void {
    const b = this.board;
    if (!b) return;
    const el = deg(54);
    const pts = b.fitPoints();
    this.fitOverview = [
      this.rig.fitDistance(pts, this.boardCenter, 0, el, 0.93, 0.9, 0),
      this.rig.fitDistance(pts, this.boardCenter, 0, el, 0.93, 0.9, 1),
    ];
    const rc = b.layout.roulette;
    const c = new Vector3(rc.x, H_BOARD + 1, rc.z);
    const ring: Vector3[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      for (const y of [0, 3.2]) ring.push(new Vector3(rc.x + Math.sin(a) * (rc.radius + 0.6), H_BOARD + y, rc.z - Math.cos(a) * (rc.radius + 0.6)));
    }
    this.fitRoulette = [
      this.rig.fitDistance(ring, c, 0, deg(62), 0.78, 0.8, 0),
      this.rig.fitDistance(ring, c, 0, deg(62), 0.78, 0.8, 1),
    ];
    this.wake();
  }

  // ---- 駒 ---------------------------------------------------------------------
  private groundOf(index: number, out: Vector3): boolean {
    return this.board?.squareTop(index, out) != null;
  }

  private snapTokenToIndex(index: number): void {
    if (!this.token) return;
    if (!this.groundOf(index, this.tokenGround)) {
      this.token.root.visible = false;
      return;
    }
    this.token.root.visible = true;
    this.token.setPose(this.tokenGround.x, this.tokenGround.y, this.tokenGround.z, 0, 0, 0, 0);
  }

  placeToken(index: number): void {
    if (this.disposed) return;
    this.finishMove();
    this.tokenIndex = index;
    this.tokenLand = 10;
    this.snapTokenToIndex(index);
    this.wake();
  }

  moveToken(path: readonly number[]): Promise<void> {
    if (this.disposed || !this.board || !this.token) return Promise.resolve();
    this.finishMove();
    const indices: number[] = [];
    if (this.tokenIndex !== null) indices.push(this.tokenIndex);
    for (const p of path) {
      if (indices.length === 0 && this.board.layout.byIndex.has(p)) {
        indices.push(p);
        continue;
      }
      if (indices[indices.length - 1] !== p && this.board.layout.byIndex.has(p)) indices.push(p);
    }
    const last = indices[indices.length - 1];
    if (indices.length < 2 || last === undefined) {
      if (last !== undefined) this.placeToken(last);
      return Promise.resolve();
    }
    if (this.reducedMotion) {
      this.placeToken(last);
      return Promise.resolve();
    }
    const hops = indices.length - 1;
    const hopDur = MathUtils.clamp(MOVE_BUDGET_S / hops, 0.13, 0.42);
    this.wake();
    return new Promise<void>((resolve) => {
      const st: MoveState = {
        indices,
        hop: 0,
        t: 0,
        hopDur,
        finishing: null,
        resolve,
        timer: undefined,
      };
      // 描画が止まっても（タブが裏）、時間が来たら必ず終わらせる
      st.timer = setTimeout(() => {
        if (this.move === st) this.finishMove();
      }, (hops * hopDur + 0.4) * 1000 + 200);
      this.move = st;
    });
  }

  /** 進行中の移動を最終マスで完了させる。 */
  private finishMove(): void {
    const m = this.move;
    if (!m) return;
    this.move = null;
    if (m.timer !== undefined) clearTimeout(m.timer);
    const last = m.indices[m.indices.length - 1];
    if (last !== undefined) {
      this.tokenIndex = last;
      this.snapTokenToIndex(last);
    }
    m.resolve();
  }

  private tokenTmpA = new Vector3();
  private tokenTmpB = new Vector3();

  private updateToken(dt: number): boolean {
    const token = this.token;
    const board = this.board;
    if (!token || !board) return false;
    let active = false;
    this.tokenLand += dt;
    const m = this.move;
    if (m) {
      active = true;
      const ia = m.indices[m.hop];
      const ib = m.indices[m.hop + 1];
      if (ia !== undefined && ib !== undefined && m.finishing === null) {
        m.t += dt / m.hopDur;
        while (m.t >= 1 && m.hop < m.indices.length - 1) {
          m.t -= 1;
          m.hop++;
          this.tokenLand = 0;
          if (m.hop >= m.indices.length - 1) {
            m.t = 1;
            m.finishing = 0;
            break;
          }
        }
      }
      const i0 = m.indices[Math.min(m.hop, m.indices.length - 2)];
      const i1 = m.indices[Math.min(m.hop + 1, m.indices.length - 1)];
      if (i0 !== undefined && i1 !== undefined) {
        board.squareTop(i0, this.tokenTmpA);
        board.squareTop(i1, this.tokenTmpB);
        const u = m.finishing !== null ? 1 : MathUtils.clamp(m.t, 0, 1);
        const dx = this.tokenTmpB.x - this.tokenTmpA.x;
        const dz = this.tokenTmpB.z - this.tokenTmpA.z;
        const dist = Math.hypot(dx, dz);
        const h = m.finishing !== null ? 0 : (1.4 + Math.min(2.2, dist * 0.16)) * 4 * u * (1 - u);
        const gx = this.tokenTmpA.x + dx * u;
        const gz = this.tokenTmpA.z + dz * u;
        const gy = this.tokenTmpA.y + (this.tokenTmpB.y - this.tokenTmpA.y) * u;
        this.tokenGround.set(gx, gy, gz);
        const s = Math.sin(Math.PI * u);
        const lean = m.finishing !== null || dist < 1e-3 ? 0 : 0.2 * s;
        const airborne = m.finishing !== null ? 0 : -0.1 * s;
        const land = this.tokenLand < 0.5 ? 0.3 * Math.exp(-this.tokenLand / 0.07) * Math.cos(this.tokenLand * 26) : 0;
        token.setPose(gx, gy, gz, h, airborne + land, (dx / Math.max(dist, 1e-3)) * lean, (dz / Math.max(dist, 1e-3)) * lean);
      }
      if (m.finishing !== null) {
        m.finishing += dt;
        if (m.finishing > 0.18) this.finishMove();
      }
    } else if (this.tokenIndex !== null) {
      // 静止中。月の持ち上げアニメに追従しつつ、着地の余韻を出す。
      if (this.groundOf(this.tokenIndex, this.tokenGround)) {
        const land = this.tokenLand < 0.5 ? 0.3 * Math.exp(-this.tokenLand / 0.07) * Math.cos(this.tokenLand * 26) : 0;
        token.setPose(this.tokenGround.x, this.tokenGround.y, this.tokenGround.z, 0, land, 0, 0);
        if (this.tokenLand < 0.5) active = true;
      }
    }
    return active;
  }

  // ---- ルーレット ----------------------------------------------------------------
  spinRoulette(plan: RollPlan): Promise<void> {
    if (this.disposed || !this.roulette) return Promise.resolve();
    this.wake();
    return this.roulette.spin(plan, this.reducedMotion);
  }

  // ---- カメラ・状態 -----------------------------------------------------------------
  setFocus(mode: FocusMode, index?: number): void {
    this.focusMode = mode;
    this.focusIndex = index;
    this.wake();
  }

  setPanelOpen(open: boolean): void {
    this.rig.setPanel(open);
    this.wake();
  }

  markSquareDone(index: number, done: boolean): void {
    if (done) this.done.add(index);
    else this.done.delete(index);
    this.board?.markDone(index, done, this.reducedMotion);
    this.wake();
  }

  setCurrentPeriod(period: number): void {
    this.currentPeriod = period;
    this.board?.setCurrentPeriod(period, this.reducedMotion);
    this.wake();
  }

  setQuality(q: Quality): void {
    if (this.disposed || q === this.quality) return;
    this.quality = q;
    // 材質（テクスチャ解像度）も変わるので作り直す
    const squares = this.squares;
    const hadToken = this.tokenIndex;
    this.disposeWorld();
    this.token?.dispose();
    if (this.token) this.scene.remove(this.token.root);
    this.materials.dispose();
    this.materials = this.makeMaterials();
    this.token = buildToken(this.materials);
    this.token.root.visible = false;
    this.scene.add(this.token.root);
    this.applyQuality();
    if (squares.length > 0) this.setBoard(squares);
    if (hadToken !== null) this.placeToken(hadToken);
  }

  private computeGoal(): CameraGoal {
    const panel = this.rig.panelTarget;
    const aspect = this.rig.aspect;
    const p = MathUtils.clamp(panel, 0, 1);
    const visibleAspect = aspect * (1 - 0.46 * p);
    switch (this.focusMode) {
      case 'roulette': {
        const rc = this.board?.layout.roulette;
        const d = MathUtils.lerp(this.fitRoulette[0], this.fitRoulette[1], p);
        return { tx: rc?.x ?? 0, ty: H_BOARD + 1, tz: rc?.z ?? 0, dist: d, az: 0, el: deg(62) };
      }
      case 'token': {
        const dist = 31 * Math.max(1, 1 / Math.max(0.2, visibleAspect));
        return {
          tx: this.tokenGround.x,
          ty: this.tokenGround.y + 0.8,
          tz: this.tokenGround.z,
          dist,
          az: 0,
          el: deg(50),
        };
      }
      case 'square': {
        const idx = this.focusIndex ?? this.tokenIndex;
        const v = this.tokenTmpA;
        if (idx !== undefined && idx !== null && this.board?.squareTop(idx, v)) {
          const dist = 27 * Math.max(1, 1 / Math.max(0.2, visibleAspect));
          return { tx: v.x, ty: v.y, tz: v.z, dist, az: 0, el: deg(48) };
        }
        break;
      }
      default:
        break;
    }
    const d = MathUtils.lerp(this.fitOverview[0], this.fitOverview[1], p);
    return { tx: this.boardCenter.x, ty: this.boardCenter.y, tz: this.boardCenter.z, dist: d, az: 0, el: deg(54) };
  }

  private updateLight(): void {
    const t = this.rig.target;
    const dist = this.rig.camera.position.distanceTo(t);
    const half = MathUtils.clamp(dist * 1.05, 28, 135);
    const texel = (half * 2) / 2048;
    t.x = Math.round(t.x / texel) * texel;
    t.z = Math.round(t.z / texel) * texel;
    t.y = 0;
    this.key.target.position.copy(t);
    this.key.position.copy(t).add(this.keyOffset);
    const cam = this.key.shadow.camera;
    if (Math.abs(half - this.shadowHalf) > 0.25) {
      this.shadowHalf = half;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
  }

  // ---- ループ ------------------------------------------------------------------
  private readonly frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.tick(dt, false);
  };

  /** 1 フレーム分の更新と描画。 */
  private tick(dt: number, force: boolean, draw = true): void {
    let active = false;
    if (this.board?.update(dt)) active = true;
    if (this.roulette?.update(dt)) active = true;
    if (this.updateToken(dt)) active = true;
    this.rig.setGoal(this.computeGoal());
    this.rig.update(dt);
    if (this.rig.isMoving()) active = true;

    if (active || this.dirty || force) this.idleFrames = 0;
    else this.idleFrames++;
    if (this.idleFrames > 2 || !draw) return;
    this.dirty = false;
    this.updateLight();
    this.renderer.render(this.scene, this.rig.camera);
  }

  /** 開発用: 非表示のタブでも指定秒数ぶん進めて描画する。公開 API ではない。 */
  debugAdvance(seconds: number, fps = 60): void {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) this.tick(1 / fps, i === n - 1, i === n - 1);
  }

  /** 開発用: 描画統計。公開 API ではない。 */
  debugInfo(): { calls: number; triangles: number; geometries: number; textures: number; dist: number; fit: number[]; wheelDeg: number; flapRad: number } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      dist: this.rig.camera.position.distanceTo(this.rig.target),
      fit: [...this.fitOverview, ...this.fitRoulette],
      wheelDeg: this.roulette?.angleDeg() ?? 0,
      flapRad: this.roulette?.flapRad() ?? 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.finishMove();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.disposeWorld();
    this.token?.dispose();
    this.materials.dispose();
    for (const t of Object.values(this.art)) t?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.key.shadow.map?.dispose();
    this.renderer.dispose();
  }
}

export const createBoardRenderer = (canvas: HTMLCanvasElement, opts: RendererOptions = {}): BoardRenderer =>
  new BoardRendererImpl(canvas, opts);
