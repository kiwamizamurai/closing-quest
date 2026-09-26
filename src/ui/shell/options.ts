export interface ShellOptions {
  /** セーブデータがあるか（タイトルの「つづきから」の有効化）。 */
  hasSave(): boolean;
  /** 「はじめる」「もう一度遊ぶ」。本体側が NEW_GAME を dispatch する。 */
  onNewGame(): void;
  /** 「つづきから」。 */
  onLoad(): void;
}
