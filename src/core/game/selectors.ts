import {
  accountTotals,
  balanceSheet,
  cashOnHand,
  incomeStatement,
  ledger,
  normalBalance,
  trialBalance,
  type AccountId,
  type BalanceSheet,
  type IncomeStatement,
  type LedgerRow,
  type TrialBalance,
} from '../accounting';
import {
  endOfPeriod,
  formatDate,
  formatDateWithWeekday,
  formatPeriodJa,
  LAST_FISCAL_PERIOD,
  mkDate,
  monthOf,
  periodOf,
  type GameDate,
  type Yen,
} from '../types';
import { SKILL_LABEL, type SkillId } from '../tasks/types';
import type { ActiveCard, GameState, Scenario, Square } from './types';

export interface Hud {
  readonly date: GameDate;
  readonly dateLabel: string; // "7/10（金）"
  readonly periodLabel: string; // "令和8年7月"
  readonly month: number; // 1〜12
  readonly period: number;
  /** 決算ステージ（翌4〜6月）か。 */
  readonly yearEndStage: boolean;
  readonly cash: Yen;
  readonly trust: number;
  readonly turn: number;
  /** 盤面の進み具合 0〜1。 */
  readonly progress: number;
  readonly skills: readonly { readonly id: SkillId; readonly label: string; readonly level: number; readonly points: number }[];
}

/** スキルレベル。5 ポイントごとに 1 上がる（1 始まり）。 */
export const skillLevel = (points: number): number => 1 + Math.floor(points / 5);

export const selectSquare = (state: GameState, scenario: Scenario): Square => {
  const sq = scenario.board[state.position];
  if (!sq) throw new Error(`invalid position ${state.position}`);
  return sq;
};

export const selectHud = (state: GameState, scenario: Scenario): Hud => {
  const period = periodOf(state.date);
  const last = Math.max(1, scenario.board.length - 1);
  return {
    date: state.date,
    dateLabel: formatDateWithWeekday(state.date),
    periodLabel: formatPeriodJa(period),
    month: monthOf(period),
    period,
    yearEndStage: period > LAST_FISCAL_PERIOD,
    cash: cashOnHand(state.book, state.date),
    trust: state.resources.trust,
    turn: state.turn,
    progress: state.position / last,
    skills: (Object.keys(SKILL_LABEL) as SkillId[]).map((id) => ({
      id,
      label: SKILL_LABEL[id],
      level: skillLevel(state.resources.skillPoints[id]),
      points: state.resources.skillPoints[id],
    })),
  };
};

export interface UpcomingItem {
  readonly square: Square;
  readonly dateLabel: string;
  /** 現在位置から何マス先か。 */
  readonly distance: number;
}

/** これから来る必須マス（期限・月末など）を、近い順に limit 件。 */
export const selectUpcoming = (state: GameState, scenario: Scenario, limit = 6): UpcomingItem[] => {
  const out: UpcomingItem[] = [];
  for (let i = state.position + 1; i < scenario.board.length && out.length < limit; i++) {
    const sq = scenario.board[i];
    if (sq && sq.mandatory && sq.cardId) {
      out.push({ square: sq, dateLabel: formatDate(sq.date), distance: i - state.position });
    }
  }
  return out;
};

export interface StatementsView {
  readonly date: GameDate;
  readonly period: number;
  /** 残高試算表（決算整理前。計上済みの仕訳だけ）。 */
  readonly trialBalance: TrialBalance;
  /** 当月の損益（決算ステージでは年度全体）。 */
  readonly monthIncome: IncomeStatement;
  /** 期首からの累計損益。 */
  readonly ytdIncome: IncomeStatement;
  readonly balanceSheet: BalanceSheet;
  /** 月次の売上予算（税抜）と当月売上（税抜）。 */
  readonly salesBudget: Yen;
  /** 決算整理前の月次で使っている月末棚卸高。決算整理済みなら undefined。 */
  readonly inventoryEnd?: Yen;
}

const inventoryAdjusted = (state: GameState): boolean =>
  state.book.entries.some(
    (e) => e.kind === 'adjust' && e.lines.some((l) => l.account === 'inventory'),
  );

export const selectStatements = (
  state: GameState,
  scenario: Scenario,
  atDate: GameDate = state.date,
): StatementsView => {
  // 決算ステージ（翌4月以降）の決算書は、期末日（3/31）時点のものを見る
  const at = Math.min(atDate, endOfPeriod(LAST_FISCAL_PERIOD));
  const inStage = periodOf(atDate) > LAST_FISCAL_PERIOD;
  const period = periodOf(at);
  const fp = period;
  const adjusted = inventoryAdjusted(state);
  const invEnd = adjusted ? undefined : scenario.monthEndInventory[fp];
  const invOpen = scenario.monthEndInventory[-1] ?? 0;
  const invPrev = fp === 0 ? invOpen : (scenario.monthEndInventory[fp - 1] ?? invOpen);

  const ytdIncome = incomeStatement(
    state.book,
    invEnd === undefined
      ? { to: at }
      : { to: at, inventoryStart: invOpen, inventoryEnd: invEnd },
  );
  const monthIncome =
    inStage
      ? ytdIncome
      : incomeStatement(
          state.book,
          invEnd === undefined
            ? { from: mkDate(period, 1), to: Math.min(at, endOfPeriod(period)) }
            : {
                from: mkDate(period, 1),
                to: Math.min(at, endOfPeriod(period)),
                inventoryStart: invPrev,
                inventoryEnd: invEnd,
              },
        );
  return {
    date: at,
    period,
    trialBalance: trialBalance(state.book, at),
    monthIncome,
    ytdIncome,
    balanceSheet: balanceSheet(state.book, at, invEnd === undefined ? {} : { inventoryEnd: invEnd }),
    salesBudget: scenario.monthlySalesBudget[fp] ?? 0,
    ...(invEnd === undefined ? {} : { inventoryEnd: invEnd }),
  };
};

export const selectActiveCard = (state: GameState): ActiveCard | undefined => state.active;

/** 勘定科目の総勘定元帳（帳簿を見る画面用）。 */
export const selectLedger = (state: GameState, account: AccountId): LedgerRow[] =>
  ledger(state.book, account, state.date);

/** 科目の現在残高（正常残高側を正）。 */
export const selectBalance = (state: GameState, account: AccountId): Yen =>
  normalBalance(accountTotals(state.book, { upTo: state.date }), account);
