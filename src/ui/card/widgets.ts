/** 回答ウィジェット（択一・複数選択・数値・仕訳）。入力の検証と Answer への変換もここで行う。 */
import { ACCOUNT_LIST, accountName, isAccountId } from '@/core/accounting/accounts';
import type { JournalLine } from '@/core/accounting/journal';
import type {
  Answer,
  ChoiceQuestion,
  JournalQuestion,
  MultiQuestion,
  NumberQuestion,
  Question,
} from '@/core/tasks/types';
import type { Side } from '@/core/types';
import { el } from '@/ui/dom';
import { formatYen } from '@/core/types';
import { groupDigits, parseInput, UNIT_LABEL } from './format';
import { icon } from './icons';

export type ReadResult =
  | { readonly ok: true; readonly answer: Answer }
  | { readonly ok: false; readonly message: string; readonly focus: HTMLElement | null };

export interface Widget {
  readonly el: HTMLElement;
  /** 入力を検証して回答にする。足りなければ理由とフォーカス先を返す。 */
  read(): ReadResult;
  /** 最初に操作する要素。 */
  firstControl(): HTMLElement | null;
  /** 数字キー（1〜9）で選ぶ。処理したら true。 */
  pressDigit?(n: number): boolean;
}

export interface WidgetContext {
  /** 設問文の要素 id（グループ名として読み上げる）。 */
  readonly labelledBy: string;
  /** 再挑戦のとき、前回の回答（入力の引き継ぎ用）。 */
  readonly prefill: Answer | undefined;
  /** 入力が変わったとき（エラー表示を消す）。 */
  readonly onChange: () => void;
}

let seq = 0;
const uid = (p: string): string => `${p}-${(seq += 1)}`;

// ---------------------------------------------------------------------------
// 1. choice
// ---------------------------------------------------------------------------

const createChoice = (q: ChoiceQuestion, ctx: WidgetContext): Widget => {
  const name = uid('cq-choice');
  const tried = ctx.prefill?.type === 'choice' ? ctx.prefill.index : -1;
  const inputs: HTMLInputElement[] = [];
  const list = el('div', {
    class: 'cq-opts',
    attrs: { role: 'radiogroup', 'aria-labelledby': ctx.labelledBy },
  });
  q.options.forEach((text, i) => {
    const input = el('input', {
      class: 'cq-opt__input',
      attrs: { type: 'radio', name, value: i, 'aria-keyshortcuts': i < 9 ? String(i + 1) : undefined },
      on: { change: () => ctx.onChange() },
    });
    inputs.push(input);
    list.appendChild(
      el(
        'label',
        { class: i === tried ? 'cq-opt is-tried' : 'cq-opt' },
        input,
        el('span', { class: 'cq-opt__key', text: i < 9 ? String(i + 1) : '', attrs: { 'aria-hidden': 'true' } }),
        el(
          'span',
          { class: 'cq-opt__text' },
          text,
          i === tried
            ? el('span', { class: 'cq-opt__tag' }, icon('cross', 14), '前回の回答（不正解）')
            : null,
        ),
        el('span', { class: 'cq-opt__mark', attrs: { 'aria-hidden': 'true' } }, icon('check', 16)),
      ),
    );
  });

  return {
    el: list,
    firstControl: () => inputs[0] ?? null,
    read: () => {
      const i = inputs.findIndex((x) => x.checked);
      if (i < 0) return { ok: false, message: '選択肢を1つ選んでください。', focus: inputs[0] ?? null };
      return { ok: true, answer: { type: 'choice', index: i } };
    },
    pressDigit: (n) => {
      const input = inputs[n - 1];
      if (!input) return false;
      input.checked = true;
      input.focus({ preventScroll: true });
      input.closest('label')?.scrollIntoView({ block: 'nearest' });
      ctx.onChange();
      return true;
    },
  };
};

// ---------------------------------------------------------------------------
// 2. multi
// ---------------------------------------------------------------------------

