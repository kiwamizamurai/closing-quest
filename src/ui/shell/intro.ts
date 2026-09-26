import type { GameStore } from '@/core/game/types';
import { el } from '@/ui/dom';
import { suppressKeyRepeat } from './keys';
import { focusSoon, type View } from './view';

/** 導入画面（phase 'intro'）。scenario.intro を紙のパネルで見せる。 */
export const createIntro = (store: GameStore): View => {
  const sc = store.scenario;
  const go = el('button', {
    class: 'cq-btn cq-btn--primary cq-btn--lg',
    text: '1年間のスタート',
    attrs: { type: 'button' },
    on: { click: () => store.dispatch({ type: 'CONTINUE' }) },
  });
  suppressKeyRepeat(go);

  const paper = el(
    'article',
    { class: 'cq-paper cq-intro__paper', attrs: { role: 'dialog', 'aria-labelledby': 'cq-intro-title' } },
    el(
      'header',
      { class: 'cq-intro__meta' },
      el('span', { class: 'cq-intro__company', text: sc.companyName }),
      el('span', { class: 'cq-intro__year', text: sc.fiscalYearLabel }),
    ),
    el('h2', { class: 'cq-intro__title', attrs: { id: 'cq-intro-title' }, text: sc.intro.title }),
    el('div', { class: 'cq-intro__body' }, ...sc.intro.paragraphs.map((p) => el('p', { text: p }))),
    el('footer', { class: 'cq-intro__foot' }, go),
  );

  const root = el('section', { class: 'cq-intro', attrs: { hidden: true } }, paper);

  return {
    el: root,
    update(state, ctx) {
      const visible = state.phase === 'intro';
      root.hidden = !visible;
      if (visible && ctx.entered) focusSoon(go);
    },
  };
};
