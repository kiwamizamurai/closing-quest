import {
  ClampToEdgeWrapping,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  type Material,
  type Texture,
} from 'three';
import { loadArt, type ArtName } from './art';
import {
  makeBlobTexture,
  makeFiberTexture,
  makeLedgerTexture,
  makePaperColorTexture,
  makeWoodTexture,
} from './textures';

/**
 * 材質はここに集約する（マットなプラスチック・紙のおもちゃ風、パステルのポップな配色）。
 *
 * テクスチャの差し替え口:
 *  - 手続き生成の絵は `textureSource`。ここを別の実装に替えれば全体が変わる。
 *  - イラスト素材（public/assets/art/*.png）は art.ts の loadArt() が読み込み、
 *    見つかったときだけ `applyDeskArt` などで上書きする。無ければ手続き生成のまま。
 */
export interface TextureSource {
  /** 机の天板（明るい木目）。 */
  wood(size: number, anisotropy: number): Texture;
  /** 紙・厚紙の繊維（無彩色・バンプ用・タイル可） */
  fiber(anisotropy: number): Texture;
  /** 盤面の印刷紙（ミント・タイル可） */
  boardPaper(anisotropy: number): Texture;
  /** 中央の方眼紙（クリーム） */
  ledger(anisotropy: number): Texture;
  /**
   * イラスト素材（public/assets/art/*.png）。あれば TextureLoader で読み込み、無ければ null。
   * null のときは上の手続き生成のまま使う（呼び出し側の責務）。
   */
  file(name: ArtName): Promise<Texture | null>;
}

export const textureSource: TextureSource = {
  wood: (size, anisotropy) => makeWoodTexture(size, 11, anisotropy),
  fiber: (anisotropy) => makeFiberTexture(512, 3, anisotropy),
  boardPaper: (anisotropy) => makePaperColorTexture('#bfe9d6', 512, 5, 0.04, anisotropy),
  ledger: (anisotropy) => makeLedgerTexture('#fff8e6', '#e9efd9', '#cfe6d2', anisotropy),
  file: loadArt,
};

/** 机の木目 1 枚が覆う長さ（単位）。イラスト素材もこれで敷き詰める。 */
export const DESK_TILE = 96;

export type PropName =
  | 'white'
  | 'cream'
  | 'pink'
  | 'pinkDeep'
  | 'mint'
  | 'mintDeep'
  | 'sky'
  | 'skyDeep'
  | 'lemon'
  | 'lemonDeep'
  | 'coral'
  | 'coralDeep'
  | 'lavender'
  | 'peach'
  | 'orange'
  | 'navy'
  | 'paper'
  | 'kraft'
  | 'cork'
  | 'ceramic'
  | 'coffee'
  | 'ink'
  | 'metal'
  | 'glass'
  | 'rubber'
  | 'flag'
  | 'noteYellow'
  | 'wall'
  | 'tokenRed'
  | 'tokenCream';

type PhysicalParams = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

/** 半つや消しのプラスチック（おもちゃ）。 */
const toy = (color: string, rough = 0.5, coat = 0.18): PhysicalParams => ({
  color,
  roughness: rough,
  clearcoat: coat,
  clearcoatRoughness: 0.4,
});

