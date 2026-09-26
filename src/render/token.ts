import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import type { Materials } from './materials';
import { FONT_SERIF, finishTexture, makeCanvas } from './textures';

export interface TokenView {
  readonly root: Group;
  /**
   * 足元の位置 (x, groundY, z)、跳ねの高さ、着地の潰れ（0..1）、進行方向への傾き。
   * 影は足元に残し、高さに応じて薄く小さくする。
   */
  setPose(x: number, groundY: number, z: number, lift: number, squash: number, leanX: number, leanZ: number): void;
  setShadowStrength(s: number): void;
  dispose(): void;
}

const lathe = (pts: readonly (readonly [number, number])[], segments: number): LatheGeometry =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

/** 天面のクリーム色の円盤に朱の「認」。 */
const sealFaceTexture = (): CanvasTexture => {
  const s = 256;
  const { canvas, ctx } = makeCanvas(s, s);
  ctx.translate(s / 2, s / 2);
  ctx.fillStyle = '#fff3dc';
  ctx.beginPath();
  ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2493f';
  ctx.fillStyle = '#f2493f';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `800 148px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('認', 0, 10);
  return finishTexture(new CanvasTexture(canvas), { color: true, anisotropy: 8 });
};

/** 認印（はんこ）の駒。丸っこい赤いおもちゃ風。天面はクリーム色の印面に朱の「認」。 */
export const buildToken = (mats: Materials): TokenView => {
  const root = new Group();
  root.name = 'token';
  const body = new Group();
  root.add(body);
  const geos: BufferGeometry[] = [];
  const own: { dispose(): void }[] = [];
  const add = (geo: BufferGeometry, mat: Mesh['material'], cast = true): Mesh => {
    geos.push(geo);
    const m = new Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    body.add(m);
    return m;
  };
  const seg = 56;

  // ぽってりした赤い胴
  add(
    lathe(
      [
        [0, 0],
        [0.9, 0],
        [1.16, 0.12],
        [1.27, 0.5],
        [1.29, 1.2],
        [1.25, 2.3],
        [1.15, 2.78],
        [0.98, 3.02],
        [0.82, 3.08],
        [0, 3.08],
      ],
      seg,
    ),
    mats.prop('tokenRed'),
  );
  // 白い帯
  const band = new TorusGeometry(1.285, 0.1, 10, seg);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0.78, 0);
  add(band, mats.prop('white'), false);
  // 天面の縁のふくらみ
  const lip = new TorusGeometry(0.84, 0.075, 10, seg);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, 3.08, 0);
  add(lip, mats.prop('tokenCream'), false);
  // 印面
  const faceTex = sealFaceTexture();
  own.push(faceTex);
  const faceMat = new MeshStandardMaterial({
    map: faceTex,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  own.push(faceMat);
  const face = add(new CircleGeometry(0.84, 40).rotateX(-Math.PI / 2), faceMat, false);
  face.position.y = 3.09;

  // 足元の影（高さに応じて薄くなる）。ルート直下に置き、body のスケールの影響を受けない。
  const blobGeo = new PlaneGeometry(4.8, 4.8).rotateX(-Math.PI / 2);
  geos.push(blobGeo);
  const blobMat = mats.blob.clone();
  own.push(blobMat);
  const blob = new Mesh(blobGeo, blobMat);
  blob.position.y = 0.02;
  blob.renderOrder = 3;
  root.add(blob);
  let shadowStrength = 0.5;

  return {
    root,
    setPose(x, groundY, z, lift, squash, leanX, leanZ) {
      root.position.set(x, groundY, z);
      body.position.y = lift;
      const sq = Math.max(-0.25, Math.min(0.35, squash));
      body.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);
      body.rotation.set(leanZ, 0, -leanX);
      const k = 1 / (1 + lift * 0.35);
      blob.scale.setScalar(k * (1 + sq * 0.3));
      blobMat.opacity = shadowStrength * k;
    },
    setShadowStrength(s) {
      shadowStrength = s;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const o of own) o.dispose();
    },
  };
};
