import './shell.css';
import type { GameState, GameStore, Phase } from '@/core/game/types';
import { el } from '@/ui/dom';
import { createEnded } from './ended';
import { EV_BOOKS_STATE, type BooksStateDetail } from './events';
import { createHud } from './hud';
import { createIntro } from './intro';
import type { ShellOptions } from './options';
import { createSpin } from './spin';
import { createTitle } from './title';
import { createUpcoming } from './upcoming';
import type { View } from './view';

export type { ShellOptions } from './options';

/**
 * シェル UI（タイトル・導入・HUD・ルーレット操作・今後の予定・終了画面）。
 * 全面のオーバーレイで、操作部品以外は pointer-events:none。3D の画面を邪魔しない。
 */
export function createShell(store: GameStore, opts: ShellOptions): { el: HTMLElement; destroy(): void } {
  const views: View[] = [
    createTitle(opts),
    createIntro(store),
    createEnded(opts),
    createHud(store),
    createUpcoming(store),
    createSpin(store),
  ];
  const root = el('div', { class: 'cq-shell' }, ...views.map((v) => v.el));

  let prevPhase: Phase | undefined;
  let booksOpen = false;
  let booksJustClosed = false;

  const render = (state: GameState): void => {
    const entered = state.phase !== prevPhase;
    root.dataset.phase = state.phase;
    root.classList.toggle('cq-shell--books-open', booksOpen);
    for (const v of views) v.update(state, { entered, booksOpen, booksJustClosed });
    prevPhase = state.phase;
    booksJustClosed = false;
  };

  // 帳簿ドロワーの開閉（books が通知する）に合わせて、位置や表示を切り替える
  const onBooksState = (e: Event): void => {
    const open = (e as CustomEvent<BooksStateDetail>).detail.open;
    if (open === booksOpen) return;
    booksJustClosed = booksOpen && !open;
    booksOpen = open;
    render(store.getState());
  };
  document.addEventListener(EV_BOOKS_STATE, onBooksState);

  const unsubscribe = store.subscribe((state) => render(state));
  render(store.getState());

  return {
    el: root,
    destroy() {
      unsubscribe();
      document.removeEventListener(EV_BOOKS_STATE, onBooksState);
      for (const v of views) v.destroy?.();
      root.remove();
    },
  };
}
