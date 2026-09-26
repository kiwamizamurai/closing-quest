import type { GameState } from '@/core/game/types';

/** 帳簿ドロワーのタブ 1 枚分。開いている間だけ update が呼ばれる。 */
export interface BooksTab {
  readonly el: HTMLElement;
  update(state: GameState): void;
}
