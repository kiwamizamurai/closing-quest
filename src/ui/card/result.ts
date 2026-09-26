/** カード完了時の結果（正確さ・設問ごとの結果・現預金と信頼の増減・ペナルティ・出典）。 */
import type { ActiveCard, CardRecord, QuestionResult } from '@/core/game/types';
import type { SourceRef } from '@/core/tasks/types';
import { formatYen } from '@/core/types';
import { el } from '@/ui/dom';
import { percent, signed } from './format';
import { icon } from './icons';
import { entryTable, sectionLabel } from './parts';

export interface ResultView {
  readonly el: HTMLElement;
  readonly announcement: string;
}

interface Grade {
  readonly seal: string;
  readonly text: string;
}

/** 得点率に応じた印と一言。 */
const gradeOf = (score: number): Grade =>
  score >= 0.9
    ? { seal: '優', text: 'お見事です！' }
    : score >= 0.7
      ? { seal: '良', text: 'よくできました' }
      : score >= 0.5
        ? { seal: '可', text: 'あと一歩です' }
        : { seal: '再', text: 'もう一度おさらいしましょう' };

const STAR_COUNT = 5;

const scoreBlock = (score: number): HTMLElement => {
  const stars = Math.max(0, Math.min(STAR_COUNT, Math.round(score * STAR_COUNT)));
  const grade = gradeOf(score);
  const pct = Math.round(score * 100);
  return el(
    'section',
    { class: 'cq-score', attrs: { role: 'group', 'aria-label': `正確さ ${pct}%（${grade.text}）` } },
    el(
      'div',
      { class: 'cq-score__main' },
      el('p', { class: 'cq-score__label', text: '正確さ' }),
      el('p', { class: 'cq-score__num' }, el('strong', { text: String(pct) }), el('span', { text: '%' })),
      el(
        'div',
        { class: 'cq-stars', attrs: { role: 'img', 'aria-label': `星 ${STAR_COUNT} つ中 ${stars} つ` } },
        ...Array.from({ length: STAR_COUNT }, (_, i) =>
          el('span', { class: i < stars ? 'cq-star is-on' : 'cq-star' }, icon(i < stars ? 'star' : 'starEmpty', 26)),
        ),
      ),
      el('p', { class: 'cq-score__text', text: grade.text }),
    ),
    el('div', { class: 'cq-seal', attrs: { 'aria-hidden': 'true' } }, el('span', { text: grade.seal })),
  );
};

const resultRow = (r: QuestionResult, index: number): HTMLElement => {
  const tags: HTMLElement[] = [];
  if (r.wrong > 0) tags.push(el('span', { class: 'cq-tag cq-tag--ng', text: `誤答 ${r.wrong}回` }));
  if (r.hints > 0) tags.push(el('span', { class: 'cq-tag cq-tag--warn', text: `ヒント ${r.hints}回` }));
  if (r.autoSolved) tags.push(el('span', { class: 'cq-tag cq-tag--ng', text: '正解を自動で計上' }));
  if (tags.length === 0) tags.push(el('span', { class: 'cq-tag cq-tag--ok' }, icon('check', 14), 'ノーミス'));
  const pct = Math.round(r.credit * 100);
  return el(
    'li',
    { class: r.credit >= 0.7 ? 'cq-res' : r.credit >= 0.5 ? 'cq-res is-mid' : 'cq-res is-low' },
    el(
      'div',
      { class: 'cq-res__top' },
      el('span', { class: 'cq-res__no', text: `設問 ${index + 1}` }),
      el('span', { class: 'cq-res__pct', text: `${pct}%` }),
    ),
    el(
      'div',
      { class: 'cq-res__bar', attrs: { 'aria-hidden': 'true' } },
      el('span', { class: 'cq-res__fill', attrs: { style: `width:${pct}%` } }),
    ),
    el('div', { class: 'cq-res__tags' }, ...tags),
  );
};

type Tone = 'pos' | 'neg' | 'zero';

const tile = (label: string, tone: Tone, text: string, sub: (Node | string)[]): HTMLElement =>
  el(
    'div',
    { class: `cq-tile cq-tile--${tone}` },
    el('p', { class: 'cq-tile__label', text: label }),
    el(
      'p',
      { class: 'cq-tile__val' },
      tone === 'pos' ? icon('arrowUp', 20) : tone === 'neg' ? icon('arrowDown', 20) : icon('minusCircle', 20),
      el('span', { text }),
    ),
    el('p', { class: 'cq-tile__sub' }, ...sub),
  );

