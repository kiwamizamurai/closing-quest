import { accountDef } from '@/core/accounting/accounts';
import { selectStatements } from '@/core/game/selectors';
import type { GameStore } from '@/core/game/types';
import { clear, el } from '@/ui/dom';
import { balanceBadge, CATEGORY_LABEL, fmtNum, tabHead } from './format';
import type { BooksTab } from './tab';

/** ① 試算表（残高試算表）。借方・貸方の列、合計行、貸借一致の表示。 */
export const createTrialTab = (store: GameStore): BooksTab => {
  const root = el('div', { class: 'cq-tab' });

  return {
    el: root,
    update(state) {
      const tb = selectStatements(state, store.scenario).trialBalance;
      clear(root);
      root.append(tabHead('残高試算表', state));

      if (tb.rows.length === 0) {
        root.append(el('p', { class: 'cq-empty', text: 'まだ仕訳がありません。' }));
        return;
      }

      const body = el('tbody');
      let lastCategory: string | undefined;
      for (const r of tb.rows) {
        const def = accountDef(r.account);
        if (def.category !== lastCategory) {
          lastCategory = def.category;
          body.append(
            el('tr', { class: 'cq-group' }, el('th', { attrs: { colspan: 3 }, text: CATEGORY_LABEL[def.category] })),
          );
        }
        body.append(
          el(
            'tr',
            {},
            el('th', { attrs: { scope: 'row' }, text: def.name }),
            el('td', { class: 'num', text: r.debit ? fmtNum(r.debit) : '' }),
            el('td', { class: 'num', text: r.credit ? fmtNum(r.credit) : '' }),
          ),
        );
      }

      root.append(
        el(
          'table',
          { class: 'cq-table cq-trial' },
          el('caption', { class: 'sr-only', text: '残高試算表（単位：円）' }),
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { attrs: { scope: 'col' }, text: '勘定科目' }),
              el('th', { class: 'num', attrs: { scope: 'col' }, text: '借方（円）' }),
              el('th', { class: 'num', attrs: { scope: 'col' }, text: '貸方（円）' }),
            ),
          ),
          body,
          el(
            'tfoot',
            {},
            el(
              'tr',
              {},
              el('th', { attrs: { scope: 'row' }, text: '合計' }),
              el('td', { class: 'num', text: fmtNum(tb.totalDebit) }),
              el('td', { class: 'num', text: fmtNum(tb.totalCredit) }),
            ),
          ),
        ),
        balanceBadge(
          tb.balanced,
          '貸借一致（借方合計 = 貸方合計）',
          `貸借が一致しません（差額 ${fmtNum(Math.abs(tb.totalDebit - tb.totalCredit))}円）`,
        ),
      );
    },
  };
};
