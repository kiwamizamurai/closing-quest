import { cashOnHand, createBook, incomeStatement } from '../accounting';
import { LAST_FISCAL_PERIOD } from '../types';
import type { FinalScore, GameState, Scenario } from './types';

const avg = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const rankOf = (total: number): FinalScore['rank'] =>
  total >= 900 ? 'S' : total >= 780 ? 'A' : total >= 620 ? 'B' : total >= 450 ? 'C' : 'D';

/**
 * 1000 点満点。正確さ 45%、月次決算 20%、決算ステージ 15%、資金繰り 10%、信頼 10%。
 * 資金繰りは、期末の現預金が期首以上なら満点、期首の半分以下なら 0。
 */
export const computeFinalScore = (state: GameState, scenario: Scenario): FinalScore => {
  const accuracy = avg(state.records.map((r) => r.score));
  const monthClose = avg(state.records.filter((r) => r.monthClose).map((r) => r.score));
  const yearEnd = avg(state.records.filter((r) => r.period > LAST_FISCAL_PERIOD).map((r) => r.score));

  const openingCash = cashOnHand(createBook(scenario.opening));
  const finalCash = cashOnHand(state.book);
  const cashScore = openingCash <= 0 ? 1 : clamp01((finalCash - openingCash * 0.5) / (openingCash * 0.5));

  const penaltyTotal = state.records.reduce((s, r) => s + r.penalty, 0);
  const trust = state.resources.trust;
  const total = Math.round(
    1000 * (0.45 * accuracy + 0.2 * monthClose + 0.15 * yearEnd + 0.1 * cashScore + 0.1 * (trust / 100)),
  );
  return {
    total,
    rank: rankOf(total),
    accuracy,
    monthClose,
    yearEnd,
    cashScore,
    trust,
    netIncome: incomeStatement(state.book).netIncome,
    finalCash,
    penaltyTotal,
  };
};