/** 「変更前 → 変更後」。増減がなければ現在の値だけ。折り返しても数字の途中で切れないようにする。 */
const beforeAfter = (delta: number, start: number, fmt: (n: number) => string): (Node | string)[] => {
  const num = (n: number): HTMLElement => el('span', { class: 'cq-nowrap', text: fmt(n) });
  return delta === 0 ? ['現在 ', num(start)] : [num(start), ' → ', num(start + delta)];
};

const toneOf = (n: number): Tone => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);

const sourceItem = (s: SourceRef): HTMLElement =>
  el(
    'li',
    { class: 'cq-src' },
    isHttp(s.url)
      ? el(
          'a',
          { class: 'cq-src__link', attrs: { href: s.url, target: '_blank', rel: 'noopener noreferrer' } },
          el('span', { text: s.label }),
          icon('link', 15),
          el('span', { class: 'sr-only', text: '（新しいタブで開きます）' }),
        )
      : el('span', { class: 'cq-src__link', text: s.label }),
    el('span', { class: 'cq-src__meta', text: `確認日 ${s.asOf}` }),
    s.verified === 'primary'
      ? el('span', { class: 'cq-tag cq-tag--ok', text: '一次情報' })
      : el(
          'p',
          { class: 'cq-src__note' },
          icon('warn', 16),
          el('span', { text: '民間の解説による。一次情報で要確認' }),
        ),
  );

export const buildResult = (active: ActiveCard, record: CardRecord | undefined): ResultView => {
  const card = active.card;
  const results: readonly QuestionResult[] = record?.results ?? active.progress.results;
  const score =
    record?.score ?? (results.length > 0 ? results.reduce((s, r) => s + r.credit, 0) / results.length : 0);
  const cash = record?.cashDelta ?? 0;
  const trust = record?.trustDelta ?? 0;
  const penalty = record?.penalty ?? 0;

  const cashText = cash === 0 ? '変動なし' : cash > 0 ? `+${formatYen(cash)}` : formatYen(cash);
  const trustText = trust === 0 ? '変動なし' : signed(trust);

  const parts: (Node | null)[] = [scoreBlock(score)];

  parts.push(
    el(
      'section',
      { class: 'cq-sec' },
      sectionLabel('設問ごとの結果'),
      el('ol', { class: 'cq-results' }, ...results.map((r, i) => resultRow(r, i))),
    ),
  );

  parts.push(
    el(
      'section',
      { class: 'cq-sec' },
      sectionLabel('今回の増減'),
      el(
        'div',
        { class: 'cq-tiles' },
        tile('現預金', toneOf(cash), cashText, beforeAfter(cash, active.startCash, formatYen)),
        tile('信頼', toneOf(trust), trustText, beforeAfter(trust, active.startTrust, String)),
      ),
    ),
  );

  if (penalty > 0) {
    parts.push(
      el(
        'section',
        { class: 'cq-penalty', attrs: { role: 'group', 'aria-label': 'ペナルティ' } },
        el('span', { class: 'cq-penalty__icon' }, icon('warn', 26)),
        el(
          'div',
          { class: 'cq-penalty__body' },
          el(
            'p',
            { class: 'cq-penalty__h' },
            el('span', { text: 'ペナルティ' }),
            el('strong', { text: formatYen(-penalty) }),
          ),
          el('p', {
            class: 'cq-penalty__why',
            text: card.penalty?.reason ?? '得点が半分に届かなかったため、現預金から差し引かれました。',
          }),
        ),
      ),
    );
  }

  if (card.postings && card.postings.length > 0) {
    parts.push(
      el(
        'section',
        { class: 'cq-sec' },
        sectionLabel('あわせて帳簿に計上された仕訳'),
        ...card.postings.map((p) =>
          el(
            'div',
            { class: 'cq-posting' },
            el('p', { class: 'cq-posting__memo', text: `摘要：${p.memo}` }),
            entryTable(p.lines, p.memo),
          ),
        ),
      ),
    );
  }

  if (card.sources && card.sources.length > 0) {
    parts.push(
      el(
        'section',
        { class: 'cq-sec' },
        sectionLabel('出典'),
        el('ul', { class: 'cq-sources' }, ...card.sources.map((s) => sourceItem(s))),
      ),
    );
  }

  const announcement = [
    `カード完了。正確さ ${percent(score)}。`,
    cash !== 0 ? `現預金 ${cash < 0 ? formatYen(cash).replace('△', 'マイナス') : formatYen(cash)}。` : '',
    penalty > 0 ? `ペナルティ ${formatYen(penalty)}。` : '',
  ]
    .filter(Boolean)
    .join('');

  return { el: el('div', { class: 'cq-done' }, ...parts), announcement };
};
