import { ACCOUNT_LIST, type Category } from '@/core/accounting/accounts';
import { el } from '@/ui/dom';
import { CATEGORY_LABEL, SIDE_LABEL } from './format';
import type { BooksTab } from './tab';

const CATEGORY_ORDER: readonly Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const CATEGORY_HINT: Record<Category, string> = {
  asset: '会社が持っているもの。増えると借方',
  liability: '将来払うべきもの。増えると貸方',
  equity: '出資と積み立てた利益。増えると貸方',
  revenue: '売上などの収益。増えると貸方',
  expense: '使ったお金・費用。増えると借方',
};

/** ⑤ 勘定科目表（ヘルプ）。区分ごとに、名前・正常残高側・説明。内容は固定なので一度だけ組み立てる。 */
export const createChartTab = (): BooksTab => {
  const root = el(
    'div',
    { class: 'cq-tab' },
    el(
      'header',
      { class: 'cq-tab__head' },
      el('h3', { class: 'cq-tab__title', text: '勘定科目表' }),
      el('p', { class: 'cq-tab__asof', text: '使う科目の一覧' }),
    ),
    el('p', { class: 'cq-note', text: '正常残高側は、その科目の残高が増える側です。' }),
    ...CATEGORY_ORDER.map((c) =>
      el(
        'section',
        { class: 'cq-chart__sec' },
        el(
          'h4',
          { class: 'cq-chart__heading' },
          el('span', { text: CATEGORY_LABEL[c] }),
          el('small', { text: CATEGORY_HINT[c] }),
        ),
        el(
          'dl',
          { class: 'cq-chart__list' },
          ...ACCOUNT_LIST.filter((a) => a.category === c).map((a) =>
            el(
              'div',
              { class: 'cq-chart__item' },
              el(
                'dt',
                {},
                el('span', { class: 'cq-chart__name', text: a.name }),
                el('span', {
                  class: `cq-chip cq-chip--${a.normalSide}`,
                  text: SIDE_LABEL[a.normalSide],
                }),
                'contra' in a && a.contra ? el('span', { class: 'cq-chip cq-chip--contra', text: '評価勘定' }) : null,
              ),
              el('dd', { text: a.note }),
            ),
          ),
        ),
      ),
    ),
  );
  return { el: root, update() {} };
};
