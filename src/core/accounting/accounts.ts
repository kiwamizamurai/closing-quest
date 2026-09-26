import type { Side } from '../types';

export type Category = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface AccountDef {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  /** 残高が増える側（正常残高側）。評価勘定は区分の通常側と逆になる。 */
  readonly normalSide: Side;
  /** 評価勘定（貸倒引当金・減価償却累計額）。 */
  readonly contra?: true;
  /** 貸借対照表・損益計算書での表示区分。 */
  readonly section:
    | 'current_asset'
    | 'fixed_asset'
    | 'current_liability'
    | 'equity'
    | 'sales'
    | 'cogs'
    | 'sga'
    | 'non_operating'
    | 'tax';
  /** ヘルプ（勘定科目表）用の一言説明。 */
  readonly note: string;
}

/** 区分ごとの通常の増加側。 */
export const defaultSideOf = (c: Category): Side =>
  c === 'asset' || c === 'expense' ? 'debit' : 'credit';

const def = (
  id: string,
  name: string,
  category: Category,
  section: AccountDef['section'],
  note: string,
  contra = false,
): AccountDef => {
  const base = defaultSideOf(category);
  const normalSide: Side = contra ? (base === 'debit' ? 'credit' : 'debit') : base;
  return contra
    ? { id, name, category, normalSide, contra: true, section, note }
    : { id, name, category, normalSide, section, note };
};

/**
 * 月次決算・年次決算で使う勘定科目。消費税は税抜経理（仮払消費税・仮受消費税）。
 * 商品売買は三分法（仕入・売上・繰越商品）。
 */
