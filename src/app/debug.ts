import { correctAnswer } from '@/core/tasks/judge';
import type { GameState, GameStore } from '@/core/game/types';

export interface DebugHandle {
  /** true の間は、ルーレットと駒の演出を飛ばす。 */
  fast: boolean;
}

/**
 * 開発用の操作。開発サーバー、または URL に ?debug を付けたときだけ有効。
 * コンソールから window.__CQ__ で使う（本番では公開しない）。
 *   __CQ__.step()                    現在の局面を 1 手だけ正解で進める
 *   __CQ__.run(s => s.date >= 800)   条件を満たすまで正解で自動プレイ（演出は飛ばす）
 */
export const installDebug = (store: GameStore, params: URLSearchParams): DebugHandle => {
  const handle: DebugHandle = { fast: false };
  if (!import.meta.env.DEV && !params.has('debug')) return handle;

  const step = (): void => {
    const s = store.getState();
    switch (s.phase) {
      case 'title':
        store.dispatch({ type: 'NEW_GAME', seed: 1 });
        break;
      case 'intro':
      case 'feedback':
      case 'cardDone':
        store.dispatch({ type: 'CONTINUE' });
        break;
      case 'idle':
        store.dispatch({ type: 'SPIN' });
        break;
      case 'rolling':
      case 'moving':
        store.dispatch({ type: 'ANIM_DONE' });
        break;
      case 'question': {
        const q = s.active?.card.questions[s.active.progress.questionIndex];
        if (q) store.dispatch({ type: 'SUBMIT', answer: correctAnswer(q) });
        break;
      }
      case 'ended':
        break;
    }
  };

  const run = (until: (s: GameState) => boolean, maxSteps = 5000): number => {
    const prev = handle.fast;
    handle.fast = true;
    let n = 0;
    while (n < maxSteps && store.getState().phase !== 'ended' && !until(store.getState())) {
      step();
      n += 1;
    }
    handle.fast = prev;
    return n;
  };

  Object.assign(window, { __CQ__: { store, step, run, handle } });
  return handle;
};