const createMulti = (q: MultiQuestion, ctx: WidgetContext): Widget => {
  const before = new Set(ctx.prefill?.type === 'multi' ? ctx.prefill.indices : []);
  const inputs: HTMLInputElement[] = [];
  const list = el('div', {
    class: 'cq-opts',
    attrs: { role: 'group', 'aria-labelledby': ctx.labelledBy },
  });
  q.options.forEach((text, i) => {
    const input = el('input', {
      class: 'cq-opt__input',
      attrs: { type: 'checkbox', value: i, 'aria-keyshortcuts': i < 9 ? String(i + 1) : undefined },
      on: { change: () => ctx.onChange() },
    });
    input.checked = before.has(i);
    inputs.push(input);
    list.appendChild(
      el(
        'label',
        { class: 'cq-opt cq-opt--multi' },
        input,
        el('span', { class: 'cq-opt__box', attrs: { 'aria-hidden': 'true' } }, icon('check', 18)),
        el(
          'span',
          { class: 'cq-opt__text' },
          i < 9 ? el('span', { class: 'cq-opt__no', text: `${i + 1}` }) : null,
          text,
        ),
      ),
    );
  });

  return {
    el: el(
      'div',
      { class: 'cq-multi' },
      el('p', { class: 'cq-hintline', text: '当てはまるものをすべて選んでください（複数選択）。' }),
      list,
    ),
    firstControl: () => inputs[0] ?? null,
    read: () => {
      const indices = inputs.flatMap((x, i) => (x.checked ? [i] : []));
      if (indices.length === 0) {
        return { ok: false, message: '当てはまるものを1つ以上選んでください。', focus: inputs[0] ?? null };
      }
      return { ok: true, answer: { type: 'multi', indices } };
    },
    pressDigit: (n) => {
      const input = inputs[n - 1];
      if (!input) return false;
      input.checked = !input.checked;
      input.focus({ preventScroll: true });
      input.closest('label')?.scrollIntoView({ block: 'nearest' });
      ctx.onChange();
      return true;
    },
  };
};

// ---------------------------------------------------------------------------
// 3. number
// ---------------------------------------------------------------------------

/** 数値入力欄の共通処理。フォーカスを外すと半角・桁区切りにそろえる。 */
const bindNumberField = (
  input: HTMLInputElement,
  opts: { decimal: boolean; negative: boolean },
  onChange: () => void,
  onValidity?: (invalid: boolean) => void,
): void => {
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    onValidity?.(false);
    onChange();
  });
  input.addEventListener('blur', () => {
    const p = parseInput(input.value, opts);
    if (p.kind === 'ok') input.value = p.value < 0 ? `-${groupDigits(-p.value)}` : groupDigits(p.value);
    else if (p.kind === 'empty') input.value = '';
    const invalid = p.kind === 'invalid';
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    onValidity?.(invalid);
    onChange();
  });
};

const createNumber = (q: NumberQuestion, ctx: WidgetContext): Widget => {
  const unit = UNIT_LABEL[q.unit];
  const opts = { decimal: q.unit !== 'yen', negative: true };
  const input = el('input', {
    class: 'cq-num__input',
    attrs: {
      type: 'text',
      inputmode: opts.decimal ? 'decimal' : 'numeric',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-labelledby': ctx.labelledBy,
    },
  });
  if (ctx.prefill?.type === 'number') input.value = groupDigits(ctx.prefill.value);
  bindNumberField(input, opts, ctx.onChange);

  return {
    el: el(
      'div',
      { class: 'cq-numwrap' },
      el('div', { class: 'cq-num' }, input, unit ? el('span', { class: 'cq-num__unit', text: unit }) : null),
      el('p', {
        class: 'cq-hintline',
        text: '数字で入力してください（全角でもかまいません）。',
      }),
    ),
    firstControl: () => input,
    read: () => {
      const p = parseInput(input.value, opts);
      if (p.kind === 'empty') return { ok: false, message: '数値を入力してください。', focus: input };
      if (p.kind === 'invalid') {
        input.setAttribute('aria-invalid', 'true');
        return { ok: false, message: '数字だけで入力してください（例: 12,000）。', focus: input };
      }
      return { ok: true, answer: { type: 'number', value: p.value } };
    },
  };
};

// ---------------------------------------------------------------------------
// 4. journal
// ---------------------------------------------------------------------------

const MAX_ROWS = 5;
const INITIAL_ROWS = 2;
const SIDE_LABEL: Record<Side, string> = { debit: '借方', credit: '貸方' };
const AMOUNT_OPTS = { decimal: false, negative: false } as const;

const ACCOUNT_ORDER: ReadonlyMap<string, number> = new Map(ACCOUNT_LIST.map((a, i) => [a.id, i]));

interface Row {
  readonly root: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly amount: HTMLInputElement;
  readonly error: HTMLElement;
}

