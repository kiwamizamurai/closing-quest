import { selectHud } from '@/core/game/selectors';
import type { GameStore } from '@/core/game/types';
import { dayOf, daysInPeriod, FISCAL_PERIODS, formatYen, PERIOD_MONTHS, type Yen } from '@/core/types';
import { SKILL_LABEL, type SkillId } from '@/core/tasks/types';
import { el } from '@/ui/dom';
import { EV_BOOKS_STATE, EV_TOGGLE_BOOKS, type BooksStateDetail } from './events';
import { retrigger, type View } from './view';

/** スキルは 5 ポイントごとに 1 レベル上がる（core の skillLevel と同じ）。 */
const LEVEL_STEP = 5;
/** 増減表示を消すまでの時間（ミリ秒）。 */
const POP_MS = 2200;

const signedYen = (n: Yen): string => (n > 0 ? `+${formatYen(n)}` : formatYen(n));

const label = (text: string): HTMLElement => el('span', { class: 'cq-hud__label', text });

/** 上部の帯（HUD）。日付・年度の進行・現預金・信頼・スキル・ターン・帳簿ボタン。 */
export const createHud = (store: GameStore): View => {
  // 日付
  const datePeriod = label('');
  const dateMain = el('strong', { class: 'cq-hud__value cq-hud__date-main' });
  const dateBlock = el('div', { class: 'cq-hud__block cq-hud__date' }, datePeriod, dateMain);

  // 会計年度の進行（12か月＋決算ステージ）
  const cells = Array.from({ length: FISCAL_PERIODS + 1 }, (_, i) => {
    const settle = i === FISCAL_PERIODS;
    const fill = el('span', { class: 'cq-fy__fill' });
    const cell = el(
      'li',
      { class: settle ? 'cq-fy__cell is-settle' : 'cq-fy__cell' },
      el('span', { class: 'cq-fy__label', text: settle ? '決算' : String(PERIOD_MONTHS[i] ?? '') }),
      el('span', { class: 'cq-fy__bar' }, fill),
    );
    return { cell, fill };
  });
  const fy = el(
    'ol',
    { class: 'cq-fy', attrs: { role: 'img' } },
    ...cells.map((c) => c.cell),
  );

  // 現預金
  const cashValue = el('strong', { class: 'cq-hud__value cq-cash__value' });
  const cashPop = el('span', { class: 'cq-cash__pop', attrs: { 'aria-hidden': 'true' } });
  const cashBlock = el(
    'div',
    { class: 'cq-hud__block cq-cash' },
    label('現預金'),
    el('span', { class: 'cq-cash__row' }, cashValue),
    cashPop,
  );

  // 信頼
  const trustFill = el('span', { class: 'cq-trust__fill' });
  const trustNum = el('strong', { class: 'cq-hud__value cq-trust__num' });
  const trustBlock = el(
    'div',
    { class: 'cq-hud__block cq-trust', attrs: { role: 'meter', 'aria-label': '信頼', 'aria-valuemin': 0, 'aria-valuemax': 100 } },
    label('信頼'),
    el('span', { class: 'cq-trust__row' }, el('span', { class: 'cq-trust__bar' }, trustFill), trustNum),
  );

  // スキル 5 種
  const skillIds = Object.keys(SKILL_LABEL) as SkillId[];
  const skillEls = skillIds.map((id) => {
    const lv = el('strong', { class: 'cq-skill__lv' });
    const pips = Array.from({ length: LEVEL_STEP }, () => el('i', { class: 'cq-skill__pip' }));
    const item = el(
      'li',
      { class: 'cq-skill' },
      el('span', { class: 'cq-skill__label', text: SKILL_LABEL[id] }),
      el('span', { class: 'cq-skill__row' }, lv, el('span', { class: 'cq-skill__pips', attrs: { 'aria-hidden': 'true' } }, ...pips)),
    );
    return { id, item, lv, pips };
  });
  const skills = el('ul', { class: 'cq-skills', attrs: { 'aria-label': '経理スキル' } }, ...skillEls.map((s) => s.item));

  // ターン
  const turnValue = el('strong', { class: 'cq-hud__value' });
  const turnBlock = el('div', { class: 'cq-hud__block cq-turn' }, label('ターン'), turnValue);

  // 帳簿ボタン（drawer とは document のカスタムイベントでつなぐ）
  const booksBtn = el(
    'button',
    {
      class: 'cq-hud__books',
      attrs: { type: 'button', 'aria-keyshortcuts': 'B', 'aria-expanded': 'false', 'aria-label': '帳簿を開く（B）' },
      on: { click: () => document.dispatchEvent(new CustomEvent(EV_TOGGLE_BOOKS)) },
    },
    el('span', { text: '帳簿' }),
    el('kbd', { class: 'cq-kbd cq-kbd--sm', text: 'B' }),
  );
  const onBooksState = (e: Event): void => {
    const open = (e as CustomEvent<BooksStateDetail>).detail.open;
    booksBtn.setAttribute('aria-expanded', String(open));
    booksBtn.setAttribute('aria-label', open ? '帳簿を閉じる（B）' : '帳簿を開く（B）');
    booksBtn.classList.toggle('is-active', open);
  };
  document.addEventListener(EV_BOOKS_STATE, onBooksState);

  const root = el(
    'header',
    { class: 'cq-hud', attrs: { hidden: true } },
    dateBlock,
    el('div', { class: 'cq-hud__fy' }, fy),
    cashBlock,
    trustBlock,
    skills,
    turnBlock,
    booksBtn,
  );

  // 増減の演出用
  let lastCash: Yen | undefined;
  let lastTrust: number | undefined;
  let pendingDelta = 0;
  let popTimer: number | undefined;

  const showCashDelta = (d: Yen): void => {
    pendingDelta += d;
    if (pendingDelta === 0) {
      cashPop.classList.remove('is-show');
      return;
    }
    cashPop.textContent = signedYen(pendingDelta);
    cashPop.dataset.dir = pendingDelta > 0 ? 'up' : 'down';
    retrigger(cashPop, 'is-show');
    window.clearTimeout(popTimer);
    popTimer = window.setTimeout(() => {
      pendingDelta = 0;
      cashPop.classList.remove('is-show');
    }, POP_MS);
  };

  return {
    el: root,
    update(state) {
      const visible = state.phase !== 'title' && state.phase !== 'ended';
      root.hidden = !visible;
      if (!visible) {
        // 新しいゲームの最初の値を「増減」として見せないよう、前回値を捨てる
        lastCash = undefined;
        lastTrust = undefined;
        return;
      }
      const hud = selectHud(state, store.scenario);

      datePeriod.textContent = hud.periodLabel;
      dateMain.textContent = hud.dateLabel;

      // 年度の進行
      const settleIdx = FISCAL_PERIODS;
      cells.forEach(({ cell, fill }, i) => {
        let st: 'done' | 'current' | 'todo';
        let ratio = 0;
        if (i < settleIdx) {
          st = hud.period > i ? 'done' : hud.period === i ? 'current' : 'todo';
          if (st === 'current') ratio = dayOf(hud.date) / daysInPeriod(i);
        } else {
          st = hud.yearEndStage ? 'current' : 'todo';
          if (st === 'current') {
            ratio = (hud.period - FISCAL_PERIODS + dayOf(hud.date) / daysInPeriod(hud.period)) / 3;
          }
        }
        cell.dataset.state = st;
        if (st === 'current') cell.setAttribute('aria-current', 'step');
        else cell.removeAttribute('aria-current');
        fill.style.width = st === 'done' ? '100%' : st === 'current' ? `${Math.round(Math.min(1, ratio) * 100)}%` : '0%';
      });
      fy.setAttribute(
        'aria-label',
        hud.yearEndStage ? '会計年度の進行：決算ステージ' : `会計年度の進行：${hud.month}月（12か月のうち${hud.period + 1}か月目）`,
      );

      // 現預金
      cashValue.textContent = formatYen(hud.cash);
      cashValue.classList.toggle('is-neg', hud.cash < 0);
      if (lastCash !== undefined && lastCash !== hud.cash) {
        cashValue.dataset.flash = hud.cash > lastCash ? 'up' : 'down';
        retrigger(cashValue, 'is-flash');
        showCashDelta(hud.cash - lastCash);
      }
      lastCash = hud.cash;

      // 信頼
      const trust = Math.max(0, Math.min(100, Math.round(hud.trust)));
      trustFill.style.width = `${trust}%`;
      trustNum.textContent = String(trust);
      trustBlock.setAttribute('aria-valuenow', String(trust));
      if (lastTrust !== undefined && lastTrust !== trust) {
        trustNum.dataset.flash = trust > lastTrust ? 'up' : 'down';
        retrigger(trustNum, 'is-flash');
      }
      lastTrust = trust;

      // スキル
      for (const s of skillEls) {
        const info = hud.skills.find((x) => x.id === s.id);
        if (!info) continue;
        const into = info.points - (info.level - 1) * LEVEL_STEP;
        s.lv.textContent = `Lv${info.level}`;
        s.pips.forEach((p, i) => p.classList.toggle('is-on', i < into));
        s.item.title = `${info.label} Lv${info.level}（次のレベルまであと${LEVEL_STEP - into}）`;
        s.item.setAttribute('aria-label', `${info.label} レベル${info.level}`);
      }

      turnValue.textContent = String(hud.turn);
    },
    destroy() {
      document.removeEventListener(EV_BOOKS_STATE, onBooksState);
      window.clearTimeout(popTimer);
    },
  };
};
