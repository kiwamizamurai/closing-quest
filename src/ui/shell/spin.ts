import type { GameState, GameStore } from '@/core/game/types';
import { announce, el } from '@/ui/dom';
import { isControlTarget, suppressKeyRepeat } from './keys';
import { focusSoon, type View } from './view';

const kbd = (text: string): HTMLElement => el('kbd', { class: 'cq-kbd', text });

/** 何マス進むか。必須マスで途中停止する場合は path の長さのほうが短い（path は通過するマスの列で起点を含まない前提）。 */
const stepsOf = (state: GameState): { roll: number; steps: number } | undefined => {
  const pr = state.pendingRoll;
  if (!pr) return undefined;
  const roll = pr.plan.roll;
  const steps = pr.path.length > 0 && pr.path.length < roll ? pr.path.length : roll;
  return { roll, steps };
};

/** 画面下中央のルーレット操作（idle: ボタン／rolling・moving: 状況のカプセル）。 */
export const createSpin = (store: GameStore): View => {
  const spin = (): void => {
    if (store.getState().phase === 'idle') store.dispatch({ type: 'SPIN' });
  };

  const btn = el(
    'button',
    { class: 'cq-spin__btn', attrs: { type: 'button' }, on: { click: spin } },
    el('span', { text: 'ルーレットを回す' }),
  );
  suppressKeyRepeat(btn);
  const idleBox = el(
    'div',
    { class: 'cq-spin__idle' },
    btn,
    el('p', { class: 'cq-spin__hint' }, kbd('Space'), ' / ', kbd('Enter'), ' でも回せます'),
  );

  const rollingBox = el(
    'div',
    { class: 'cq-spin__cap', attrs: { role: 'status' } },
    el('span', { class: 'cq-spin__dots', attrs: { 'aria-hidden': 'true' } }, el('i'), el('i'), el('i')),
    el('span', { text: 'ルーレット中…' }),
  );

  const dieNum = el('span', { class: 'cq-spin__die' });
  const moveText = el('span', { class: 'cq-spin__cap-text' });
  const movingBox = el('div', { class: 'cq-spin__cap', attrs: { role: 'status' } }, dieNum, moveText);

  const root = el('div', { class: 'cq-spin', attrs: { hidden: true } }, idleBox, rollingBox, movingBox);

  // Space/Enter でルーレット。ボタンなど自前で処理する部品の上では何もしない（二重発火を防ぐ）
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (store.getState().phase !== 'idle') return;
    if (isControlTarget(e.target)) return;
    e.preventDefault();
    spin();
  };
  document.addEventListener('keydown', onKey);

  const bodyFocused = (): boolean => document.activeElement === null || document.activeElement === document.body;

  return {
    el: root,
    update(state, ctx) {
      const { phase } = state;
      const isIdle = phase === 'idle';
      const isRolling = phase === 'rolling';
      const isMoving = phase === 'moving';
      root.hidden = !(isIdle || isRolling || isMoving);
      idleBox.hidden = !isIdle;
      rollingBox.hidden = !isRolling;
      movingBox.hidden = !isMoving;

      if (isMoving) {
        const info = stepsOf(state);
        if (info) {
          dieNum.textContent = String(info.roll);
          dieNum.hidden = false;
          moveText.textContent =
            info.steps === info.roll ? `${info.steps} マス進む` : `${info.steps} マス進む（必須マスで止まる）`;
        } else {
          dieNum.hidden = true;
          moveText.textContent = '移動中…';
        }
      }

      if (ctx.entered) {
        if (isIdle) announce('ルーレットを回してください');
        else if (isRolling) announce('ルーレットを回しています');
        else if (isMoving) announce(moveText.textContent ?? '移動中');
      }
      // 画面に入ったとき、または帳簿を閉じて何もフォーカスされていないときに、ボタンへフォーカスを当てる
      if (isIdle && !ctx.booksOpen && (ctx.entered || (ctx.booksJustClosed && bodyFocused()))) {
        focusSoon(btn);
      }
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
};