const PROP_DEFS: Record<PropName, PhysicalParams> = {
  white: toy('#fffaf2'),
  cream: toy('#fff0d9'),
  pink: toy('#ffb5d0'),
  pinkDeep: toy('#ff7fa9'),
  mint: toy('#8fe5c4'),
  mintDeep: toy('#3fcf9b'),
  sky: toy('#94d3ff'),
  skyDeep: toy('#4aa8f4'),
  lemon: toy('#ffe36a'),
  lemonDeep: toy('#ffc93c'),
  coral: toy('#ff8378'),
  coralDeep: toy('#f2493f'),
  lavender: toy('#c6b5ff'),
  peach: toy('#ffcdab'),
  orange: toy('#ffb45a'),
  navy: toy('#3d4572', 0.55, 0.1),
  paper: { color: '#fffdf7', roughness: 0.9 },
  kraft: { color: '#ebc790', roughness: 0.85 },
  cork: { color: '#e2bd8a', roughness: 0.95 },
  ceramic: { color: '#fffaf2', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  coffee: { color: '#8a5a3c', roughness: 0.3, clearcoat: 0.4 },
  ink: { color: '#ee4d55', roughness: 0.95 },
  metal: { color: '#eef0f7', metalness: 0.45, roughness: 0.42 },
  glass: { color: '#bfe5ff', roughness: 0.12, clearcoat: 0.8 },
  rubber: { color: '#5f6785', roughness: 0.85 },
  flag: { color: '#ff6f86', roughness: 0.8, side: DoubleSide },
  noteYellow: { color: '#fff08a', roughness: 0.9 },
  wall: { color: '#fff4e2', roughness: 0.8 },
  tokenRed: { color: '#ff2f2a', roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.35 },
  tokenCream: { color: '#fff3dc', roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3 },
};

export type Quality = 'low' | 'high';

/** レンダラーが共有する材質一式。 */
export class Materials {
  readonly maxAniso: number;
  readonly fiber: Texture;
  readonly desk: MeshStandardMaterial;
  readonly mat: MeshStandardMaterial;
  readonly boardTop: MeshStandardMaterial;
  readonly boardSide: MeshStandardMaterial;
  readonly ledger: MeshStandardMaterial;
  /** 縁取り・ラインの色（ポップなレモンイエロー） */
  readonly gold: MeshStandardMaterial;
  readonly sector: MeshStandardMaterial;
  readonly tilePlate: MeshStandardMaterial;
  readonly tilePaper: MeshStandardMaterial;
  readonly label: MeshStandardMaterial;
  readonly icons: MeshStandardMaterial;
  readonly ground: MeshStandardMaterial;
  readonly stamp: MeshStandardMaterial;
  readonly blob: MeshBasicMaterial;

  private readonly owned: Texture[] = [];
  private readonly props = new Map<PropName, MeshPhysicalMaterial>();
  private readonly extras: Material[] = [];
  private deskArt: Texture | null = null;

  constructor(maxAniso: number, quality: Quality) {
    this.maxAniso = maxAniso;
    const aniso = Math.min(maxAniso, quality === 'high' ? 16 : 4);
    const own = <T extends Texture>(t: T): T => {
      this.owned.push(t);
      return t;
    };
    const repeated = (src: Texture, rx: number, ry = rx): Texture => {
      const t = src.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return own(t);
    };

    this.fiber = own(textureSource.fiber(aniso));

    // 机（白木の天板。つや消し）
    const woodSize = quality === 'high' ? 2048 : 1024;
    const wood = own(textureSource.wood(woodSize, aniso));
    wood.repeat.set(1 / DESK_TILE, 1 / DESK_TILE);
    this.desk = new MeshStandardMaterial({
      map: wood,
      bumpMap: wood,
      bumpScale: 0.5,
      roughness: 0.62,
    });
    // デスクマット（フェルト地）。色は貼るテクスチャ側で持つ。
    this.mat = new MeshStandardMaterial({
      color: '#ffffff',
      bumpMap: repeated(this.fiber, 1 / 7),
      bumpScale: 1.4,
      roughness: 0.96,
    });

    // 盤面: 厚紙に貼ったミントの印刷紙。上面 UV は形状の xy（単位そのまま）。
    const paper = own(textureSource.boardPaper(aniso));
    paper.repeat.set(1 / 32, 1 / 32);
    this.boardTop = new MeshStandardMaterial({
      map: paper,
      bumpMap: repeated(this.fiber, 1 / 11),
      bumpScale: 0.7,
      roughness: 0.78,
    });
    this.boardSide = new MeshStandardMaterial({
      color: '#f8eedb',
      bumpMap: repeated(this.fiber, 1 / 5),
      bumpScale: 1.4,
      roughness: 0.9,
    });
    const ledger = own(textureSource.ledger(aniso));
    ledger.repeat.set(1 / 4, 1 / 4);
    this.ledger = new MeshStandardMaterial({
      map: ledger,
      bumpMap: repeated(this.fiber, 1 / 11),
      bumpScale: 0.5,
      roughness: 0.8,
    });
    this.gold = new MeshStandardMaterial({ color: '#ffd15a', roughness: 0.5, metalness: 0 });
    // 盤面の下地イラスト（board_ground.png があるときだけ貼る）
    this.ground = new MeshStandardMaterial({
      bumpMap: repeated(this.fiber, 1 / 11),
      bumpScale: 0.5,
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 月のプレート・マスの台紙: 頂点カラーで色分け。
    this.sector = new MeshStandardMaterial({
      vertexColors: true,
      bumpMap: repeated(this.fiber, 1 / 11),
      bumpScale: 0.6,
      roughness: 0.66,
    });
    this.tilePlate = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    const fiberUv1 = this.fiber.clone();
    fiberUv1.channel = 1;
    fiberUv1.needsUpdate = true;
    own(fiberUv1);
    this.tilePaper = new MeshStandardMaterial({
      vertexColors: true,
      bumpMap: fiberUv1,
      bumpScale: 0.45,
      roughness: 0.72,
    });
    this.label = new MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.icons = new MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.stamp = new MeshStandardMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const blobTex = own(makeBlobTexture());
    this.blob = new MeshBasicMaterial({
      map: blobTex,
      color: '#5a3a4a',
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
  }

  /** 小物用の材質（キャッシュ）。 */
  prop(name: PropName): MeshPhysicalMaterial {
    let m = this.props.get(name);
    if (!m) {
      m = new MeshPhysicalMaterial(PROP_DEFS[name]);
      this.props.set(name, m);
    }
    return m;
  }

  /** 一点ものの材質。dispose を Materials に任せる。 */
  track<T extends Material>(m: T): T {
    this.extras.push(m);
    return m;
  }

  trackTexture<T extends Texture>(t: T): T {
    this.owned.push(t);
    return t;
  }

  /** イラスト素材（desk_wood.png）で机を上書き。null で手続き生成に戻す。 */
  applyDeskArt(tex: Texture | null): void {
    const d = this.desk;
    if (tex) {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.repeat.set(1 / DESK_TILE, 1 / DESK_TILE);
      tex.anisotropy = Math.min(this.maxAniso, 16);
      tex.needsUpdate = true;
      this.deskArt = tex;
      d.map = tex;
      d.bumpMap = null;
    }
    d.needsUpdate = true;
  }

  /** 盤面の下地イラスト用のテクスチャ設定（貼る形状側の UV は形状の xy）。 */
  prepareGround(tex: Texture, side: number): void {
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.repeat.set(1 / side, 1 / side);
    tex.offset.set(0.5, 0.5);
    tex.anisotropy = Math.min(this.maxAniso, 16);
    tex.needsUpdate = true;
    this.ground.map = tex;
    this.ground.needsUpdate = true;
  }

  setTileAtlas(tex: Texture | null): void {
    this.tilePaper.map = tex;
    this.tilePaper.needsUpdate = true;
  }

  setLabelAtlas(tex: Texture | null): void {
    this.label.map = tex;
    this.label.needsUpdate = true;
  }

  setIconTexture(tex: Texture | null): void {
    this.icons.map = tex;
    this.icons.needsUpdate = true;
  }

  setStampMap(tex: Texture): void {
    this.stamp.map = tex;
    this.stamp.needsUpdate = true;
  }

  /** シャドウの有無が変わったとき、プログラムを作り直させる。 */
  refresh(): void {
    for (const m of this.allMaterials()) m.needsUpdate = true;
  }

  private allMaterials(): Material[] {
    return [
      this.desk,
      this.mat,
      this.boardTop,
      this.boardSide,
      this.ledger,
      this.gold,
      this.ground,
      this.sector,
      this.tilePlate,
      this.tilePaper,
      this.label,
      this.icons,
      this.stamp,
      this.blob,
      ...this.props.values(),
      ...this.extras,
    ];
  }

  dispose(): void {
    for (const m of this.allMaterials()) m.dispose();
    for (const t of this.owned) t.dispose();
    this.tilePaper.map?.dispose();
    this.label.map?.dispose();
    this.stamp.map?.dispose();
    // イラスト素材のテクスチャは renderer 側が持っている（作り直しで使い回す）
    void this.deskArt;
  }
}
