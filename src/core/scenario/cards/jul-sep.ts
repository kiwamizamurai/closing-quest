import { cashOnHand, cr, dr } from '../../accounting';
import type { Card, CardContext, CardDef, SourceRef } from '../../tasks/types';
import { formatYen, mkDate } from '../../types';
import {
  BONUS,
  COMPANY,
  MONTHLY,
  MONTHLY_SALES,
  MONTHLY_SALES_BUDGET,
  PAYMENTS,
  consumptionTaxInterim,
  corporateTaxInterim,
  purchasesOf,
  withTax,
} from '../company';

/**
 * 7〜9月のカード。
 *  帳簿に仕訳を入れるのは、CONTENT_GUIDE の表にある 5 枚だけ
 *  （c07_withholding_1 / c07_bonus_summer / c07_labor_insurance / c07_fixed_asset_tax_2 / c08_insurance_annual）。
 *  ほかの 6 枚は知識・判断の問題で、帳簿には何も入れない。
 * 金額はすべて company.ts の定数から作る。
 */

// ---------------------------------------------------------------------------
// 出典（確認日 2026-09-26）。primary は一次情報を読んで確認したもの。
// ---------------------------------------------------------------------------

const AS_OF = '2026-09-26';
const primary = (label: string, url: string): SourceRef => ({ label, url, asOf: AS_OF, verified: 'primary' });
const secondary = (label: string, url: string): SourceRef => ({ label, url, asOf: AS_OF, verified: 'secondary' });

