import { createGameStore } from '@/core/game/store';
import type { GameEvent, GameState, GameStore } from '@/core/game/types';
import { createScenario } from '@/core/scenario';
import { validateScenario } from '@/core/scenario/validate';
import { createBoardRenderer, type BoardRenderer } from '@/render';
import { createBooksDrawer } from '@/ui/books';
import { createCardPanel } from '@/ui/card';
import { createShell } from '@/ui/shell';
import { installDebug } from './debug';
import { clearSave, hasSave, loadSave, writeSave } from './save';

const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

const randomSeed = (): number => (Math.floor(Math.random() * 0x7fffffff) | 0) >>> 0;

/** 演出が終わるのを待つ。描画側が止まってもゲームが固まらないよう、上限時間で進める。 */
const animate = (run: Promise<void>, limitMs: number, fast: () => boolean): Promise<void> =>
  fast() ? Promise.resolve() : Promise.race([run, wait(limitMs)]);

/** ストア・3D・UI を結線してゲームを起動する。 */
export const startApp = (): void => {
  const canvas = document.getElementById('scene');
  const uiRoot = document.getElementById('ui');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) throw new Error('#scene / #ui が見つかりません');

  const params = new URLSearchParams(window.location.search);
  const scenario = createScenario();

  // 開発中は、シナリオの整合性をコンソールに出す（カード編集のミスに気づくため）
  if (import.meta.env.DEV) {
    const report = validateScenario(scenario);
    if (report.errors.length > 0) console.error('[scenario] 整合性エラー', report.errors);
    else console.info('[scenario] OK', report.stats);
  }

  const store: GameStore = createGameStore(scenario);
  const renderer: BoardRenderer = createBoardRenderer(canvas, {
    quality: params.get('q') === 'low' ? 'low' : 'high',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  renderer.setBoard(scenario.board);

  const debug = installDebug(store, params);
  const fast = (): boolean => debug.fast;

  /** 盤面の見た目を、状態に合わせて作り直す（読み込み・新規開始のとき）。 */
  const resync = (state: GameState): void => {
    const done = new Set(state.records.map((r) => r.cardId));
    for (const sq of scenario.board) renderer.markSquareDone(sq.index, sq.cardId !== undefined && done.has(sq.cardId));
    renderer.placeToken(state.position);
    renderer.setCurrentPeriod(scenario.board[state.position]?.period ?? 0);
    renderer.setPanelOpen(false);
    renderer.setFocus('overview');
  };
  resync(store.getState());

  const onEvents = (state: GameState, events: readonly GameEvent[]): void => {
    for (const e of events) {
      switch (e.type) {
        case 'rollPlanned':
          renderer.setFocus('roulette');
          void animate(renderer.spinRoulette(e.plan), e.plan.durationMs + 4000, fast).then(() => {
            store.dispatch({ type: 'ANIM_DONE' });
          });
          break;
        case 'moveStarted':
          renderer.setFocus('token');
          void animate(renderer.moveToken(e.path), e.path.length * 700 + 3000, fast).then(() => {
            store.dispatch({ type: 'ANIM_DONE' });
          });
          break;
        case 'landed':
          renderer.setCurrentPeriod(scenario.board[e.index]?.period ?? 0);
          break;
        case 'cardStarted':
          renderer.setFocus('square', state.position);
          break;
        case 'cardCompleted':
          renderer.markSquareDone(state.position, true);
          break;
        default:
          break;
      }
    }

    // カードの操作中は、右側のパネルに隠れないよう 3D の中心をずらす
    const panelOpen = state.phase === 'question' || state.phase === 'feedback' || state.phase === 'cardDone';
    renderer.setPanelOpen(panelOpen);
    if (state.phase === 'idle' || state.phase === 'intro' || state.phase === 'title' || state.phase === 'ended') {
      renderer.setFocus('overview');
    }

    // 安全な再開点（ルーレットを回す前）で自動セーブ。終わったら消す
    if (state.phase === 'idle') writeSave(state);
    if (state.phase === 'ended') clearSave();
  };
  store.subscribe(onEvents);

  const shell = createShell(store, {
    hasSave: () => hasSave(scenario.id),
    onNewGame: () => {
      clearSave();
      store.dispatch({ type: 'NEW_GAME', seed: randomSeed() });
      resync(store.getState());
    },
    onLoad: () => {
      const saved = loadSave(scenario.id);
      if (!saved) return;
      store.dispatch({ type: 'LOAD', state: saved });
      resync(store.getState());
    },
  });
  const books = createBooksDrawer(store);
  const card = createCardPanel(store);
  // 重ね順：帳簿（下）→ カード → シェル（HUD・操作。最前面）
  uiRoot.append(books.el, card.el, shell.el);

  document.documentElement.dataset.ready = 'true';
  window.addEventListener('beforeunload', () => renderer.dispose());
};
