import { checkInvariants, cr, dr, linesEqual, normalBalance, accountTotals, trialBalance, validateLines, type JournalLine } from '../accounting';
import { createBook } from '../accounting/book';
import { autoplay } from '../game/autoplay';
import { resolveCard } from '../game/board';
import type { Scenario } from '../game/types';
import type { Card } from '../tasks/types';
import { endOfPeriod, formatDate, mkDate, periodOf } from '../types';
import { BONUS, MONTHLY, OPENING_BALANCES, PAYMENTS, consumptionTaxInterim, corporateTaxInterim } from './company';

export interface ValidationReport {
  readonly errors: string[];
  readonly warnings: string[];
  readonly stats: Record<string, number | string>;
}

/** 必ず存在し、決まった仕訳を計上しなければならないカード（納税・賞与・中間納付など）。 */
const REQUIRED: readonly { id: string; date: [number, number]; lines: readonly JournalLine[] }[] = [
  { id: 'c04_fixed_asset_tax_1', date: [0, 28], lines: [dr('dues', PAYMENTS.fixedAssetTaxInstallment), cr('bank', PAYMENTS.fixedAssetTaxInstallment)] },
  { id: 'c05_vehicle_tax', date: [1, 31], lines: [dr('dues', PAYMENTS.vehicleTax), cr('bank', PAYMENTS.vehicleTax)] },
  { id: 'c06_resident_tax_1', date: [2, 10], lines: [dr('wh_resident', MONTHLY.payroll.residentTax * 6), cr('bank', MONTHLY.payroll.residentTax * 6)] },
  { id: 'c07_withholding_1', date: [3, 10], lines: [dr('wh_income', MONTHLY.payroll.incomeTax * 6), cr('bank', MONTHLY.payroll.incomeTax * 6)] },
  { id: 'c07_labor_insurance', date: [3, 10], lines: [dr('welfare', PAYMENTS.laborInsuranceEstimate), cr('bank', PAYMENTS.laborInsuranceEstimate)] },
  { id: 'c07_bonus_summer', date: [3, 10], lines: [dr('bonus', BONUS.gross), cr('wh_income', BONUS.incomeTax), cr('wh_social', BONUS.social), cr('bank', BONUS.net)] },
  { id: 'c07_fixed_asset_tax_2', date: [3, 28], lines: [dr('dues', PAYMENTS.fixedAssetTaxInstallment), cr('bank', PAYMENTS.fixedAssetTaxInstallment)] },
  { id: 'c08_insurance_annual', date: [4, 1], lines: [dr('prepaid', PAYMENTS.insuranceAnnual), cr('bank', PAYMENTS.insuranceAnnual)] },
  { id: 'c11_interim_corporate_tax', date: [7, 30], lines: [dr('tax_prepaid', corporateTaxInterim()), cr('bank', corporateTaxInterim())] },
  { id: 'c11_interim_consumption_tax', date: [7, 30], lines: [dr('ct_payable', consumptionTaxInterim().total), cr('bank', consumptionTaxInterim().total)] },
  { id: 'c12_resident_tax_2', date: [8, 10], lines: [dr('wh_resident', MONTHLY.payroll.residentTax * 6), cr('bank', MONTHLY.payroll.residentTax * 6)] },
  { id: 'c12_bonus_winter', date: [8, 10], lines: [dr('bonus', BONUS.gross), cr('wh_income', BONUS.incomeTax), cr('wh_social', BONUS.social), cr('bank', BONUS.net)] },
  { id: 'c12_year_end_adjustment', date: [8, 20], lines: [dr('wh_income', PAYMENTS.yearEndRefund), cr('bank', PAYMENTS.yearEndRefund)] },
  { id: 'c12_fixed_asset_tax_3', date: [8, 25], lines: [dr('dues', PAYMENTS.fixedAssetTaxInstallment), cr('bank', PAYMENTS.fixedAssetTaxInstallment)] },
  {
    id: 'c01_withholding_2',
    date: [9, 20],
    lines: [
      dr('wh_income', MONTHLY.payroll.incomeTax * 6 + BONUS.incomeTax * 2 - PAYMENTS.yearEndRefund),
      cr('bank', MONTHLY.payroll.incomeTax * 6 + BONUS.incomeTax * 2 - PAYMENTS.yearEndRefund),
    ],
  },
  { id: 'c02_fixed_asset_tax_4', date: [10, 25], lines: [dr('dues', PAYMENTS.fixedAssetTaxInstallment), cr('bank', PAYMENTS.fixedAssetTaxInstallment)] },
];

