import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Mesh, Path, Shape, type Group, type InstancedMesh, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PathFn } from './layout';

/** 中心原点の角丸長方形。 */
export const roundedRectShape = (w: number, h: number, r: number): Shape => {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.max(0.001, Math.min(r, w / 2, h / 2));
  const s = new Shape();
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - rr);
  s.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x + rr, y + h);
  s.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + rr);
  s.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
};

/**
 * 面取りつきの厚板。形状の外形はそのままで、z が 0〜height。
 * （形状の xy は「ローカル x と文字の上方向」。layFlat で机の上に寝かせる）
 */
export const slabGeometry = (
  shape: Shape,
  height: number,
  bevel: number,
  bevelSegments = 1,
  curveSegments = 6,
): ExtrudeGeometry => {
  const depth = Math.max(0.001, height - 2 * bevel);
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments,
    steps: 1,
  });
  g.translate(0, 0, bevel);
  return g;
};

/** 形状の xy を机の x,(-z) に、厚みを +y に向ける。 */
export const layFlat = <T extends BufferGeometry>(g: T): T => {
  g.rotateX(-Math.PI / 2);
  return g;
};

export interface BatchRange {
  readonly start: number;
  readonly end: number;
}

interface Part {
  readonly geo: BufferGeometry;
  readonly group: number;
}

/**
 * 複数のジオメトリを 1 つに統合する（draw call 削減）。
 * group ごとの頂点範囲を返すので、月ごとの持ち上げ・色替えを頂点更新で行える。
 */
export class GeometryBatch {
  private readonly parts: Part[] = [];

  add(geo: BufferGeometry, group = 0): void {
    this.parts.push({ geo: geo.index ? geo.toNonIndexed() : geo, group });
  }

  get size(): number {
    return this.parts.length;
  }

  build(): { geometry: BufferGeometry; ranges: Map<number, BatchRange> } {
    let total = 0;
    for (const p of this.parts) total += p.geo.getAttribute('position').count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const uv1 = new Float32Array(total * 2);
    const col = new Float32Array(total * 3).fill(1);
    const ranges = new Map<number, { start: number; end: number }>();
    let o = 0;
    for (const p of this.parts) {
      const g = p.geo;
      const n = g.getAttribute('position').count;
      pos.set(g.getAttribute('position').array, o * 3);
      const gn = g.getAttribute('normal');
      if (gn) nor.set(gn.array, o * 3);
      const gu = g.getAttribute('uv');
      if (gu) uv.set(gu.array, o * 2);
      const gu1 = g.getAttribute('uv1');
      if (gu1) uv1.set(gu1.array, o * 2);
      const gc = g.getAttribute('color');
      if (gc) col.set(gc.array, o * 3);
      const r = ranges.get(p.group);
      if (r) r.end = o + n;
      else ranges.set(p.group, { start: o, end: o + n });
      o += n;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    for (const p of this.parts) if (p.geo !== undefined) p.geo.dispose();
    return { geometry, ranges };
  }
}

/** ジオメトリ全頂点に単色の頂点カラー（リニア）を付ける。 */
export const paintVertices = (g: BufferGeometry, r: number, gr: number, b: number): void => {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = r;
    a[i * 3 + 1] = gr;
    a[i * 3 + 2] = b;
  }
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
};

/** 世界座標の xz を平面 UV（uv1）に焼く。紙の繊維バンプ用。 */
export const bakePlanarUv1 = (g: BufferGeometry, scale: number): void => {
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    a[i * 2] = p.getX(i) * scale;
    a[i * 2 + 1] = p.getZ(i) * scale;
  }
  g.setAttribute('uv1', new Float32BufferAttribute(a, 2));
};

interface OutlinePoint {
  readonly x: number;
  readonly z: number;
}

/**
 * 経路に沿った帯の輪郭（世界座標 xz）。両端は半径 rr の角丸。
 * 輪の内側・外側は path の外向き法線でオフセットするので、角でも幅が一定。
 */