const createJournal = (q: JournalQuestion, ctx: WidgetContext): Widget => {
  // 科目は勘定科目表の並び（資産→負債→純資産→収益→費用）にそろえる。出題側の並びで答えが漏れないように。
  const accounts = [...new Set(q.accounts)].sort(
    (a, b) => (ACCOUNT_ORDER.get(a) ?? 0) - (ACCOUNT_ORDER.get(b) ?? 0),
  );
  const rows: Record<Side, Row[]> = { debit: [], credit: [] };
  const rowsBox: Record<Side, HTMLElement> = {
    debit: el('div', { class: 'cq-slip__rows' }),
    credit: el('div', { class: 'cq-slip__rows' }),
  };
  const addBtn: Record<Side, HTMLButtonElement> = {
    debit: el('button', { attrs: { type: 'button' } }),
    credit: el('button', { attrs: { type: 'button' } }),
  };
  const totalVal: Record<Side, HTMLElement> = {
    debit: el('span', { class: 'cq-total__val' }),
    credit: el('span', { class: 'cq-total__val' }),
  };
  const status = el('div', { class: 'cq-slip__status' });

  const sumOf = (side: Side): number =>
    rows[side].reduce((s, r) => {
      const p = parseInput(r.amount.value, AMOUNT_OPTS);
      return p.kind === 'ok' ? s + p.value : s;
    }, 0);

  /** 借方計・貸方計と、貸借一致の表示を更新する。色だけでなくアイコンと文言でも伝える。 */
  const refreshTotals = (): void => {
    const d = sumOf('debit');
    const c = sumOf('credit');
    totalVal.debit.textContent = formatYen(d);
    totalVal.credit.textContent = formatYen(c);
    while (status.firstChild) status.removeChild(status.firstChild);
    if (d === 0 && c === 0) {
      status.dataset['state'] = 'idle';
      status.append(icon('info', 20), el('span', { text: '金額を入れると、貸借の一致を確かめます。' }));
    } else if (d === c) {
      status.dataset['state'] = 'ok';
      status.append(icon('check', 20), el('span', { text: '貸借一致' }));
    } else {
      status.dataset['state'] = 'ng';
      status.append(
        icon('warn', 20),
        el('span', { text: '貸借が一致していません' }),
        el('span', { class: 'cq-slip__diff', text: `（差 ${formatYen(Math.abs(d - c))}）` }),
      );
    }
  };

  const relabel = (side: Side): void => {
    const list = rows[side];
    list.forEach((r, i) => {
      r.select.setAttribute('aria-label', `${SIDE_LABEL[side]} ${i + 1}行目 勘定科目`);
      r.amount.setAttribute('aria-label', `${SIDE_LABEL[side]} ${i + 1}行目 金額（円）`);
    });
    addBtn[side].hidden = list.length >= MAX_ROWS;
  };

  const addRow = (side: Side, removable: boolean, init?: JournalLine): Row => {
    const select = el(
      'select',
      { class: 'cq-select is-empty', on: { change: () => onEdit() } },
      el('option', { text: '選択してください', attrs: { value: '' } }),
      ...accounts.map((id) => el('option', { text: accountName(id), attrs: { value: id } })),
    );
    const amount = el('input', {
      class: 'cq-amt__input',
      attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' },
    });
    const error = el('p', { class: 'cq-row__err', attrs: { hidden: true } });
    const del = removable
      ? el(
          'button',
          {
            class: 'cq-btn cq-btn--ghost cq-row__del',
            attrs: { type: 'button' },
            on: {
              click: () => {
                const list = rows[side];
                const i = list.findIndex((r) => r.root === root);
                if (i < 0) return;
                list.splice(i, 1);
                root.remove();
                relabel(side);
                refreshTotals();
                (list[Math.max(0, i - 1)]?.select ?? addBtn[side]).focus();
                ctx.onChange();
              },
            },
          },
          icon('cross', 18),
          el('span', { class: 'sr-only', text: 'この行を削除' }),
        )
      : null;
    const root = el(
      'div',
      { class: 'cq-row' },
      select,
      el(
        'div',
        { class: 'cq-row__amt' },
        el('div', { class: 'cq-amt' }, amount, el('span', { class: 'cq-amt__unit', text: '円', attrs: { 'aria-hidden': 'true' } })),
        del,
      ),
      error,
    );
    const row: Row = { root, select, amount, error };
    const onEdit = (): void => {
      select.classList.toggle('is-empty', select.value === '');
      refreshTotals();
      ctx.onChange();
    };
    bindNumberField(
      amount,
      AMOUNT_OPTS,
      () => {
        refreshTotals();
        ctx.onChange();
      },
      (invalid) => {
        error.hidden = !invalid;
        error.textContent = invalid ? '金額は 1 円以上の整数で入力してください。' : '';
      },
    );
    if (init) {
      select.value = init.account;
      select.classList.toggle('is-empty', select.value === '');
      amount.value = groupDigits(init.amount);
    }
    rows[side].push(row);
    rowsBox[side].appendChild(root);
    relabel(side);
    return row;
  };

  // 初期の行。再挑戦のときは前回の入力を引き継ぐ。
  const prev = ctx.prefill?.type === 'journal' ? ctx.prefill.lines : [];
  for (const side of ['debit', 'credit'] as const) {
    const mine = prev.filter((l) => l.side === side).slice(0, MAX_ROWS);
    const n = Math.max(INITIAL_ROWS, mine.length);
    for (let i = 0; i < n; i++) {
      const init = mine[i];
      if (init && !accounts.includes(init.account)) {
        // 選択肢にない科目は引き継げない（空行にする）
        addRow(side, i >= INITIAL_ROWS);
      } else {
        addRow(side, i >= INITIAL_ROWS, init);
      }
    }
  }

  for (const side of ['debit', 'credit'] as const) {
    const btn = addBtn[side];
    btn.className = 'cq-add';
    btn.append(icon('plus', 18), el('span', { text: '行を追加' }));
    btn.addEventListener('click', () => {
      if (rows[side].length >= MAX_ROWS) return;
      addRow(side, true).select.focus();
      ctx.onChange();
    });
    relabel(side);
  }

  const col = (side: Side): HTMLElement =>
    el(
      'div',
      { class: 'cq-slip__col', dataset: { side } },
      el('div', { class: 'cq-slip__head', text: SIDE_LABEL[side] }),
      rowsBox[side],
      el('div', { class: 'cq-slip__addwrap' }, addBtn[side]),
    );
  const total = (side: Side): HTMLElement =>
    el(
      'div',
      { class: 'cq-total' },
      el('span', { class: 'cq-total__label', text: `${SIDE_LABEL[side]}計` }),
      totalVal[side],
    );

  const slip = el(
    'div',
    { class: 'cq-slip', attrs: { role: 'group', 'aria-labelledby': ctx.labelledBy } },
    el('div', { class: 'cq-slip__cols' }, col('debit'), col('credit')),
    el('div', { class: 'cq-slip__totals' }, total('debit'), total('credit')),
    status,
  );
  refreshTotals();

  return {
    el: slip,
    firstControl: () => rows.debit[0]?.select ?? null,
    read: () => {
      const lines: JournalLine[] = [];
      for (const side of ['debit', 'credit'] as const) {
        for (let i = 0; i < rows[side].length; i++) {
          const r = rows[side][i];
          if (!r) continue;
          const p = parseInput(r.amount.value, AMOUNT_OPTS);
          const where = `${SIDE_LABEL[side]} ${i + 1}行目`;
          const acc = r.select.value;
          if (acc === '' && p.kind === 'empty') continue;
          if (!isAccountId(acc)) {
            return { ok: false, message: `${where}: 勘定科目を選んでください。`, focus: r.select };
          }
          if (p.kind === 'empty') {
            return { ok: false, message: `${where}: 金額を入力してください。`, focus: r.amount };
          }
          if (p.kind === 'invalid' || p.value <= 0) {
            r.amount.setAttribute('aria-invalid', 'true');
            r.error.hidden = false;
            r.error.textContent = '金額は 1 円以上の整数で入力してください。';
            return { ok: false, message: `${where}: 金額は 1 円以上の整数で入力してください。`, focus: r.amount };
          }
          lines.push({ account: acc, side, amount: p.value });
        }
      }
      if (lines.length === 0) {
        return { ok: false, message: '借方と貸方に、勘定科目と金額を入力してください。', focus: rows.debit[0]?.select ?? null };
      }
      return { ok: true, answer: { type: 'journal', lines } };
    },
  };
};

// ---------------------------------------------------------------------------

export const createWidget = (q: Question, ctx: WidgetContext): Widget => {
  switch (q.type) {
    case 'choice':
      return createChoice(q, ctx);
    case 'multi':
      return createMulti(q, ctx);
    case 'number':
      return createNumber(q, ctx);
    case 'journal':
      return createJournal(q, ctx);
  }
};
