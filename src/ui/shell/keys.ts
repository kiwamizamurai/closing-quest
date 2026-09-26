/** キーボードショートカットの誤爆を防ぐための判定。 */

/** 文字入力を受ける要素か。 */
export const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** Space/Enter を自前で処理する操作部品（ボタン・タブなど）の上か。 */
export const isControlTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  if (isEditableTarget(t)) return true;
  return (
    t.closest(
      'button, a[href], summary, [role="tab"], [role="button"], [role="radio"], [role="checkbox"], [role="option"]',
    ) !== null
  );
};

/** ボタンの押しっぱなし（キーリピート）で連続して発火しないようにする。 */
export const suppressKeyRepeat = (node: HTMLElement): void => {
  node.addEventListener('keydown', (e) => {
    if (e.repeat) e.preventDefault();
  });
};
