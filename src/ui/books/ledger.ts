import { ACCOUNT_LIST, accountDef, type AccountId, type Category } from '@/core/accounting/accounts';
import { selectLedger } from '@/core/game/selectors';
import type { GameState, GameStore } from '@/core/game/types';
import { formatDate } from '@/core/types';
import { clear, el } from '@/ui/dom';
import { CATEGORY_LABEL, fmtNum, SIDE_LABEL } from './format';
import type { BooksTab } from './tab';

const CATEGORY_ORDER: readonly Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

/** ④ 総勘定元帳。勘定科目を選ぶと、その科目の行を日付・摘要・借方・貸方・残高で見せる。 */
export const createLedgerTab = (_store: GameStore): BooksTab => {
  let account: AccountId = 'bank';
  let last: GameState | undefined;
  let lastKey = '';

  // 選択欄は作り直さない（開いている間に選択・フォーカスを失わないため）
  const select = el(
    'select',
    {
      class: 'cq-select',
      attrs: { id: 'cq-ledger-select' },
      on: {
        change: () => {
          account = select.value as AccountId;
          if (last) render(last);
        },
      },
    },
    ...CATEGORY_ORDER.map((c) =>
      el(
        'optgroup',
        { attrs: { label: CATEGORY_LABEL[c] } },
        ...ACCOUNT_LIST.filter((a) => a.category === c).map((a) =>
          el('option', { attrs: { value: a.id }, text: a.name }),
        ),
      ),
    ),
  );
  select.value = account;

  const summary = el('p', { class: 'cq-ledger__summary' });
  const scroller = el('div', {
    class: 'cq-ledger__scroll',
    attrs: { tabindex: 0, role: 'region', 'aria-label': '総勘定元帳の明細' },
  });
  const root = el(
    'div',
    { class: 'cq-tab cq-tab--fill' },
    el(
      'div',
      { class: 'cq-ledger__bar' },
      el('label', { class: 'cq-ledger__label', attrs: { for: 'cq-ledger-select' }, text: '勘定科目' }),
      select,
    ),
    summary,
    scroller,
  );

  const render = (state: GameState): void => {
    const def = accountDef(account);
    const rows = selectLedger(state, account);
    const balance = rows.length > 0 ? (rows[rows.length - 1]?.balance ?? 0) : 0;

    clear(summary);
    summary.append(
      el('span', { text: `正常残高：${SIDE_LABEL[def.normalSide]}${def.contra ? '（評価勘定）' : ''}` }),
      el('span', {}, '現在残高 ', el('strong', { class: 'num', text: `${fmtNum(balance)}円` })),
    );

    clear(scroller);
    if (rows.length === 0) {
      scroller.append(el('p', { class: 'cq-empty', text: 'この科目の取引はまだありません。' }));
    } else {
      scroller.append(
        el(
          'table',
          { class: 'cq-table cq-ledger' },
          el('caption', { class: 'sr-only', text: `${def.name}の総勘定元帳（単位：円）` }),
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { attrs: { scope: 'col' }, text: '日付' }),
              el('th', { attrs: { scope: 'col' }, text: '摘要' }),
              el('th', { class: 'num', attrs: { scope: 'col' }, text: '借方' }),
              el('th', { class: 'num', attrs: { scope: 'col' }, text: '貸方' }),
              el('th', { class: 'num', attrs: { scope: 'col' }, text: '残高' }),
            ),
          ),
          el(
            'tbody',
            {},
            ...rows.map((r) =>
              el(
                'tr',
                { class: r.date === null ? 'is-open' : '' },
                el('td', { class: 'cq-ledger__date', text: r.date === null ? '期首' : formatDate(r.date) }),
                el('td', { class: 'cq-ledger__memo', text: r.memo }),
                el('td', { class: 'num', text: r.debit ? fmtNum(r.debit) : '' }),
                el('td', { class: 'num', text: r.credit ? fmtNum(r.credit) : '' }),
                el('td', { class: r.balance < 0 ? 'num is-neg' : 'num', text: fmtNum(r.balance) }),
              ),
            ),
          ),
        ),
      );
    }
    // 科目を替えたときと行が増えたときは、いちばん新しい行が見えるように下へ送る
    const key = `${account}:${rows.length}`;
    if (key !== lastKey) {
      lastKey = key;
      scroller.scrollTop = scroller.scrollHeight;
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
