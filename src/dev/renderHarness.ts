import type { Square, SquareType } from '@/core/game/types';
import { planSpin } from '@/core/game/roulette';
import type { CardKind } from '@/core/tasks/types';
import { mkDate } from '@/core/types';
import { setArtUrl } from '@/render/art';
import { createBoardRenderer, type BoardRenderer } from '@/render';

/**
 * 3D 描画の動作確認ハーネス（/dev/render.html）。約 80 マスの固定フィクスチャで、
 * 回す・動かす・寄る・パネルを開く・押印・月の強調・画質切り替えを試せる。
 * URL に ?art=1 を付けると、イラスト素材の差し替え口を確認するためのテスト画像を生成して読み込む。
 */

const LABELS = [
  '売上計上',
  '仕入計上',
  '給与計算',
  '源泉納付',
  '消費税確認',
  '請求書発行',
  '入金確認',
  '経費精算',
  '棚卸し',
  '社会保険',
  '賞与支給',
  '償却計算',
  '振込処理',
  '残高確認',
  '領収書整理',
  '予算差異',
  '在庫確認',
  '債権管理',
  '取引先照会',
  '証憑チェック',
];
const KINDS: CardKind[] = ['JOURNAL', 'CALC', 'AUDIT', 'DECISION', 'REPORT', 'JOURNAL', 'CALC'];

const PER_MONTH = Number(new URLSearchParams(location.search).get('n')) || 0;
const RING_COUNTS = PER_MONTH ? Array.from({ length: 12 }, () => PER_MONTH) : [5, 5, 6, 5, 5, 6, 6, 5, 6, 5, 5, 6];
const ROAD_COUNTS = [5, 5, 5];

const makeFixture = (): Square[] => {
  const out: Square[] = [];
  const counts = [...RING_COUNTS, ...ROAD_COUNTS];
  let index = 0;
  counts.forEach((n, period) => {
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      let type: SquareType = 'normal';
      if (index === 0) type = 'start';
      else if (period === counts.length - 1 && last) type = 'goal';
      else if (last) type = 'monthend';
      else if (k === 2) type = 'deadline';
      else if (k === 3 && n >= 5) type = 'event';
      else if (k === 1 && (period === 5 || period === 11 || period === 13)) type = 'special';
      else if (PER_MONTH && k % 3 !== 2) type = 'routine';
      const label =
        type === 'start'
          ? '期首'
          : type === 'goal'
            ? '決算完了'
            : type === 'monthend'
              ? '月次決算'
              : (LABELS[(index * 7 + period) % LABELS.length] ?? '仕訳');
      const cardKind: CardKind | undefined =
        type === 'start' || type === 'goal'
          ? undefined
          : type === 'deadline'
            ? 'DEADLINE'
            : type === 'event'
              ? 'CHANCE'
              : type === 'monthend'
                ? 'REPORT'
                : KINDS[index % KINDS.length];
      out.push({
        index,
        type,
        period,
        date: mkDate(period, Math.min(28, 2 + Math.floor((k / n) * 26))),
        label,
        cardKind,
        mandatory: type === 'deadline' || type === 'monthend',
      });
      index++;
    }
  });
  return out;
};

// ---- テスト用のイラスト素材（?art=1）-------------------------------------------------
const blobUrl = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('toBlob'))), 'image/png');
  });

const makeTestArt = async (): Promise<void> => {
  const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')!];
  };
  // board_ground: 街マップ風（中央の円は無地）
  {
    const [c, x] = mk(1024, 1024);
    x.fillStyle = '#c8f0dd';
    x.fillRect(0, 0, 1024, 1024);
    const blocks = ['#ffd9e6', '#fff2b8', '#cfe9ff', '#ffe0c8', '#e3d8ff'];
    let i = 0;
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        x.fillStyle = blocks[(gx * 3 + gy * 5 + i++) % blocks.length] ?? '#fff';
        x.beginPath();
        x.roundRect(gx * 128 + 14, gy * 128 + 14, 100, 100, 22);
        x.fill();
      }
    }
    x.fillStyle = '#fffaf0';
    x.beginPath();
    x.arc(512, 512, 330, 0, Math.PI * 2);
    x.fill();
    setArtUrl('board_ground', await blobUrl(c));
  }
  // month_icons: 4 x 3（絵文字）
  {
    const [c, x] = mk(1024, 768);
    const em = ['🌸', '🎏', '☔', '🎋', '🌻', '🎑', '🍁', '🍂', '🎄', '🎍', '👹', '🎎'];
    x.font = '150px "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    em.forEach((e, k) => x.fillText(e, (k % 4) * 256 + 128, Math.floor(k / 4) * 256 + 134));
    setArtUrl('month_icons', await blobUrl(c));
  }
  // kind_icons: 3 x 2
  {
    const [c, x] = mk(768, 512);
    const em = ['✏️', '⏰', '🧮', '🔍', '💡', '📊'];
    x.font = '150px "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    em.forEach((e, k) => x.fillText(e, (k % 3) * 256 + 128, Math.floor(k / 3) * 256 + 134));
    setArtUrl('kind_icons', await blobUrl(c));
  }
  // desk_wood: ラベンダーのパステル板張り（差し替わったことが分かる色）
  {
    const [c, x] = mk(512, 512);
    for (let p = 0; p < 4; p++) {
      x.fillStyle = ['#e7defa', '#efe6ff', '#dfd4f6', '#eae1fb'][p] ?? '#e7defa';
      x.fillRect(0, p * 128, 512, 128);
      x.fillStyle = 'rgba(150,120,200,0.5)';
      x.fillRect(0, p * 128, 512, 4);
    }
    setArtUrl('desk_wood', await blobUrl(c));
  }
};

