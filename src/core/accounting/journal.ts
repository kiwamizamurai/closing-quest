import type { GameDate, Side, Yen } from '../types';
import { isAccountId, type AccountId } from './accounts';

export interface JournalLine {
  readonly account: AccountId;
  readonly side: Side;
  readonly amount: Yen;
}

/** 仕訳の出どころ。auto=会社シミュレータが自動で入れる定常取引、player=プレイヤーが処理、adjust=決算整理。 */
export type EntryKind = 'auto' | 'player' | 'adjust';

export interface JournalEntry {
  readonly id: string;
  readonly date: GameDate;
  readonly memo: string;
  readonly kind: EntryKind;
  readonly lines: readonly JournalLine[];
}

export const dr = (account: AccountId, amount: Yen): JournalLine => ({
  account,
  side: 'debit',
  amount,
});

export const cr = (account: AccountId, amount: Yen): JournalLine => ({
  account,
  side: 'credit',
  amount,
});

export const entry = (
  id: string,
  date: GameDate,
  memo: string,
  kind: EntryKind,
  lines: readonly JournalLine[],
): JournalEntry => ({ id, date, memo, kind, lines });

export type EntryErrorCode =
  | 'TOO_FEW_LINES'
  | 'NOT_INTEGER'
  | 'NON_POSITIVE'
  | 'UNKNOWN_ACCOUNT'
  | 'UNBALANCED'
  | 'SAME_ACCOUNT_BOTH_SIDES';

export interface EntryError {
  readonly code: EntryErrorCode;
  readonly lineIndex?: number;
}

export const sumSide = (lines: readonly JournalLine[], side: Side): Yen =>
  lines.reduce((s, l) => (l.side === side ? s + l.amount : s), 0);

/** 仕訳の形式検査。空配列なら妥当。 */
export const validateLines = (lines: readonly JournalLine[]): EntryError[] => {
  const errors: EntryError[] = [];
  if (lines.length < 2) errors.push({ code: 'TOO_FEW_LINES' });
  lines.forEach((l, i) => {
    if (!isAccountId(l.account)) errors.push({ code: 'UNKNOWN_ACCOUNT', lineIndex: i });
    if (!Number.isSafeInteger(l.amount)) errors.push({ code: 'NOT_INTEGER', lineIndex: i });
    else if (l.amount <= 0) errors.push({ code: 'NON_POSITIVE', lineIndex: i });
  });
  if (sumSide(lines, 'debit') !== sumSide(lines, 'credit')) errors.push({ code: 'UNBALANCED' });
  const sidesByAccount = new Map<string, Set<Side>>();
  for (const l of lines) {
    const set = sidesByAccount.get(l.account) ?? new Set<Side>();
    set.add(l.side);
    sidesByAccount.set(l.account, set);
  }
  for (const sides of sidesByAccount.values()) {
    if (sides.size > 1) {
      errors.push({ code: 'SAME_ACCOUNT_BOTH_SIDES' });
      break;
    }
  }
  return errors;
};

export const validateEntry = (e: JournalEntry): EntryError[] => validateLines(e.lines);

/**
 * 同じ科目・同じ側の行を合算し、0 円の行を除き、決まった順に並べる。
 * プレイヤーの入力と正解の比較に使う（行の並び順や分割の違いを吸収する）。
 */
export const normalizeLines = (lines: readonly JournalLine[]): JournalLine[] => {
  const acc = new Map<string, JournalLine>();
  for (const l of lines) {
    if (l.amount === 0) continue;
    const key = `${l.side}:${l.account}`;
    const prev = acc.get(key);
    acc.set(key, prev ? { ...prev, amount: prev.amount + l.amount } : { ...l });
  }
  return [...acc.values()].sort((a, b) =>
    a.side === b.side
      ? a.account.localeCompare(b.account)
      : a.side === 'debit'
        ? -1
        : 1,
  );
};

export const linesEqual = (a: readonly JournalLine[], b: readonly JournalLine[]): boolean => {
  const na = normalizeLines(a);
  const nb = normalizeLines(b);
  if (na.length !== nb.length) return false;
  return na.every((l, i) => {
    const r = nb[i];
    return r !== undefined && l.account === r.account && l.side === r.side && l.amount === r.amount;
  });
};

/** 誤答の内訳。ヒントや解説の文言づくりに使う。 */
export type LineDiff =
  | { readonly type: 'missing'; readonly line: JournalLine }
  | { readonly type: 'extra'; readonly line: JournalLine }
  | { readonly type: 'wrong_amount'; readonly account: AccountId; readonly side: Side; readonly expected: Yen; readonly actual: Yen }
  | { readonly type: 'wrong_side'; readonly account: AccountId; readonly expectedSide: Side };

/** 入力 actual を、正解 expected に対して比較する（最も近い解との差）。 */
export const diffLines = (
  expected: readonly JournalLine[],
  actual: readonly JournalLine[],
): LineDiff[] => {
  const ne = normalizeLines(expected);
  const na = normalizeLines(actual);
  const diffs: LineDiff[] = [];
  const usedActual = new Set<number>();
  for (const e of ne) {
    const exact = na.findIndex(
      (a, i) => !usedActual.has(i) && a.account === e.account && a.side === e.side,
    );
    if (exact >= 0) {
      usedActual.add(exact);
      const a = na[exact]!;
      if (a.amount !== e.amount) {
        diffs.push({
          type: 'wrong_amount',
          account: e.account,
          side: e.side,
          expected: e.amount,
          actual: a.amount,
        });
      }
      continue;
    }
    const flipped = na.findIndex(
      (a, i) => !usedActual.has(i) && a.account === e.account && a.side !== e.side,
    );
    if (flipped >= 0) {
      usedActual.add(flipped);
      diffs.push({ type: 'wrong_side', account: e.account, expectedSide: e.side });
      continue;
    }
    diffs.push({ type: 'missing', line: e });
  }
  na.forEach((a, i) => {
    if (!usedActual.has(i)) diffs.push({ type: 'extra', line: a });
  });
  return diffs;
};
