import { el } from '@/ui/dom';
import { suppressKeyRepeat } from './keys';
import type { ShellOptions } from './options';
import { focusSoon, type View } from './view';

const kbd = (text: string): HTMLElement => el('kbd', { class: 'cq-kbd', text });

/** タイトル画面（phase 'title'）。 */
export const createTitle = (opts: ShellOptions): View => {
  const start = el('button', {
    class: 'cq-btn cq-btn--primary cq-btn--lg',
    text: 'はじめる',
    attrs: { type: 'button' },
    on: { click: () => opts.onNewGame() },
  });
  const load = el('button', {
    class: 'cq-btn cq-btn--ghost cq-btn--lg',
    text: 'つづきから',
    attrs: { type: 'button' },
    on: { click: () => opts.onLoad() },
  });
  suppressKeyRepeat(start);
  suppressKeyRepeat(load);
  const noSave = el('p', { class: 'cq-title__nosave', text: 'セーブデータはまだありません' });

  const keys = el(
    'dl',
    { class: 'cq-keys' },
    el('div', { class: 'cq-keys__row' }, el('dt', {}, kbd('Space'), ' / ', kbd('Enter')), el('dd', { text: 'ルーレットを回す' })),
    el('div', { class: 'cq-keys__row' }, el('dt', {}, kbd('B')), el('dd', { text: '帳簿を開く（Esc で閉じる）' })),
    el('div', { class: 'cq-keys__row' }, el('dt', {}, kbd('Ctrl/⌘'), ' + ', kbd('Enter')), el('dd', { text: '回答を送信する' })),
  );

  const seal = el('span', { class: 'cq-seal', attrs: { 'aria-hidden': 'true' } }, el('span', { text: '決算' }));

  const inner = el(
    'div',
    { class: 'cq-title__inner' },
    el('div', { class: 'cq-title__head' }, el('h1', { class: 'cq-title__name', attrs: { id: 'cq-title-name' }, text: 'Closing Quest' }), seal),
    el('p', { class: 'cq-title__sub', text: '経理の1年間' }),
    el('hr', { class: 'cq-rule' }),
    // 「月次決算」などの語の途中で折り返さないよう、文節ごとにまとめる
    el(
      'p',
      { class: 'cq-title__lead' },
      ...['1年間の経理業務を体験して、', '月次決算を積み重ね、', '年次決算をめざす。'].map((t) =>
        el('span', { class: 'cq-phrase', text: t }),
      ),
    ),
    el('div', { class: 'cq-title__actions' }, start, load),
    noSave,
    el('h2', { class: 'cq-title__keys-head', text: '操作' }),
    keys,
    el('p', { class: 'cq-title__credit', text: '盤面の絵柄と、月・種別のアイコンには、AI（Gemini）で生成したイラストを含みます。' }),
  );

  const root = el(
    'section',
    { class: 'cq-title', attrs: { role: 'dialog', 'aria-labelledby': 'cq-title-name', hidden: true } },
    inner,
  );

  return {
    el: root,
    update(state, ctx) {
      const visible = state.phase === 'title';
      root.hidden = !visible;
      if (!visible) return;
      if (ctx.entered) {
        const has = opts.hasSave();
        load.disabled = !has;
        noSave.hidden = has;
        focusSoon(start);
      }
    },
  };
};
