/** shell と books が document 越しにやり取りするカスタムイベント名。 */

/** HUD の「帳簿」ボタンなどが発火する。books が購読して開閉する。 */
export const EV_TOGGLE_BOOKS = 'cq:toggle-books';

/** 帳簿ドロワーの開閉状態の通知（books が発火、shell が購読）。detail は BooksStateDetail。 */
export const EV_BOOKS_STATE = 'cq:books-state';

export interface BooksStateDetail {
  readonly open: boolean;
}
