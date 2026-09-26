import { endOfPeriod, LAST_FISCAL_PERIOD, mkDate, type GameDate, type Yen } from '../types';
import { ACCOUNT_LIST, accountDef, type AccountId } from './accounts';
import { accountTotals, normalBalance, type Book } from './book';

export interface StatementLine {
  readonly account: AccountId;
  readonly name: string;
  /** 表示上の金額。評価勘定や控除項目はマイナスで持つ。 */
  readonly amount: Yen;
}

export interface IncomeStatement {
  readonly sales: Yen;
  readonly cogs: Yen;
  readonly grossProfit: Yen;
  readonly sga: readonly StatementLine[];
  readonly sgaTotal: Yen;
  readonly operatingIncome: Yen;
  /** 営業外収益（雑収入など）。 */
  readonly nonOperatingIncome: readonly StatementLine[];
  /** 営業外費用（支払利息など）。 */
  readonly nonOperatingExpense: readonly StatementLine[];
  readonly incomeBeforeTax: Yen;
  readonly corpTax: Yen;
  readonly netIncome: Yen;
}

export interface IncomeStatementOptions {
  /** 集計の開始日（含む）。省略時は会計年度の初日。 */
  readonly from?: GameDate;
  /** 集計の終了日（含む）。省略時は年度末。 */
  readonly to?: GameDate;
  /**
   * 期首・期末の商品棚卸高を指定すると、売上原価 = 仕入 + 期首 − 期末 で計算する
   * （決算整理仕訳をまだ計上していない月次の損益計算用）。
   * 省略時は「仕入」勘定の残高をそのまま売上原価とする（決算整理仕訳を計上済みの前提）。
   */
  readonly inventoryStart?: Yen;
  readonly inventoryEnd?: Yen;
}

const FISCAL_START: GameDate = mkDate(0, 1);
const FISCAL_END: GameDate = endOfPeriod(LAST_FISCAL_PERIOD);

/** 期間内の損益。開始残高は含めない。 */
export const incomeStatement = (book: Book, opts: IncomeStatementOptions = {}): IncomeStatement => {
  const from = opts.from ?? FISCAL_START;
  const to = opts.to ?? FISCAL_END;
  const totals = accountTotals(book, { from, upTo: to });
  const bal = (id: AccountId): Yen => normalBalance(totals, id);

  const sales = bal('sales');
  const purchases = bal('purchases');
  const cogs =
    opts.inventoryStart !== undefined && opts.inventoryEnd !== undefined
      ? purchases + opts.inventoryStart - opts.inventoryEnd
      : purchases;

  const sga: StatementLine[] = [];
  const nonOperatingIncome: StatementLine[] = [];
  const nonOperatingExpense: StatementLine[] = [];
  for (const a of ACCOUNT_LIST) {
    const v = bal(a.id);
    if (v === 0) continue;
    if (a.section === 'sga') sga.push({ account: a.id, name: a.name, amount: v });
    else if (a.section === 'non_operating' && a.category === 'revenue')
      nonOperatingIncome.push({ account: a.id, name: a.name, amount: v });
    else if (a.section === 'non_operating' && a.category === 'expense')
      nonOperatingExpense.push({ account: a.id, name: a.name, amount: v });
  }
  const sgaTotal = sga.reduce((s, l) => s + l.amount, 0);
  const grossProfit = sales - cogs;
  const operatingIncome = grossProfit - sgaTotal;
  const incomeBeforeTax =
    operatingIncome +
    nonOperatingIncome.reduce((s, l) => s + l.amount, 0) -
    nonOperatingExpense.reduce((s, l) => s + l.amount, 0);
  const corpTax = bal('corp_tax');
  return {
    sales,
    cogs,
    grossProfit,
    sga,
    sgaTotal,
    operatingIncome,
    nonOperatingIncome,
    nonOperatingExpense,
    incomeBeforeTax,
    corpTax,
    netIncome: incomeBeforeTax - corpTax,
  };
};

export interface BalanceSheet {
  readonly assets: readonly StatementLine[];
  readonly liabilities: readonly StatementLine[];
  readonly equity: readonly StatementLine[];
  readonly totalAssets: Yen;
  readonly totalLiabilities: Yen;
  readonly totalEquity: Yen;
  /** 当期純利益（純資産の部に含まれている）。 */
  readonly netIncome: Yen;
  readonly balanced: boolean;
}

export interface BalanceSheetOptions {
  /** 期末商品棚卸高を指定すると、繰越商品をこの金額で表示し、売上原価にも反映する。 */
  readonly inventoryEnd?: Yen;
}

/** その日時点の貸借対照表。当期純利益は純資産の部に別行で含める。 */
export const balanceSheet = (
  book: Book,
  upTo?: GameDate,
  opts: BalanceSheetOptions = {},
): BalanceSheet => {
  const at = upTo ?? FISCAL_END;
  const totals = accountTotals(book, { upTo: at });
  const openingInventory = book.opening
    .filter((o) => o.account === 'inventory')
    .reduce((s, o) => s + (o.side === 'debit' ? o.amount : -o.amount), 0);

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  for (const a of ACCOUNT_LIST) {
    let v = normalBalance(totals, a.id);
    if (a.id === 'inventory' && opts.inventoryEnd !== undefined) v = opts.inventoryEnd;
    if (v === 0) continue;
    if (a.category === 'asset') {
      assets.push({ account: a.id, name: a.name, amount: a.contra ? -v : v });
    } else if (a.category === 'liability') {
      liabilities.push({ account: a.id, name: a.name, amount: v });
    } else if (a.category === 'equity') {
      equity.push({ account: a.id, name: a.name, amount: v });
    }
  }

  const pl = incomeStatement(
    book,
    opts.inventoryEnd !== undefined
      ? {
          to: at < FISCAL_END ? at : FISCAL_END,
          inventoryStart: openingInventory,
          inventoryEnd: opts.inventoryEnd,
        }
      : { to: at < FISCAL_END ? at : FISCAL_END },
  );

  const totalAssets = assets.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
  const totalEquity = equity.reduce((s, l) => s + l.amount, 0) + pl.netIncome;
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome: pl.netIncome,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
};

/** 勘定科目の名前を引く小さな補助（UI 用）。 */
export const nameOf = (id: AccountId): string => accountDef(id).name;
