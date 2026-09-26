/**
 * カードパネル。業務カードの設問・フィードバック・結果を、盤面の右側に「伝票」として見せる。
 * GameStore の購読だけで動き、dispatch するのは SUBMIT / HINT / CONTINUE のみ。
 */
import './card.css';
import type { GameState, GameStore, Phase, QuestionProgress } from '@/core/game/types';
import type { Card, Question } from '@/core/tasks/types';
import { announce, append, clear, el } from '@/ui/dom';
import { buildFeedback } from './feedback';
import { isMacLike } from './format';
import { icon } from './icons';
import {
  cardHeader,
  factsBlock,
  hintBlock,
  kindClass,
  markScrollableTables,
  questionLabel,
  situationBlock,
  type HintBlock,
} from './parts';
import { buildResult } from './result';
import { createWidget, type Widget } from './widgets';

export interface CardPanel {
  readonly el: HTMLElement;
  destroy(): void;
}

const VISIBLE_PHASES: ReadonlySet<Phase> = new Set<Phase>(['question', 'feedback', 'cardDone']);
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

let promptSeq = 0;

export function createCardPanel(store: GameStore): CardPanel {
  const scroll = el('div', { class: 'cq-card__scroll' });
  const foot = el('div', { class: 'cq-card__foot' });
  const root = el(
    'section',
    { class: 'cq-card', attrs: { 'aria-label': '業務カード', hidden: true } },
    scroll,
    foot,
  );

  /** いま表示している内容の識別子。変わったときだけ作り直す。 */
  let renderedKey: string | null = null;
  let widget: Widget | null = null;
  let hints: HintBlock | null = null;
  let errBox: HTMLElement | null = null;

  // -------------------------------------------------------------------------
  // 操作
  // -------------------------------------------------------------------------

  const showError = (msg: string): void => {
    if (!errBox) return;
    clear(errBox);
    if (msg) errBox.appendChild(el('p', { class: 'cq-err' }, icon('warn', 18), el('span', { text: msg })));
  };

  const submit = (): void => {
    if (store.getState().phase !== 'question' || !widget) return;
    const r = widget.read();
    if (!r.ok) {
      showError(r.message);
      r.focus?.focus();
      return;
    }
    showError('');
    store.dispatch({ type: 'SUBMIT', answer: r.answer });
  };

  const revealHint = (): void => {
    if (store.getState().phase !== 'question' || !hints?.canReveal()) return;
    store.dispatch({ type: 'HINT' });
  };

  const proceed = (): void => {
    const phase = store.getState().phase;
    if (phase === 'feedback' || phase === 'cardDone') store.dispatch({ type: 'CONTINUE' });
  };

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  const button = (label: string, primary: boolean, onClick: () => void, key?: string): HTMLButtonElement =>
    el(
      'button',
      { class: primary ? 'cq-btn cq-btn--primary' : 'cq-btn', attrs: { type: 'button' }, on: { click: onClick } },
      el('span', { text: label }),
      key ? el('kbd', { class: 'cq-kbd', text: key, attrs: { 'aria-hidden': 'true' } }) : null,
    );

  const setFoot = (note: string, action: HTMLButtonElement): void => {
    clear(foot);
    errBox = el('div', { class: 'cq-foot__err', attrs: { role: 'alert' } });
    foot.append(
      errBox,
      el('div', { class: 'cq-foot__row' }, el('p', { class: 'cq-foot__note', text: note }), action),
    );
  };

  const buildQuestion = (
    card: Card,
    progress: QuestionProgress,
    q: Question,
  ): { section: HTMLElement; first: HTMLElement | null } => {
    const total = card.questions.length;
    const promptId = `cq-prompt-${(promptSeq += 1)}`;
    const w = createWidget(q, {
      labelledBy: promptId,
      // 再挑戦のときだけ、前回の入力を引き継ぐ
      prefill: progress.wrong > 0 ? progress.lastAnswer : undefined,
      onChange: () => showError(''),
    });
    widget = w;
    const hintList = q.hints ?? [];
    hints = hintList.length > 0 ? hintBlock(hintList, progress.hintsUsed, revealHint) : null;
    const submitKey = isMacLike() ? '⌘+Enter' : 'Ctrl+Enter';
    setFoot(`${submitKey} でも回答できます`, button('回答する', true, submit));
    const section = el(
      'section',
      { class: 'cq-sec cq-q' },
      questionLabel(progress.questionIndex, total),
      el('p', { class: 'cq-prompt', text: q.prompt, attrs: { id: promptId } }),
      w.el,
      hints?.el,
    );
    return { section, first: w.firstControl() };
  };

  const render = (state: GameState): void => {
    const active = state.active;
    const missingQuestion =
      active !== undefined &&
      state.phase !== 'cardDone' &&
      active.card.questions[active.progress.questionIndex] === undefined;
    if (!active || missingQuestion || !VISIBLE_PHASES.has(state.phase)) {
      if (!root.hidden) root.hidden = true;
      renderedKey = null;
      widget = null;
      hints = null;
      errBox = null;
      clear(scroll);
      clear(foot);
      return;
    }
    const { card, progress } = active;
    const phase = state.phase;
    root.hidden = false;

    const key = `${card.id}|${progress.questionIndex}|${progress.wrong}|${phase}`;
    if (key === renderedKey) {
      // ヒントが増えただけなら、入力欄とフォーカスはそのままヒントの部分だけ更新する
      hints?.update(progress.hintsUsed);
      return;
    }
    renderedKey = key;
    widget = null;
    hints = null;
    root.className = `cq-card ${kindClass(card.kind)}`;
    clear(scroll);

    const q = card.questions[progress.questionIndex];
    let focusTarget: HTMLElement | null = null;
    let jumpTo: HTMLElement | null = null;
    let said = '';

    if (phase === 'question' && q) {
      const { section, first } = buildQuestion(card, progress, q);
      append(scroll, [cardHeader(card), situationBlock(card), factsBlock(card), section]);
      focusTarget = first;
      // 2 問目以降・再挑戦では、状況の説明を飛ばして設問へ
      if (progress.questionIndex > 0 || progress.wrong > 0) jumpTo = section;
    } else if (phase === 'feedback' && q) {
      const fb = buildFeedback(q, progress);
      const context = el(
        'details',
        { class: 'cq-context' },
        el('summary', { text: '状況と資料をもう一度見る' }),
        situationBlock(card),
        factsBlock(card),
      );
      // 閉じている間は幅が測れないので、開いたときに横スクロールの要否を調べ直す
      context.addEventListener('toggle', () => markScrollableTables(context));
      const recap = el(
        'section',
        { class: 'cq-sec' },
        questionLabel(progress.questionIndex, card.questions.length),
        el('p', { class: 'cq-prompt cq-prompt--recap', text: q.prompt }),
      );
      const next = button(fb.canRetry ? 'もう一度' : '次へ', true, proceed, 'Enter');
      setFoot(fb.canRetry ? 'Enter でやり直します' : 'Enter で進みます', next);
      append(scroll, [cardHeader(card), recap, fb.el, context]);
      focusTarget = next;
      said = fb.announcement;
    } else {
      // cardDone。card の情報は state.active から、結果は直近の記録から取る
      const record = state.records[state.records.length - 1];
      const rv = buildResult(active, record);
      const next = button('次へ', true, proceed, 'Enter');
      setFoot('Enter で進みます', next);
      append(scroll, [cardHeader(card), rv.el]);
      focusTarget = next;
      said = rv.announcement;
    }

    markScrollableTables(scroll);
    scroll.scrollTop = 0;
    if (jumpTo) scroll.scrollTop = Math.max(0, jumpTo.offsetTop - 8);
    // フェーズが変わるたびに、操作できる先頭の要素へフォーカスを移す
    (focusTarget ?? scroll.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
    if (said) announce(said);
  };

  // -------------------------------------------------------------------------
  // キーボード
  // -------------------------------------------------------------------------

  const isTextField = (t: EventTarget | null): boolean =>
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit'].includes(t.type));

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (root.hidden || ev.defaultPrevented || ev.isComposing || ev.keyCode === 229 || ev.repeat) return;
    const t = ev.target;
    const inPanel = t instanceof Node && root.contains(t);
    const onBody = t === document.body || t === document.documentElement;
    // 他の UI（別のパネルなど）が操作中のときは横取りしない
    if (!inPanel && !onBody) return;
    const phase = store.getState().phase;

    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      if (phase === 'question') {
        ev.preventDefault();
        submit();
      }
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    if (phase === 'question') {
      if (ev.key === 'Enter' && t instanceof HTMLInputElement && t.classList.contains('cq-num__input')) {
        ev.preventDefault();
        submit();
        return;
      }
      if (isTextField(t)) return;
      if ((ev.key === 'h' || ev.key === 'H') && hints) {
        ev.preventDefault();
        revealHint();
        return;
      }
      if (/^[1-9]$/.test(ev.key) && widget?.pressDigit?.(Number(ev.key))) {
        ev.preventDefault();
      }
      return;
    }

    if ((phase === 'feedback' || phase === 'cardDone') && ev.key === 'Enter') {
      // ボタン・リンク・summary は Enter でそのまま働くので、二重に進めない
      if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || (t instanceof HTMLElement && t.tagName === 'SUMMARY')) return;
      ev.preventDefault();
      proceed();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  const onResize = (): void => {
    if (!root.hidden) markScrollableTables(scroll);
  };
  window.addEventListener('resize', onResize);

  const unsubscribe = store.subscribe((state) => render(state));
  render(store.getState());

  return {
    el: root,
    destroy: () => {
      unsubscribe();
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
}