const cardIssues = (c: Card, add: (m: string) => void): void => {
  const where = `[${c.id}]`;
  if (!c.title.trim()) add(`${where} title が空`);
  if (!c.situation.trim()) add(`${where} situation が空`);
  if (!c.squareLabel.trim()) add(`${where} squareLabel が空`);
  if (c.squareLabel.length > 8) add(`${where} squareLabel が長い（${c.squareLabel.length}文字）`);
  if (c.questions.length === 0) add(`${where} 設問がない`);
  const qids = new Set<string>();
  for (const q of c.questions) {
    const w = `${where} ${q.id}`;
    if (qids.has(q.id)) add(`${w} 設問 id が重複`);
    qids.add(q.id);
    if (!q.prompt.trim()) add(`${w} prompt が空`);
    if (!q.explain.trim()) add(`${w} explain が空`);
    if ((q.hints?.length ?? 0) > 3) add(`${w} hints が 3 つを超える`);
    switch (q.type) {
      case 'choice':
        if (q.options.length < 2) add(`${w} 選択肢が 2 つ未満`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) add(`${w} answer が範囲外`);
        for (const p of q.partial ?? []) if (p < 0 || p >= q.options.length) add(`${w} partial が範囲外`);
        if (new Set(q.options).size !== q.options.length) add(`${w} 選択肢が重複`);
        break;
      case 'multi':
        if (q.answer.length === 0) add(`${w} answer が空`);
        for (const a of q.answer) if (a < 0 || a >= q.options.length) add(`${w} answer が範囲外`);
        break;
      case 'number':
        if (!Number.isFinite(q.answer)) add(`${w} answer が数値でない`);
        break;
      case 'journal': {
        if (q.expected.length === 0) add(`${w} expected が空`);
        for (const e of q.expected) {
          const errs = validateLines(e);
          if (errs.length > 0) add(`${w} expected が不正: ${errs.map((x) => x.code).join(',')}`);
          for (const l of e) if (!q.accounts.includes(l.account)) add(`${w} 選択肢に ${l.account} がない`);
        }
        if (q.accounts.length < 4) add(`${w} 科目の選択肢が少ない（引っかけの科目を入れる）`);
        if (new Set(q.accounts).size !== q.accounts.length) add(`${w} 科目の選択肢が重複`);
        break;
      }
    }
  }
  for (const p of c.postings ?? []) {
    const errs = validateLines(p.lines);
    if (errs.length > 0) add(`${where} postings ${p.id} が不正: ${errs.map((x) => x.code).join(',')}`);
  }
  if (c.kind === 'DEADLINE' && (c.sources?.length ?? 0) === 0) add(`${where} DEADLINE なのに sources がない`);
  for (const s of c.sources ?? []) {
    if (!s.url.startsWith('http')) add(`${where} source の url が不正`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.asOf)) add(`${where} source の asOf が不正`);
  }
};

