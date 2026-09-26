/**
 * 共通の基本型と、ゲーム内カレンダー。
 * このファイルを含む src/core は three / DOM / window に依存しない（境界テストで強制）。
 */

/** 金額。整数の円。 */
export type Yen = number;

export type Side = 'debit' | 'credit';

export const oppositeSide = (s: Side): Side => (s === 'debit' ? 'credit' : 'debit');

// ---------------------------------------------------------------------------
// ゲーム内カレンダー
// ---------------------------------------------------------------------------

/** 会計年度の開始年（令和8年度 = 2026/4〜2027/3）。 */
export const FISCAL_YEAR = 2026;

/**
 * 期間インデックス。0〜11 が 4月〜翌3月（会計年度）、12〜14 が翌4月〜6月（決算ステージ）。
 */
export const PERIOD_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6] as const;

export const FISCAL_PERIODS = 12;
export const LAST_FISCAL_PERIOD = 11;
export const LAST_PERIOD = 14;

/** period * 100 + day の整数。大小比較がそのまま時系列になる。 */
export type GameDate = number;

export const mkDate = (period: number, day: number): GameDate => period * 100 + day;
export const periodOf = (d: GameDate): number => Math.floor(d / 100);
export const dayOf = (d: GameDate): number => d % 100;

export const monthOf = (period: number): number => {
  const m = PERIOD_MONTHS[period];
  if (m === undefined) throw new RangeError(`period out of range: ${period}`);
  return m;
};

/** 西暦年。period 0〜8 が会計年度の開始年、9 以降は翌年。 */
export const yearOfPeriod = (period: number): number =>
  period <= 8 ? FISCAL_YEAR : FISCAL_YEAR + 1;

/** その月の日数（うるう年を考慮）。 */
export const daysInPeriod = (period: number): number => {
  const y = yearOfPeriod(period);
  const m = monthOf(period);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** 月末日の GameDate。 */
export const endOfPeriod = (period: number): GameDate => mkDate(period, daysInPeriod(period));

/** 0=日 … 6=土 */
export const weekdayOf = (d: GameDate): number => {
  const p = periodOf(d);
  return new Date(Date.UTC(yearOfPeriod(p), monthOf(p) - 1, dayOf(d))).getUTCDay();
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 例: "7/10" */
export const formatDate = (d: GameDate): string => `${monthOf(periodOf(d))}/${dayOf(d)}`;

/** 例: "7/10（金）" */
export const formatDateWithWeekday = (d: GameDate): string =>
  `${formatDate(d)}（${WEEKDAY_JA[weekdayOf(d)]}）`;

/** 例: "令和8年7月" 。決算ステージの翌年分も西暦から換算する。 */
export const formatPeriodJa = (period: number): string => {
  const reiwa = yearOfPeriod(period) - 2018;
  return `令和${reiwa}年${monthOf(period)}月`;
};

/** 例: "令和8年度" */
export const FISCAL_YEAR_LABEL = `令和${FISCAL_YEAR - 2018}年度`;

/** 円表記。例: 1234567 -> "1,234,567円"、負は "△1,234円"。 */
export const formatYen = (n: Yen): string =>
  n < 0 ? `△${Math.abs(n).toLocaleString('ja-JP')}円` : `${n.toLocaleString('ja-JP')}円`;
