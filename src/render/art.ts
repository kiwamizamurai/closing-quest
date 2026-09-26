import { SRGBColorSpace, TextureLoader, type Texture } from 'three';

/**
 * 外部のイラスト素材（あれば使い、無ければ手続き生成のままにする）。
 * 置き場所: public/assets/art/
 *  - desk_wood.jpeg   机の天板（タイルできる木目。1 枚が約 96 単位）
 *  - board_ground.jpeg 盤面の下地。正方形。中央の円形は無地（ルーレットの下）
 *  - month_icons.png  月のアイコン。4 列 x 3 行、左上から 4月 → 翌3月の順
 *  - kind_icons.png   カード種別のアイコン。3 列 x 2 行、JOURNAL, DEADLINE, CALC, AUDIT, DECISION, REPORT の順
 */
export type ArtName = 'desk_wood' | 'board_ground' | 'month_icons' | 'kind_icons';

export const ART_FILES: Record<ArtName, string> = {
  desk_wood: 'desk_wood.jpeg',
  board_ground: 'board_ground.jpeg',
  month_icons: 'month_icons.png',
  kind_icons: 'kind_icons.png',
};

/** アイコンシートのグリッド（列数, 行数）。 */
export const ART_GRID: Record<'month_icons' | 'kind_icons', { cols: number; rows: number }> = {
  month_icons: { cols: 4, rows: 3 },
  kind_icons: { cols: 3, rows: 2 },
};

const overrides: Partial<Record<ArtName, string>> = {};

/** テストや別の配置場所のために、素材の URL を差し替える（読み込み前に呼ぶ）。 */
export const setArtUrl = (name: ArtName, url: string | null): void => {
  if (url === null) delete overrides[name];
  else overrides[name] = url;
};

const baseUrl = (): string => {
  if (import.meta.env.DEV) return '/assets/art/';
  return new URL(`${import.meta.env.BASE_URL}assets/art/`, document.baseURI).href;
};

export const artUrl = (name: ArtName): string => overrides[name] ?? `${baseUrl()}${ART_FILES[name]}`;

/**
 * ファイルがあれば TextureLoader で読み込む。無い・画像でない場合は null（呼び出し側は手続き生成のまま使う）。
 * 開発サーバーは存在しないパスに index.html を返すので、先に Content-Type が画像かを確認する。
 */
export const loadArt = async (name: ArtName): Promise<Texture | null> => {
  try {
    const res = await fetch(artUrl(name));
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const tex = await new TextureLoader().loadAsync(objectUrl);
      tex.colorSpace = SRGBColorSpace;
      return tex;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
};

/** アイコンシートのセル (col, row) を、テクスチャ座標（v は上が 1）で返す。 */
export const gridCellUv = (
  grid: { cols: number; rows: number },
  index: number,
  inset = 0.004,
): { u0: number; v0: number; u1: number; v1: number } => {
  const c = index % grid.cols;
  const r = Math.floor(index / grid.cols);
  return {
    u0: c / grid.cols + inset,
    u1: (c + 1) / grid.cols - inset,
    v1: 1 - r / grid.rows - inset,
    v0: 1 - (r + 1) / grid.rows + inset,
  };
};
