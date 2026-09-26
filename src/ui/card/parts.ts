/** カードパネルの部品（ヘッダー・状況・資料の表・設問見出し・ヒント・仕訳の表）。 */
import { accountName } from '@/core/accounting/accounts';
import { sumSide, type JournalLine } from '@/core/accounting/journal';
import { CARD_KIND_LABEL, SKILL_LABEL, type Card, type FactTable } from '@/core/tasks/types';
import { formatDateWithWeekday, formatYen } from '@/core/types';
import { el } from '@/ui/dom';
import { groupDigits } from './format';
import { icon } from './icons';

/** 種別ごとの CSS クラス（--cq-kc に tokens の --kind-* を当てる）。 */
export const kindClass = (kind: Card['kind']): string => `cq-kind-${kind.toLowerCase()}`;

/** 「◆ 見出し ───」の項目名。 */
export const sectionLabel = (text: string, ...extra: (Node | string)[]): HTMLElement =>
  el('h3', { class: 'cq-label' }, el('span', { text }), ...extra);

// ---------------------------------------------------------------------------
// ヘッダー・状況・資料
// ---------------------------------------------------------------------------

/** カード種別バッジ・日付・スキル・タイトル。伝票の頭書きのイメージ。 */
export const cardHeader = (card: Card): HTMLElement =>
  el(
    'header',
    { class: 'cq-head' },
    el(
      'div',
      { class: 'cq-head__meta' },
      el('span', { class: 'cq-badge', text: CARD_KIND_LABEL[card.kind] }),
      card.monthClose ? el('span', { class: 'cq-hanko', text: '月次決算' }) : null,
      el('span', { class: 'cq-chip', text: formatDateWithWeekday(card.date) }),
      el('span', { class: 'cq-chip', text: `スキル：${SKILL_LABEL[card.skill]}` }),
    ),
    el('h2', { class: 'cq-head__title', text: card.title }),
  );

export const situationBlock = (card: Card): HTMLElement =>
  el(
    'section',
    { class: 'cq-sec' },
    sectionLabel('状況'),
    el('p', { class: 'cq-situation', text: card.situation }),
  );

const factTable = (t: FactTable): HTMLElement => {
  const numeric = new Set(t.numericColumns ?? []);
  const cell = (v: string | number, col: number): string =>
    typeof v === 'number' && numeric.has(col) ? groupDigits(v) : String(v);
  const table = el(
    'table',
    { class: 'cq-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...t.headers.map((h, c) =>
          el('th', { class: numeric.has(c) ? 'num' : '', text: h, attrs: { scope: 'col' } }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...t.rows.map((row) =>
        el('tr', {}, ...row.map((v, c) => el('td', { class: numeric.has(c) ? 'num' : '', text: cell(v, c) }))),
      ),
    ),
  );
  return el(
    'figure',
    { class: 'cq-fact' },
    t.caption ? el('figcaption', { class: 'cq-fact__cap' }, icon('book', 16), t.caption) : null,
    el('div', { class: 'cq-table-wrap', dataset: { label: t.caption ?? '資料の表' } }, table),
    el('p', { class: 'cq-fact__scroll', text: '表は横にスクロールできます（左右の矢印キーでも動かせます）。' }),
  );
};

/**
 * 横にはみ出す表に、キーボードで動かせるようにする属性と案内を付ける。
 * 画面に載せて幅が決まったあと（と、ウィンドウの大きさが変わったとき）に呼ぶ。
 */
export const markScrollableTables = (root: HTMLElement): void => {
  for (const wrap of root.querySelectorAll<HTMLElement>('.cq-table-wrap')) {
    const over = wrap.scrollWidth > wrap.clientWidth + 1;
    wrap.closest('.cq-fact')?.classList.toggle('is-scrollable', over);
    if (over) {
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', wrap.dataset['label'] ?? '資料の表');
    } else {
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('role');
      wrap.removeAttribute('aria-label');
    }
  }
};

/** 資料の表（請求書・通帳・台帳など）。 */
export const factsBlock = (card: Card): HTMLElement | null => {
  if (!card.facts || card.facts.length === 0) return null;
  return el(
    'section',
    { class: 'cq-sec' },
    sectionLabel('資料'),
    ...card.facts.map((t) => factTable(t)),
  );
};

// ---------------------------------------------------------------------------
// 設問の見出し
// ---------------------------------------------------------------------------

/** 「設問 2/3」＋進み具合のドット。 */
export const questionLabel = (index: number, total: number): HTMLElement => {
  const dots = el('span', { class: 'cq-dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < total; i++) {
    dots.appendChild(el('span', { class: i < index ? 'is-done' : i === index ? 'is-now' : '' }));
  }
  return sectionLabel(`設問 ${index + 1}/${total}`, dots);
};

// ---------------------------------------------------------------------------
// 仕訳の表（読み取り専用）
// ---------------------------------------------------------------------------

/** 借方 | 貸方の 2 列で仕訳を見せる表。 */
export const entryTable = (lines: readonly JournalLine[], label: string): HTMLElement => {
  const debits = lines.filter((l) => l.side === 'debit');
  const credits = lines.filter((l) => l.side === 'credit');
  const n = Math.max(debits.length, credits.length);
  const rows: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const d = debits[i];
    const c = credits[i];
    rows.push(
      el(
        'tr',
        {},
        el('td', { class: 'cq-entry__acc', text: d ? accountName(d.account) : '' }),
        el('td', { class: 'cq-entry__amt', text: d ? formatYen(d.amount) : '' }),
        el('td', { class: 'cq-entry__acc cq-entry__split', text: c ? accountName(c.account) : '' }),
        el('td', { class: 'cq-entry__amt', text: c ? formatYen(c.amount) : '' }),
      ),
    );
  }
  return el(
    'table',
    { class: 'cq-entry', attrs: { 'aria-label': label } },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: '借方', attrs: { colspan: 2, scope: 'colgroup' } }),
        el('th', { class: 'cq-entry__split', text: '貸方', attrs: { colspan: 2, scope: 'colgroup' } }),
      ),
    ),
    el('tbody', {}, ...rows),
    el(
      'tfoot',
      {},
      el(
        'tr',
        {},
        el('td', { text: '計' }),
        el('td', { class: 'cq-entry__amt', text: formatYen(sumSide(lines, 'debit')) }),
        el('td', { class: 'cq-entry__split', text: '計' }),
        el('td', { class: 'cq-entry__amt', text: formatYen(sumSide(lines, 'credit')) }),
      ),
    ),
  );
};

