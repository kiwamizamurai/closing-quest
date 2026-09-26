import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStaticMeshes } from './geometry';
import { BUILDING_D, BUILDING_W, H_BOARD, type BoardLayout } from './layout';
import type { Materials, Quality } from './materials';
import { FONT_SERIF, finishTexture, makeCanvas, seeded } from './textures';

export interface Landmarks {
  readonly group: Group;
  dispose(): void;
}

/** 決算棟の壁面（窓・扉）。パステルのおもちゃ風。 */
const facadeTexture = (cols: number, rows: number, wCm: number, hCm: number, door: boolean): CanvasTexture => {
  const px = 44;
  const W = Math.round(wCm * px);
  const H = Math.round(hCm * px);
  const { canvas, ctx } = makeCanvas(W, H);
  const R = seeded(19 + cols);
  ctx.fillStyle = '#fff3e0';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(255,190,150,0.06)';
    ctx.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3);
  }
  const floorH = H / rows;
  // 階の区切り帯（ピンク）
  for (let r = 1; r < rows; r++) {
    ctx.fillStyle = '#ffc3d6';
    ctx.fillRect(0, r * floorH - 6, W, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, r * floorH - 6, W, 3);
  }
  const colW = W / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDoor = door && r === rows - 1 && c === Math.floor(cols / 2);
      const cx = c * colW + colW / 2;
      const ww = colW * 0.58;
      const wh = floorH * 0.56;
      const wy = r * floorH + floorH * 0.2;
      if (isDoor) {
        const dw = colW * 0.72;
        const dh = floorH * 0.82;
        const dy = (r + 1) * floorH - dh;
        ctx.fillStyle = '#ff7a70';
        ctx.beginPath();
        ctx.roundRect(cx - dw / 2 - 6, dy - 6, dw + 12, dh + 6, [dw * 0.5, dw * 0.5, 0, 0]);
        ctx.fill();
        const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
        g.addColorStop(0, '#d5efff');
        g.addColorStop(1, '#8fcaf5');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(cx - dw / 2, dy, dw, dh, [dw * 0.45, dw * 0.45, 0, 0]);
        ctx.fill();
        ctx.fillStyle = '#ff7a70';
        ctx.fillRect(cx - 2.5, dy, 5, dh);
        ctx.fillStyle = '#ffd45a';
        ctx.beginPath();
        ctx.arc(cx - 12, dy + dh * 0.6, 5, 0, Math.PI * 2);
        ctx.arc(cx + 12, dy + dh * 0.6, 5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // 丸みのある窓（白いふち・水色のガラス）
      ctx.fillStyle = 'rgba(200,120,110,0.25)';
      ctx.beginPath();
      ctx.roundRect(cx - ww / 2 - 3, wy - 1, ww + 6, wh + 10, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cx - ww / 2 - 4, wy - 4, ww + 8, wh + 8, 14);
      ctx.fill();
      const g = ctx.createLinearGradient(cx - ww / 2, wy, cx + ww / 2, wy + wh);
      g.addColorStop(0, '#d8f0ff');
      g.addColorStop(1, '#8fcaf5');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx - ww / 2, wy, ww, wh, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2 + 6, wy + wh * 0.55);
      ctx.lineTo(cx - ww / 2 + ww * 0.5, wy + 6);
      ctx.lineTo(cx - ww / 2 + ww * 0.72, wy + 6);
      ctx.lineTo(cx - ww / 2 + 6, wy + wh * 0.85);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 2, wy, 4, wh);
      ctx.fillRect(cx - ww / 2, wy + wh * 0.5 - 2, ww, 4);
      // 窓の下の小さな花台
      ctx.fillStyle = '#ffb3cd';
      ctx.beginPath();
      ctx.roundRect(cx - ww / 2 - 6, wy + wh + 6, ww + 12, 8, 4);
      ctx.fill();
    }
  }
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 8 });
};

