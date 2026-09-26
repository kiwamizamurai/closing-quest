import type { OpeningBalance } from '../accounting/book';
import type { Yen } from '../types';

/**
 * ミナト商事株式会社（文具・オフィス用品の卸売）。従業員 8 名、3 月決算の中小企業。
 * 消費税は税抜経理（税率 10%）、商品売買は三分法。
 * 数字はすべてここに集める。カード・定常取引・決算はこの定数から作る（別の場所に数字を直書きしない）。
 *
 * 会計年度: 令和8年度（2026/4〜2027/3）。着任は 4/1。前期の決算・申告は前任者と税理士が済ませている。
 */
export const COMPANY = {
  name: 'ミナト商事株式会社',
  employees: 8,
  consumptionTaxRate: 0.1,
  /** 仕入率（売上に対する仕入の割合）。 */
  purchaseRatio: 0.74,
  /** 決算整理の貸倒引当金の設定率（期末売掛金に対して）。 */
  allowanceRate: 0.02,
  /** 法人税等の実効税率（教育用の仮定）。 */
  effectiveTaxRate: 0.3,
} as const;

/** 月次の売上（税抜）。キーは period 0〜11（4月〜翌3月）。 */
export const MONTHLY_SALES: readonly Yen[] = [
  11_500_000, 11_000_000, 12_500_000, 13_000_000, 11_800_000, 12_600_000,
  12_900_000, 13_200_000, 15_000_000, 11_700_000, 12_000_000, 13_800_000,
];

/** 月次の売上予算（税抜）。 */
export const MONTHLY_SALES_BUDGET: readonly Yen[] = [
  11_800_000, 11_200_000, 12_400_000, 13_200_000, 12_200_000, 12_800_000,
  13_000_000, 13_400_000, 14_800_000, 12_000_000, 12_200_000, 13_600_000,
];

/** 前年 3 月の売上（税抜）。期首の売掛金・買掛金のもと。 */
export const PRIOR_MARCH_SALES: Yen = 12_000_000;

/**
 * 前月分の売掛金のうち、月末（最終日）に入金される 1 社ぶん（税込）。残りは 20 日に入金される。
 * 月末の入金は通帳に翌営業日にしか載らないことがあり、月次決算の残高照合（未達）の題材になる。
 */
export const MONTH_END_COLLECTION: Yen = 1_320_000;

/** 月末の商品棚卸高。-1 は期首。決算整理前の月次損益の売上原価に使う。 */
export const MONTH_END_INVENTORY: Readonly<Record<number, Yen>> = {
  [-1]: 5_000_000,
  0: 5_100_000,
  1: 5_050_000,
  2: 5_200_000,
  3: 5_250_000,
  4: 5_150_000,
  5: 5_200_000,
  6: 5_300_000,
  7: 5_250_000,
  8: 5_500_000,
  9: 5_250_000,
  10: 5_300_000,
  11: 5_400_000,
};

/** 月次の仕入（税抜）。売上 × 仕入率。 */
export const purchasesOf = (sales: Yen): Yen => Math.round(sales * COMPANY.purchaseRatio);

/** 税額（10%）。 */
export const taxOf = (net: Yen): Yen => Math.round(net * COMPANY.consumptionTaxRate);

/** 税込金額。 */
export const withTax = (net: Yen): Yen => net + taxOf(net);

/** 毎月の固定的な取引（すべて円）。 */
export const MONTHLY = {
  /** 給与：総支給と天引き。 */
  payroll: { gross: 2_000_000, incomeTax: 50_000, residentTax: 60_000, socialEmployee: 290_000, net: 1_600_000 },
  /** 会社負担の社会保険料（法定福利費）。 */
  socialEmployer: 290_000,
  /** 家賃（税抜）。 */
  rent: 300_000,
  /** 水道光熱費（税抜）。 */
  utilities: 60_000,
  /** 通信費（税抜）。 */
  comm: 45_000,
  /** 借入金の利息（毎月末払い）。年 2.4% × 3,000,000 ÷ 12。 */
  interest: 6_000,
  /** 備品の減価償却費（定額法・残存価額ゼロ・耐用年数 10 年・取得価額 6,000,000）。 */
  depreciation: 50_000,
  /** 保険料の月割（年払い 120,000 ÷ 12）。 */
  insurance: 10_000,
} as const;