export const ACCOUNT_LIST = [
  // 資産
  def('cash', '現金', 'asset', 'current_asset', '手元の現金。小口現金を含む。'),
  def('bank', '普通預金', 'asset', 'current_asset', '銀行の普通預金口座。'),
  def('ar', '売掛金', 'asset', 'current_asset', '商品を売ったがまだ入金されていない代金。'),
  def('allowance', '貸倒引当金', 'asset', 'current_asset', '売掛金の将来の貸倒れに備える評価勘定。', true),
  def('inventory', '繰越商品', 'asset', 'current_asset', '期末に売れ残っている商品（三分法）。'),
  def('prepaid', '前払費用', 'asset', 'current_asset', '来期以降の分を先に払った費用（前払保険料など）。'),
  def('suspense_paid', '仮払金', 'asset', 'current_asset', '内容や金額が未確定の支払を一時的に処理する勘定。'),
  def('input_tax', '仮払消費税', 'asset', 'current_asset', '支払時に払った消費税（税抜経理）。'),
  def('tax_prepaid', '仮払法人税等', 'asset', 'current_asset', '法人税等の中間納付額。決算で法人税等に振り替える。'),
  def('equipment', '備品', 'asset', 'fixed_asset', 'パソコンや事務机など、長く使う道具。'),
  def('accum_dep', '減価償却累計額', 'asset', 'fixed_asset', '備品の減価償却費の累計。備品から差し引く評価勘定。', true),
  def('receivable_other', '未収入金', 'asset', 'current_asset', '商品以外の売却などで、まだ入金されていない代金。'),
  def('advance_paid', '立替金', 'asset', 'current_asset', '従業員などのために一時的に立て替えた金額。'),
  // 負債
  def('ap', '買掛金', 'liability', 'current_liability', '商品を仕入れたがまだ払っていない代金。'),
  def('payable', '未払金', 'liability', 'current_liability', '商品以外の代金でまだ払っていないもの（備品購入など）。'),
  def('accrued', '未払費用', 'liability', 'current_liability', '当期に発生したがまだ払っていない費用（継続的なサービス）。'),
  def('wh_income', '所得税預り金', 'liability', 'current_liability', '給与から天引きした源泉所得税。国へ納めるまでの預り金。'),
  def('wh_resident', '住民税預り金', 'liability', 'current_liability', '給与から天引きした個人住民税（特別徴収）。'),
  def('wh_social', '社会保険料預り金', 'liability', 'current_liability', '給与から天引きした従業員負担の社会保険料。'),
  def('output_tax', '仮受消費税', 'liability', 'current_liability', '受け取った消費税（税抜経理）。'),
  def('tax_payable', '未払法人税等', 'liability', 'current_liability', '決算で計上した、まだ納めていない法人税・住民税・事業税。'),
  def('ct_payable', '未払消費税等', 'liability', 'current_liability', '決算で計上した、まだ納めていない消費税・地方消費税。'),
  def('loan', '短期借入金', 'liability', 'current_liability', '1年以内に返す銀行などからの借入。'),
  // 純資産
  def('capital', '資本金', 'equity', 'equity', '出資者が出したお金。'),
  def('retained', '繰越利益剰余金', 'equity', 'equity', '過去の利益の積み立て。'),
  // 収益
  def('sales', '売上', 'revenue', 'sales', '商品を売って得た収益。'),
  def('misc_income', '雑収入', 'revenue', 'non_operating', '少額で他の科目に当てはまらない収入。'),
  // 費用
  def('purchases', '仕入', 'expense', 'cogs', '売るために買った商品の原価（三分法）。'),
  def('salaries', '給料', 'expense', 'sga', '従業員に払う給与（総支給額）。'),
  def('bonus', '賞与', 'expense', 'sga', '従業員に払うボーナス（総支給額）。'),
  def('welfare', '法定福利費', 'expense', 'sga', '会社負担の社会保険料など。'),
  def('rent', '支払家賃', 'expense', 'sga', '事務所などの家賃。'),
  def('utilities', '水道光熱費', 'expense', 'sga', '電気・ガス・水道の料金。'),
  def('comm', '通信費', 'expense', 'sga', '電話・インターネット・郵送の費用。'),
  def('travel', '旅費交通費', 'expense', 'sga', '電車賃や出張の交通費・宿泊費。'),
  def('supplies', '消耗品費', 'expense', 'sga', '文房具や、10万円未満の備品などの購入費。'),
  def('insurance', '保険料', 'expense', 'sga', '火災保険などの保険料。'),
  def('repair', '修繕費', 'expense', 'sga', '固定資産を元の状態に戻す修理の費用。'),
  def('fee', '支払手数料', 'expense', 'sga', '振込手数料や、税理士など専門家への手数料。'),
  def('depreciation', '減価償却費', 'expense', 'sga', '備品などの価値の減りを、使う期間に配分した費用。'),
  def('bad_debt_exp', '貸倒引当金繰入', 'expense', 'sga', '貸倒引当金を積み立てたときの費用。'),
  def('bad_debt_loss', '貸倒損失', 'expense', 'sga', '売掛金が回収できなくなった損失（引当金で足りない分）。'),
  def('dues', '租税公課', 'expense', 'sga', '固定資産税・印紙税・延滞税など、法人税等以外の税金。'),
  def('misc', '雑費', 'expense', 'sga', '他の科目に当てはまらない少額の費用。'),
  def('interest', '支払利息', 'expense', 'non_operating', '借入金の利息。'),
  def('corp_tax', '法人税等', 'expense', 'tax', '法人税・住民税・事業税。'),
] as const satisfies readonly AccountDef[];

export type AccountId = (typeof ACCOUNT_LIST)[number]['id'];

const BY_ID: ReadonlyMap<string, AccountDef> = new Map(ACCOUNT_LIST.map((a) => [a.id, a]));

export const isAccountId = (s: string): s is AccountId => BY_ID.has(s);

export const accountDef = (id: AccountId): AccountDef => {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`unknown account: ${id}`);
  return a;
};

export const accountName = (id: AccountId): string => accountDef(id).name;

export const ALL_ACCOUNT_IDS: readonly AccountId[] = ACCOUNT_LIST.map((a) => a.id);
