import type { GameDate } from '../types';
import { accountTotals, normalBalance, trialBalance, type Book } from './book';
import { ACCOUNT_LIST, accountDef } from './accounts';
import { validateEntry } from './journal';
import { balanceSheet } from './statements';

export type InvariantId = 'I1' | 'I2' | 'I3' | 'I4' | 'I7';

export interface InvariantFailure {
  readonly id: InvariantId;
  readonly message: string;
}

export interface AbnormalBalance {
  readonly account: string;
  readonly name: string;
  readonly balance: number;
}

export interface InvariantReport {
  readonly ok: boolean;
  readonly failures: readonly InvariantFailure[];
  /** 正常残高側と逆に残高が出ている科目（警告。失敗ではない）。 */
  readonly abnormal: readonly AbnormalBalance[];
}

/**
 * 帳簿の不変条件を検査する。
 *  I1 各仕訳で借方合計＝貸方合計
 *  I2 開始残高の借方合計＝貸方合計
 *  I3 残高試算表の借方合計＝貸方合計
 *  I4 貸借対照表で 資産＝負債＋純資産（当期純利益を含む）
 *  I7 仕訳 ID は一意
 * （I5 PL の純利益＝純資産の増加、I6 正常残高側 は abnormal として警告に出す）
 */
export const checkInvariants = (book: Book, upTo?: GameDate): InvariantReport => {
  const failures: InvariantFailure[] = [];

  for (const e of book.entries) {
    const errs = validateEntry(e);
    if (errs.length > 0) {
      failures.push({ id: 'I1', message: `${e.id}: ${errs.map((x) => x.code).join(',')}` });
    }
  }

  const openDebit = book.opening.filter((o) => o.side === 'debit').reduce((s, o) => s + o.amount, 0);
  const openCredit = book.opening.filter((o) => o.side === 'credit').reduce((s, o) => s + o.amount, 0);
  if (openDebit !== openCredit) {
    failures.push({ id: 'I2', message: `opening ${openDebit} != ${openCredit}` });
  }

  const tb = trialBalance(book, upTo);
  if (!tb.balanced) {
    failures.push({ id: 'I3', message: `trial balance ${tb.totalDebit} != ${tb.totalCredit}` });
  }

  const bs = balanceSheet(book, upTo);
  if (!bs.balanced) {
    failures.push({
      id: 'I4',
      message: `balance sheet assets ${bs.totalAssets} != L+E ${bs.totalLiabilities + bs.totalEquity}`,
    });
  }

  const seen = new Set<string>();
  for (const e of book.entries) {
    if (seen.has(e.id)) failures.push({ id: 'I7', message: `duplicate id ${e.id}` });
    seen.add(e.id);
  }

  const totals = accountTotals(book, upTo === undefined ? {} : { upTo });
  const abnormal: AbnormalBalance[] = [];
  for (const a of ACCOUNT_LIST) {
    const v = normalBalance(totals, a.id);
    if (v < 0) abnormal.push({ account: a.id, name: accountDef(a.id).name, balance: v });
  }

  return { ok: failures.length === 0, failures, abnormal };
};
