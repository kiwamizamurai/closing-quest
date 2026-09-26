import { accountDef } from '@/core/accounting/accounts';
import type { StatementLine } from '@/core/accounting/statements';
import { selectStatements } from '@/core/game/selectors';
import type { GameStore } from '@/core/game/types';
import { clear, el } from '@/ui/dom';
import { balanceBadge, fmtNum, tabHead } from './format';
import type { BooksTab } from './tab';

interface Line {
  readonly label: string;
  readonly amount: number;
  /** 評価勘定（貸倒引当金・減価償却累計額）。控除として表示する。 */
  readonly contra?: boolean;
}

interface Section {
  readonly heading: string;
  readonly lines: readonly Line[];
  readonly subtotal?: Line;
}

const fromStatement = (l: StatementLine): Line => ({
  label: l.name,
  amount: l.amount,
  ...(accountDef(l.account).contra ? { contra: true } : {}),
});

const lineRow = (l: Line): HTMLElement =>
  el(
    'li',
    { class: l.contra ? 'cq-bs__line is-contra' : 'cq-bs__line' },
    el('span', { class: 'cq-bs__name' }, l.label, l.contra ? el('small', { class: 'cq-bs__tag', text: '控除' }) : null),
    el('span', { class: l.amount < 0 ? 'num is-neg' : 'num', text: fmtNum(l.amount) }),
  );

/** 「・」の後ろで折り返せるようにする（負債・純資産合計 が変な位置で切れないように）。 */
const softWrap = (text: string): (string | HTMLElement)[] =>
  text.split('・').flatMap((part, i) => (i === 0 ? [part] : ['・', el('wbr'), part]));

const column = (title: string, sections: readonly Section[], total: Line): HTMLElement =>
  el(
    'section',
    { class: 'cq-bs__col' },
    el('h4', { class: 'cq-bs__title', text: title }),
    ...sections.map((sec) =>
      el(
        'div',
        { class: 'cq-bs__sec' },
        el('h5', { class: 'cq-bs__heading', text: sec.heading }),
        el('ul', { class: 'cq-bs__list' }, ...sec.lines.map(lineRow)),
        sec.subtotal
          ? el(
              'p',
              { class: 'cq-bs__sub' },
              el('span', { text: sec.subtotal.label }),
              el('span', { class: 'num', text: fmtNum(sec.subtotal.amount) }),
            )
          : null,
      ),
    ),
    el(
      'p',
      { class: 'cq-bs__total' },
      el('span', {}, ...softWrap(total.label)),
      el('span', { class: 'num', text: fmtNum(total.amount) }),
    ),
  );

/** ③ 貸借対照表。左に資産、右に負債＋純資産。純資産の部の当期純利益は 1 行だけ。 */
export const createBalanceTab = (store: GameStore): BooksTab => {
  const root = el('div', { class: 'cq-tab' });

  return {
    el: root,
    update(state) {
      const s = selectStatements(state, store.scenario);
      const bs = s.balanceSheet;
      clear(root);
      root.append(tabHead('貸借対照表', state));

      // equity 配列に当期純利益は含まれていないので、ここで 1 行だけ足す
      const equityLines: Line[] = [
        ...bs.equity.map(fromStatement),
        { label: '当期純利益', amount: bs.netIncome },
      ];
      const liabilitiesAndEquity = bs.totalLiabilities + bs.totalEquity;

      root.append(
        el(
          'div',
          { class: 'cq-bs' },
          column(
            '資産の部',
            [{ heading: '資産', lines: bs.assets.map(fromStatement) }],
            { label: '資産合計', amount: bs.totalAssets },
          ),
          column(
            '負債・純資産の部',
            [
              {
                heading: '負債',
                lines: bs.liabilities.map(fromStatement),
                subtotal: { label: '負債合計', amount: bs.totalLiabilities },
              },
              {
                heading: '純資産',
                lines: equityLines,
                subtotal: { label: '純資産合計', amount: bs.totalEquity },
              },
            ],
            { label: '負債・純資産合計', amount: liabilitiesAndEquity },
          ),
        ),
        balanceBadge(
          bs.balanced,
          '貸借一致（資産合計 = 負債・純資産合計）',
          `貸借が一致しません（差額 ${fmtNum(Math.abs(bs.totalAssets - liabilitiesAndEquity))}円）`,
        ),
        el('p', { class: 'cq-note', text: '金額の単位は円。△ はマイナス（評価勘定は資産から控除）。' }),
      );
      if (s.inventoryEnd !== undefined) {
        root.append(
          el('p', {
            class: 'cq-note',
            text: `※ 繰越商品は月末の実地棚卸（${fmtNum(s.inventoryEnd)}円）による。決算整理前。`,
          }),
        );
      }
    },
  };
};
