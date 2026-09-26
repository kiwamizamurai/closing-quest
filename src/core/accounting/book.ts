import type { GameDate, Side, Yen } from '../types';
import { ACCOUNT_LIST, accountDef, type AccountId } from './accounts';
import { validateEntry, validateLines, type JournalEntry, type JournalLine } from './journal';

export interface OpeningBalance {
  readonly account: AccountId;
  readonly side: Side;
  readonly amount: Yen;
}

/** 開始残高と仕訳の集まり。不変データ（更新は新しい Book を返す）。JSON にできる。 */
export interface Book {
  readonly opening: readonly OpeningBalance[];
  readonly entries: readonly JournalEntry[];
}

export class BookError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BookError';
  }
}

export const createBook = (opening: readonly OpeningBalance[]): Book => {
  const asLines: JournalLine[] = opening.map((o) => ({
    account: o.account,
    side: o.side,
    amount: o.amount,
  }));
  const errors = validateLines(asLines).filter((e) => e.code !== 'TOO_FEW_LINES');
  // 開始残高は同じ科目が複数行あってもよい（評価勘定など）ので SAME_ACCOUNT_BOTH_SIDES は許容しない：科目ごとに1行とする
  if (errors.length > 0) {
    throw new BookError(`invalid opening balances: ${errors.map((e) => e.code).join(',')}`, 'OPENING_INVALID');
  }
  return { opening, entries: [] };
};

export const hasEntry = (book: Book, id: string): boolean => book.entries.some((e) => e.id === id);

export const postEntry = (book: Book, e: JournalEntry): Book => {
  const errors = validateEntry(e);
  if (errors.length > 0) {
    throw new BookError(`invalid entry ${e.id}: ${errors.map((x) => x.code).join(',')}`, 'ENTRY_INVALID');
  }
  if (hasEntry(book, e.id)) {
    throw new BookError(`duplicate entry id: ${e.id}`, 'ENTRY_DUPLICATE');
  }
  return { opening: book.opening, entries: [...book.entries, e] };
};

export const postEntries = (book: Book, es: readonly JournalEntry[]): Book =>
  es.reduce((b, e) => postEntry(b, e), book);

export interface Totals {
  readonly debit: Yen;
  readonly credit: Yen;
}

export interface TotalsOptions {
  /** この日付以前（含む）の仕訳だけ集計する。 */
  readonly upTo?: GameDate;
  /** この日付以降（含む）の仕訳だけ集計する。指定すると開始残高は含めない。 */
  readonly from?: GameDate;
}

/** 科目ごとの借方合計・貸方合計。 */
export const accountTotals = (book: Book, opts: TotalsOptions = {}): Map<AccountId, Totals> => {
  const map = new Map<AccountId, { debit: Yen; credit: Yen }>();
  const add = (account: AccountId, side: Side, amount: Yen): void => {
    const cur = map.get(account) ?? { debit: 0, credit: 0 };
    if (side === 'debit') cur.debit += amount;
    else cur.credit += amount;
    map.set(account, cur);
  };
  if (opts.from === undefined) {
    for (const o of book.opening) add(o.account, o.side, o.amount);
  }
  for (const e of book.entries) {
    if (opts.upTo !== undefined && e.date > opts.upTo) continue;
    if (opts.from !== undefined && e.date < opts.from) continue;
    for (const l of e.lines) add(l.account, l.side, l.amount);
  }
  return map;
};

/** 借方 − 貸方。 */
export const netDebit = (totals: Map<AccountId, Totals>, id: AccountId): Yen => {
  const t = totals.get(id);
  return t ? t.debit - t.credit : 0;
};

/** 正常残高側を正とした残高。 */
export const normalBalance = (totals: Map<AccountId, Totals>, id: AccountId): Yen => {
  const net = netDebit(totals, id);
  return accountDef(id).normalSide === 'debit' ? net : -net;
};

/** 現預金（現金＋普通預金）。 */
export const cashOnHand = (book: Book, upTo?: GameDate): Yen => {
  const t = accountTotals(book, upTo === undefined ? {} : { upTo });
  return normalBalance(t, 'cash') + normalBalance(t, 'bank');
};

// ---------------------------------------------------------------------------
// 試算表
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  readonly account: AccountId;
  /** 借方残高（借方に残高がある場合のみ >0）。 */
  readonly debit: Yen;
  /** 貸方残高（貸方に残高がある場合のみ >0）。 */
  readonly credit: Yen;
}

export interface TrialBalance {
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebit: Yen;
  readonly totalCredit: Yen;
  readonly balanced: boolean;
}

/** 残高試算表。残高のある科目だけを、勘定科目表の順に並べる。 */
export const trialBalance = (book: Book, upTo?: GameDate): TrialBalance => {
  const totals = accountTotals(book, upTo === undefined ? {} : { upTo });
  const rows: TrialBalanceRow[] = [];
  for (const a of ACCOUNT_LIST) {
    const net = netDebit(totals, a.id);
    if (net === 0) continue;
    rows.push({ account: a.id, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
};

// ---------------------------------------------------------------------------
// 総勘定元帳
// ---------------------------------------------------------------------------

export interface LedgerRow {
  readonly date: GameDate | null; // null = 前期繰越
  readonly memo: string;
  readonly debit: Yen;
  readonly credit: Yen;
  /** 正常残高側を正とした累計残高。 */
  readonly balance: Yen;
}

export const ledger = (book: Book, id: AccountId, upTo?: GameDate): LedgerRow[] => {
  const sign = accountDef(id).normalSide === 'debit' ? 1 : -1;
  const rows: LedgerRow[] = [];
  let bal = 0;
  for (const o of book.opening) {
    if (o.account !== id) continue;
    const d = o.side === 'debit' ? o.amount : 0;
    const c = o.side === 'credit' ? o.amount : 0;
    bal += sign * (d - c);
    rows.push({ date: null, memo: '前期繰越', debit: d, credit: c, balance: bal });
  }
  const sorted = [...book.entries]
    .filter((e) => upTo === undefined || e.date <= upTo)
    .sort((a, b) => a.date - b.date);
  for (const e of sorted) {
    for (const l of e.lines) {
      if (l.account !== id) continue;
      const d = l.side === 'debit' ? l.amount : 0;
      const c = l.side === 'credit' ? l.amount : 0;
      bal += sign * (d - c);
      rows.push({ date: e.date, memo: e.memo, debit: d, credit: c, balance: bal });
    }
  }
  return rows;
};
