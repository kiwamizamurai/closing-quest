import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { layFlat, mergeStaticMeshes, roundedRectShape, slabGeometry } from './geometry';
import type { BoardLayout } from './layout';
import { MARGIN } from './layout';
import type { Materials, PropName, Quality } from './materials';
import { FONT_SANS, finishTexture, makeCanvas, makeDeskMatTexture, seeded } from './textures';

export interface DeskView {
  readonly group: Group;
  dispose(): void;
}

/** デスクマットの厚み（この上に盤面と小物を置く）。 */
export const MAT_H = 0.3;

const lathe = (pts: readonly (readonly [number, number])[], segments: number): LatheGeometry =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

/** 机（白木）とパステルのデスクマット、その上の小物。ゲームの邪魔にならない位置に置く。 */
export const buildDesk = (layout: BoardLayout, mats: Materials, quality: Quality): DeskView => {
  const group = new Group();
  group.name = 'desk';
  const geos: BufferGeometry[] = [];
  const ownMats: Material[] = [];
  const ownTex: CanvasTexture[] = [];
  const seg = quality === 'high' ? 40 : 20;
  const G = <T extends BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const mesh = (
    parent: Group,
    geo: BufferGeometry,
    mat: Material | Material[],
    x = 0,
    y = 0,
    z = 0,
    cast = true,
  ): Mesh => {
    const m = new Mesh(G(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const P = (n: PropName): MeshPhysicalMaterial => mats.prop(n);
  const own = <T extends Material>(m: T): T => {
    ownMats.push(m);
    return m;
  };
  const tex = (t: CanvasTexture): CanvasTexture => {
    ownTex.push(t);
    return t;
  };
  const cx = (layout.bounds.minX + layout.bounds.maxX) / 2;

  // ---- 天板（白木） -----------------------------------------------------------
  {
    const plane = new PlaneGeometry(2200, 1500);
    plane.rotateX(-Math.PI / 2);
    plane.translate(cx, 0, 0);
    // UV は世界座標（木目は DESK_TILE 単位で 1 周期）
    const p = plane.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getZ(i);
    }
    plane.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const m = mesh(group, plane, mats.desk, 0, 0, 0, false);
    m.receiveShadow = true;
    m.name = 'desk-top';
  }

  // ---- パステルのデスクマット -----------------------------------------------------
  const b = layout.bounds;
  {
    const w = b.maxX - b.minX + 30;
    const d = b.maxZ - b.minZ + 70;
    const shape = roundedRectShape(w, d, 14);
    const g = slabGeometry(shape, MAT_H, 0.1, 2, 10);
    const p = g.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) / w + 0.5;
      uv[i * 2 + 1] = p.getY(i) / d + 0.5;
    }
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    layFlat(g);
    g.translate(cx, 0, 0);
    const matTex = tex(makeDeskMatTexture(w / d, '#ffc6da', '#ffd6e5', '#fff8fb', Math.min(mats.maxAniso, 8)));
    const mm = own(
      new MeshStandardMaterial({
        map: matTex,
        bumpMap: mats.mat.bumpMap,
        bumpScale: 1.2,
        roughness: 0.95,
      }),
    );
    const m = mesh(group, g, mm, 0, 0, 0, false);
    m.name = 'desk-mat';
  }

  const ringR = layout.ring.A + MARGIN;
  const front = layout.bounds.maxZ;
  const back = layout.bounds.minZ;

  // ---- 電卓 -----------------------------------------------------------------
  const calculator = (): Group => {
    const g = new Group();
    const W = 11.6;
    const D = 19;
    mesh(g, new RoundedBoxGeometry(W, 1.9, D, 5, 1.0), P('pink'), 0, 0.95, 0);
    mesh(g, new RoundedBoxGeometry(W - 1.2, 0.5, D - 1.2, 4, 0.25), P('white'), 0, 1.85, 0, false);
    // 液晶
    const lcd = tex(
      finishTexture(
        (() => {
          const { canvas, ctx } = makeCanvas(512, 168);
          const gr = ctx.createLinearGradient(0, 0, 0, 168);
          gr.addColorStop(0, '#d5f0e0');
          gr.addColorStop(1, '#bfe4d0');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, 512, 168);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.font = `700 118px 'Menlo','Consolas',monospace`;
          ctx.fillStyle = 'rgba(40,90,80,0.10)';
          ctx.fillText('888,888', 484, 96);
          ctx.fillStyle = '#2d5a52';
          ctx.fillText('128,460', 484, 96);
          ctx.font = `700 26px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.fillText('TAX+', 22, 34);
          ctx.fillText('M', 24, 132);
          return new CanvasTexture(canvas);
        })(),
        { color: true, anisotropy: 8 },
      ),
    );
    const lcdMat = own(new MeshPhysicalMaterial({ map: lcd, roughness: 0.4, clearcoat: 0.5 }));
    mesh(g, new RoundedBoxGeometry(9.6, 0.3, 3.7, 3, 0.15), P('navy'), 0, 2.05, -6.4, false);
    const face = mesh(g, new PlaneGeometry(8.7, 2.8).rotateX(-Math.PI / 2), lcdMat, 0, 2.22, -6.4, false);
    face.receiveShadow = true;
    mesh(g, new RoundedBoxGeometry(3.0, 0.16, 0.9, 2, 0.06), P('skyDeep'), -3.2, 2.1, -8.7, false);
    // キー（色ごとに 1 つへ統合）
    const keyDefs: [string, PropName][][] = [
      [['C', 'coralDeep'], ['AC', 'coralDeep'], ['%', 'sky'], ['÷', 'skyDeep']],
      [['7', 'white'], ['8', 'white'], ['9', 'white'], ['×', 'skyDeep']],
      [['4', 'white'], ['5', 'white'], ['6', 'white'], ['−', 'skyDeep']],
      [['1', 'white'], ['2', 'white'], ['3', 'white'], ['+', 'skyDeep']],
      [['0', 'white'], ['00', 'white'], ['.', 'white'], ['=', 'lemonDeep']],
    ];
    const byMat = new Map<PropName, BufferGeometry[]>();
    const pitchX = 2.6;
    const pitchZ = 2.3;
    keyDefs.forEach((row, r) => {
      row.forEach(([, mat], c) => {
        const k = new RoundedBoxGeometry(2.15, 0.8, 1.8, 3, 0.4);
        k.translate((c - 1.5) * pitchX, 2.3, -1.2 + r * pitchZ + 0.2);
        const arr = byMat.get(mat);
        if (arr) arr.push(k);
        else byMat.set(mat, [k]);
      });
    });
    for (const [name, arr] of byMat) {
      const merged = mergeGeometries(arr);
      for (const a of arr) a.dispose();
      if (merged) mesh(g, merged, P(name), 0, 0, 0);
    }
    // キーの文字
    const legend = tex(
      finishTexture(
        (() => {
          const ppu = 64;
          const { canvas, ctx } = makeCanvas(Math.round(4 * pitchX * ppu), Math.round(5 * pitchZ * ppu));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          keyDefs.forEach((row, r) => {
            row.forEach(([label, mat], c) => {
              ctx.fillStyle = mat === 'white' ? '#3d4572' : '#ffffff';
              ctx.font = `800 ${label.length > 1 ? 0.62 * ppu : 0.86 * ppu}px ${FONT_SANS}`;
              ctx.fillText(label, (c + 0.5) * pitchX * ppu, (r + 0.5) * pitchZ * ppu + 0.05 * ppu);
            });
          });
          return new CanvasTexture(canvas);
        })(),
        { color: true, anisotropy: 8 },
      ),
    );
    const legendMat = own(
      new MeshPhysicalMaterial({
        map: legend,
        transparent: true,
        depthWrite: false,
        roughness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const lg = mesh(
      g,
      new PlaneGeometry(4 * pitchX, 5 * pitchZ).rotateX(-Math.PI / 2),
      legendMat,
      0,
      2.71,
      -1.2 + 2 * pitchZ + 0.2,
      false,
    );
    lg.renderOrder = 5;
    return g;
  };

  // ---- ボールペンと鉛筆 -----------------------------------------------------------
  const ballpen = (): Group => {
    const g = new Group();
    const L = 13.6;
    const body = mesh(g, new CylinderGeometry(0.5, 0.5, L, 20), P('skyDeep'), 0, 0.5, 0);
    body.rotation.z = Math.PI / 2;
    const grip = mesh(g, new CylinderGeometry(0.56, 0.48, 3.0, 20), P('white'), -L / 2 + 1.5, 0.5, 0);
    grip.rotation.z = Math.PI / 2;
    const tip = mesh(g, new CylinderGeometry(0.5, 0.12, 1.5, 16), P('metal'), -L / 2 - 0.75, 0.5, 0);
    tip.rotation.z = Math.PI / 2;
    const cap = mesh(g, new SphereGeometry(0.5, 16, 10), P('lemonDeep'), L / 2, 0.5, 0);
    cap.scale.set(1, 1, 1);
    mesh(g, new RoundedBoxGeometry(4.6, 0.14, 0.4, 1, 0.05), P('lemonDeep'), L / 2 - 3.0, 1.05, 0);
    return g;
  };
  const pencil = (): Group => {
    const g = new Group();
    const L = 14.5;
    const body = mesh(g, new CylinderGeometry(0.48, 0.48, L, 6), P('lemon'), 0, 0.48, 0);
    body.rotation.z = Math.PI / 2;
    const wood = mesh(g, new CylinderGeometry(0.48, 0.16, 1.6, 6), P('peach'), -L / 2 - 0.8, 0.48, 0);
    wood.rotation.z = Math.PI / 2;
    const lead = mesh(g, new CylinderGeometry(0.16, 0.03, 0.6, 8), P('navy'), -L / 2 - 1.8, 0.48, 0);
    lead.rotation.z = Math.PI / 2;
    const ferrule = mesh(g, new CylinderGeometry(0.5, 0.5, 0.9, 12), P('metal'), L / 2 + 0.3, 0.48, 0);
    ferrule.rotation.z = Math.PI / 2;
    const eraser = mesh(g, new CylinderGeometry(0.46, 0.46, 0.7, 12), P('pinkDeep'), L / 2 + 1.05, 0.48, 0);
    eraser.rotation.z = Math.PI / 2;
    return g;
  };

  // ---- マグカップ・コースター・観葉植物 ------------------------------------------------
  const mug = (): Group => {
    const g = new Group();
    mesh(g, new CylinderGeometry(4.9, 4.9, 0.36, seg), P('cream'), 0, 0.18, 0);
    mesh(
      g,
      lathe(
        [
          [2.6, 0.5],
          [3.3, 0.56],
          [3.7, 0.95],
          [3.9, 2.2],
          [4.0, 5.5],
          [4.05, 8.2],
          [4.05, 8.7],
          [3.85, 8.9],
          [3.65, 8.7],
          [3.65, 8.2],
          [3.55, 5.5],
          [3.4, 1.5],
          [2.6, 1.15],
        ],
        seg,
      ),
      P('mint'),
      0,
      0.36,
      0,
    );
    mesh(g, new CylinderGeometry(3.62, 3.62, 0.06, seg), P('coffee'), 0, 7.9, 0, false);
    const handle = mesh(g, new TorusGeometry(2.2, 0.55, 12, 28, Math.PI), P('mint'), 4.0, 5.3, 0);
    handle.rotation.z = -Math.PI / 2;
    // ハートのラテアート風の白い点
    mesh(g, new CylinderGeometry(1.3, 1.3, 0.05, seg), P('cream'), 0, 7.95, 0, false);
    return g;
  };
  const plant = (): Group => {
    const g = new Group();
    mesh(
      g,
      lathe(
        [
          [2.0, 0],
          [2.7, 0.1],
          [3.1, 2.6],
          [3.3, 3.2],
          [3.1, 3.3],
          [2.8, 3.0],
          [0, 2.9],
        ],
        seg,
      ),
      P('peach'),
      0,
      0,
      0,
    );
    const leaf = new SphereGeometry(1.0, 14, 10);
    const R = seeded(9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = mesh(g, leaf.clone(), P('mintDeep'), Math.cos(a) * 1.3, 4.3 + (i % 2) * 0.4, Math.sin(a) * 1.3);
      l.scale.set(0.7, 1.4 + R() * 0.5, 0.7);
      l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    mesh(g, leaf, P('mint'), 0, 4.6, 0).scale.set(0.8, 1.7, 0.8);
    return g;
  };

  // ---- スタンプ台と認印 ----------------------------------------------------------
  const stampPad = (): Group => {
    const g = new Group();
    mesh(g, new RoundedBoxGeometry(10.4, 1.9, 6.8, 4, 0.7), P('skyDeep'), 0, 0.95, 0);
    mesh(g, new RoundedBoxGeometry(9.0, 0.4, 5.4, 3, 0.18), P('ink'), 0, 1.85, 0, false);
    // 開いたフタ（後ろの縁でヒンジ）
    const lid = new Group();
    lid.position.set(0, 1.85, -3.5);
    lid.rotation.x = -1.75;
    mesh(lid, new RoundedBoxGeometry(10.4, 0.7, 6.9, 4, 0.3), P('sky'), 0, 0.3, 3.45);
    g.add(lid);
    // はんこ（横倒し。赤い胴とクリームの印面）
    const h = new Group();
    const body = mesh(h, new CylinderGeometry(1.05, 1.05, 4.6, 28), P('tokenRed'), 0, 0, 0);
    body.rotation.z = Math.PI / 2;
    const face = mesh(h, new CylinderGeometry(0.85, 0.85, 0.3, 28), P('tokenCream'), 2.4, 0, 0);
    face.rotation.z = Math.PI / 2;
    const band = mesh(h, new TorusGeometry(1.06, 0.1, 8, 28), P('white'), -1.3, 0, 0);
    band.rotation.y = Math.PI / 2;
    h.position.set(0.5, 1.05, 6.6);
    h.rotation.y = 0.5;
    g.add(h);
    return g;
  };

  // ---- 帳簿・試算表・付箋・ファイル ------------------------------------------------------
  const ledgerBook = (): Group => {
    const g = new Group();
    mesh(g, new RoundedBoxGeometry(13.6, 2.0, 18.4, 4, 0.6), P('mintDeep'), 0, 1.0, 0);
    mesh(g, new RoundedBoxGeometry(12.4, 1.3, 17.4, 3, 0.3), P('paper'), 0.6, 1.0, 0, false);
    mesh(g, new RoundedBoxGeometry(2.0, 2.06, 18.5, 3, 0.5), P('pinkDeep'), -6.2, 1.03, 0, false);
    mesh(g, new RoundedBoxGeometry(6.4, 0.12, 4.2, 2, 0.05), P('lemon'), 0.4, 2.02, -3.6, false);
    mesh(g, new RoundedBoxGeometry(0.7, 0.08, 6.6, 1, 0.03), P('coralDeep'), 4.7, 1.99, 9.6, false);
    return g;
  };
  const paperStack = (): Group => {
    const g = new Group();
    const R = seeded(23);
    for (let i = 0; i < 4; i++) {
      const h = 0.35;
      const s = mesh(g, new BoxGeometry(14.8, h, 20.4), P('paper'), (R() - 0.5) * 0.6, h / 2 + i * h, (R() - 0.5) * 0.6);
      s.rotation.y = (R() - 0.5) * 0.06;
    }
    const sheet = tex(
      finishTexture(
        (() => {
          const { canvas, ctx } = makeCanvas(448, 616);
          ctx.fillStyle = '#fffdf7';
          ctx.fillRect(0, 0, 448, 616);
          ctx.fillStyle = '#3d4572';
          ctx.font = `800 34px ${FONT_SANS}`;
          ctx.textAlign = 'center';
          ctx.fillText('試 算 表', 224, 62);
          ctx.strokeStyle = 'rgba(80,110,180,0.45)';
          ctx.lineWidth = 1.5;
          const rows = 15;
          for (let r = 0; r <= rows; r++) {
            const y = 96 + r * 32;
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(418, y);
            ctx.stroke();
          }
          for (const x of [30, 210, 314, 418]) {
            ctx.beginPath();
            ctx.moveTo(x, 96);
            ctx.lineTo(x, 96 + rows * 32);
            ctx.stroke();
          }
          const rnd = seeded(5);
          ctx.font = `700 18px ${FONT_SANS}`;
          const names = ['現金預金', '売掛金', '商品', '買掛金', '資本金', '売上', '仕入', '給料', '地代家賃', '水道光熱', '減価償却', '租税公課', '雑費', '支払利息'];
          names.forEach((n, r) => {
            const y = 96 + r * 32 + 22;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#3d4572';
            ctx.fillText(n, 38, y);
            ctx.textAlign = 'right';
            ctx.fillText(String(Math.floor(rnd() * 900 + 100) * 1000).replace(/\B(?=(\d{3})+(?!\d))/g, ','), r % 2 ? 404 : 300, y);
          });
          return new CanvasTexture(canvas);
        })(),
        { color: true, anisotropy: 8 },
      ),
    );
    const sm = own(new MeshPhysicalMaterial({ map: sheet, roughness: 0.9 }));
    const top = mesh(g, new PlaneGeometry(14.6, 20.2).rotateX(-Math.PI / 2), sm, 0, 4 * 0.35 + 0.01, 0, false);
    top.receiveShadow = true;
    return g;
  };
  const stickyNotes = (): Group => {
    const g = new Group();
    for (let i = 0; i < 5; i++) mesh(g, new RoundedBoxGeometry(6.4, 0.18, 6.4, 1, 0.05), P('noteYellow'), 0, 0.09 + i * 0.18, 0);
    const one = mesh(g, new RoundedBoxGeometry(6.4, 0.08, 6.4, 1, 0.03), P('pink'), 7.4, 0.04, 1.8, false);
    one.rotation.y = 0.35;
    return g;
  };
  const fileBoxes = (): Group => {
    const g = new Group();
    const cols: PropName[] = ['skyDeep', 'coralDeep', 'mintDeep'];
    cols.forEach((c, i) => {
      const fx = i * 6.0;
      mesh(g, new RoundedBoxGeometry(5.2, 17.5, 15.5, 3, 0.8), P(c), fx, 8.75, 0);
      // 背ラベル
      mesh(g, new RoundedBoxGeometry(0.3, 9, 3.6, 1, 0.1), P('white'), fx + 2.55, 9.5, 0, false);
      mesh(g, new RoundedBoxGeometry(0.3, 1.6, 3.6, 1, 0.1), P('lemonDeep'), fx + 2.6, 15.4, 0, false);
    });
    return g;
  };
  const clip = (): Group => {
    const g = new Group();
    const t = mesh(g, new TorusGeometry(0.9, 0.11, 6, 16), P('pinkDeep'), 0, 0.11, 0);
    t.rotation.x = Math.PI / 2;
    t.scale.set(0.55, 1, 1);
    return g;
  };

  const place = (o: Group, x: number, z: number, rotY = 0): void => {
    o.position.set(x, MAT_H, z);
    o.rotation.y = rotY;
    group.add(o);
  };

  // 配置。全体表示（16:9）でも切れないよう、道の両側の空き地と、盤の奥・手前の縁に置く。
  const frontZ = front + 9;
  const backZ = back - 17;
  place(calculator(), ringR + 20, 28, -0.3);
  place(ledgerBook(), ringR + 47, 29, 0.1);
  place(ballpen(), ringR + 30, 42, 0.42);
  place(pencil(), ringR + 32, 45.6, 0.3);
  place(clip(), ringR + 12, 42, 0.6);
  place(clip(), ringR + 14.5, 40.6, 1.5);
  place(stampPad(), -30, frontZ, 0.15);
  const files = fileBoxes();
  files.scale.setScalar(0.85);
  place(files, ringR + 12, -31, 0.05);
  place(paperStack(), ringR + 44, -29, 0.08);
  place(stickyNotes(), ringR + 68, -26, 0.25);
  place(mug(), -30, backZ, 0);
  place(plant(), -48, backZ - 3, 0);

  // 同じ材質の小物を 1 つに統合（draw call 削減）
  geos.push(...mergeStaticMeshes(group));

  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of ownMats) m.dispose();
      for (const t of ownTex) t.dispose();
    },
  };
};