export const validateScenario = (scenario: Scenario): ValidationReport => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: Record<string, number | string> = {};

  // --- 盤面 ---
  const board = scenario.board;
  stats['squares'] = board.length;
  if (board.length === 0) errors.push('盤面が空');
  board.forEach((sq, i) => {
    if (sq.index !== i) errors.push(`square ${i}: index が連番でない`);
    const prev = board[i - 1];
    if (prev && sq.date < prev.date) errors.push(`square ${i}: 日付が前より前`);
  });
  if (board[0]?.type !== 'start') warnings.push('先頭のマスが start ではない');
  if (board[board.length - 1]?.type !== 'goal') errors.push('最後のマスが goal ではない');
  for (let p = 0; p <= 11; p++) {
    const inPeriod = board.filter((s) => s.period === p);
    const ends = inPeriod.filter((s) => s.type === 'monthend');
    if (ends.length !== 1) {
      errors.push(`${p + 1}番目の月: monthend マスが ${ends.length} 個`);
      continue;
    }
    const last = inPeriod[inPeriod.length - 1];
    if (last?.type !== 'monthend') errors.push(`${p + 1}番目の月: monthend が月の最後のマスではない`);
    if (ends[0] && ends[0].date !== endOfPeriod(p)) errors.push(`${p + 1}番目の月: monthend の日付が月末でない`);
    if (inPeriod.length < 4) warnings.push(`${p + 1}番目の月: マスが少ない（${inPeriod.length}）`);
  }
  stats['mandatory'] = board.filter((s) => s.mandatory).length;

  // --- カード（静的） ---
  const previewBook = createBook(scenario.opening);
  const kinds: Record<string, number> = {};
  for (const def of scenario.cardDefs) {
    const c = resolveCard(def, { book: previewBook, date: 0 });
    kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    if (typeof def !== 'function') cardIssues(c, (m) => errors.push(m));
    else if (!c.title.trim() || c.questions.length === 0) errors.push(`[${c.id}] 動的カードの実体化に失敗`);
  }
  stats['cards'] = scenario.cardDefs.length;
  stats['kinds'] = Object.entries(kinds).map(([k, v]) => `${k}:${v}`).join(' ');

  // --- 定常取引 ---
  const ids = new Set<string>();
  for (const e of scenario.autoEntries) {
    if (ids.has(e.id)) errors.push(`auto ${e.id}: 重複`);
    ids.add(e.id);
    const errs = validateLines(e.lines);
    if (errs.length > 0) errors.push(`auto ${e.id}: ${errs.map((x) => x.code).join(',')}`);
  }
  stats['autoEntries'] = scenario.autoEntries.length;

  // --- 必須カード ---
  for (const r of REQUIRED) {
    const sq = board.find((s) => s.cardId === r.id);
    if (!sq) {
      errors.push(`必須カード ${r.id} がない`);
      continue;
    }
    if (!sq.mandatory) errors.push(`必須カード ${r.id} が mandatory でない`);
    if (sq.date !== mkDate(r.date[0], r.date[1])) {
      warnings.push(`必須カード ${r.id} の日付が ${formatDate(sq.date)}（期待 ${formatDate(mkDate(r.date[0], r.date[1]))}）`);
    }
  }

  // --- 全問正解で 1 年を通す ---
  let perfect;
  try {
    perfect = autoplay(scenario, 1);
  } catch (e) {
    errors.push(`全問正解の自動プレイが例外: ${e instanceof Error ? e.message : String(e)}`);
    return { errors, warnings, stats };
  }
  stats['steps'] = perfect.steps;
  if (!perfect.ok) errors.push(`全問正解の自動プレイが完走しない（phase=${perfect.state.phase}）`);
  const s = perfect.state;
  const inv = checkInvariants(s.book);
  if (!inv.ok) errors.push(`不変条件の違反: ${inv.failures.map((f) => `${f.id} ${f.message}`).join(' / ')}`);
  if (perfect.minCash < 0) errors.push(`現預金がマイナスになる（最小 ${perfect.minCash}）`);
  stats['minCash'] = perfect.minCash;
  for (const a of inv.abnormal) warnings.push(`異常残高: ${a.name} ${a.balance}`);

  const playedIds = new Set(s.records.map((r) => r.cardId));
  for (const sq of board) {
    if (sq.mandatory && sq.cardId && !playedIds.has(sq.cardId)) errors.push(`必須マスのカードが遊ばれていない: ${sq.cardId}`);
  }
  const notPerfect = s.records.filter((r) => r.score < 0.999);
  if (notPerfect.length > 0) errors.push(`全問正解なのに満点でないカード: ${notPerfect.map((r) => r.cardId).join(',')}`);
  stats['played'] = s.records.length;
  if (s.finalScore) {
    stats['finalScore'] = s.finalScore.total;
    stats['netIncome'] = s.finalScore.netIncome;
    stats['finalCash'] = s.finalScore.finalCash;
    if (s.finalScore.netIncome <= 0) errors.push(`当期純利益が赤字（${s.finalScore.netIncome}）`);
  }

  // 必須カードの仕訳が、期待どおりに帳簿へ入っているか
  for (const r of REQUIRED) {
    const posted = s.book.entries.filter((e) => e.id.startsWith(`${r.id}:`));
    if (posted.length === 0) errors.push(`必須カード ${r.id} が帳簿に何も計上していない`);
    else if (!posted.some((e) => linesEqual(e.lines, r.lines))) errors.push(`必須カード ${r.id} の仕訳が期待と違う`);
  }

  // 年度末の残高の整合（来期の期首につながるか）
  const totals = accountTotals(s.book, { upTo: mkDate(11, 31) });
  const open = (id: string): number => {
    const o = OPENING_BALANCES.find((x) => x.account === id);
    return o ? o.amount : 0;
  };
  const expectEq = (account: 'wh_income' | 'wh_resident' | 'wh_social' | 'accrued' | 'accum_dep' | 'prepaid', v: number, label: string): void => {
    const b = normalBalance(totals, account);
    if (b !== v) errors.push(`期末残高 ${label}: ${b}（期待 ${v}）`);
  };
  expectEq('wh_income', open('wh_income'), '所得税預り金（期首と同じ 1〜3 月分）');
  expectEq('wh_resident', open('wh_resident'), '住民税預り金（期首と同じ 12〜3 月分）');
  expectEq('wh_social', open('wh_social'), '社会保険料預り金');
  expectEq('accrued', open('accrued'), '未払費用');
  expectEq('prepaid', MONTHLY.insurance * 4, '前払費用');
  expectEq('accum_dep', open('accum_dep') + MONTHLY.depreciation * 12, '減価償却累計額');
  const tb = trialBalance(s.book);
  if (!tb.balanced) errors.push('最終の試算表が貸借不一致');

  // --- 誤答を混ぜても壊れない ---
  for (const rate of [0.3, 1]) {
    try {
      const r = autoplay(scenario, 7, { mistakeRate: rate });
      if (!r.ok) errors.push(`誤答率 ${rate} の自動プレイが完走しない（phase=${r.state.phase}）`);
      const i2 = checkInvariants(r.state.book);
      if (!i2.ok) errors.push(`誤答率 ${rate} で不変条件の違反: ${i2.failures.map((f) => f.message).join(' / ')}`);
      stats[`score@mistake${rate}`] = r.state.finalScore?.total ?? 0;
    } catch (e) {
      errors.push(`誤答率 ${rate} の自動プレイが例外: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  stats['periods'] = `${periodOf(board[0]?.date ?? 0)}〜${periodOf(board[board.length - 1]?.date ?? 0)}`;
  return { errors, warnings, stats };
};
