/** 回答直後のフィードバック（正解・部分点・不正解）と、正解・解説の表示。 */
import type { QuestionProgress } from '@/core/game/types';
import type { Answer, Judgement, Question } from '@/core/tasks/types';
import { el } from '@/ui/dom';
import { formatWithUnit, percent } from './format';
import { icon, type IconName } from './icons';
import { entryTable, sectionLabel } from './parts';

/** これだけ誤ると正解を見せる。 */
export const MAX_WRONG = 3;

export interface FeedbackView {
  readonly el: HTMLElement;
  /** 「もう一度」で再挑戦できるか（false なら「次へ」）。 */
  readonly canRetry: boolean;
  /** スクリーンリーダー向けの読み上げ文。 */
  readonly announcement: string;
}

const optionRow = (n: number, text: string): HTMLElement =>
  el(
    'p',
    { class: 'cq-ans' },
    n <= 9 ? el('span', { class: 'cq-ans__key', text: String(n), attrs: { 'aria-hidden': 'true' } }) : null,
    el('span', { text }),
  );

/** 正解（または回答）を、設問の種類に合わせて見せる。 */
const answerBody = (q: Question, a: Answer | 'correct'): HTMLElement | null => {
  switch (q.type) {
    case 'choice': {
      const i = a === 'correct' ? q.answer : a.type === 'choice' ? a.index : -1;
      const text = q.options[i];
      return text === undefined ? null : optionRow(i + 1, text);
    }
    case 'multi': {
      const idx = a === 'correct' ? q.answer : a.type === 'multi' ? a.indices : null;
      if (idx === null) return null;
      if (idx.length === 0) return el('p', { class: 'cq-ans', text: '選択なし' });
      return el(
        'div',
        { class: 'cq-anslist' },
        ...[...idx].sort((x, y) => x - y).map((i) => optionRow(i + 1, q.options[i] ?? '')),
      );
    }
    case 'number': {
      const v = a === 'correct' ? q.answer : a.type === 'number' ? a.value : null;
      return v === null ? null : el('p', { class: 'cq-ans cq-ans--num', text: formatWithUnit(v, q.unit) });
    }
    case 'journal': {
      const lines = a === 'correct' ? q.expected[0] : a.type === 'journal' ? a.lines : undefined;
      return lines ? entryTable(lines, a === 'correct' ? '正解の仕訳' : 'あなたの仕訳') : null;
    }
  }
};

const BANNER: Record<Judgement['verdict'], { tone: string; icon: IconName }> = {
  correct: { tone: 'correct', icon: 'check' },
  partial: { tone: 'partial', icon: 'warn' },
  wrong: { tone: 'wrong', icon: 'cross' },
};

export const buildFeedback = (q: Question, progress: QuestionProgress): FeedbackView => {
  const j: Judgement = progress.lastJudgement ?? { verdict: 'wrong', credit: 0, messages: [] };
  const canRetry = j.verdict === 'wrong' && !progress.revealed;
  const left = Math.max(1, MAX_WRONG - progress.wrong);

  const title =
    j.verdict === 'correct'
      ? '正解です'
      : j.verdict === 'partial'
        ? '惜しい！ 部分点です'
        : progress.revealed
          ? `不正解（${MAX_WRONG}回まちがえました）`
          : '不正解です';
  const settled = progress.results.find((r) => r.questionId === q.id);
  const sub =
    settled !== undefined
      ? `この設問の得点 ${percent(settled.credit)}`
      : j.verdict === 'partial'
        ? `部分点 ${percent(j.credit)}`
        : progress.revealed
          ? '正解を見てから、次へ進みます'
          : '';

  const b = BANNER[j.verdict];
  const banner = el(
    'div',
    { class: `cq-banner cq-banner--${b.tone}` },
    el('span', { class: 'cq-banner__icon' }, icon(b.icon, 26)),
    el(
      'div',
      { class: 'cq-banner__text' },
      el('p', { class: 'cq-banner__title', text: title }),
      sub ? el('p', { class: 'cq-banner__sub', text: sub }) : null,
    ),
  );

  const msgs =
    j.messages.length > 0
      ? el('ul', { class: 'cq-msgs' }, ...j.messages.map((m) => el('li', { text: m })))
      : null;

  const tries = canRetry
    ? el(
        'div',
        { class: 'cq-tries' },
        el(
          'span',
          { class: 'cq-pips', attrs: { 'aria-hidden': 'true' } },
          ...Array.from({ length: MAX_WRONG }, (_, i) =>
            el('span', { class: i < progress.wrong ? 'cq-pip is-used' : 'cq-pip' }),
          ),
        ),
        el('p', { class: 'cq-tries__text' }, 'あと ', el('strong', { text: String(left) }), ' 回、やり直せます。'),
      )
    : null;

  // 正解以外のときは、自分の回答を見返せるようにする（仕訳では特に役に立つ）
  let mine: HTMLElement | null = null;
  if (j.verdict !== 'correct' && progress.lastAnswer) {
    const body = answerBody(q, progress.lastAnswer);
    if (body) mine = el('section', { class: 'cq-sec' }, sectionLabel('あなたの回答'), body);
  }

  // 正解・部分点・正解表示済みのときは、正解と解説を見せる
  let reveal: HTMLElement | null = null;
  if (!canRetry) {
    const body = answerBody(q, 'correct');
    const isJournal = q.type === 'journal';
    reveal = el(
      'div',
      { class: 'cq-reveal' },
      body
        ? el(
            'section',
            { class: 'cq-answer' },
            el(
              'h3',
              { class: 'cq-answer__h' },
              icon(isJournal ? 'book' : 'check', 18),
              isJournal ? '帳簿に計上された仕訳' : '正解',
            ),
            body,
            q.type === 'journal' ? el('p', { class: 'cq-answer__memo', text: `摘要：${q.memo}` }) : null,
          )
        : null,
      el('section', { class: 'cq-sec' }, sectionLabel('解説'), el('p', { class: 'cq-explain', text: q.explain })),
    );
  }

  const root = el('div', { class: 'cq-fb' }, banner, msgs, tries, mine, reveal);
  const said = [title, ...j.messages, canRetry ? `あと${left}回、やり直せます` : '']
    .filter(Boolean)
    .map((t) => t.replace(/[。.]+$/, ''));
  const announcement = `${said.join('。')}。`;
  return { el: root, canRetry, announcement };
};
