import type { GameState } from '@/core/game/types';

export interface ViewContext {
  /** この更新で phase が切り替わった（画面に入った）。 */
  readonly entered: boolean;
  /** 帳簿ドロワーが開いている。 */
  readonly booksOpen: boolean;
  /** この更新で帳簿ドロワーが閉じた。 */
  readonly booksJustClosed: boolean;
}

/** shell を構成する画面部品。store の状態から表示を更新する。 */
export interface View {
  readonly el: HTMLElement;
  update(state: GameState, ctx: ViewContext): void;
  destroy?(): void;
}

/**
 * 表示直後のフォーカス移動。すぐ当てられるときはすぐ当て、まだ DOM に載っていない初回描画のときだけ次フレームに回す
 * （バックグラウンドのタブでは rAF が止まるので、常に rAF に頼らない）。
 */
export const focusSoon = (node: HTMLElement): void => {
  const tryFocus = (): boolean => {
    if (!node.isConnected || node.closest('[hidden]') || (node as HTMLButtonElement).disabled) return false;
    node.focus({ preventScroll: true });
    return true;
  };
  if (!tryFocus()) requestAnimationFrame(tryFocus);
};

/** CSS アニメーションを最初から再生し直す。 */
export const retrigger = (node: HTMLElement, cls: string): void => {
  node.classList.remove(cls);
  void node.offsetWidth; // 再フロー
  node.classList.add(cls);
};
