import type { FinalScore } from '@/core/game/types';
import { formatYen } from '@/core/types';
import { announce, clear, el } from '@/ui/dom';
import { suppressKeyRepeat } from './keys';
import type { ShellOptions } from './options';
import { focusSoon, type View } from './view';

const RANK_COMMENT: Record<FinalScore['rank'], string> = {
  S: '帳簿に一点の曇りなし。決算を安心して任せられる経理担当です。',
  A: '安定した仕事ぶりでした。月次を積み重ねた成果が出ています。',
  B: '基本は身についています。見直しをすれば、さらに伸びます。',
  C: 'ところどころ抜けがありました。もう一周すれば確実に上達します。',
  D: 'まずは月次決算の流れを見直しましょう。もう一度挑戦してみてください。',
};

const pct = (v: number): string => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/** 内訳 1 行（ラベル・バー・値）。ratio は 0〜1。 */
const meterRow = (name: string, ratio: number, valueText: string): HTMLElement =>
  el(
    'li',
    { class: 'cq-score__row' },
    el('span', { class: 'cq-score__name', text: name }),
    el(
      'span',
      { class: 'cq-score__bar', attrs: { 'aria-hidden': 'true' } },
      el('span', { class: 'cq-score__fill', attrs: { style: `width:${pct(ratio)}` } }),
    ),
    el('strong', { class: 'num cq-score__val', text: valueText }),
  );

const factRow = (name: string, value: string, tone?: 'neg' | 'warn'): HTMLElement =>
  el(
    'div',
    { class: 'cq-facts__row' },
    el('dt', { text: name }),
    el('dd', { class: tone ? `num is-${tone}` : 'num', text: value }),
  );

/** 終了画面（phase 'ended'）。最終スコアを見せる。 */
export const createEnded = (opts: ShellOptions): View => {
  const again = el('button', {
    class: 'cq-btn cq-btn--primary cq-btn--lg',
    text: 'もう一度遊ぶ',
    attrs: { type: 'button' },
    on: { click: () => opts.onNewGame() },
  });
  suppressKeyRepeat(again);

  const paper = el('article', {
    class: 'cq-paper cq-ended__paper',
    attrs: { role: 'dialog', 'aria-labelledby': 'cq-ended-title' },
  });
  const root = el('section', { class: 'cq-ended', attrs: { hidden: true } }, paper);

  let rendered: FinalScore | undefined;

  const build = (fs: FinalScore): void => {
    clear(paper);
    const netTone = fs.netIncome < 0 ? 'neg' : undefined;
    const cashTone = fs.finalCash < 0 ? 'neg' : undefined;
    const penTone = fs.penaltyTotal > 0 ? 'warn' : undefined;
    paper.append(
      el('h2', { class: 'cq-ended__title', attrs: { id: 'cq-ended-title' }, text: '1年間おつかれさまでした' }),
      el(
        'div',
        { class: 'cq-ended__hero' },
        el('div', { class: 'cq-rank', attrs: { 'aria-label': `ランク ${fs.rank}` }, text: fs.rank }),
        el(
          'div',
          { class: 'cq-ended__total' },
          el('span', { class: 'cq-ended__total-label', text: '総合点' }),
          el(
            'p',
            { class: 'cq-ended__total-num' },
            el('strong', { class: 'num', text: String(Math.round(fs.total)) }),
            el('span', { text: ' / 1000点' }),
          ),
          el('p', { class: 'cq-ended__comment', text: RANK_COMMENT[fs.rank] }),
        ),
      ),
      el('h3', { class: 'cq-ended__sub', text: '得点の内訳' }),
      el(
        'ul',
        { class: 'cq-score' },
        meterRow('正確さ', fs.accuracy, pct(fs.accuracy)),
        meterRow('月次決算', fs.monthClose, pct(fs.monthClose)),
        meterRow('決算ステージ', fs.yearEnd, pct(fs.yearEnd)),
        meterRow('資金繰り', fs.cashScore, pct(fs.cashScore)),
        meterRow('信頼', fs.trust / 100, String(Math.round(fs.trust))),
      ),
      el(
        'dl',
        { class: 'cq-facts' },
        factRow('当期純利益', formatYen(fs.netIncome), netTone),
        factRow('期末の現預金', formatYen(fs.finalCash), cashTone),
        factRow('ペナルティ合計', formatYen(fs.penaltyTotal), penTone),
      ),
      el('div', { class: 'cq-ended__actions' }, again),
    );
  };

  return {
    el: root,
    update(state, ctx) {
      const fs = state.finalScore;
      const visible = state.phase === 'ended' && fs !== undefined;
      root.hidden = !visible;
      if (!visible || !fs) return;
      if (fs !== rendered) {
        rendered = fs;
        build(fs);
      }
      if (ctx.entered) {
        announce(`1年が終了しました。ランク ${fs.rank}、${Math.round(fs.total)}点`);
        focusSoon(again);
      }
    },
  };
};