interface HarnessApi {
  renderer: BoardRenderer;
  squares: Square[];
  state: { index: number; period: number };
}

const start = async (): Promise<void> => {
  const params = new URLSearchParams(location.search);
  if (params.get('art') === '1') await makeTestArt();
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#scene not found');
  const quality = params.get('quality') === 'low' ? 'low' : 'high';
  const renderer = createBoardRenderer(canvas, { quality, reducedMotion: params.get('reduced') === '1' });
  const squares = makeFixture();
  renderer.setBoard(squares);
  const state = { index: 0, period: 0 };
  // 初期状態を URL で指定できる（ヘッドレスのスクリーンショット用）。?at=21&focus=token&panel=1&done=1
  const at = Number(params.get('at') ?? '0');
  const startIndex = Number.isFinite(at) ? Math.max(0, Math.min(squares.length - 1, at)) : 0;
  state.index = startIndex;
  state.period = squares[startIndex]?.period ?? 0;
  renderer.placeToken(startIndex);
  renderer.setCurrentPeriod(state.period);
  if (params.get('done') === '1') {
    squares.forEach((s) => {
      if (s.index < startIndex) renderer.markSquareDone(s.index, true);
    });
  }
  const focus = params.get('focus');
  if (focus === 'overview' || focus === 'roulette' || focus === 'token') renderer.setFocus(focus);
  else if (focus === 'square') renderer.setFocus('square', startIndex);
  if (params.get('panel') === '1') {
    document.getElementById('panel')?.classList.add('open');
    renderer.setPanelOpen(true);
  }
  (window as unknown as { __h: HarnessApi }).__h = { renderer, squares, state };

  // ?settle=1: 補間を待たずにカメラを収束させる（ヘッドレスのスクリーンショット用）
  if (params.get('settle') === '1') (renderer as unknown as { debugAdvance?: (s: number, fps?: number) => void }).debugAdvance?.(6, 30);

  const panel = document.getElementById('panel');
  const bar = document.getElementById('bar');
  const stat = document.getElementById('stat');
  if (!panel || !bar) return;
  let panelOpen = params.get('panel') === '1';
  let q: 'low' | 'high' = quality;
  const done = new Set<number>();

  const btn = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  const sep = (t: string): void => {
    const s = document.createElement('span');
    s.textContent = t;
    bar.appendChild(s);
  };

  const spin = async (force?: number): Promise<number> => {
    const { plan } = planSpin(Math.floor(Math.random() * 2 ** 31), force);
    renderer.setFocus('roulette');
    await renderer.spinRoulette(plan);
    return plan.roll;
  };
  const move = async (n: number): Promise<void> => {
    const path: number[] = [];
    for (let i = 1; i <= n && state.index + i < squares.length; i++) path.push(state.index + i);
    if (path.length === 0) return;
    renderer.setFocus('token');
    await renderer.moveToken(path);
    state.index = path[path.length - 1] ?? state.index;
    const sq = squares[state.index];
    if (sq) {
      state.period = sq.period;
      renderer.setCurrentPeriod(sq.period);
    }
  };

  sep('ルーレット');
  btn('回す', () => void spin());
  for (const n of [1, 2, 3, 4]) btn(`出目${n}`, () => void spin(n));
  btn('回して進む', () => {
    void spin().then((r) => move(r));
  });
  sep('移動');
  for (const n of [1, 2, 4, 6, 12]) btn(`+${n}`, () => void move(n));
  btn('スタートへ', () => {
    state.index = 0;
    renderer.placeToken(0);
    state.period = 0;
    renderer.setCurrentPeriod(0);
  });
  btn('出口へ', () => {
    const i = squares.findIndex((s) => s.period === 12);
    state.index = Math.max(0, i - 1);
    renderer.placeToken(state.index);
  });
  sep('カメラ');
  btn('全体', () => renderer.setFocus('overview'));
  btn('ルーレット', () => renderer.setFocus('roulette'));
  btn('駒', () => renderer.setFocus('token'));
  btn('マス', () => renderer.setFocus('square', state.index));
  btn('決算棟', () => renderer.setFocus('square', squares.length - 1));
  btn('パネル', () => {
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    renderer.setPanelOpen(panelOpen);
  });
  sep('状態');
  btn('押印 ±', () => {
    const on = !done.has(state.index);
    if (on) done.add(state.index);
    else done.delete(state.index);
    renderer.markSquareDone(state.index, on);
  });
  btn('全押印', () => {
    squares.forEach((s) => {
      if (s.index < state.index) {
        done.add(s.index);
        renderer.markSquareDone(s.index, true);
      }
    });
  });
  btn('月 +', () => {
    state.period = (state.period + 1) % 15;
    renderer.setCurrentPeriod(state.period);
  });
  btn('画質', () => {
    q = q === 'high' ? 'low' : 'high';
    renderer.setQuality(q);
  });

  const info = (): void => {
    const dbg = (renderer as unknown as { debugInfo?: () => { calls: number; triangles: number; dist: number } }).debugInfo?.();
    if (stat && dbg) stat.textContent = `calls ${dbg.calls} / tris ${dbg.triangles} / dist ${dbg.dist.toFixed(1)} / idx ${state.index}`;
    requestAnimationFrame(() => setTimeout(info, 500));
  };
  info();
};

void start();
