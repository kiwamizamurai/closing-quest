import type { IncomeStatement } from '@/core/accounting/statements';
import { selectStatements } from '@/core/game/selectors';
import type { GameState, GameStore } from '@/core/game/types';
import {
  endOfPeriod,
  formatDate,
  formatDateWithWeekday,
  formatPeriodJa,
  FISCAL_YEAR_LABEL,
  mkDate,
  type Yen,
} from '@/core/types';
import { clear, el } from '@/ui/dom';
import { fmtNum, fmtSigned } from './format';
import type { BooksTab } from './tab';

type Mode = 'month' | 'ytd';

type Row =
  | { kind: 'line' | 'sub' | 'total' | 'head'; label: string; amount: Yen }
  /** 内訳（内側の列に金額を出す）。 */
  | { kind: 'detail'; label: string; amount: Yen }
  | { kind: 'note'; node: HTMLElement };

const buildRows = (is: IncomeStatement, budget: HTMLElement | null): Row[] => {
  const rows: Row[] = [{ kind: 'line', label: '売上高', amount: is.sales }];
  if (budget) rows.push({ kind: 'note', node: budget });
  rows.push(
    { kind: 'line', label: '売上原価', amount: is.cogs },
    { kind: 'sub', label: '売上総利益', amount: is.grossProfit },
    { kind: 'head', label: '販売費及び一般管理費', amount: is.sgaTotal },
    ...is.sga.map((l): Row => ({ kind: 'detail', label: l.name, amount: l.amount })),
    { kind: 'sub', label: '営業利益', amount: is.operatingIncome },
  );
  if (is.nonOperatingIncome.length > 0) {
    rows.push({
      kind: 'head',
      label: '営業外収益',
      amount: is.nonOperatingIncome.reduce((s, l) => s + l.amount, 0),
    });
    for (const l of is.nonOperatingIncome) rows.push({ kind: 'detail', label: l.name, amount: l.amount });
  }
  if (is.nonOperatingExpense.length > 0) {
    rows.push({
      kind: 'head',
      label: '営業外費用',
      amount: is.nonOperatingExpense.reduce((s, l) => s + l.amount, 0),
    });
    for (const l of is.nonOperatingExpense) rows.push({ kind: 'detail', label: l.name, amount: l.amount });
  }
  rows.push(
    { kind: 'sub', label: '税引前当期純利益', amount: is.incomeBeforeTax },
    { kind: 'line', label: '法人税等', amount: is.corpTax },
    { kind: 'total', label: '当期純利益', amount: is.netIncome },
  );
  return rows;
};

const renderRow = (r: Row): HTMLElement => {
  if (r.kind === 'note') {
    return el('tr', { class: 'cq-fs__note' }, el('td', { attrs: { colspan: 3 } }, r.node));
  }
  const neg = r.amount < 0 ? ' is-neg' : '';
  if (r.kind === 'detail') {
    return el(
      'tr',
      { class: 'cq-fs__detail' },
      el('th', { attrs: { scope: 'row' }, text: r.label }),
      el('td', { class: `num${neg}`, text: fmtNum(r.amount) }),
      el('td'),
    );
  }
  return el(
    'tr',
    { class: `cq-fs__${r.kind}` },
    el('th', { attrs: { scope: 'row' }, text: r.label }),
    el('td'),
    el('td', { class: `num${neg}`, text: fmtNum(r.amount) }),
  );
};

/** 売上予算との差の 1 行（当月のみ）。色だけでなく文言でも達成・未達を示す。 */
const budgetNote = (sales: Yen, budget: Yen): HTMLElement => {
  const diff = sales - budget;
  const rate = Math.round((sales / budget) * 100);
  return el(
    'p',
    { class: 'cq-budget' },
    el('span', { text: `売上予算 ${fmtNum(budget)}円` }),
    el('strong', {
      class: diff >= 0 ? 'is-ok' : 'is-ng',
      text: `${diff >= 0 ? '予算超過' : '予算未達'} ${fmtSigned(diff)}円（達成率 ${rate}%）`,
    }),
  );
};