/** 賞与（夏 7/10・冬 12/10）。 */
export const BONUS = { gross: 1_200_000, incomeTax: 30_000, social: 174_000, net: 996_000, employerSocial: 174_000 } as const;

/** 納税・保険料など、カードが計上する金額。 */
export const PAYMENTS = {
  /** 固定資産税（償却資産）1期あたり。年額 42,000（課税標準 3,000,000 × 1.4%）を 4 回。 */
  fixedAssetTaxInstallment: 10_500,
  /** 自動車税（納税通知書の記載額）。 */
  vehicleTax: 39_500,
  /** 労働保険料（事業主負担の概算保険料）。40 万円未満なので 7/10 に一括納付。 */
  laborInsuranceEstimate: 288_000,
  /** 保険料の年払い（8/1）。 */
  insuranceAnnual: 120_000,
  /** 前期の確定消費税額（国税分）。中間納付は 6/12 と、地方消費税 22/78。 */
  priorConsumptionTaxNational: 2_028_000,
  /** 前期の法人税等の年税額（合計）。中間納付は 1/2。 */
  priorCorporateTaxTotal: 1_000_000,
  /** 年末調整の過納額（従業員へ還付）。 */
  yearEndRefund: 24_000,
  /** 銀行の振込手数料（残高照合で見つかる）。 */
  bankFee: 550,
} as const;

/** 消費税の中間納付：国税 6/12、地方消費税は国税の 22/78。 */
export const consumptionTaxInterim = (): { national: Yen; local: Yen; total: Yen } => {
  const national = Math.round((PAYMENTS.priorConsumptionTaxNational * 6) / 12);
  const local = Math.round((national * 22) / 78);
  return { national, local, total: national + local };
};

/** 法人税等の中間納付。 */
export const corporateTaxInterim = (): Yen => Math.round(PAYMENTS.priorCorporateTaxTotal / 2);

/** 期首（4/1）の残高。貸借が一致するように作ってある。 */
export const OPENING_BALANCES: readonly OpeningBalance[] = (() => {
  const priorMarchPurchases = purchasesOf(PRIOR_MARCH_SALES);
  const rows: OpeningBalance[] = [
    { account: 'cash', side: 'debit', amount: 300_000 },
    { account: 'bank', side: 'debit', amount: 8_000_000 },
    { account: 'ar', side: 'debit', amount: withTax(PRIOR_MARCH_SALES) },
    { account: 'allowance', side: 'credit', amount: Math.round(withTax(PRIOR_MARCH_SALES) * COMPANY.allowanceRate) },
    { account: 'inventory', side: 'debit', amount: MONTH_END_INVENTORY[-1] ?? 0 },
    // 火災保険：前年 8/1 に年払い済みの残り（4〜7 月の 4 か月分）
    { account: 'prepaid', side: 'debit', amount: MONTHLY.insurance * 4 },
    { account: 'equipment', side: 'debit', amount: 6_000_000 },
    { account: 'accum_dep', side: 'credit', amount: 3_000_000 },
    { account: 'ap', side: 'credit', amount: withTax(priorMarchPurchases) },
    // 3 月分の未払（経費）
    { account: 'payable', side: 'credit', amount: 220_000 },
    // 3 月分の社会保険料（会社負担分）。従業員負担分は預り金
    { account: 'accrued', side: 'credit', amount: MONTHLY.socialEmployer },
    // 納期の特例：源泉所得税は 1〜3 月の 3 か月分、住民税は 12〜3 月の 4 か月分が預り金に残っている
    { account: 'wh_income', side: 'credit', amount: MONTHLY.payroll.incomeTax * 3 },
    { account: 'wh_resident', side: 'credit', amount: MONTHLY.payroll.residentTax * 4 },
    { account: 'wh_social', side: 'credit', amount: MONTHLY.payroll.socialEmployee },
    { account: 'loan', side: 'credit', amount: 3_000_000 },
    { account: 'capital', side: 'credit', amount: 10_000_000 },
  ];
  const debit = rows.filter((r) => r.side === 'debit').reduce((s, r) => s + r.amount, 0);
  const credit = rows.filter((r) => r.side === 'credit').reduce((s, r) => s + r.amount, 0);
  rows.push({ account: 'retained', side: 'credit', amount: debit - credit });
  return rows;
})();
