import { cr, dr, entry, type JournalEntry, type JournalLine } from '../accounting';
import { daysInPeriod, mkDate, type Yen } from '../types';
import {
  BONUS,
  MONTH_END_COLLECTION,
  MONTHLY,
  MONTHLY_SALES,
  PRIOR_MARCH_SALES,
  purchasesOf,
  taxOf,
  withTax,
} from './company';

/** 賞与を支給する月（period）。7月と12月。 */
export const BONUS_PERIODS: readonly number[] = [3, 8];

/** 月次決算のカードで仕訳させる「主役の決算整理」。偶数月は減価償却、奇数月は保険料の月割。残りは自動計上。 */
export type MonthClosePrimary = 'depreciation' | 'insurance';
export const monthClosePrimary = (period: number): MonthClosePrimary =>
  period % 2 === 0 ? 'depreciation' : 'insurance';

/** 残高照合で銀行の振込手数料（記帳漏れ）が見つかる月。それ以外の月は「未達」が原因。 */
export const isBankFeeMonth = (period: number): boolean => period % 3 === 1;

const auto = (id: string, period: number, day: number, memo: string, lines: readonly JournalLine[]): JournalEntry =>
  entry(`auto:${id}`, mkDate(period, day), memo, 'auto', lines);

const half = (n: Yen): Yen => n / 2;

/** 前月売上（税抜 prevSales）の回収。20 日に大半、月末（end 日）に 1 社ぶん。 */
const arCollections = (period: number, prevSales: Yen, end: number): JournalEntry[] => {
  const total = withTax(prevSales);
  const late = MONTH_END_COLLECTION;
  return [
    auto(`p${period}:ar_collect`, period, 20, '売掛金の回収', [dr('bank', total - late), cr('ar', total - late)]),
    auto(`p${period}:ar_collect_end`, period, end, '売掛金の回収（月末入金）', [dr('bank', late), cr('ar', late)]),
  ];
};

/**
 * 会社シミュレータが自動で計上する定常取引（実務の自動仕訳に相当）。
 * プレイヤーのカードが計上するもの（納税・賞与・中間納付・年末調整・月次決算の主役の仕訳など）は含めない。
 */
export const buildAutoEntries = (): JournalEntry[] => {
  const out: JournalEntry[] = [];

  for (let p = 0; p <= 11; p++) {
    const S = MONTHLY_SALES[p] ?? 0;
    const P = purchasesOf(S);
    const Sprev = p === 0 ? PRIOR_MARCH_SALES : (MONTHLY_SALES[p - 1] ?? 0);
    const Pprev = purchasesOf(Sprev);
    const end = daysInPeriod(p);

    // 掛売上（月に 2 回）
    for (const [n, day] of [[1, 10], [2, 24]] as const) {
      const h = half(S);
      out.push(auto(`p${p}:sales${n}`, p, day, '掛売上', [dr('ar', withTax(h)), cr('sales', h), cr('output_tax', taxOf(h))]));
    }
    // 掛仕入（月に 2 回）
    for (const [n, day] of [[1, 8], [2, 22]] as const) {
      const h = half(P);
      out.push(auto(`p${p}:purchase${n}`, p, day, '掛仕入', [dr('purchases', h), dr('input_tax', taxOf(h)), cr('ap', withTax(h))]));
    }
    // 前月分の売掛金の回収（大半は 20 日、1 社ぶんは月末）と、買掛金の支払（25日）
    out.push(...arCollections(p, Sprev, end));
    out.push(auto(`p${p}:ap_pay`, p, 25, '買掛金の支払', [dr('ap', withTax(Pprev)), cr('bank', withTax(Pprev))]));

    // 給与（25日）と会社負担の社会保険料の見越し
    const pr = MONTHLY.payroll;
    out.push(
      auto(`p${p}:payroll`, p, 25, '給与の支払', [
        dr('salaries', pr.gross),
        cr('wh_income', pr.incomeTax),
        cr('wh_resident', pr.residentTax),
        cr('wh_social', pr.socialEmployee),
        cr('bank', pr.net),
      ]),
    );
    out.push(auto(`p${p}:welfare_accrue`, p, 25, '社会保険料（会社負担）の計上', [dr('welfare', MONTHLY.socialEmployer), cr('accrued', MONTHLY.socialEmployer)]));

    // 前月分の社会保険料の納付（月末）。賞与の翌月は賞与分も一緒に納める
    const bonusPrev = BONUS_PERIODS.includes(p - 1);
    const socialEmp = MONTHLY.payroll.socialEmployee + (bonusPrev ? BONUS.social : 0);
    const socialCo = MONTHLY.socialEmployer + (bonusPrev ? BONUS.employerSocial : 0);
    out.push(auto(`p${p}:social_pay`, p, end, '社会保険料の納付', [dr('wh_social', socialEmp), dr('accrued', socialCo), cr('bank', socialEmp + socialCo)]));

    // 賞与月は、会社負担の社会保険料の見越し（賞与の支給日 10日）
    if (BONUS_PERIODS.includes(p)) {
      out.push(auto(`p${p}:bonus_welfare`, p, 10, '賞与の社会保険料（会社負担）の計上', [dr('welfare', BONUS.employerSocial), cr('accrued', BONUS.employerSocial)]));
    }

    // 経費（課税）
    out.push(auto(`p${p}:rent`, p, 27, '家賃の支払', [dr('rent', MONTHLY.rent), dr('input_tax', taxOf(MONTHLY.rent)), cr('bank', withTax(MONTHLY.rent))]));
    out.push(auto(`p${p}:utilities`, p, 25, '水道光熱費の支払', [dr('utilities', MONTHLY.utilities), dr('input_tax', taxOf(MONTHLY.utilities)), cr('bank', withTax(MONTHLY.utilities))]));
    out.push(auto(`p${p}:comm`, p, 25, '通信費の支払', [dr('comm', MONTHLY.comm), dr('input_tax', taxOf(MONTHLY.comm)), cr('bank', withTax(MONTHLY.comm))]));
    out.push(auto(`p${p}:interest`, p, end, '借入金の利息の支払', [dr('interest', MONTHLY.interest), cr('bank', MONTHLY.interest)]));

    // 月次の決算整理のうち、カードで仕訳させない方
    if (monthClosePrimary(p) === 'depreciation') {
      out.push(auto(`p${p}:insurance`, p, end, '保険料の月割', [dr('insurance', MONTHLY.insurance), cr('prepaid', MONTHLY.insurance)]));
    } else {
      out.push(auto(`p${p}:depreciation`, p, end, '減価償却費の計上', [dr('depreciation', MONTHLY.depreciation), cr('accum_dep', MONTHLY.depreciation)]));
    }

    // 期首の未払金（3月分の経費）の支払
    if (p === 0) out.push(auto('p0:payable_pay', 0, 28, '未払金の支払', [dr('payable', 220_000), cr('bank', 220_000)]));
  }

  // 決算ステージ（翌4月）：3月分の支払・回収・社会保険料の納付
  const S11 = MONTHLY_SALES[11] ?? 0;
  const P11 = purchasesOf(S11);
  out.push(...arCollections(12, S11, 30));
  out.push(auto('p12:ap_pay', 12, 25, '買掛金の支払', [dr('ap', withTax(P11)), cr('bank', withTax(P11))]));
  out.push(auto('p12:social_pay', 12, 30, '社会保険料の納付', [dr('wh_social', MONTHLY.payroll.socialEmployee), dr('accrued', MONTHLY.socialEmployer), cr('bank', MONTHLY.payroll.socialEmployee + MONTHLY.socialEmployer)]));

  return out.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
};