const signTexture = (): CanvasTexture => {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#4a5590';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 50);
  ctx.fill();
  ctx.strokeStyle = '#ffe36a';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(18, 18, W - 36, H - 36, 38);
  ctx.stroke();
  ctx.fillStyle = '#ffe36a';
  ctx.font = `900 150px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('決算棟', W / 2, H / 2 + 8);
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 8 });
};

export const buildLandmarks = (layout: BoardLayout, mats: Materials, quality: Quality): Landmarks => {
  const group = new Group();
  group.name = 'landmarks';
  const geos: BufferGeometry[] = [];
  const localMats: Material[] = [];
  const textures: CanvasTexture[] = [];
  const g = <T extends BufferGeometry>(x: T): T => {
    geos.push(x);
    return x;
  };
  // 決算棟は少し縮めて置く（駒や伝票に対して大きすぎないように）
  const BUILDING_SCALE = 0.82;
  const bld = new Group();
  let bo = { x: 0, y: 0, z: 0 };
  let target: Group = group;
  const addMesh = (geo: BufferGeometry, mat: Material | Material[], x: number, y: number, z: number): Mesh => {
    const m = new Mesh(geo, mat);
    m.position.set(x - bo.x, y - bo.y, z - bo.z);
    m.castShadow = true;
    m.receiveShadow = true;
    target.add(m);
    return m;
  };
  const seg = quality === 'high' ? 24 : 12;

  // ---- スタート旗 -----------------------------------------------------------
  if (layout.startFlag) {
    const f = layout.startFlag;
    const baseY = H_BOARD;
    addMesh(g(new CylinderGeometry(1.05, 1.2, 0.5, seg)), mats.prop('lemonDeep'), f.x, baseY + 0.25, f.z);
    addMesh(g(new CylinderGeometry(0.14, 0.17, 8, 12)), mats.prop('white'), f.x, baseY + 4.3, f.z);
    addMesh(g(new SphereGeometry(0.36, 14, 10)), mats.prop('lemonDeep'), f.x, baseY + 8.4, f.z);
    // 旗は緩やかに波打つ布
    const flag = g(new PlaneGeometry(3.8, 2.4, 14, 4));
    const p = flag.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + 1.9) / 3.8;
      p.setZ(i, Math.sin(u * 5.2) * 0.34 * u);
      p.setY(i, p.getY(i) - u * 0.25);
    }
    flag.computeVertexNormals();
    addMesh(flag, mats.prop('flag'), f.x + 2.1, baseY + 7.0, f.z);
  }

  // ---- 決算棟 ---------------------------------------------------------------
  if (layout.building) {
    const bx = layout.building.x;
    const bz = layout.building.z;
    const bodyW = BUILDING_W - 1.4;
    const bodyD = BUILDING_D - 1.3;
    const floors = 3;
    const bodyH = 7.8;
    const y0 = H_BOARD;
    bld.position.set(bx, y0, bz);
    bld.scale.setScalar(BUILDING_SCALE);
    group.add(bld);
    target = bld;
    bo = { x: bx, y: y0, z: bz };
    // 基壇
    addMesh(g(new RoundedBoxGeometry(BUILDING_W, 0.6, BUILDING_D, 3, 0.25)), mats.prop('cream'), bx, y0 + 0.3, bz);
    // 本体（面ごとに壁面テクスチャ）
    const texZ = facadeTexture(5, floors, bodyW, bodyH, false);
    const texX = facadeTexture(4, floors, bodyD, bodyH, true);
    const texXback = facadeTexture(4, floors, bodyD, bodyH, false);
    textures.push(texZ, texX, texXback);
    const mk = (map: CanvasTexture | null): MeshPhysicalMaterial => {
      const m = new MeshPhysicalMaterial({ roughness: 0.75, clearcoat: 0.08, color: map ? '#ffffff' : '#fff3e0', map });
      localMats.push(m);
      return m;
    };
    const plain = mk(null);
    // BoxGeometry の面順: +x, -x, +y, -y, +z, -z
    const body = addMesh(
      g(new RoundedBoxGeometry(bodyW, bodyH, bodyD, 3, 0.3)),
      plain,
      bx,
      y0 + 0.6 + bodyH / 2,
      bz,
    );
    body.name = 'kessantou';
    // 壁面テクスチャは薄い板で貼る（角丸の胴体に UV を合わせるより簡単で安定）
    const skin = (map: CanvasTexture, w: number, rotY: number, x: number, z: number): void => {
      const m = mk(map);
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      const pl = g(new PlaneGeometry(w, bodyH));
      const mesh = addMesh(pl, m, x, y0 + 0.6 + bodyH / 2, z);
      mesh.rotation.y = rotY;
      mesh.castShadow = false;
    };
    skin(texZ, bodyW - 0.5, 0, bx, bz + bodyD / 2 + 0.03);
    skin(texZ, bodyW - 0.5, Math.PI, bx, bz - bodyD / 2 - 0.03);
    skin(texX, bodyD - 0.5, -Math.PI / 2, bx - bodyW / 2 - 0.03, bz);
    skin(texXback, bodyD - 0.5, Math.PI / 2, bx + bodyW / 2 + 0.03, bz);
    // 屋根（ぷっくり）
    const roofY = y0 + 0.6 + bodyH;
    addMesh(g(new RoundedBoxGeometry(bodyW + 1.0, 0.7, bodyD + 1.0, 3, 0.3)), mats.prop('coral'), bx, roofY + 0.3, bz);
    addMesh(g(new RoundedBoxGeometry(2.6, 1.1, 2.2, 2, 0.3)), mats.prop('lavender'), bx - 2.6, roofY + 1.1, bz - 1.6);
    // 玄関の庇と柱（道側 = -x）
    const px = bx - bodyW / 2;
    addMesh(g(new RoundedBoxGeometry(2.0, 0.34, 4.8, 2, 0.14)), mats.prop('skyDeep'), px - 0.85, y0 + 3.2, bz);
    for (const s of [-1, 1]) {
      addMesh(g(new CylinderGeometry(0.2, 0.2, 2.6, 12)), mats.prop('white'), px - 1.5, y0 + 1.9, bz + s * 2.05);
    }
    addMesh(g(new RoundedBoxGeometry(1.7, 0.2, 3.8, 2, 0.08)), mats.prop('cream'), px - 1.35, y0 + 0.7, bz);
    addMesh(g(new RoundedBoxGeometry(1.1, 0.2, 3.8, 2, 0.08)), mats.prop('cream'), px - 2.15, y0 + 0.6, bz);

    // 屋上の看板（カメラ側 +z に向ける）
    const sign = signTexture();
    textures.push(sign);
    const signMat = new MeshStandardMaterial({ map: sign, roughness: 0.6 });
    localMats.push(signMat);
    const signMesh = addMesh(
      g(new RoundedBoxGeometry(8.4, 2.2, 0.4, 3, 0.16)),
      mats.prop('navy'),
      bx,
      roofY + 2.2,
      bz + bodyD / 2 - 0.4,
    );
    signMesh.name = 'sign';
    const faceGeo = g(new PlaneGeometry(8.1, 2.02));
    const face = addMesh(faceGeo, signMat, bx, roofY + 2.2, bz + bodyD / 2 - 0.4 + 0.22);
    face.castShadow = false;
    for (const s of [-1, 1]) {
      addMesh(g(new BoxGeometry(0.22, 1.3, 0.24)), mats.prop('white'), bx + s * 3.6, roofY + 1.0, bz + bodyD / 2 - 0.4);
    }
    // 旗竿
    const fx = bx + bodyW / 2 - 1.0;
    addMesh(g(new CylinderGeometry(0.1, 0.13, 5.4, 10)), mats.prop('white'), fx, roofY + 3.4, bz - 1.2);
    const flag = g(new PlaneGeometry(2.5, 1.6, 10, 3));
    const p = flag.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + 1.25) / 2.5;
      p.setZ(i, Math.sin(u * 5.0) * 0.25 * u);
    }
    flag.computeVertexNormals();
    addMesh(flag, mats.prop('flag'), fx + 1.35, roofY + 5.6, bz - 1.2);

    // 植え込みの木（まん丸のぽんぽん）
    const foliage: BufferGeometry[] = [];
    const trunks: BufferGeometry[] = [];
    const treeAt = (x: number, z: number, s: number): void => {
      const ball = new SphereGeometry(1.35 * s, 16, 12);
      ball.translate(x, y0 + 2.5 * s, z);
      foliage.push(ball);
      const trunk = new CylinderGeometry(0.2 * s, 0.26 * s, 1.2 * s, 10);
      trunk.translate(x, y0 + 0.6 * s, z);
      trunks.push(trunk);
    };
    treeAt(bx - 3.4, bz + 7.0, 1);
    treeAt(bx + 3.2, bz + 7.2, 1.15);
    treeAt(bx - 3.6, bz - 7.0, 1.1);
    treeAt(bx + 3.0, bz - 7.1, 0.95);
    const foliageMat = new MeshStandardMaterial({ color: '#7be0a8', roughness: 0.75 });
    localMats.push(foliageMat);
    const fg = mergeGeometries(foliage);
    const tg = mergeGeometries(trunks);
    target = group;
    bo = { x: 0, y: 0, z: 0 };
    if (fg) addMesh(g(fg), foliageMat, 0, 0, 0);
    if (tg) addMesh(g(tg), mats.prop('cork'), 0, 0, 0);
    for (const x of [...foliage, ...trunks]) x.dispose();
  }

  target = group;
  bo = { x: 0, y: 0, z: 0 };
  geos.push(...mergeStaticMeshes(group));

  return {
    group,
    dispose() {
      for (const x of geos) x.dispose();
      for (const m of localMats) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
};