/** ② 損益計算書。当月／累計の切替つき。当月には売上予算との差も出す。 */
export const createIncomeTab = (store: GameStore): BooksTab => {
  let mode: Mode = 'month';
  let last: GameState | undefined;

  // 見出しと切替ボタンは作り直さない（クリック後もフォーカスを保つ）
  const title = el('h3', { class: 'cq-tab__title', text: '損益計算書' });
  const asOf = el('p', { class: 'cq-tab__asof' });

  const monthBtn: HTMLButtonElement = el('button', {
    class: 'cq-seg__btn',
    text: '当月',
    attrs: { type: 'button', role: 'radio', 'aria-checked': 'true' },
  });
  const ytdBtn: HTMLButtonElement = el('button', {
    class: 'cq-seg__btn',
    text: '累計',
    attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
  });
  const choose = (m: Mode, focus = false): void => {
    mode = m;
    if (last) render(last);
    if (focus) (m === 'month' ? monthBtn : ytdBtn).focus();
  };
  monthBtn.addEventListener('click', () => choose('month'));
  ytdBtn.addEventListener('click', () => choose('ytd'));
  for (const b of [monthBtn, ytdBtn]) {
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      choose(mode === 'month' ? 'ytd' : 'month', true);
    });
  }
  const seg = el('div', { class: 'cq-seg', attrs: { role: 'radiogroup', 'aria-label': '集計期間' } }, monthBtn, ytdBtn);

  const caption = el('p', { class: 'cq-tab__caption' });
  const content = el('div', { class: 'cq-tab__content' });
  const root = el(
    'div',
    { class: 'cq-tab' },
    el('header', { class: 'cq-tab__head' }, title, asOf, seg),
    caption,
    content,
  );

  const render = (state: GameState): void => {
    const s = selectStatements(state, store.scenario);
    const yearEnd = s.monthIncome === s.ytdIncome; // 決算ステージは年度全体だけ
    const eff: Mode = yearEnd ? 'ytd' : mode;
    seg.hidden = yearEnd;
    monthBtn.setAttribute('aria-checked', String(eff === 'month'));
    ytdBtn.setAttribute('aria-checked', String(eff === 'ytd'));
    monthBtn.tabIndex = eff === 'month' ? 0 : -1;
    ytdBtn.tabIndex = eff === 'ytd' ? 0 : -1;
    asOf.textContent = `${formatDateWithWeekday(state.date)} 時点`;

    const is = eff === 'month' ? s.monthIncome : s.ytdIncome;
    if (yearEnd) {
      title.textContent = `損益計算書（${FISCAL_YEAR_LABEL}）`;
      caption.textContent = `決算ステージ：期首から${formatDate(state.date)}までの年度全体の損益です。`;
    } else if (eff === 'month') {
      const from = mkDate(s.period, 1);
      const to = Math.min(state.date, endOfPeriod(s.period));
      title.textContent = `損益計算書（${formatPeriodJa(s.period)}分）`;
      caption.textContent = `当月：${formatDate(from)}〜${formatDate(to)}`;
    } else {
      title.textContent = '損益計算書（累計）';
      caption.textContent = `累計：期首（4/1）〜${formatDate(state.date)}`;
    }

    const budget = eff === 'month' && s.salesBudget > 0 ? budgetNote(is.sales, s.salesBudget) : null;
    const rows = buildRows(is, budget);

    clear(content);
    content.append(
      el(
        'table',
        { class: 'cq-table cq-fs' },
        el('caption', { class: 'sr-only', text: '損益計算書（単位：円）' }),
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { attrs: { scope: 'col' }, text: '科目' }),
            el('th', { class: 'num', attrs: { scope: 'col' }, text: '内訳（円）' }),
            el('th', { class: 'num', attrs: { scope: 'col' }, text: '金額（円）' }),
          ),
        ),
        el('tbody', {}, ...rows.map(renderRow)),
      ),
    );
    if (s.inventoryEnd !== undefined) {
      content.append(
        el('p', {
          class: 'cq-note',
          text: `※ 棚卸高は月末の実地棚卸による（決算整理前）。月末の商品棚卸高は ${fmtNum(s.inventoryEnd)}円。`,
        }),
      );
    }
  };

  return {
    el: root,
    update(state) {
      last = state;
      render(state);
    },
  };
};