const SRC_NTA_2505 = primary(
  '国税庁 No.2505 源泉所得税及び復興特別所得税の納付期限と納期の特例',
  'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm',
);
const SRC_NTA_6609 = primary('国税庁 No.6609 中間申告の方法（消費税）', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm');
const SRC_NTA_6201 = primary('国税庁 No.6201 非課税となる取引（保険料は非課税）', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6201.htm');
const SRC_NTA_5320 = primary('国税庁 No.5320 貸倒損失として処理できる場合', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5320.htm');
const SRC_NTA_HOJIN = primary(
  '国税庁 法人税のあらましと申告の手引（令和6年10月）中間申告',
  'https://www.nta.go.jp/publication/pamph/hojin/aramashi2024/pdf/01.pdf',
);
const SRC_JPS_TEIJI = primary('日本年金機構 定時決定（算定基礎届）', 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20121017.html');
const SRC_JPS_TEIJI_R8 = primary(
  '日本年金機構 令和8年度の算定基礎届のご提出について（提出期限 7/10（金））',
  'https://www.nenkin.go.jp/tokusetsu/santei.html',
);
const SRC_JPS_BONUS = primary('日本年金機構 従業員に賞与を支給したときの手続き', 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20141203.html');
const SRC_KOUNEN_RULE = primary(
  'e-Gov 厚生年金保険法施行規則（賞与額の届出は賞与を支払った日から5日以内）',
  'https://laws.e-gov.go.jp/law/329M50000100037',
);
const SRC_MINPO = primary('e-Gov 民法 第140条（期間の初日は算入しない）', 'https://laws.e-gov.go.jp/law/129AC0000000089');
const SRC_MHLW_NENDO = primary(
  '厚生労働省 労働保険料の申告・納付（年度更新・延納）',
  'https://www.mhlw.go.jp/www2/topics/seido/daijin/hoken/980916_3.htm',
);
const SRC_MHLW_R8 = primary(
  '厚生労働省 令和8年度労働保険の年度更新（6/1〜7/10）',
  'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/roudouhoken21/index.html',
);
const SRC_LOCALTAX = primary('e-Gov 地方税法 第350条・第362条（固定資産税の税率・納期）', 'https://laws.e-gov.go.jp/law/325AC0000000226');
const SRC_YAYOI = secondary('弥生 経理業務がわかる年間スケジュール（法人向け）', 'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/keri-schedule/');
const SRC_INVOICE = secondary(
  '請求ABC 経理の仕事内容を一覧で解説（日次・月次・年次）',
  'https://media.invoice.ne.jp/column/industry-tips/accounting-Schedule.html',
);
const SRC_MF_CLOSE = secondary('マネーフォワード 月次決算とは（流れと目的）', 'https://biz.moneyforward.com/accounting/basic/46320/');
const SRC_MF_PREPAID = secondary(
  'マネーフォワード 前払費用の勘定科目と仕訳例（火災保険の例）',
  'https://biz.moneyforward.com/accounting/basic/48712/',
);

/** 期限に遅れたときの負担（教育用の仮定額。得点が半分未満のとき現預金から引く）。 */
const LATE_COST = 5_000;

// ---------------------------------------------------------------------------
// 7/9  算定基礎届（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

/** 従業員1人あたりの平均月額給与（給与総額 ÷ 人数）。算定基礎届の例に使う。 */
const AVG_PAY = MONTHLY.payroll.gross / COMPANY.employees;
const TEIJI_PAY = [AVG_PAY - 5_000, AVG_PAY + 5_000, AVG_PAY] as const;

const teijiKettei: Card = {
  id: 'c07_teiji_kettei',
  kind: 'DEADLINE',
  title: '算定基礎届を出す（社会保険料の見直し）',
  date: mkDate(3, 9),
  skill: 'labor',
  situation:
    '毎年7月は、社会保険料のもとになる「標準報酬月額」（毎月の給与を等級に当てはめた金額）を年に1度見直します。' +
    '総務の担当者から「算定基礎届の用紙が届きました。いつまでに、どこへ、どの月の給与で作ればいいですか」と聞かれました。',
  facts: [
    {
      caption: '従業員Aさんの4〜6月の報酬（通勤手当・残業手当などを含む総額）',
      headers: ['月', '報酬月額（円）', '支払基礎日数（日）'],
      rows: [
        ['4月', TEIJI_PAY[0], 30],
        ['5月', TEIJI_PAY[1], 31],
        ['6月', TEIJI_PAY[2], 30],
      ],
      numericColumns: [1, 2],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '算定基礎届の提出期限と提出先として、正しいものはどれですか。',
      options: [
        '7月31日まで。給与に関する届出なので、税務署へ提出する',
        '7月10日まで。労働保険と同じ窓口の、労働基準監督署へ提出する',
        '7月10日まで。日本年金機構（管轄の年金事務所または事務センター）へ提出する',
        '8月31日まで。雇用保険に関する届出なので、ハローワークへ提出する',
      ],
      answer: 2,
      hints: [
        '算定基礎届は、健康保険・厚生年金保険（社会保険）の手続きです。窓口はどこでしょう。',
        '同じ7/10が期限でも、源泉所得税の納付先や労働保険の窓口とは別です。',
      ],
      explain:
        '算定基礎届は、毎年7/1〜7/10に日本年金機構（管轄の年金事務所または事務センター）へ出します。令和8年度の期限は7/10（金）です。' +
        '同じ7/10でも、源泉所得税は税務署（金融機関）、労働保険の年度更新は労働局・労働基準監督署と窓口が違います。混同しないようにしましょう。',
    },
    {
      id: 'q2',
      type: 'multi',
      prompt: '算定基礎届の対象にならない人を、すべて選んでください。',
      options: [
        '4月に入社し、7/1 も在籍している人',
        '6/15 に入社（被保険者の資格を取得）した人',
        '6/25 に退職した人',
        '4〜6月の毎月、給与を受けていて、7/1 も在籍している人',
      ],
      answer: [1, 2],
      hints: [
        '届け出るのは「7/1 現在の被保険者」です。',
        '6/1 以降に被保険者になった人や、6/30 までに退職した人は、対象から外れます。',
      ],
      explain:
        '算定基礎届の対象は、7/1 現在で使用している被保険者です。ただし、6/1 以降に資格を取得した人（4〜6月の報酬がそろわない）と、6/30 以前に退職した人は対象外です。' +
        'ほかにも、7月・8月・9月に給与の見直し（随時改定）をする予定の人などは省ける場合があるので、迷ったら日本年金機構のページで確認しましょう。',
    },
    {
      id: 'q3',
      type: 'number',
      prompt: 'Aさんの報酬月額（4〜6月の3か月の平均）はいくらですか。3か月とも支払基礎日数は17日以上です。',
      unit: 'yen',
      answer: (TEIJI_PAY[0] + TEIJI_PAY[1] + TEIJI_PAY[2]) / 3,
      hints: [
        '4月・5月・6月の報酬を合計して、月数で割ります。',
        `3か月の合計は ${formatYen(TEIJI_PAY[0] + TEIJI_PAY[1] + TEIJI_PAY[2])} です。`,
      ],
      explain:
        '4〜6月のうち、支払基礎日数が17日以上ある月の報酬を平均して、報酬月額を出します。' +
        `${formatYen(TEIJI_PAY[0])} ＋ ${formatYen(TEIJI_PAY[1])} ＋ ${formatYen(TEIJI_PAY[2])} ＝ ${formatYen(TEIJI_PAY[0] + TEIJI_PAY[1] + TEIJI_PAY[2])}、` +
        `÷ 3か月 ＝ ${formatYen((TEIJI_PAY[0] + TEIJI_PAY[1] + TEIJI_PAY[2]) / 3)}。この金額を、日本年金機構の標準報酬月額の等級表に当てはめて、標準報酬月額が決まります。`,
    },
    {
      id: 'q4',
      type: 'choice',
      prompt: 'この届出で決まった標準報酬月額は、いつからいつまでの保険料に使われますか。',
      options: [
        'その年の7月から翌年の6月まで',
        'その年の9月から翌年の8月まで',
        'その年の4月から翌年の3月まで',
        'その年の10月から翌年の9月まで',
      ],
      answer: 1,
      hints: ['算定基礎届を出す7月ではなく、少しあとの月から使い始めます。'],
      explain:
        '定時決定で決まった標準報酬月額は、その年の9月から翌年の8月までの各月に使われます。' +
        '給与が大きく変わったときは、年の途中でも見直す「月額変更届」（随時改定）という別の手続きがあります。',
    },
  ],
  sources: [SRC_JPS_TEIJI, SRC_JPS_TEIJI_R8],
  mandatory: true,
  squareLabel: '算定基礎届',
};

// ---------------------------------------------------------------------------
// 7/10  源泉所得税の納期の特例（必須・仕訳あり）
// ---------------------------------------------------------------------------

const WITHHOLDING_1H = MONTHLY.payroll.incomeTax * 6;

const withholding1: Card = {
  id: 'c07_withholding_1',
  kind: 'DEADLINE',
  title: '源泉所得税を納める（1〜6月分）',
  date: mkDate(3, 10),
  skill: 'tax',
  situation:
    `税理士の先生から「従業員${COMPANY.employees}名の会社なので、源泉所得税は納期の特例で年2回にまとめて納めていますね。` +
    '1〜6月分の納付期限は今日、7/10です」と連絡がありました。',
  facts: [
    {
      caption: '給与から天引きした所得税（所得税預り金）',
      headers: ['月', '天引きの内容', '所得税（円）'],
      rows: [
        ['1〜3月', '前期から繰り越された預り金の残高（3か月分）', MONTHLY.payroll.incomeTax * 3],
        ['4月', '4/25 の給与から', MONTHLY.payroll.incomeTax],
        ['5月', '5/25 の給与から', MONTHLY.payroll.incomeTax],
        ['6月', '6/25 の給与から', MONTHLY.payroll.incomeTax],
        ['7月', '今日（7/10）支給する夏季賞与から天引きする予定', BONUS.incomeTax],
      ],
      numericColumns: [2],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: `従業員${COMPANY.employees}名のミナト商事は、源泉所得税の「納期の特例」の承認を受けています。この特例の説明として、正しいものはどれですか。`,
      options: [
        '従業員の人数に関係なく、届出だけで使える。1〜6月分は6/10、7〜12月分は12/10に納める',
        '毎月10日の納付を、年1回（翌年1/20）にまとめて納められる制度で、承認は要らない',
        '従業員が30人未満の会社なら、税務署の承認を受けなくても、届出だけで使える',
        '給与の支給人員が常時10人未満で、承認を受けた会社は、1〜6月分を7/10、7〜12月分を翌年1/20に納められる',
      ],
      answer: 3,
      hints: [
        '原則は、給与を支払った月の翌月10日までに納めます。',
        '使えるのは小さな会社だけで、税務署への申請（承認）が必要です。',
        '納付は年2回です。1〜6月分は7/10、7〜12月分は翌年1/20です。',
      ],
      explain:
        '源泉徴収した所得税は、原則として、給与を支払った月の翌月10日までに納めます。' +
        '給与の支給人員が常時10人未満の会社は、税務署に「納期の特例」の申請書を出して承認を受けると（却下の通知がなければ承認されたものとみなされます）、' +
        '1〜6月に源泉徴収した分は7/10、7〜12月分は翌年1/20に、まとめて納められます。人数が常時10人以上になったら、特例は使えなくなります。' +
        '6/10 と 12/10 は、住民税の納期の特例の期限で、所得税とは別です。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '今日（7/10）納付する源泉所得税（1〜6月分）の合計はいくらですか。',
      unit: 'yen',
      answer: WITHHOLDING_1H,
      hints: [
        '1〜3月分は預り金の残高にまとまっています。4〜6月分は毎月の給与から天引きした額です。',
        '今日支給する賞与から天引きする分は「7月に源泉徴収した所得税」です。1〜6月分に入るでしょうか。',
      ],
      explain:
        `納期の特例で今日納めるのは、1〜6月に源泉徴収した分です。${formatYen(MONTHLY.payroll.incomeTax * 3)} ＋ ${formatYen(MONTHLY.payroll.incomeTax)} × 3か月 ＝ ${formatYen(WITHHOLDING_1H)}。` +
        `今日支給する賞与から天引きする${formatYen(BONUS.incomeTax)}は7月に源泉徴収する分なので、7〜12月分として翌年1/20にまとめて納めます。`,
    },
    {
      id: 'q3',
      type: 'journal',
      prompt: '源泉所得税を普通預金から納付する仕訳をしてください。',
      accounts: ['wh_income', 'bank', 'dues', 'corp_tax', 'wh_resident', 'salaries'],
      expected: [[dr('wh_income', WITHHOLDING_1H), cr('bank', WITHHOLDING_1H)]],
      memo: '源泉所得税の納付（1〜6月分・納期の特例）',
      traps: [
        { account: 'dues', side: 'debit', message: '源泉所得税は、従業員の税金を会社が預かって納めるものです。会社の費用（租税公課）にはなりません。' },
        { account: 'corp_tax', side: 'debit', message: '「法人税等」は会社自身の利益にかかる税金です。従業員から預かった源泉所得税は「所得税預り金」で処理します。' },
        { account: 'wh_resident', side: 'debit', message: '住民税預り金は6/10に納付済みです。今回納めるのは所得税の預り金です。' },
        { account: 'salaries', side: 'debit', message: '給料は、給与を支払ったときに費用にしています。納付のときにもう一度費用にすると二重計上になります。' },
      ],
      hints: [
        '給与から天引きしたときに、貸方に「所得税預り金」（負債）を積んでいます。',
        '預り金を国に納めると、その負債が減ります。負債が減るのは借方です。',
        `借方：所得税預り金 ${formatYen(WITHHOLDING_1H)} ／ 貸方：普通預金 ${formatYen(WITHHOLDING_1H)}`,
      ],
      explain:
        '天引きしたときに「所得税預り金」（負債）を貸方に積んであります。国に納めると預り金がなくなるので借方に置き、預金が減るので貸方は普通預金です。' +
        '預かったお金を納めるだけで、会社の費用ではないので、損益には影響しません。',
    },
  ],
  penalty: { amount: LATE_COST, reason: '納付が遅れ、延滞税などの負担が発生した' },
  sources: [SRC_NTA_2505, SRC_YAYOI],
  mandatory: true,
  squareLabel: '源泉納付',
  squareType: 'deadline',
};

// ---------------------------------------------------------------------------
// 7/10  夏季賞与（必須・仕訳あり）
// ---------------------------------------------------------------------------

const bonusSummer: Card = {
  id: 'c07_bonus_summer',
  kind: 'JOURNAL',
  title: '夏季賞与を支給する',
  date: mkDate(3, 10),
  skill: 'bookkeeping',
  situation:
    `社長から「夏季賞与を今日、全員の口座に振り込んでほしい」と指示がありました。賞与の総支給額は全員分で${formatYen(BONUS.gross)}です。` +
    '所得税と社会保険料（従業員負担分）を天引きして、手取りを確認し、帳簿に入れましょう。',
  facts: [
    {
      caption: '夏季賞与（全員の合計）',
      headers: ['項目', '金額（円）'],
      rows: [
        ['総支給額', BONUS.gross],
        ['所得税（源泉徴収）', BONUS.incomeTax],
        ['社会保険料（従業員負担分）', BONUS.social],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'number',
      prompt: '従業員に実際に振り込む賞与の手取り額（全員の合計）はいくらですか。',
      unit: 'yen',
      answer: BONUS.net,
      hints: ['手取りは、総支給額から天引きの合計を引いた額です。', `天引きは、所得税 ${formatYen(BONUS.incomeTax)} と社会保険料 ${formatYen(BONUS.social)} です。`],
      explain: `${formatYen(BONUS.gross)} − ${formatYen(BONUS.incomeTax)} − ${formatYen(BONUS.social)} ＝ ${formatYen(BONUS.net)}。これが振込額（手取り）です。`,
    },
    {
      id: 'q2',
      type: 'journal',
      prompt: '夏季賞与の支給を仕訳してください。',
      accounts: ['bonus', 'wh_income', 'wh_social', 'bank', 'salaries', 'welfare', 'wh_resident'],
      expected: [[dr('bonus', BONUS.gross), cr('wh_income', BONUS.incomeTax), cr('wh_social', BONUS.social), cr('bank', BONUS.net)]],
      memo: '夏季賞与の支給',
      traps: [
        { account: 'bonus', side: 'debit', message: '賞与（費用）は、天引きする前の「総支給額」で計上します。振り込む手取りの額ではありません。' },
        { account: 'salaries', side: 'debit', message: '賞与は「給料」ではなく「賞与」で処理します。分けておくと、賞与の年間の総額がわかります。' },
        { account: 'welfare', side: 'debit', message: '会社が負担する社会保険料（法定福利費）は、賞与の支給日に別に計上されています。この仕訳では、従業員から預かる分だけを扱います。' },
        { account: 'wh_resident', side: 'credit', message: 'このゲームでは、賞与から住民税は天引きしません（住民税は毎月の給与から天引きします）。' },
      ],
      hints: [
        '費用にするのは「天引きする前」の金額です。従業員に払う総額が、会社の人件費です。',
        '天引きした所得税と社会保険料は、国や年金機構に納めるまでの預り金（負債）です。',
        `借方：賞与 ${formatYen(BONUS.gross)} ／ 貸方：所得税預り金 ${formatYen(BONUS.incomeTax)}、社会保険料預り金 ${formatYen(BONUS.social)}、普通預金 ${formatYen(BONUS.net)}`,
      ],
      explain:
        `賞与は会社が払う人件費なので、天引き前の総支給額 ${formatYen(BONUS.gross)} を「賞与」で費用にします。` +
        `従業員の手元に届く手取り ${formatYen(BONUS.net)} で費用にすると、人件費が実際より小さくなり、預り金も記録できません。` +
        `天引きした所得税 ${formatYen(BONUS.incomeTax)} と社会保険料 ${formatYen(BONUS.social)} は、あとで納めるまでの預り金（負債）です。` +
        `会社が負担する社会保険料 ${formatYen(BONUS.employerSocial)} は、別に法定福利費として自動で計上されています。`,
    },
  ],
  mandatory: true,
  squareLabel: '夏季賞与',
};

// ---------------------------------------------------------------------------
// 7/10  労働保険の年度更新（必須・仕訳あり）
// ---------------------------------------------------------------------------

const LABOR_EST = PAYMENTS.laborInsuranceEstimate;

const laborInsurance: Card = {
  id: 'c07_labor_insurance',
  kind: 'DEADLINE',
  title: '労働保険の年度更新を済ませる',
  date: mkDate(3, 10),
  skill: 'labor',
  situation:
    '労働保険（労災保険・雇用保険）の年度更新の申告と納付は、今日7/10までです。' +
    '社長から「今年の保険料はいくらで、いつ、どう払うのか」と聞かれています。前年度の精算と、今年度の概算保険料をまとめて申告します。',
  facts: [
    {
      caption: '年度更新の申告書（ミナト商事）',
      headers: ['項目', '内容'],
      rows: [
        ['加入している保険', '労災保険・雇用保険（両方）'],
        ['前年度の確定保険料と概算保険料の差額（精算）', formatYen(0)],
        ['今年度（令和8年度）の概算保険料（このゲームでは会社負担分の額）', formatYen(LABOR_EST)],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '労働保険の「年度更新」の説明として、正しいものはどれですか。',
      options: [
        '前年度の確定保険料と、今年度の概算保険料を、あわせて申告・納付する手続き',
        '今年度の保険料を、年度が終わる3月末にまとめて申告・納付する手続き',
        '前年度の保険料を、毎月10日に12回に分けて申告・納付する手続き',
        '今年度の概算保険料だけを、法人税と同じように税務署へ申告・納付する手続き',
      ],
      answer: 0,
      hints: ['労働保険料は、年度の初めに概算で払い、翌年度の初めに確定した額で精算します。', '精算と、新しい年度の概算払いを、毎年同じ時期にまとめて行います。'],
      explain:
        '労働保険料は、年度の初めに概算で申告・納付し、翌年度の初めに確定した額で精算します。そのため毎年、前年度の確定保険料と今年度の概算保険料をあわせて申告・納付します。' +
        'これが年度更新で、期間は原則6/1〜7/10です（令和8年度は6/1（月）〜7/10（金））。申告先は労働局・労働基準監督署などで、税務署ではありません。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: `今年度の概算保険料は${formatYen(LABOR_EST)}です。納付の方法として、正しいものはどれですか。`,
      options: [
        '3回に分けて納付できる。第1期は7/10、第2期は10/31、第3期は1/31',
        '概算保険料が20万円以上なので、3回に分けて納付できる',
        '40万円未満なので、分割はできない。7/10に全額をまとめて納付する',
        '希望すれば金額に関係なく分割でき、納付の回数も自由に増やせる',
      ],
      answer: 2,
      hints: [
        '3回に分けて納付できるのは、概算保険料がある金額以上のときだけです。',
        '労災保険と雇用保険の両方に加入している会社の基準は、40万円です。',
      ],
      explain:
        `分割できるかどうかは、概算保険料の額で決まります。40万円以上（労災保険か雇用保険の一方だけが成立している事業では20万円以上）なら、7/10・10/31・翌年1/31の3回に分けて納められます。` +
        `ミナト商事は両方に加入していて、概算保険料は${formatYen(LABOR_EST)}で40万円未満なので、今日7/10に全額を納付します。`,
    },
    {
      id: 'q3',
      type: 'journal',
      prompt: '概算保険料を普通預金から納付する仕訳をしてください。（会社が負担する分として処理します）',
      accounts: ['welfare', 'bank', 'dues', 'insurance', 'wh_social'],
      expected: [[dr('welfare', LABOR_EST), cr('bank', LABOR_EST)]],
      memo: '労働保険料（概算保険料）の納付',
      traps: [
        { account: 'dues', side: 'debit', message: '労働保険料は税金ではなく、公的な保険の保険料です。「租税公課」ではなく「法定福利費」で処理します。' },
        { account: 'insurance', side: 'debit', message: '「保険料」は火災保険など、民間の保険会社に払う保険の科目です。労働保険料は、会社負担の社会保険料と同じ「法定福利費」です。' },
        { account: 'wh_social', side: 'debit', message: '「社会保険料預り金」は、従業員の給与から天引きして預かった分の科目です。会社が負担する分は、費用の「法定福利費」です。' },
      ],
      hints: [
        '会社が負担する社会保険料は、月々「法定福利費」で費用にしています。',
        '労働保険料も同じ仲間です。払うお金は普通預金から出ます。',
        `借方：法定福利費 ${formatYen(LABOR_EST)} ／ 貸方：普通預金 ${formatYen(LABOR_EST)}`,
      ],
      explain:
        '会社が負担する労働保険料は、健康保険料・厚生年金保険料の会社負担分と同じく、人件費の一部として「法定福利費」で処理します。' +
        '実務では、雇用保険料の従業員負担分は給与から天引きして預り金で処理し、その分も含めて納付します。' +
        `ここでは、納付する${formatYen(LABOR_EST)}をすべて会社負担分として扱います。`,
    },
  ],
  penalty: { amount: LATE_COST, reason: '納付が遅れ、延滞金などの負担が発生した' },
  sources: [SRC_MHLW_NENDO, SRC_MHLW_R8],
  mandatory: true,
  squareLabel: '労働保険',
  squareType: 'deadline',
};

// ---------------------------------------------------------------------------
// 7/11  賞与支払届（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

const BONUS_SOCIAL_TOTAL = BONUS.social + BONUS.employerSocial;

const bonusNotice: Card = {
  id: 'c07_bonus_notice',
  kind: 'DEADLINE',
  title: '賞与支払届を出す',
  date: mkDate(3, 11),
  skill: 'labor',
  situation:
    '夏季賞与を7/10（金）に支給しました。総務の担当者から「賞与にも社会保険料がかかると聞きました。どんな書類を、いつまでに出すのですか」と聞かれています。',
  facts: [
    {
      caption: '夏季賞与の支給状況',
      headers: ['項目', '内容'],
      rows: [
        ['賞与の支給日', '7月10日（金）'],
        ['対象', `全従業員 ${COMPANY.employees}名`],
        ['賞与の総支給額（合計）', formatYen(BONUS.gross)],
        ['年間の賞与の回数', '年2回（夏・冬）'],
        ['社会保険料（従業員負担分・天引き済み）', formatYen(BONUS.social)],
        ['社会保険料（会社負担分）', formatYen(BONUS.employerSocial)],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '賞与支払届は「賞与を支給した日から5日以内」に出します。7/10（金）に支給した場合、提出期限はいつになりますか。',
      options: [
        '7月14日（火）：7/10 を1日目として数える',
        '7月15日（水）：支給日の翌日（7/11）を1日目として数える',
        '7月31日（金）：支給した月の末日',
        '8月10日（月）：支給した月の翌月10日',
      ],
      answer: 1,
      partial: [0],
      hints: [
        '期間を数えるときは、原則として初日（ここでは支給日）を入れません。',
        '7/10 の翌日、7/11 が1日目です。',
      ],
      explain:
        '賞与を支給したら、支給日から5日以内に「被保険者賞与支払届」を日本年金機構へ出します。期間の数え方の原則では初日は算入しないので、' +
        '支給日の翌日（7/11）が1日目、5日目の7/15（水）が期限です。7/14 と数えて出しても間に合うので、迷ったら早めに出すのが安全です。' +
        '7/31 や 8/10 のような、月末・翌月10日の期限と混同しないようにしましょう。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '賞与を支払ったときの社会保険の手続きとして、正しいものはどれですか。',
      options: [
        '賞与には社会保険料がかからないので、日本年金機構への届出は要らない',
        '賞与も4〜6月の報酬に含めて、7/10の算定基礎届でまとめて届け出る',
        '賞与の額を税務署へ届け出て、保険料は源泉所得税といっしょに納める',
        '賞与の額を「賞与支払届」で日本年金機構へ届け出て、保険料は翌月末に、毎月分と合わせて納める',
      ],
      answer: 3,
      hints: ['賞与にも、健康保険料と厚生年金保険料がかかります。', '届出先は、算定基礎届と同じ社会保険の窓口です。'],
      explain:
        '賞与にも健康保険・厚生年金保険の保険料がかかるので、支給のたびに賞与支払届で日本年金機構へ届け出ます。保険料は、賞与を支払った月の翌月末までに、毎月の保険料と合算して納めます。' +
        '年3回以下の賞与は「賞与」として扱い、算定基礎届の報酬には含めません。',
    },
    {
      id: 'q3',
      type: 'number',
      prompt: '賞与にかかる社会保険料は、翌月末（8/31）に毎月分と合わせて納めます。賞与分の保険料（従業員負担分と会社負担分の合計）はいくらですか。',
      unit: 'yen',
      answer: BONUS_SOCIAL_TOTAL,
      hints: ['納めるのは、従業員から天引きした分と、会社が負担する分の両方です。'],
      explain:
        `従業員負担分 ${formatYen(BONUS.social)}（賞与から天引き済み）＋ 会社負担分 ${formatYen(BONUS.employerSocial)} ＝ ${formatYen(BONUS_SOCIAL_TOTAL)}。` +
        '8/31 の社会保険料の納付には、毎月分にこの賞与分が加わります。',
    },
  ],
  sources: [SRC_JPS_BONUS, SRC_KOUNEN_RULE, SRC_MINPO],
  mandatory: false,
  squareLabel: '賞与支払届',
};

// ---------------------------------------------------------------------------
// 7/28  固定資産税 第2期（必須・仕訳あり）
// ---------------------------------------------------------------------------

const FA_INSTALLMENT = PAYMENTS.fixedAssetTaxInstallment;
const FA_ANNUAL = FA_INSTALLMENT * 4;
/** 固定資産税の標準税率（地方税法第350条）。表示は %、計算は小数。 */
const FA_RATE_PCT = 1.4;
const FA_RATE = FA_RATE_PCT / 100;
const FA_BASE = Math.round(FA_ANNUAL / FA_RATE);

const fixedAssetTax2: Card = {
  id: 'c07_fixed_asset_tax_2',
  kind: 'DEADLINE',
  title: '固定資産税（第2期）を納める',
  date: mkDate(3, 28),
  skill: 'tax',
  situation:
    '市役所から届いた納税通知書の第2期の納期限が近づいています。総務の担当者が「備品にかかる固定資産税（償却資産）です。今回の金額と、帳簿の科目を教えてください」と言っています。',
  facts: [
    {
      caption: '固定資産税（償却資産）の納税通知書（令和8年度）',
      headers: ['項目', '内容'],
      rows: [
        ['課税標準額', formatYen(FA_BASE)],
        ['税率', `${FA_RATE_PCT}%（標準税率）`],
        ['年税額', formatYen(FA_ANNUAL)],
        ['納期', '年4期（第1期は4/28に納付済み）'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'number',
      prompt: '年税額を4期に分けて納めます。第2期の納付額はいくらですか。',
      unit: 'yen',
      answer: FA_INSTALLMENT,
      hints: [`年税額は ${formatYen(FA_ANNUAL)} です。`, '4期に同じ額で分けます。'],
      explain: `${formatYen(FA_BASE)} × ${FA_RATE_PCT}% ＝ ${formatYen(FA_ANNUAL)}（年税額）。これを4期に分けるので、${formatYen(FA_ANNUAL)} ÷ 4 ＝ ${formatYen(FA_INSTALLMENT)} が1期ぶんです。`,
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '固定資産税の納め方について、正しいものはどれですか。',
      options: [
        '市町村が税額を計算して納税通知書を送る。納期は年4期で、自治体の条例で決まるので、通知書で確認する',
        '国税なので、法人税や消費税と同じように、自分で税額を計算して税務署に申告して納める',
        '自分で税額を計算して、事業年度が終わる3月末までに、1年分を一括で納める',
        '納期は全国共通で、4/30・7/31・12/28・2/28の年4回と、法律で決まっている',
      ],
      answer: 0,
      hints: ['固定資産税は、国ではなく市町村（東京23区は都）が課す税金です。', '納期は法律で「標準」が決められ、実際の日付は自治体ごとに決まります。'],
      explain:
        '固定資産税は市町村が課す地方税で、税額は市町村が計算し、納税通知書で知らせます（自分で申告して計算する法人税や消費税とは違います）。' +
        '地方税法では、納期は4月・7月・12月・2月中で市町村の条例で定めるとされています（特別な事情があれば別の納期にもできます）。' +
        '実際の納期限は自治体ごとに違うので、納税通知書で必ず確認しましょう。',
    },
    {
      id: 'q3',
      type: 'journal',
      prompt: '固定資産税（第2期）を普通預金から納付する仕訳をしてください。',
      accounts: ['dues', 'bank', 'corp_tax', 'payable', 'prepaid', 'misc'],
      expected: [[dr('dues', FA_INSTALLMENT), cr('bank', FA_INSTALLMENT)]],
      memo: '固定資産税（償却資産）第2期の納付',
      traps: [
        { account: 'corp_tax', side: 'debit', message: '「法人税等」は法人税・住民税・事業税（利益にかかる税金）の科目です。固定資産税は「租税公課」です。' },
        { account: 'payable', side: 'debit', message: '第1期（4/28）と同じく、この会社は納付するときに費用にします。未払金を先に立てる処理はしていません。' },
        { account: 'prepaid', side: 'debit', message: '税金は前払いした費用ではありません。納付したときに「租税公課」で費用にします。' },
      ],
      hints: [
        '法人税等（利益にかかる税金）以外の税金は、「租税公課」に入れます。',
        `借方：租税公課 ${formatYen(FA_INSTALLMENT)} ／ 貸方：普通預金 ${formatYen(FA_INSTALLMENT)}`,
      ],
      explain:
        '固定資産税は、利益にかかる税金（法人税・住民税・事業税）ではないので、「法人税等」ではなく「租税公課」で費用にします。' +
        '納付した分がそのまま費用で、預金が減るので貸方は普通預金です。',
    },
  ],
  sources: [SRC_LOCALTAX],
  mandatory: true,
  squareLabel: '固定資産税',
  squareType: 'deadline',
};

// ---------------------------------------------------------------------------
// 8/1  火災保険の年払い（必須・仕訳あり）
// ---------------------------------------------------------------------------

const insuranceAnnual: Card = {
  id: 'c08_insurance_annual',
  kind: 'JOURNAL',
  title: '火災保険料の年払いを処理する',
  date: mkDate(4, 1),
  skill: 'bookkeeping',
  situation:
    `今日は火災保険の更新日です。保険会社から届いた請求書のとおり、1年分の保険料 ${formatYen(PAYMENTS.insuranceAnnual)} を普通預金から払いました。` +
    'この支払いを、帳簿にどう入れるでしょう。',
  facts: [
    {
      caption: '火災保険の請求書',
      headers: ['項目', '内容'],
      rows: [
        ['保険の種類', '火災保険（事務所・倉庫）'],
        ['保険期間', '8/1 〜 翌年7/31（12か月）'],
        ['保険料（1年分・年払い）', formatYen(PAYMENTS.insuranceAnnual)],
        ['消費税', '非課税'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'journal',
      prompt: '火災保険料の年払いを仕訳してください。',
      accounts: ['prepaid', 'bank', 'insurance', 'payable', 'input_tax', 'accrued'],
      expected: [[dr('prepaid', PAYMENTS.insuranceAnnual), cr('bank', PAYMENTS.insuranceAnnual)]],
      memo: '火災保険料の年払い',
      traps: [
        {
          account: 'insurance',
          side: 'debit',
          message: '払ったときに全額を保険料（費用）にすると、来期にあたる翌年4〜7月の分まで今期の費用になってしまいます。まだ補償を受けていない分は「前払費用」（資産）にして、月がたつごとに費用へ移します。',
        },
        { account: 'input_tax', side: 'debit', message: '保険料は消費税が非課税です。仮払消費税は発生しません。' },
        { account: 'payable', side: 'credit', message: '未払金は「まだ払っていない」ときの科目です。今回は普通預金から払っているので、貸方は普通預金です。' },
      ],
      hints: [
        '払ったのは、これから1年間の補償に対する保険料です。まだ受けていない分は、資産として扱います。',
        '来期にあたる分まで、今期の費用にはしません。資産の科目は「前払費用」です。',
        `借方：前払費用 ${formatYen(PAYMENTS.insuranceAnnual)} ／ 貸方：普通預金 ${formatYen(PAYMENTS.insuranceAnnual)}`,
      ],
      explain:
        '保険料は、これから1年間の補償に対する支払いです。払った日に全額を費用にすると、来期の分まで今期の費用にしてしまいます。' +
        `そこで、いったん全額を「前払費用」（資産）にして、月次決算で毎月 ${formatYen(PAYMENTS.insuranceAnnual)} ÷ 12か月 ＝ ${formatYen(MONTHLY.insurance)} を「保険料」（費用）へ移していきます。` +
        '実務では、支払時に当期分だけを費用にして、翌期分を前払費用にする方法もありますが、この会社は毎月費用にする方法です。' +
        '保険料は消費税が非課税なので、仮払消費税はありません。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '3/31（決算日）の時点で、この保険料のうち前払費用として残る額はいくらですか。（保険期間は8/1〜翌年7/31。月割で考えます）',
      unit: 'yen',
      answer: MONTHLY.insurance * 4,
      hints: [
        `1か月あたりの保険料は ${formatYen(PAYMENTS.insuranceAnnual)} ÷ 12 ＝ ${formatYen(MONTHLY.insurance)} です。`,
        '決算日までに使った月は、8月〜3月の8か月です。',
        '保険期間のうち、来期にあたるのは4月〜7月の4か月分です。',
      ],
      explain:
        `8/1〜3/31 の8か月分（${formatYen(MONTHLY.insurance * 8)}）は今期の費用、4/1〜7/31 の4か月分（${formatYen(MONTHLY.insurance * 4)}）は来期の費用です。` +
        'この4か月分が、前払費用として貸借対照表に残ります。',
    },
  ],
  sources: [SRC_NTA_6201, SRC_MF_PREPAID],
  mandatory: true,
  squareLabel: '火災保険',
};

// ---------------------------------------------------------------------------
// 8/8  夏季休暇の前の支払段取り（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

/** 8/25 に仕入先へ払う 7月分の仕入（税込）。 */
const AUG_AP = withTax(purchasesOf(MONTHLY_SALES[3] ?? 0));
/** 8/31 に納める社会保険料。7月に賞与を払ったので、賞与分が加わる。 */
const AUG_SOCIAL = MONTHLY.payroll.socialEmployee + MONTHLY.socialEmployer + BONUS.social + BONUS.employerSocial;

const paymentSchedule: Card = {
  id: 'c08_payment_schedule',
  kind: 'DECISION',
  title: '夏季休暇の前に、支払の段取りを決める',
  date: mkDate(4, 8),
  skill: 'audit',
  situation:
    '8/10（月）から8/21（金）まで、社長が夏季休暇と海外出張で不在になります。振込は「経理が作成し、社長がネットバンキングで承認する」決まりで、社長が承認できるのは8/24（月）以降です。' +
    '8/25（火）の支払に向けて、休暇の前に段取りを決めましょう。',
  facts: [
    {
      caption: '8月の主な支払予定（税込）',
      headers: ['日付', '内容', '金額（円）'],
      rows: [
        ['8/25', '仕入先への支払（7月分の仕入）', AUG_AP],
        ['8/25', '給与の支払（手取り）', MONTHLY.payroll.net],
        ['8/27', '家賃の支払', withTax(MONTHLY.rent)],
        ['8/31', '社会保険料の納付（賞与分を含む）', AUG_SOCIAL],
      ],
      numericColumns: [2],
    },
    {
      caption: '承認まわりの状況',
      headers: ['項目', '内容'],
      rows: [
        ['社長の承認', '8/10〜8/21 は不在。承認できるのは 8/24（月）から'],
        ['支払の期日', '8/25（火）'],
        ['7月分の請求書', 'まだ届いていない取引先が2社ある'],
        ['銀行の振込受付', '振込データの受付には締切がある（時刻・日数は銀行ごとに違う）'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '支払処理の進め方として、もっとも適切なものはどれですか。',
      options: [
        '休暇明けの8/24にまとめて処理する。請求書の照合、振込データの作成、承認を1日で行えば、8/25の支払に間に合うので、休暇の前は他の仕事を優先する',
        '休暇の前に、届いた請求書を照合して支払予定表と振込データを作り、承認をもらって8/25の振込指定日で予約する。未着の2社は早めに催促し、間に合わない分は社長に相談しておく',
        '社長とは連絡が取りにくいので、承認者の代わりに、経理担当が社長のIDでネットバンキングにログインして、承認まで進めておく',
        '承認をもらうのは休暇明けになるので、それより前に振込データを銀行へ送って予約だけしておき、社長には休暇明けに事後報告する',
      ],
      answer: 1,
      hints: [
        '「作る人」と「承認する人」を分ける決まりは、守ったまま段取りを組みます。',
        '承認できる日から支払期日までが1営業日しかありません。手戻りが出たら間に合わなくなります。',
        '承認者がいるうちに、できる作業を前倒しで進めます。',
      ],
      explain:
        '支払は「作成する人」と「承認する人」を分けるのが基本です（内部統制）。承認できる日と支払期日の間が1日しかないと、請求書の不備や金額の修正が出たときに、作り直しと再承認ができず、銀行の受付締切にも間に合いません。' +
        '休暇の前に、①請求書をそろえて照合し、②振込データを作って承認をもらい、振込指定日で予約し、③そろわない分は代理の承認者や連絡方法を決めておきます。' +
        '経理の遅れの主因は、請求書の受領など経理の外の前工程にあるという調査（請求ABC）もあるので、早めの催促が大切です。' +
        'IDの借用や、承認前の実行は、誰が承認したのかがわからなくなり、誤りや不正を止める仕組みがなくなるので、してはいけません。',
    },
    {
      id: 'q2',
      type: 'multi',
      prompt: '承認者が不在でも、手戻りなく支払を進めるために、休暇の前にやっておくとよいことを、すべて選んでください。',
      options: [
        '8月の支払予定（金額・期日）を一覧にして、社長と共有する',
        '7月分の請求書がそろっているか確認し、届いていない取引先へ連絡する',
        '社長が不在の間だけ、承認者のIDとパスワードを経理担当に教えてもらう',
        '緊急のときに備えて、承認できる代理の人と連絡方法を決めておく',
      ],
      answer: [0, 1, 3],
      hints: ['承認の権限を、作成する人に渡してはいけません。', '早めに共有・確認しておくと、休暇中に判断が必要になる場面が減ります。'],
      explain:
        '支払予定の共有、請求書のそろい具合の確認、代理の承認者と連絡方法の取り決めは、どれも手戻りと不在中のトラブルを減らします。' +
        'IDとパスワードを貸し借りすると、作成する人が承認までできてしまい、内部統制の意味がなくなります。承認の権限は、貸さずに、代理の人を決めて対応します。',
    },
  ],
  sources: [SRC_INVOICE],
  mandatory: false,
  squareLabel: '支払段取り',
};

// ---------------------------------------------------------------------------
// 8/20  4〜8月の予実差異分析（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

const BUDGET_MONTHS = [0, 1, 2, 3, 4] as const;
const budgetMonthLabel = (p: number): string => (p === 4 ? '8月（営業部の見込み）' : `${p + 4}月`);
const salesOf = (p: number): number => MONTHLY_SALES[p] ?? 0;
const budgetOf = (p: number): number => MONTHLY_SALES_BUDGET[p] ?? 0;
const BUDGET_ACTUAL = BUDGET_MONTHS.reduce<number>((s, p) => s + salesOf(p), 0);
const BUDGET_PLAN = BUDGET_MONTHS.reduce<number>((s, p) => s + budgetOf(p), 0);
const BUDGET_DIFF = BUDGET_ACTUAL - BUDGET_PLAN;
const BUDGET_DIFFS = BUDGET_MONTHS.map((p) => salesOf(p) - budgetOf(p));
const BUDGET_BELOW = BUDGET_DIFFS.filter((d) => d < 0).length;
const BUDGET_WORST = BUDGET_MONTHS.reduce<number>((w, p) => (salesOf(p) - budgetOf(p) < salesOf(w) - budgetOf(w) ? p : w), 0);
const BUDGET_WORST_DIFF = Math.abs(salesOf(BUDGET_WORST) - budgetOf(BUDGET_WORST));
const BUDGET_RATE = Math.round((BUDGET_ACTUAL / BUDGET_PLAN) * 1000) / 10;
const BUDGET_SHORT = Math.round((1 - BUDGET_ACTUAL / BUDGET_PLAN) * 1000) / 10;

const budgetVariance: Card = {
  id: 'c08_budget_variance',
  kind: 'REPORT',
  title: '4〜8月の売上を予算と比べる',
  date: mkDate(4, 20),
  skill: 'audit',
  situation:
    '社長から「8月の月次報告を待たずに、いま4〜8月の売上が予算に対してどうなっているか、ざっくり教えてほしい」と頼まれました。' +
    '8月は月末まで日があるので、営業部の月末見込みを使って、予算との差を整理しましょう。',
  facts: [
    {
      caption: '売上高（税抜）の実績と予算',
      headers: ['月', '実績（円）', '予算（円）', '差（実績−予算）'],
      rows: BUDGET_MONTHS.map((p) => [budgetMonthLabel(p), salesOf(p), budgetOf(p), salesOf(p) - budgetOf(p)]),
      numericColumns: [1, 2, 3],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'number',
      prompt: '4〜8月の累計で、売上は予算より何円多い（少ない）ですか。（実績 − 予算。予算に届かないときはマイナスで入力します）',
      unit: 'yen',
      answer: BUDGET_DIFF,
      hints: [
        '月ごとの「差」の列を、5か月ぶん足します。',
        `マイナスの月とプラスの月があります。${BUDGET_DIFFS.map((d) => (d > 0 ? `＋${d.toLocaleString('ja-JP')}` : d.toLocaleString('ja-JP'))).join('、')} を合計します。`,
      ],
      explain:
        `月ごとの差を合計すると ${formatYen(BUDGET_DIFF)} です。検算すると、実績の合計 ${formatYen(BUDGET_ACTUAL)} − 予算の合計 ${formatYen(BUDGET_PLAN)} ＝ ${formatYen(BUDGET_DIFF)} で、同じになります。` +
        'マイナス（△）は、予算に届いていないことを表します。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '4〜8月の累計の予算達成率（実績 ÷ 予算）は何%ですか。小数第2位を四捨五入して、小数第1位まで答えてください。',
      unit: 'percent',
      answer: BUDGET_RATE,
      tolerance: 0.01,
      hints: ['実績の合計を、予算の合計で割ります。', `${formatYen(BUDGET_ACTUAL)} ÷ ${formatYen(BUDGET_PLAN)} を100倍します。`],
      explain: `${formatYen(BUDGET_ACTUAL)} ÷ ${formatYen(BUDGET_PLAN)} ＝ ${(BUDGET_ACTUAL / BUDGET_PLAN).toFixed(5)}…、つまり ${BUDGET_RATE}%。予算に対して ${BUDGET_SHORT}% 届いていません。`,
    },
    {
      id: 'q3',
      type: 'choice',
      prompt: '社長への報告として、もっとも適切なものはどれですか。',
      options: [
        `予算より少ないという数字だけを伝えます。差は${BUDGET_SHORT}%と小さいので、原因は調べず、今後の見通しや対策の話も、月次報告のときまで出しません。`,
        '景気が悪いことが原因です。予算を達成できないので、下期の予算を実績に合わせて引き下げるよう、社長に提案し、営業部にも伝えます。',
        `4〜8月の売上は予算より${formatYen(Math.abs(BUDGET_DIFF))}（${BUDGET_SHORT}%）少ない見込みです。5か月のうち${BUDGET_BELOW}か月が未達で、${BUDGET_WORST + 4}月の差が最大です。内訳（得意先別・商品別）を営業部と確認し、原因と対策を報告します。`,
        `4〜8月の売上は予算を${formatYen(Math.abs(BUDGET_DIFF))}上回っています。このまま好調が続くと見込まれるので、下期の予算を引き上げるよう、社長に提案します。`,
      ],
      answer: 2,
      partial: [0],
      hints: [
        '差の向き（予算より多いか少ないか）と大きさを、表の数字のとおりに伝えます。',
        '原因は、確かめてから伝えます。決めつけないようにしましょう。',
        '報告は「数字 → 傾向 → 原因の確認 → 次の一手」の順にまとめます。',
      ],
      explain:
        '予実差異の報告は、①差の向きと大きさ（実績−予算）、②傾向（何か月が未達か、どの月の差が大きいか）、③原因は事実で確かめる（得意先別・商品別・数量×単価に分けて見る）、④次の一手（対策と見通し）の順に伝えます。' +
        '景気などの原因を確かめずに決めつけたり、予算を実績に合わせて書き換えたりするのは経理の役割ではありません。予算の見直しは、社長が経営判断として決めます。' +
        `差が小さくても、多くの月で未達という傾向は、早めに共有します。この表では、${BUDGET_WORST + 4}月の ${formatYen(BUDGET_WORST_DIFF)} の未達が最大です。`,
    },
  ],
  sources: [SRC_MF_CLOSE],
  mandatory: false,
  squareLabel: '予実分析',
};

// ---------------------------------------------------------------------------
// 9/12  得意先の入金遅れ（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

/** 入金が遅れている請求（税抜）と、来週見込まれる追加注文（税抜）。架空の得意先の設定。 */
const LATE_INVOICE_NET = 600_000;
const LATE_ORDER_NET = 300_000;

const latePayment: Card = {
  id: 'c09_late_payment',
  kind: 'CHANCE',
  title: '得意先の入金が遅れている',
  date: mkDate(5, 12),
  skill: 'cash',
  situation:
    '営業の三浦さんから相談です。「ハヤシ文具店さんの7月分の代金が、期日の8/31を過ぎても入金されていません。先方は『今月中には払う』と言っていますが、来週また注文が入りそうです」。' +
    '経理として、どう動きますか。',
  facts: [
    {
      caption: '売掛金の明細（ハヤシ文具店）',
      headers: ['項目', '内容'],
      rows: [
        ['対象', '7月分の納品（請求日 7/31）'],
        ['請求額（税込）', formatYen(withTax(LATE_INVOICE_NET))],
        ['支払期日', '8月31日'],
        ['入金状況（9/12 時点）', '未入金（期日から12日が経過）'],
        ['取引の状況', '取引開始から3年。これまで遅れたことはない'],
        ['追加の注文の見込み', `来週、${formatYen(withTax(LATE_ORDER_NET))}（税込）`],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '最初にとる対応として、もっとも適切なものはどれですか。',
      options: [
        '通帳の入金記録と請求書・納品書の控えを見て、こちらの請求や消込みに誤りがないか確かめる。そのうえで先方の経理担当に入金予定日を確認する',
        '期日を過ぎたので、すぐに取引をやめて、この売掛金を貸倒損失として費用に計上する。先方への連絡は、営業の三浦さんにやめてもらう',
        '先方が「今月中に払う」と言っているので、催促すると関係が悪くなるおそれがある。月末になるまでは、通帳も請求書も確認せずに待つ',
        '売掛金の管理は営業の仕事なので、経理は通帳の入金も請求書の控えも確認せず、三浦さんが先方とやり取りした結果だけを待つ',
      ],
      answer: 0,
      hints: ['先方に連絡する前に、自社の側で確かめられることがあります。', '請求書の金額や宛先の間違い、入金の消込み漏れが、遅れに見える原因のこともあります。'],
      explain:
        '入金が遅れたときは、まず自社側の確認からです。請求書の金額や宛先の誤り、入金の消込み漏れ（別名義での振込や、複数の請求をまとめて払われたときなど）が原因のこともあります。' +
        'そのうえで、先方の経理担当に入金予定日を確認し、やり取りは記録に残します。営業と経理で情報を共有しながら動くのが基本です。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: `来週、ハヤシ文具店から${formatYen(withTax(LATE_ORDER_NET))}（税込）の追加注文が入りそうです。掛けでの出荷について、適切な対応はどれですか。`,
      options: [
        '取引は3年と長く、これまで遅れたことはないので、今回もこれまでどおり掛けで出荷する',
        '入金があるまでは、追加の注文を断る。ただし、先方には何も連絡せず、入金を待つ',
        '出荷を先に済ませ、今回の代金は、遅れている分といっしょに次の請求書でまとめて請求する',
        '入金の見通しがつくまで掛けの出荷を控えるか、前払い・現金払いに条件を変えるか、社長・営業と相談して決める',
      ],
      answer: 3,
      hints: ['取引先ごとに、掛けで売ってよい上限や支払条件を決めておく考え方を、与信管理といいます。'],
      explain:
        '取引先ごとに、掛けで売ってよい上限（与信限度額）や支払条件を決めておくのが与信管理です。' +
        '遅れが出た取引先には、未回収の額が増えないように、出荷を待つ、前払い・現金払いにする、限度額を下げるなど、条件を見直します。取引の長さだけで判断しないことが大切です。' +
        'ただし、取引を続けるかどうかは営業上の判断でもあるので、経理だけで決めず、社長・営業と相談します。',
    },
    {
      id: 'q3',
      type: 'choice',
      prompt: '今の状態（期日から12日遅れ、先方は「今月中に払う」と言っている）で、この売掛金を貸倒損失にできますか。',
      options: [
        'できる。期日を過ぎた売掛金は、遅れた日からすぐに貸倒損失として費用にできる',
        'まだできない。回収を続ける。貸倒損失にできるのは、回収できないことが明らかな場合など、限られる',
        'できる。期日から1か月以上たった売掛金は、自動的に貸倒損失として扱われる',
        'まだできない。期末にこの売掛金だけ貸倒引当金を設定するので、回収は続けなくてよい',
      ],
      answer: 1,
      hints: ['貸倒れとして費用にできるのは、回収をあきらめざるを得ない状況が、はっきりしているときです。', '数日の遅れだけでは、その状況にはあたりません。'],
      explain:
        '国税庁の説明では、売掛金などを貸倒損失にできるのは、債権が法的に切り捨てられた場合、債務者の資産状況や支払能力から全額が回収できないことが明らかになった場合、' +
        '売掛債権で取引停止後1年以上たった場合などに限られます（担保がある場合の扱いなど、条件もあります）。入金が少し遅れただけでは、あてはまりません。' +
        '決算では、売掛金全体に対して貸倒引当金を見積もって備えますが（3月末の決算整理）、これは回収をあきらめることとは別です。判断に迷うときは、税理士の先生に相談しましょう。',
    },
  ],
  sources: [SRC_NTA_5320],
  mandatory: false,
  squareLabel: '入金遅れ',
};

// ---------------------------------------------------------------------------
// 9/20  半期の資金繰り確認（追加・帳簿には入れない）
// ---------------------------------------------------------------------------

const INTERIM_CT = consumptionTaxInterim();
const INTERIM_CORP = corporateTaxInterim();
const INTERIM_TOTAL = INTERIM_CT.total + INTERIM_CORP;

/** 動的カード：いまの現預金は帳簿から読む（日付・種別・ラベルは帳簿に依存しない）。 */
const cashflowReview = (ctx: CardContext): Card => ({
  id: 'c09_cashflow_review',
  kind: 'DECISION',
  title: '11月の中間納付に備えて資金繰りを見る',
  date: mkDate(5, 20),
  skill: 'cash',
  situation:
    '半期（4〜9月）が終わろうとしています。社長から「11月末に、法人税等と消費税の中間納付があると聞いた。お金は足りるのか、今のうちにやることを整理してほしい」と頼まれました。',
  facts: [
    {
      caption: '11/30 に納める中間納付（見込み）の計算のもと',
      headers: ['項目', '計算のもと'],
      rows: [
        ['法人税等', `前期の年税額 ${formatYen(PAYMENTS.priorCorporateTaxTotal)} の 1/2`],
        ['消費税（国税）', `前期の確定税額 ${formatYen(PAYMENTS.priorConsumptionTaxNational)} の 6/12`],
        ['地方消費税', '上の消費税（国税）の 22/78'],
      ],
    },
    {
      caption: '帳簿の現預金（現金＋普通預金）',
      headers: ['時点', '金額（円）'],
      rows: [['9/20', cashOnHand(ctx.book, ctx.date)]],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'number',
      prompt: '11/30 に納める中間納付の合計（法人税等・消費税・地方消費税）はいくらですか。',
      unit: 'yen',
      answer: INTERIM_TOTAL,
      hints: ['表の「計算のもと」から、3つの金額をそれぞれ出して、足します。', '消費税（国税）を出してから、その22/78が地方消費税です。'],
      explain:
        `法人税等は ${formatYen(PAYMENTS.priorCorporateTaxTotal)} ÷ 2 ＝ ${formatYen(INTERIM_CORP)}。消費税（国税）は ${formatYen(PAYMENTS.priorConsumptionTaxNational)} × 6/12 ＝ ${formatYen(INTERIM_CT.national)}、` +
        `地方消費税は ${formatYen(INTERIM_CT.national)} × 22/78 ＝ ${formatYen(INTERIM_CT.local)}。合計は ${formatYen(INTERIM_CORP)} ＋ ${formatYen(INTERIM_CT.national)} ＋ ${formatYen(INTERIM_CT.local)} ＝ ${formatYen(INTERIM_TOTAL)} です。` +
        '前期の確定消費税額（国税）が48万円超〜400万円以下の会社は、中間申告が年1回で、前期の確定税額の6/12を納めます（3月決算なら11/30が期限）。' +
        'ここでは、法人税・住民税・事業税をまとめて「法人税等」とし、前期の年税額の1/2として扱っています。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: `11/30 に合計 ${formatYen(INTERIM_TOTAL)} の納付があります。いまの時点でとる対応として、もっとも適切なものはどれですか。`,
      options: [
        '帳簿の現預金が納付額より多いので、特に準備はしない。足りなくなったら、そのときに銀行へ相談すればよい',
        '中間納付は決算で精算される仕組みなので、11月の納付は見送って、5月の決算の納付のときにまとめて納める',
        '資金繰り表に11/30の納付を入れて、10〜11月の残高が足りるかを確認する。足りなそうなら、早めに社長へ報告し、銀行にも相談する',
        '納付のお金をつくるために、9〜11月の仕入先への支払を少しずつ遅らせて、手元の現預金を増やしておく',
      ],
      answer: 2,
      hints: [
        '資金繰りは「今の残高」だけでなく、「これから入るお金と出ていくお金の時期」で見ます。',
        '納付の期限は決まっています。期限までに足りなくなりそうなら、早めに動く必要があります。',
      ],
      explain:
        '資金繰りは、今の残高だけでなく、月ごとの入金（売掛金の回収）と出金（仕入先・給与・家賃・社会保険料など）の時期を並べて、残高が足りるかを見ます。' +
        '11/30 の納付のような大きな支出を先に予定表へ入れておけば、不足しそうなときに、社長への報告や銀行への相談を早めにできます。' +
        '法人税の中間申告は、納付すべき税額があるときは、提出期限までに納付が必要です（申告書を出さなくても、前年度の実績による中間申告があったものとみなされます）。決算まで見送ることはできません。' +
        '仕入先への支払を遅らせると、取引先からの信用を失うおそれがあるので、避けます。',
    },
  ],
  sources: [SRC_NTA_6609, SRC_NTA_HOJIN],
  mandatory: false,
  squareLabel: '資金繰り',
});

// ---------------------------------------------------------------------------
// 一覧（同じ日付のカードは、この並び順でマスになる）
// ---------------------------------------------------------------------------

export const cards: CardDef[] = [
  teijiKettei,
  withholding1,
  bonusSummer,
  laborInsurance,
  bonusNotice,
  fixedAssetTax2,
  insuranceAnnual,
  paymentSchedule,
  budgetVariance,
  latePayment,
  cashflowReview,
];