// ---------------------------------------------------------------------------
// ヒント
// ---------------------------------------------------------------------------

export interface HintBlock {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  /** hintsUsed が変わったとき、表示だけを差し替える（入力欄には触れない）。 */
  update(used: number): void;
  /** まだ見られるヒントがあるか。 */
  canReveal(): boolean;
}

/** ヒントのボタンと、これまでに開いたヒントの一覧。 */
export const hintBlock = (
  hints: readonly string[],
  initialUsed: number,
  onReveal: () => void,
): HintBlock => {
  const max = hints.length;
  let used = 0;
  const noteId = `cq-hint-note-${Math.random().toString(36).slice(2, 8)}`;
  const label = el('span', { class: 'cq-hintbtn__label' });
  const button = el(
    'button',
    {
      class: 'cq-btn cq-btn--ghost cq-hintbtn',
      attrs: { type: 'button', 'aria-describedby': noteId, 'aria-keyshortcuts': 'H' },
      on: {
        click: () => {
          if (used < max) onReveal();
        },
      },
    },
    icon('bulb', 20),
    label,
    el('kbd', { class: 'cq-kbd', text: 'H', attrs: { 'aria-hidden': 'true' } }),
  );
  const list = el('ol', { class: 'cq-hints__list', attrs: { 'aria-live': 'polite' } });
  const root = el(
    'section',
    { class: 'cq-hints' },
    el(
      'div',
      { class: 'cq-hints__bar' },
      button,
      el('p', {
        class: 'cq-hints__note',
        text: 'ヒントを使うと、1段階ごとに得点が 10% 下がります。',
        attrs: { id: noteId },
      }),
    ),
    list,
  );

  const update = (n: number): void => {
    const next = Math.max(0, Math.min(n, max));
    // 増えた分だけ足す（読み上げが重複しないように）
    if (next < used) {
      while (list.firstChild) list.removeChild(list.firstChild);
      used = 0;
    }
    for (let i = used; i < next; i++) {
      list.appendChild(
        el(
          'li',
          { class: 'cq-hint' },
          el('span', { class: 'cq-hint__tag', text: `ヒント ${i + 1}` }),
          el('span', { class: 'cq-hint__text', text: hints[i] ?? '' }),
        ),
      );
    }
    used = next;
    const done = used >= max;
    label.textContent = done ? `ヒントはすべて表示しました (${used}/${max})` : `ヒントを見る (${used}/${max})`;
    button.setAttribute('aria-disabled', done ? 'true' : 'false');
    button.classList.toggle('is-done', done);
  };
  update(initialUsed);

  return { el: root, button, update, canReveal: () => used < max };
};
