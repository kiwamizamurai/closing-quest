import { selectUpcoming } from '@/core/game/selectors';
import type { GameStore } from '@/core/game/types';
import { CARD_KIND_LABEL } from '@/core/tasks/types';
import { clear, el } from '@/ui/dom';
import type { View } from './view';

/** ルーレットの最大の出目。これ以内の距離なら 1 回で届く。 */
const MAX_ROLL = 4;
const LIMIT = 5;

/** 左の縁に出す「今後の予定」。idle のときだけ、帳簿が閉じているときだけ表示する。 */
export const createUpcoming = (store: GameStore): View => {
  const list = el('ol', { class: 'cq-upcoming__list' });
  const root = el(
    'aside',
    { class: 'cq-upcoming', attrs: { hidden: true, 'aria-labelledby': 'cq-upcoming-title' } },
    el(
      'header',
      { class: 'cq-upcoming__head' },
      el('h2', { class: 'cq-upcoming__title', attrs: { id: 'cq-upcoming-title' }, text: '今後の予定' }),
      el('p', { class: 'cq-upcoming__sub', text: '期限を確認しよう' }),
    ),
    list,
  );

  let renderedKey = '';

  return {
    el: root,
    update(state, ctx) {
      const items = state.phase === 'idle' && !ctx.booksOpen ? selectUpcoming(state, store.scenario, LIMIT) : [];
      root.hidden = items.length === 0;
      if (items.length === 0) {
        renderedKey = '';
        return;
      }
      const key = `${state.position}`;
      if (key === renderedKey) return;
      renderedKey = key;
      clear(list);
      for (const it of items) {
        const kind = it.square.cardKind;
        const near = it.distance <= MAX_ROLL;
        list.appendChild(
          el(
            'li',
            { class: 'cq-upcoming__item', ...(kind ? { dataset: { kind } } : {}) },
            el('span', { class: 'cq-upcoming__dot', attrs: { 'aria-hidden': 'true' } }),
            el(
              'div',
              { class: 'cq-upcoming__text' },
              el('span', { class: 'cq-upcoming__label', text: it.square.label }),
              el(
                'span',
                { class: 'cq-upcoming__meta' },
                el('span', { text: it.dateLabel }),
                kind ? el('span', { class: 'sr-only', text: `（${CARD_KIND_LABEL[kind]}）` }) : null,
                el('span', {
                  class: near ? 'cq-upcoming__dist is-near' : 'cq-upcoming__dist',
                  text: `${it.distance}マス先`,
                  attrs: near ? { title: 'ルーレット 1 回で届く距離です' } : {},
                }),
              ),
            ),
          ),
        );
      }
    },
  };
};