export const ribbonOutline = (path: PathFn, sa: number, sb: number, hw: number, rr: number): OutlinePoint[] => {
  const pts: OutlinePoint[] = [];
  const step = 0.6;
  const n = Math.max(2, Math.ceil((sb - sa - 2 * rr) / step));
  const arcN = 5;
  const inner: OutlinePoint[] = [];
  const outer: OutlinePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const s = sa + rr + ((sb - sa - 2 * rr) * i) / n;
    const c = path(s);
    inner.push({ x: c.x - c.nx * hw, z: c.z - c.nz * hw });
    outer.push({ x: c.x + c.nx * hw, z: c.z + c.nz * hw });
  }
  pts.push(...inner);
  // 終端の角丸（内側 → 外側）
  {
    const q = path(sb - rr);
    const e = path(sb);
    const dx = e.tx;
    const dz = e.tz;
    const cin = { x: q.x - q.nx * (hw - rr), z: q.z - q.nz * (hw - rr) };
    const cout = { x: q.x + q.nx * (hw - rr), z: q.z + q.nz * (hw - rr) };
    for (let k = 1; k <= arcN; k++) {
      const th = (k / arcN) * (Math.PI / 2);
      pts.push({
        x: cin.x - q.nx * rr * Math.cos(th) + dx * rr * Math.sin(th),
        z: cin.z - q.nz * rr * Math.cos(th) + dz * rr * Math.sin(th),
      });
    }
    for (let k = 0; k <= arcN; k++) {
      const th = (k / arcN) * (Math.PI / 2);
      pts.push({
        x: cout.x + dx * rr * Math.cos(th) + q.nx * rr * Math.sin(th),
        z: cout.z + dz * rr * Math.cos(th) + q.nz * rr * Math.sin(th),
      });
    }
  }
  for (let i = outer.length - 1; i >= 0; i--) pts.push(outer[i]!);
  // 始端の角丸（外側 → 内側）
  {
    const q = path(sa + rr);
    const e = path(sa);
    const dx = -e.tx;
    const dz = -e.tz;
    const cin = { x: q.x - q.nx * (hw - rr), z: q.z - q.nz * (hw - rr) };
    const cout = { x: q.x + q.nx * (hw - rr), z: q.z + q.nz * (hw - rr) };
    for (let k = 1; k <= arcN; k++) {
      const th = (k / arcN) * (Math.PI / 2);
      pts.push({
        x: cout.x + q.nx * rr * Math.cos(th) + dx * rr * Math.sin(th),
        z: cout.z + q.nz * rr * Math.cos(th) + dz * rr * Math.sin(th),
      });
    }
    for (let k = 0; k <= arcN; k++) {
      const th = (k / arcN) * (Math.PI / 2);
      pts.push({
        x: cin.x + dx * rr * Math.cos(th) - q.nx * rr * Math.sin(th),
        z: cin.z + dz * rr * Math.cos(th) - q.nz * rr * Math.sin(th),
      });
    }
  }
  return pts;
};

/** 世界座標の輪郭点列から Shape（shape の y = -z）を作る。 */
export const shapeFromXZ = (pts: readonly OutlinePoint[]): Shape => {
  const s = new Shape();
  pts.forEach((p, i) => {
    if (i === 0) s.moveTo(p.x, -p.z);
    else s.lineTo(p.x, -p.z);
  });
  s.closePath();
  return s;
};

export interface KeyholeParams {
  /** 輪の半径方向の外形（半幅） */
  readonly ax: number;
  readonly bz: number;
  readonly rc: number;
  /** 道の半幅・右端・端の丸め・付け根の丸め */
  readonly strip: { readonly hw: number; readonly xEnd: number; readonly rEnd: number; readonly fillet: number } | null;
}

/** 盤の輪郭: 角丸長方形（輪）＋右へ伸びる道の帯。付け根は凹に丸める。shape の y = -z（左右対称なので同じ）。 */
export const keyholeOutline = (k: KeyholeParams, into: Shape | Path): void => {
  const { ax, bz, rc, strip } = k;
  const h = Math.PI / 2;
  const P = Math.PI;
  into.moveTo(ax, -(bz - rc));
  if (strip) {
    const { hw, xEnd, rEnd, fillet: f } = strip;
    into.lineTo(ax, -(hw + f));
    into.absarc(ax + f, -(hw + f), f, P, h, true);
    into.lineTo(xEnd - rEnd, -hw);
    into.absarc(xEnd - rEnd, -hw + rEnd, rEnd, -h, 0, false);
    into.lineTo(xEnd, hw - rEnd);
    into.absarc(xEnd - rEnd, hw - rEnd, rEnd, 0, h, false);
    into.lineTo(ax + f, hw);
    into.absarc(ax + f, hw + f, f, -h, -P, true);
  }
  into.lineTo(ax, bz - rc);
  into.absarc(ax - rc, bz - rc, rc, 0, h, false);
  into.lineTo(-ax + rc, bz);
  into.absarc(-ax + rc, bz - rc, rc, h, P, false);
  into.lineTo(-ax, -(bz - rc));
  into.absarc(-ax + rc, -(bz - rc), rc, P, P + h, false);
  into.lineTo(ax - rc, -bz);
  into.absarc(ax - rc, -(bz - rc), rc, P + h, 2 * P, false);
};

/** キーホール形状を delta だけ内側へオフセットしたもの（delta<0 で外側）。 */
export const insetKeyhole = (k: KeyholeParams, delta: number): KeyholeParams => ({
  ax: k.ax - delta,
  bz: k.bz - delta,
  rc: k.rc - delta,
  strip: k.strip
    ? {
        hw: k.strip.hw - delta,
        xEnd: k.strip.xEnd - delta,
        rEnd: Math.max(0.2, k.strip.rEnd - delta),
        fillet: k.strip.fillet + delta,
      }
    : null,
});


/**
 * 静的な子メッシュを、同じ材質・同じ影設定ごとに 1 つへ統合する（draw call 削減）。
 * root 直下のローカル座標へ焼き込むので、root 自身の変形は保たれる。統合で作ったジオメトリを返す（dispose 用）。
 */
export const mergeStaticMeshes = (root: Group): BufferGeometry[] => {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Mesh[]>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as unknown as InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material as Material;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
    const arr = buckets.get(key);
    if (arr) arr.push(m);
    else buckets.set(key, [m]);
  });
  const created: BufferGeometry[] = [];
  const tmp = new Matrix4();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts: BufferGeometry[] = [];
    for (const m of meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      if (!g.getAttribute('uv')) {
        g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      }
      tmp.multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(tmp);
      parts.push(g);
    }
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const first = meshes[0]!;
    const out = new Mesh(merged, first.material);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    for (const m of meshes) m.removeFromParent();
    root.add(out);
    created.push(merged);
  }
  return created;
};
