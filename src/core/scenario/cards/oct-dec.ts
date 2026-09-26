import { cr, dr } from '../../accounting';
import type { Card, CardDef, SourceRef } from '../../tasks/types';
import { formatDate, formatDateWithWeekday, formatYen, mkDate, weekdayOf, type GameDate } from '../../types';
import { BONUS, MONTHLY, PAYMENTS, consumptionTaxInterim, corporateTaxInterim } from '../company';

/**
 * 10〜12月のカード（12 枚）。
 * 必須（帳簿に仕訳を入れる）：c11_interim_corporate_tax / c11_interim_consumption_tax / c12_resident_tax_2 /
 *   c12_bonus_winter / c12_year_end_adjustment / c12_fixed_asset_tax_3
 * 追加（帳簿に仕訳を入れない）：c10_nencho_docs / c10_invoice_ledger / c11_nencho_check / c11_interim_calc /
 *   c12_nencho_calc / c12_year_end_payments
 * 数字は company.ts の定数から作る。
 */

const AS_OF = '2026-09-26';

const src = (label: string, url: string, verified: SourceRef['verified'] = 'primary'): SourceRef => ({
  label,
  url,
  asOf: AS_OF,
  verified,
});

// --- 一次情報（国税庁・法令・日本年金機構・自治体）で本文を確認したもの ---
const SRC_NTA_6609 = src(
  '国税庁 タックスアンサー No.6609 中間申告の方法（消費税）',
  'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm',
);
const SRC_NTA_HOJIN = src(
  '国税庁 法人税のあらましと申告の手引（令和7年10月）「中間申告」',
  'https://www.nta.go.jp/publication/pamph/hojin/aramashi2025/pdf/01.pdf',
);
const SRC_NTA_HOJIN_YOTEI = src(
  '国税庁 前事業年度の確定分法人税額が20万円を超える場合の予定申告（お知らせ）',
  'https://www.nta.go.jp/taxes/nozei/oshirase/pdf/01.pdf',
);
const SRC_NTA_NENCHO = src(
  '国税庁 令和7年分 年末調整のしかた（令和8年分は公表後に要確認）',
  'https://www.nta.go.jp/publication/pamph/gensen/nencho2025/01.htm',
);
const SRC_NTA_2662 = src(
  '国税庁 タックスアンサー No.2662 年末調整のしかた',
  'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2662.htm',
);
const SRC_NTA_2675 = src(
  '国税庁 タックスアンサー No.2675 年末調整の過不足額の精算',
  'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2675.htm',
);
const SRC_NTA_2505 = src(
  '国税庁 タックスアンサー No.2505 源泉所得税の納期の特例',
  'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm',
);
const SRC_INCOME_TAX_ACT = src(
  '所得税法 第85条（扶養親族等の判定）e-Gov法令検索',
  'https://laws.e-gov.go.jp/law/340AC0000000033',
);
const SRC_NPS_BONUS = src(
  '日本年金機構 従業員に賞与を支給したときの手続き',
  'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20141203.html',
);
const SRC_LOCAL_TAX_ACT = src(
  '地方税法 第321条の5の2（特別徴収税額の納期の特例）・第362条（固定資産税の納期）e-Gov法令検索',
  'https://laws.e-gov.go.jp/law/325AC0000000226',
);
const SRC_SAITAMA = src(
  'さいたま市 個人住民税 特別徴収税額の納期の特例について',
  'https://www.city.saitama.lg.jp/005/004/012/001/p002773.html',
);
const SRC_TOKYO_FIXED = src(
  '東京都主税局 令和8年度固定資産税・都市計画税納税通知書の発送（納期限）',
  'https://www.tax.metro.tokyo.lg.jp/information/update/r8/06/20260601',
);
const SRC_INVOICE_BASIC = src(
  '国税庁 インボイス制度 ～基礎編～（令和8年5月）',
  'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/0023011-048_02.pdf',
);
const SRC_INVOICE_QA = src(
  '国税庁 インボイス制度に関するQ&A 問113・問113-3（免税事業者等からの仕入れに係る経過措置。令和8年4月）',
  'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/01-15.pdf',
);
const SRC_INVOICE_KOHYO = src(
  '国税庁 適格請求書発行事業者公表サイト',
  'https://www.invoice-kohyo.nta.go.jp/',
);
const SRC_DENCHO = src(
  '国税庁 電子帳簿保存法一問一答【電子取引関係】（令和7年6月）',
  'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/pdf/03-6.pdf',
);
const SRC_BANK_ACT = src(
  '銀行法 第15条・銀行法施行令 第5条（銀行の休日）e-Gov法令検索',
  'https://laws.e-gov.go.jp/law/357CO0000000040',
);

// --- 民間の解説（secondary） ---
const SRC_YAYOI = src(
  '弥生 経理業務がわかる年間スケジュール（法人向け）',
  'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/keri-schedule/',
  'secondary',
);

// ---------------------------------------------------------------------------
// 共通の数字（company.ts の定数から作る）
// ---------------------------------------------------------------------------

/** 消費税の中間納付（国税・地方消費税・合計）。 */
const CT = consumptionTaxInterim();
/** 前期に納めた地方消費税（国税の 22/78）。 */
const PRIOR_CT_LOCAL = Math.round((PAYMENTS.priorConsumptionTaxNational * 22) / 78);
/** 法人税等の中間納付。 */
const CORP_INTERIM = corporateTaxInterim();
/** 住民税の納期の特例 6 か月分。 */
const RESIDENT_6M = MONTHLY.payroll.residentTax * 6;
/** 令和8年（1〜12月）に給与・賞与から源泉徴収した所得税（毎月 12 回＋賞与 2 回）。 */
const ANNUAL_WITHHELD = MONTHLY.payroll.incomeTax * 12 + BONUS.incomeTax * 2;
/** 年末調整で確定した年税額の合計（源泉徴収した額 − 過納額）。 */
const ANNUAL_TAX_DETERMINED = ANNUAL_WITHHELD - PAYMENTS.yearEndRefund;

// ---------------------------------------------------------------------------
// 10 月
// ---------------------------------------------------------------------------

/** 10/10 年末調整の書類の配布と、提出期限の決め方。 */
const nenchoDocs: Card = {
  id: 'c10_nencho_docs',
  kind: 'DECISION',
  title: '年末調整の書類を配る',
  date: mkDate(6, 10),
  skill: 'labor',
  situation:
    '総務の小林さんから相談です。「そろそろ年末調整の書類を配ります。提出期限はいつにしましょう。早すぎると出せない人がいそうですし、遅すぎると確認が間に合わない気がして」。',
  facts: [
    {
      caption: '配る書類と、それで受けられる主な控除',
      headers: ['書類', '主な控除'],
      rows: [
        ['扶養控除等（異動）申告書', '扶養控除など'],
        ['基礎控除申告書・配偶者控除等申告書など（兼用の様式）', '基礎控除、配偶者控除・配偶者特別控除など'],
        ['保険料控除申告書', '生命保険料控除、地震保険料控除、社会保険料控除（本人が直接払ったぶん）など'],
      ],
    },
    {
      caption: '年末調整までの予定',
      headers: ['日付', '予定'],
      rows: [
        ['12/1', '年末調整の計算'],
        ['12/10', '冬季賞与の支給'],
        ['12/25', '12月の給与の支払日'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '従業員の1人が「扶養控除等申告書を出し忘れていた」と言っています。年末調整をするには、どう対応しますか。',
      options: [
        '年の途中で出し忘れた人は、その年の年末調整は受けられない',
        '会社が、本人の代わりに家族の状況を推測して記入する',
        '年末調整が済んだあとの1月以降に出してもらえばよい',
        '年末調整を行う時までに出してもらえば、その申告にもとづいて年末調整ができる。早めに出すよう案内する',
      ],
      answer: 3,
      hints: [
        '年末調整は、「年末調整を行う時」までに申告書が出ている人について行います。',
        '出し忘れに気づいた時点で、まだ間に合うかどうかを考えます。',
      ],
      explain:
        '扶養控除等申告書は、原則として、毎年最初に給与の支払いを受ける日の前日までに出す決まりです。ただ、まだ出していない人や、家族の異動を届けていない人も、年末調整を行う時までに申告があれば、その申告にもとづいて年末調整ができます（国税庁「年末調整のしかた」）。\n会社は、出し忘れていそうな人に、早めに出すよう案内します。申告書は本人が書いて出すものなので、会社が家族の状況を推測して書くのはやめましょう。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '書類の配布は今日（10/10）です。会社としての提出期限は、いつにするのがよいでしょうか。年末調整の予定は、上の表のとおりです。',
      options: [
        '10月16日（配布の1週間後）',
        '11月13日（配布から約1か月後）',
        '12月10日（賞与の支給日）',
        '12月25日（12月の給与の支払日）',
      ],
      answer: 1,
      hints: [
        '書類の確認、不備の連絡、出し直し、給与ソフトへの登録に、どれくらい時間が要るかを考えましょう。',
        '12/1に計算を始めるので、その前に確認を終えておきたいところです。',
        '従業員が控除証明書などをそろえる時間も要ります。短すぎても、長すぎても困ります。',
      ],
      explain:
        '法律上は「年末調整を行う時」までに書類が出ていればよいのですが、そこを社内の期限にすると、不備の連絡や出し直しの時間がとれず、計算のやり直しや間違いにつながります。\n実務では、確認と給与ソフトへの登録の時間を見込んで、11月中旬から月末ごろに提出期限を置くのが目安とされています（弥生の解説）。今回は12/1に計算を始めるので、配布から約1か月後の11/13なら、従業員が証明書をそろえる時間も、会社が確認して差し戻す時間もとれます。',
    },
  ],
  sources: [SRC_NTA_NENCHO, SRC_YAYOI],
  mandatory: false,
  squareLabel: '年調書類',
};

/** 10/20 インボイス制度と電子帳簿保存法の点検。 */
const invoiceLedger: Card = {
  id: 'c10_invoice_ledger',
  kind: 'AUDIT',
  title: 'インボイスと電子保存の点検',
  date: mkDate(6, 20),
  skill: 'tax',
  situation:
    '社長から「10月から、免税事業者などからの仕入れの扱いが少し変わったと聞いた。今月届いた請求書とメールのPDFが、ルールどおりになっているか見てほしい」と頼まれました。',
  facts: [
    {
      caption: '10月に受け取った請求書',
      headers: ['仕入先', '受け取り方', '記載されている内容'],
      rows: [
        ['カミヤ紙業（株）', '郵送（紙）', '登録番号／取引年月日／取引内容／税率ごとの合計額と消費税額／宛名'],
        [
          '佐野梱包',
          'メールにPDFを添付',
          '取引年月日／取引内容／10%対象 55,000円（税込）／宛名（登録番号の記載なし。10/15に納品）',
        ],
        [
          '東京配送（有）',
          '郵送（紙）',
          '登録番号／取引年月日／取引内容／「合計 33,000円」のみ（税率・消費税額の記載なし）／宛名',
        ],
        ['山中商会', 'メールにPDFを添付', '登録番号／取引年月日／取引内容／税率ごとの合計額と消費税額／宛名'],
      ],
    },
    {
      caption: '免税事業者などからの仕入れの経過措置（仕入税額相当額のうち、控除できる割合）',
      headers: ['仕入れの時期', '控除できる割合'],
      rows: [
        ['令和5年10月1日〜令和8年9月30日', '80%'],
        ['令和8年10月1日〜令和10年9月30日', '70%'],
        ['令和10年10月1日〜令和12年9月30日', '50%'],
        ['令和12年10月1日〜令和13年9月30日', '30%'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'multi',
      prompt: '適格請求書（インボイス）として使えない請求書を、すべて選んでください。',
      options: ['東京配送（有）', 'カミヤ紙業（株）', '山中商会', '佐野梱包'],
      answer: [0, 3],
      hints: [
        '適格請求書には、登録番号のほか、税率ごとに区分した合計額と適用税率、税率ごとの消費税額等も必要です。',
        '「合計 ◯◯円」だけの請求書や、登録番号のない請求書は、要件を満たしません。',
      ],
      explain:
        '適格請求書に必要なのは、①発行事業者の名称と登録番号、②取引年月日、③取引内容、④税率ごとに区分した合計額と適用税率、⑤税率ごとの消費税額等、⑥書類を受け取る事業者（宛名）の名称です（国税庁）。\n佐野梱包は登録番号がなく、インボイスを出せる事業者（インボイス発行事業者）ではありません。東京配送は、税率ごとの合計額と消費税額等の記載がありません。記載が足りないときは、売手に修正した請求書（修正インボイス）を出してもらいます。\nなお、登録番号（「T」と13桁の数字）が書かれていても、国税庁の公表サイトで、その番号が有効かどうかを確かめられます。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt:
        '佐野梱包は、インボイス発行事業者ではありません。10/15に納品された商品（税込55,000円、税率10%）について、経過措置で仕入税額として控除できる額はいくらですか。',
      unit: 'yen',
      answer: (Math.round((55_000 * 10) / 110) * 70) / 100,
      hints: [
        '税込55,000円のうち、消費税額は 55,000円 × 10/110 です。',
        '納品日は10/15です。表から、令和8年10月1日以後の仕入れの割合を探します。',
        '消費税額 5,000円に、70%をかけます。',
      ],
      explain:
        '納品日（10/15）が令和8年10月1日以後なので、割合は70%です（9月30日までの仕入れは80%）。商品の仕入れでは、引渡日で判断します。\n消費税額 55,000円 × 10/110 ＝ 5,000円、控除できる額は 5,000円 × 70% ＝ 3,500円です。残りの1,500円は控除できず、税抜経理では仕入の価額に含めるのが原則です。\nこの経過措置を使うには、区分記載請求書と同様の事項がある請求書等と、経過措置の対象であることがわかる記載のある帳簿を、保存しておく必要があります（国税庁 インボイスQ&A）。',
    },
    {
      id: 'q3',
      type: 'choice',
      prompt: '山中商会のPDFの請求書は、メールに添付されて届きました。電子帳簿保存法のルールにそった保存は、どれですか。',
      options: [
        'PDFを「日付_取引先_金額」のようなファイル名にして検索できるようにし、訂正や削除を防ぐ規程などもそなえて、電子データのまま保存する',
        'メールを印刷して紙で保存すれば、PDFのデータは削除してよい',
        'メールソフトで見られる状態にしておけば、保存したことになる',
        '受け取ったメールを、取引に関係のないものも含めて、すべて保存する',
      ],
      answer: 0,
      hints: [
        'メールで受け取った請求書は、「電子取引」にあたります。',
        '紙に出力した書面だけを保存すればよいという取扱いは、令和3年度の改正で廃止されています。',
      ],
      explain:
        'メールに添付されて届いた請求書は「電子取引」にあたり、電子データのまま保存します。日付・取引先・金額がわかるファイル名にするなどして検索できる状態にし、訂正や削除を防ぐ措置（タイムスタンプ、または事務処理規程など）も必要です。メールソフトで見られるだけでは、十分とはいえません。\n印刷した紙だけを保存する取扱いは、令和3年度の改正で廃止されました。また、取引の情報がないメールまで保存する必要はなく、添付ファイルだけを保存すれば足ります（国税庁 電子帳簿保存法一問一答【電子取引関係】問4〜6・問19）。',
    },
  ],
  sources: [SRC_INVOICE_BASIC, SRC_INVOICE_QA, SRC_INVOICE_KOHYO, SRC_DENCHO],
  mandatory: false,
  squareLabel: 'インボイス',
};

// ---------------------------------------------------------------------------
// 11 月
// ---------------------------------------------------------------------------

/** 11/12 回収した年末調整の書類の点検。 */
const nenchoCheck: Card = {
  id: 'c11_nencho_check',
  kind: 'AUDIT',
  title: '年末調整の書類を確認する',
  date: mkDate(7, 12),
  skill: 'audit',
  situation:
    '提出期限（11/13）の前日です。すでに書類を出してくれた6名分を先に確認し、記入もれや添付もれがあれば、本人に確認して直してもらいましょう。（残りの2名は、まだ出ていません）',
  facts: [
    {
      caption: '提出された書類（6名分）',
      headers: ['従業員', '扶養控除等申告書', '保険料控除申告書・添付書類'],
      rows: [
        ['佐藤さん（営業）', '提出済み。記入もれなし', '生命保険料 84,000円を申告（平成24年1月以後の契約）。控除証明書の添付なし'],
        ['鈴木さん（事務）', '提出済み。記入もれなし', '申告なし（健康保険・厚生年金保険の保険料は、給与から天引きのみ）'],
        ['高橋さん（営業）', '提出済み。長男（18歳）を扶養親族として記入', '申告なし'],
        ['伊藤さん（事務）', '提出済み。長男（18歳）を扶養親族として記入（高橋さんと同じ長男）', '申告なし'],
        ['田中さん（倉庫）', '提出済み。子1人の氏名を記入。生年月日は空欄', '申告なし'],
        ['山本さん（総務）', '今回はじめて提出。記入もれなし', '申告なし'],
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'multi',
      prompt: '本人に確認して、書類を直してもらう必要があるのは、誰の書類ですか。すべて選んでください。',
      options: ['鈴木さん', '佐藤さん', '山本さん', '高橋さんと伊藤さん（同じ長男を載せている）', '田中さん'],
      answer: [1, 3, 4],
      hints: [
        '同じ人を二重に載せていないか、必要な証明書がそろっているか、控除の判断に要る項目が空欄でないかを確認します。',
        '「申告なし」や「今回はじめて提出」は、それだけでは不備とは限りません。',
      ],
      explain:
        '書類ごとに、次の点を確認します。\n・佐藤さん：生命保険料の控除を受けるには、保険料を払ったことを証明する書類（控除証明書）を、保険料控除申告書に添付するか、提示する必要があります。平成24年1月以後の契約は、金額にかかわらず必要です。\n・高橋さんと伊藤さん：同じ人が2人以上の扶養親族になるときは、いずれか1人の扶養親族にしかなれません（所得税法第85条第6項）。どちらの申告書に載せるかを、2人に確認します。\n・田中さん：控除の区分は扶養親族の年齢で変わるので、生年月日が必要です。\n・鈴木さん：健康保険・厚生年金保険の保険料は、給与から天引きした額を会社が集計するので、申告書に書く必要はありません（本人が直接払った国民年金保険料などは、申告が必要です）。\n・山本さん：扶養控除等申告書は、年の最初の給与の支払いの前日までに出すのが原則ですが、年末調整を行う時までに出してもらえれば、その申告にもとづいて年末調整ができます。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '佐藤さんは「保険会社の控除証明書が、まだ手元に届いていない」と言っています。年末調整は、どう進めますか。',
      options: [
        '証明書が届くまで、全員の年末調整を止めて待つ',
        '証明書がなくても、申告書の記入だけで控除してよく、証明書は要らない',
        '翌年1月末日までに提出または提示してもらうことを条件に、生命保険料の控除をしたうえで、年末調整を進めてよい',
        '生命保険料の控除は、年末調整では受けられない',
      ],
      answer: 2,
      hints: [
        '証明書類が確認できないときの取扱いが、決まっています。',
        '期限をつけて、あとから出してもらうことが認められています。',
      ],
      explain:
        '証明書類の交付を請求中などで確認できない場合でも、翌年1月末日までに提出または提示することを条件として、生命保険料の控除をしたうえで、年末調整を行ってよいことになっています（国税庁「年末調整のしかた」）。\n全員の作業を止める必要はありません。ただし、証明書なしで控除を続けてよいわけではなく、期限までに証明書をもらえたか、会社が確認します。',
    },
  ],
  sources: [SRC_NTA_NENCHO, SRC_INCOME_TAX_ACT],
  mandatory: false,
  squareLabel: '書類確認',
};

/** 11/20 消費税の中間申告の要否と金額の判定（11/30 の前提練習）。 */
const interimCalc: Card = {
  id: 'c11_interim_calc',
  kind: 'CALC',
  title: '消費税の中間納付額を計算する',
  date: mkDate(7, 20),
  skill: 'tax',
  situation:
    '11月末は、消費税の中間申告と納付の期限です。税理士の先生から「前期の確定消費税額をもとに、今期は中間申告が必要か、必要なら何回で、いくら納めるのかを、先に計算しておいてください」と頼まれました。',
  facts: [
    {
      caption: '前期の確定申告（5月）で納めた消費税',
      headers: ['項目', '金額'],
      rows: [
        ['消費税（国税）', PAYMENTS.priorConsumptionTaxNational],
        ['地方消費税（国税の22/78）', PRIOR_CT_LOCAL],
        ['合計', PAYMENTS.priorConsumptionTaxNational + PRIOR_CT_LOCAL],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: 'ミナト商事は、消費税の中間申告が必要ですか。必要なら、年に何回で、いくらぶんを納めますか。',
      options: [
        '年1回。前期の確定消費税額（国税）の6/12を納める',
        '年3回。前期の確定消費税額（国税）の3/12ずつを納める',
        '年11回。前期の確定消費税額（国税）の1/12ずつを納める',
        '中間申告は不要（前期の確定消費税額が48万円以下の会社だけが行う）',
      ],
      answer: 0,
      hints: [
        '判定に使うのは、地方消費税を含まない「国税」の確定消費税額です。',
        '48万円以下は原則不要、48万円超〜400万円以下は年1回、400万円超〜4,800万円以下は年3回、4,800万円超は年11回です。',
        `${formatYen(PAYMENTS.priorConsumptionTaxNational)}は、48万円超〜400万円以下の区分にあたります。`,
      ],
      explain: `消費税の中間申告は、直前の課税期間の確定消費税額（国税。地方消費税は含みません）が48万円を超える事業者が行います。48万円超〜400万円以下は年1回で、確定額の6/12を納めます。400万円超〜4,800万円以下は年3回（3/12ずつ）、4,800万円超は年11回（1/12ずつ）です。\nミナト商事の前期の確定消費税額は${formatYen(PAYMENTS.priorConsumptionTaxNational)}なので、年1回・6/12です（国税庁 No.6609）。`,
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '国税（消費税）の中間納付額はいくらですか。',
      unit: 'yen',
      answer: CT.national,
      hints: ['前期の確定消費税額（国税）に、6/12をかけます。'],
      explain: `${formatYen(PAYMENTS.priorConsumptionTaxNational)} × 6/12 ＝ ${formatYen(CT.national)}。地方消費税は含めずに計算します。`,
    },
    {
      id: 'q3',
      type: 'number',
      prompt: '地方消費税の中間納付額はいくらですか。国税の中間納付額に、22/78をかけて求めます。',
      unit: 'yen',
      answer: CT.local,
      hints: [`${formatYen(CT.national)} × 22/78 を計算します。`],
      explain: `${formatYen(CT.national)} × 22/78 ＝ ${formatYen(CT.local)}。地方消費税は、国税の中間納付額の22/78を、国税とあわせて納めます。（税率10%のうち、国税が7.8%、地方消費税が2.2%です。）`,
    },
    {
      id: 'q4',
      type: 'number',
      prompt: '11/30に納める中間納付の合計（国税＋地方消費税）はいくらですか。',
      unit: 'yen',
      answer: CT.total,
      hints: ['国税の中間納付額と、地方消費税の中間納付額を足します。'],
      explain: `${formatYen(CT.national)} ＋ ${formatYen(CT.local)} ＝ ${formatYen(CT.total)}。前期に納めた消費税と地方消費税の合計 ${formatYen(PAYMENTS.priorConsumptionTaxNational + PRIOR_CT_LOCAL)} の6/12でも、同じ金額になります。11/30までに、この額を納めます。`,
    },
  ],
  sources: [SRC_NTA_6609],
  mandatory: false,
  squareLabel: '中間計算',
};

/** 11/30 法人税等の中間申告と納付（必須・仮払法人税等 ／ 普通預金）。 */
const interimCorporateTax: Card = {
  id: 'c11_interim_corporate_tax',
  kind: 'DEADLINE',
  title: '法人税等の中間申告と納付',
  date: mkDate(7, 30),
  skill: 'tax',
  situation:
    '税理士の先生から連絡です。「前期の法人税額が20万円を超えているので、今期は中間申告と納付が必要です。前期の実績をもとにした予定申告で出しましょう。期限は今月末です」。申告書を出し、普通預金から納付します。',
  facts: [
    {
      caption: '中間申告の前提',
      headers: ['項目', '内容'],
      rows: [
        ['決算期', '3月決算（今期は2026年4月1日〜2027年3月31日の12か月）'],
        ['中間申告の対象期間', '4月1日〜9月30日（6か月）'],
        ['前期の法人税等の年税額（法人税・住民税・事業税の合計として扱う）', PAYMENTS.priorCorporateTaxTotal],
        ['申告のしかた', '前期の実績を基準にする予定申告（仮決算はしない）'],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: 'この中間申告書を出して納める期限は、いつですか。',
      options: [
        '10月31日（6か月を経過した日から1か月以内）',
        '11月30日（6か月を経過した日から2か月以内）',
        '12月31日（年内に済ませればよい）',
        '5月31日（確定申告と同じ日）',
      ],
      answer: 1,
      hints: [
        '期限は「事業年度開始の日以後6か月を経過した日から2か月以内」です。',
        '4月1日から6か月がたった日は、10月1日です。',
        '10月1日から2か月以内なので、11月の末日になります。',
      ],
      explain:
        '中間申告書の提出と、中間申告による納付の期限は、事業年度開始の日以後6か月を経過した日から2か月以内です。4月1日に始まる事業年度なら、10月1日から2か月以内の11月30日が期限です（国税庁「法人税のあらましと申告の手引」）。\n前事業年度の確定法人税額が20万円を超える会社は、この予定申告と納税が必要です。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '前期の実績を基準にする予定申告での中間納付額は、いくらですか。（前期の年税額 ÷ 前期の月数 × 中間期間の月数）',
      unit: 'yen',
      answer: CORP_INTERIM,
      hints: ['前期は12か月、中間期間は6か月です。', '前期の年税額の 6/12（半分）です。'],
      explain: `${formatYen(PAYMENTS.priorCorporateTaxTotal)} ÷ 12か月 × 6か月 ＝ ${formatYen(CORP_INTERIM)}。前期の実績を基準にする方法なら、仮決算をしなくても計算できます。\nこの算式で出した金額が10万円以下の会社は、中間申告そのものが不要です（前期が12か月なら、前期の法人税額が20万円以下のとき）。\n※ 実際には、法人税は国税、住民税と事業税は地方税で、申告書も別です。このゲームでは、まとめて1つの「法人税等」として扱います。`,
    },
    {
      id: 'q3',
      type: 'journal',
      prompt: `中間納付の${formatYen(CORP_INTERIM)}を、普通預金から納付しました。この仕訳をしてください。`,
      accounts: ['tax_prepaid', 'bank', 'corp_tax', 'tax_payable', 'dues', 'ct_payable'],
      expected: [[dr('tax_prepaid', CORP_INTERIM), cr('bank', CORP_INTERIM)]],
      memo: '法人税等の中間納付',
      traps: [
        {
          account: 'corp_tax',
          side: 'debit',
          message:
            '費用の「法人税等」に入れるのは、決算で1年分の税額が確定したときです。中間納付のときは、いったん「仮払法人税等」（資産）に入れておきます。',
        },
        {
          account: 'tax_payable',
          side: 'debit',
          message: '未払法人税等は、決算で計上する負債です。中間納付の時点では、まだありません。',
        },
        {
          account: 'dues',
          side: 'debit',
          message: '租税公課は、固定資産税など、法人税等以外の税金に使います。法人税・住民税・事業税は、法人税等の系統です。',
        },
      ],
      hints: [
        '納めたときは、費用にせず、資産に入れておくのがポイントです。',
        '決算で1年分の法人税等が確定したら、この資産を消して、費用に振り替えます。',
        `借方：仮払法人税等 ${formatYen(CORP_INTERIM)} ／ 貸方：普通預金 ${formatYen(CORP_INTERIM)}`,
      ],
      explain: `中間納付は、1年分の税金の前払いです。納めたときは、費用の「法人税等」ではなく、資産の「仮払法人税等」に入れます。\n決算で、1年分の税額を「法人税等」として費用に計上するときに、仮払法人税等を貸方で消し、差額だけを「未払法人税等」（負債）にします。`,
    },
  ],
  penalty: { amount: 20_000, reason: '中間納付が遅れ、延滞税がかかった' },
  sources: [SRC_NTA_HOJIN, SRC_NTA_HOJIN_YOTEI],
  mandatory: true,
  squareLabel: '法人税中間',
};

/** 11/30 消費税の中間申告と納付（必須・未払消費税等 ／ 普通預金）。 */
const interimConsumptionTax: Card = {
  id: 'c11_interim_consumption_tax',
  kind: 'DEADLINE',
  title: '消費税の中間申告と納付',
  date: mkDate(7, 30),
  skill: 'tax',
  situation:
    '前期に納めた消費税が48万円を超えていたので、今期は消費税の中間申告が必要です。届いた中間申告書（納付書）の額を確認し、国税と地方消費税をあわせて、期限の今日までに普通預金から納付します。',
  facts: [
    {
      caption: '消費税の中間申告書（納付書）の内容',
      headers: ['項目', '金額'],
      rows: [
        ['前期の確定消費税額（国税）', PAYMENTS.priorConsumptionTaxNational],
        ['中間納付税額（国税）：前期の確定額の6/12', CT.national],
        ['中間納付税額（地方消費税）：国税の22/78', CT.local],
        ['納付する合計', CT.total],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '年1回の消費税の中間申告（対象期間は4月1日〜9月30日）を出して納める期限は、いつですか。',
      options: [
        '9月30日（対象期間の最終日）',
        '5月31日（確定申告と同じ日）',
        '12月31日（年内に済ませればよい）',
        '11月30日（対象期間の末日の翌日から2か月以内）',
      ],
      answer: 3,
      hints: [
        '期限は、対象となる期間の末日の翌日から数えます。',
        '対象期間の末日は9月30日です。その翌日は10月1日です。',
      ],
      explain:
        '消費税の中間申告と納付の期限は、対象となる期間の末日の翌日から2か月以内です（国税庁 No.6609）。年1回の中間申告では、対象期間は今期の前半6か月（4/1〜9/30）なので、10/1から2か月以内の11/30が期限です。\n法人税の中間申告と同じ日ですが、計算のもとになる金額も、申告書も別々です。',
    },
    {
      id: 'q2',
      type: 'journal',
      prompt: `中間納付の合計 ${formatYen(CT.total)}（国税 ${formatYen(CT.national)} ＋ 地方消費税 ${formatYen(CT.local)}）を、普通預金から納付しました。この仕訳をしてください。`,
      accounts: ['ct_payable', 'bank', 'input_tax', 'output_tax', 'dues', 'tax_prepaid'],
      expected: [[dr('ct_payable', CT.total), cr('bank', CT.total)]],
      memo: '消費税の中間納付',
      traps: [
        {
          account: 'input_tax',
          side: 'debit',
          message:
            '仮払消費税は、仕入や経費を払ったときに、一緒に払った消費税を入れる科目です。税務署へ納める中間納付は、別の科目に入れます。',
        },
        {
          account: 'dues',
          side: 'debit',
          message: '税抜経理では、消費税は費用にしません。租税公課ではなく、「未払消費税等」で処理します。',
        },
        {
          account: 'tax_prepaid',
          side: 'debit',
          message: '仮払法人税等は、法人税等の中間納付だけに使います。消費税は「未払消費税等」を使います。',
        },
        {
          account: 'output_tax',
          side: 'debit',
          message: '仮受消費税は、決算で仮払消費税と相殺するときに動かします。中間納付の時点では触りません。',
        },
      ],
      hints: [
        '税抜経理なので、消費税は費用ではなく、納める債務（負債）の側で考えます。',
        '決算では、仮受消費税と仮払消費税を「未払消費税等」に振り替えます。中間納付は、この未払消費税等の借方に置いておきます。',
        `借方：未払消費税等 ${formatYen(CT.total)} ／ 貸方：普通預金 ${formatYen(CT.total)}`,
      ],
      explain: `税抜経理では、消費税は費用にしません。中間納付は、決算で確定する納税額の前払いとして、負債の「未払消費税等」の借方に置きます。\n決算で、仮受消費税と仮払消費税を相殺し、その差額を未払消費税等の貸方に入れます。すると、借方の${formatYen(CT.total)}と打ち消し合い、確定申告で納める差額だけが残ります。`,
    },
  ],
  penalty: { amount: 30_000, reason: '中間納付が遅れ、延滞税がかかった' },
  sources: [SRC_NTA_6609],
  mandatory: true,
  squareLabel: '消費税中間',
};

// ---------------------------------------------------------------------------
// 12 月
// ---------------------------------------------------------------------------

/** 12/1 年末調整の計算（過不足を求める）。 */
const nenchoCalc: Card = {
  id: 'c12_nencho_calc',
  kind: 'CALC',
  title: '年末調整の過不足を計算する',
  date: mkDate(8, 1),
  skill: 'tax',
  situation:
    '12月の給与で年末調整をする準備です。8名分の書類の確認と年税額の計算は終わったので、会社が1年間に預かった所得税と、確定した年税額を比べて、過不足を出します。（12月の給与と賞与は、支給予定額を入れています）',
  facts: [
    {
      caption: '令和8年（1月〜12月）に源泉徴収した所得税（8名の合計）',
      headers: ['区分', '1回あたり', '回数'],
      rows: [
        ['毎月の給与', MONTHLY.payroll.incomeTax, '12回（1月〜12月）'],
        ['賞与（7月・12月）', BONUS.incomeTax, '2回'],
      ],
      numericColumns: [1],
    },
    {
      caption: '年末調整で確定した年税額',
      headers: ['項目', '金額'],
      rows: [['年税額の合計（8名分）', ANNUAL_TAX_DETERMINED]],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'number',
      prompt: '1年間（1月〜12月）に源泉徴収した所得税の合計は、いくらですか。',
      unit: 'yen',
      answer: ANNUAL_WITHHELD,
      hints: [
        '毎月の給与ぶんは「1回あたり × 12回」、賞与ぶんは「1回あたり × 2回」です。',
        '会計年度は4月〜3月ですが、年末調整は1月〜12月の給与が対象です。今年の1〜3月ぶんも数えます。',
      ],
      explain: `毎月の給与ぶん ${formatYen(MONTHLY.payroll.incomeTax)} × 12回 ＝ ${formatYen(MONTHLY.payroll.incomeTax * 12)}、賞与ぶん ${formatYen(BONUS.incomeTax)} × 2回 ＝ ${formatYen(BONUS.incomeTax * 2)}。合計 ${formatYen(ANNUAL_WITHHELD)}です。\n年末調整の対象は、その年の1月1日から12月31日までに支払うことが確定した給与です（国税庁）。会社の会計年度（4月〜3月）とは区切りが違うので、今年1〜3月に預かった分（前期の帳簿のぶん）も、12か月に入ります。`,
    },
    {
      id: 'q2',
      type: 'number',
      prompt:
        '源泉徴収した所得税の合計は、年税額の合計より、いくら多い（または少ない）ですか。（源泉徴収した額 − 年税額。多いときは、プラスの金額で答えます）',
      unit: 'yen',
      answer: PAYMENTS.yearEndRefund,
      hints: ['源泉徴収した額から、年末調整で確定した年税額を引きます。'],
      explain: `${formatYen(ANNUAL_WITHHELD)} − ${formatYen(ANNUAL_TAX_DETERMINED)} ＝ ${formatYen(PAYMENTS.yearEndRefund)}。預かった額のほうが多いので、${formatYen(PAYMENTS.yearEndRefund)}の過納です。`,
    },
    {
      id: 'q3',
      type: 'choice',
      prompt: '年末調整の結果（8名の合計）から、どう判断しますか。',
      options: [
        `預かりすぎ（過納）なので、${formatYen(PAYMENTS.yearEndRefund)}を従業員に還付する`,
        `預かりが足りないので、${formatYen(PAYMENTS.yearEndRefund)}を従業員から追加で徴収する`,
        '過不足がないので、何もしなくてよい',
        `会社の負担なので、${formatYen(PAYMENTS.yearEndRefund)}を会社が税務署に追加で納める`,
      ],
      answer: 0,
      hints: ['源泉徴収した額が年税額より多いか、少ないかを見ます。'],
      explain: `源泉徴収した額（${formatYen(ANNUAL_WITHHELD)}）が年税額（${formatYen(ANNUAL_TAX_DETERMINED)}）より多いので、多く預かった${formatYen(PAYMENTS.yearEndRefund)}を、従業員に還付します。逆に、預かった額が年税額より少ないときは、年末調整をする月の給与から追加で徴収します（国税庁 No.2675）。\n※ 実際には、従業員1人ずつ過不足を出して精算します。この教材では、8名の合計で考えます。`,
    },
  ],
  sources: [SRC_NTA_2662, SRC_NTA_2675],
  mandatory: false,
  squareLabel: '年調計算',
};

/** 12/10 住民税の納期の特例（6〜11月分）。必須（住民税預り金 ／ 普通預金）。 */
const residentTax2: Card = {
  id: 'c12_resident_tax_2',
  kind: 'DEADLINE',
  title: '住民税の納付（6〜11月分）',
  date: mkDate(8, 10),
  skill: 'tax',
  situation:
    '6月〜11月に、従業員の給与から預かった住民税（特別徴収）を、市に納める日です。ミナト商事は従業員が10人未満で、市から納期の特例の承認を受けています。今日が納期限です。',
  facts: [
    {
      caption: '住民税預り金（6〜11月分）',
      headers: ['項目', '金額'],
      rows: [
        ['1か月に給与から天引きしている住民税（8名の合計）', MONTHLY.payroll.residentTax],
        ['納める月数', '6か月（6月分〜11月分）'],
        ['納付する額', RESIDENT_6M],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: 'ミナト商事は従業員が10人未満で、市から納期の特例の承認を受けています。6〜11月分の住民税の納期限は、いつですか。',
      options: [
        '翌月10日ごとに、毎月納める（原則）',
        '7月10日と1月20日（源泉所得税の納期の特例と同じ）',
        '12月10日（6〜11月分をまとめて納める）',
        '12月25日（給与の支払日にあわせる）',
      ],
      answer: 2,
      hints: [
        '納期の特例は、給与の支払いを受ける人が常時10人未満の会社が、市区町村の承認を受けて使えます。',
        '半年分をまとめて納めるので、原則の「毎月」ではありません。',
        '納期限は、期間の最後の月（11月）の翌月10日です。',
      ],
      explain:
        '住民税（特別徴収）の納期は、原則として、天引きした月の翌月10日です。給与の支払いを受ける人が常時10人未満の会社は、市区町村長の承認を受けると、6〜11月分を12月10日、12〜5月分を翌年6月10日に、まとめて納められます（地方税法第321条の5の2）。\n源泉所得税の納期の特例（7/10と1/20）とは別の制度です。承認を受ける先も、源泉所得税は税務署、住民税は市区町村と、別々です。',
    },
    {
      id: 'q2',
      type: 'journal',
      prompt: `預かっていた住民税 ${formatYen(RESIDENT_6M)}（6〜11月分）を、普通預金から納付しました。この仕訳をしてください。`,
      accounts: ['wh_resident', 'bank', 'wh_income', 'dues', 'corp_tax', 'salaries'],
      expected: [[dr('wh_resident', RESIDENT_6M), cr('bank', RESIDENT_6M)]],
      memo: '住民税の納付（納期の特例・6〜11月分）',
      traps: [
        {
          account: 'dues',
          side: 'debit',
          message: '従業員の住民税は、給与から預かったお金です。会社が負担する税金（租税公課）ではないので、費用にはなりません。',
        },
        {
          account: 'corp_tax',
          side: 'debit',
          message: '法人税等は、会社自身の利益にかかる税金です。従業員の住民税とは別のものです。',
        },
        {
          account: 'wh_income',
          side: 'debit',
          message: '所得税預り金は、国（税務署）に納める源泉所得税です。市区町村に納める住民税は、「住民税預り金」です。',
        },
      ],
      hints: [
        '給与から天引きしたときに、「住民税預り金」（負債）として預かっています。',
        '納めると、預かりがなくなります。負債が減るのは、借方です。',
        `借方：住民税預り金 ${formatYen(RESIDENT_6M)} ／ 貸方：普通預金 ${formatYen(RESIDENT_6M)}`,
      ],
      explain: `従業員の給与から天引きした住民税は、会社が市区町村に届けるまでの預り金（負債）です。納付すると預り金が消えるので、借方は住民税預り金、貸方は普通預金です。\n会社の費用にはならず、損益には影響しません。`,
    },
  ],
  penalty: { amount: 5_000, reason: '納付が遅れ、延滞金がかかった' },
  sources: [SRC_LOCAL_TAX_ACT, SRC_SAITAMA, SRC_NTA_2505],
  mandatory: true,
  squareLabel: '住民税',
};

/** 12/10 冬季賞与の支給（必須・賞与 ／ 所得税預り金・社会保険料預り金・普通預金）。 */
const bonusWinter: Card = {
  id: 'c12_bonus_winter',
  kind: 'JOURNAL',
  title: '冬季賞与の支給',
  date: mkDate(8, 10),
  skill: 'labor',
  situation: `今日は冬のボーナスの支給日です。夏（7月）と同じ額で、8名の合計は総支給${formatYen(BONUS.gross)}、天引きは源泉所得税と社会保険料です。給与ソフトの明細をもとに仕訳を入れ、日本年金機構への届出の期限も確認します。`,
  facts: [
    {
      caption: '賞与明細の合計（8名分）',
      headers: ['項目', '金額'],
      rows: [
        ['総支給額', BONUS.gross],
        ['源泉所得税（天引き）', BONUS.incomeTax],
        ['社会保険料・従業員負担分（天引き）', BONUS.social],
        ['差引支給額（普通預金から振込）', BONUS.net],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'journal',
      prompt: '賞与の支給を仕訳してください。（会社負担の社会保険料は、別に計上済みです）',
      accounts: ['bonus', 'wh_income', 'wh_social', 'bank', 'salaries', 'welfare', 'wh_resident'],
      expected: [
        [dr('bonus', BONUS.gross), cr('wh_income', BONUS.incomeTax), cr('wh_social', BONUS.social), cr('bank', BONUS.net)],
      ],
      memo: '冬季賞与の支給',
      traps: [
        {
          account: 'salaries',
          side: 'debit',
          message: '賞与は「賞与」の科目で処理します。毎月の「給料」と分けておくと、人件費の内訳がわかりやすくなります。',
        },
        {
          account: 'welfare',
          side: 'debit',
          message:
            '法定福利費は、会社負担の社会保険料です。今回入れるのは、従業員が負担する天引きぶん（社会保険料預り金）です。会社負担ぶんは、別に計上済みです。',
        },
        {
          account: 'wh_resident',
          side: 'credit',
          message: '今回の賞与の明細には、住民税の天引きはありません。',
        },
      ],
      hints: [
        '賞与は、手取りではなく、総支給額を費用にします。',
        '天引きした所得税と社会保険料は、会社が国や年金機構に納めるまでの預り金（負債）です。',
        `借方：賞与 ${formatYen(BONUS.gross)} ／ 貸方：所得税預り金 ${formatYen(BONUS.incomeTax)}、社会保険料預り金 ${formatYen(BONUS.social)}、普通預金 ${formatYen(BONUS.net)}`,
      ],
      explain: `賞与は、総支給額の${formatYen(BONUS.gross)}を費用（賞与）に計上します。天引きした源泉所得税${formatYen(BONUS.incomeTax)}と社会保険料${formatYen(BONUS.social)}は預り金（負債）にして、残りの${formatYen(BONUS.net)}を普通預金から支払います。${formatYen(BONUS.gross)} − ${formatYen(BONUS.incomeTax)} − ${formatYen(BONUS.social)} ＝ ${formatYen(BONUS.net)}で、貸借が一致します。\n会社が負担する社会保険料（${formatYen(BONUS.employerSocial)}）は、法定福利費として別に計上しています。`,
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '賞与を支給しました。従業員の社会保険（健康保険・厚生年金保険）の「賞与支払届」は、いつまでに日本年金機構へ出しますか。',
      options: [
        '12月31日（年内に出せば足りる）',
        '翌月10日（源泉所得税の原則の納期と同じ）',
        '翌月末日（保険料の納付期限と同じ）',
        '賞与を支給した日から5日以内',
      ],
      answer: 3,
      hints: ['期限は、「賞与を支給した日から◯日以内」という形で決まっています。', '源泉所得税や保険料の納付日とは、別のルールです。'],
      explain:
        '賞与を支給したら、「被保険者賞与支払届」を、支給した日から5日以内に日本年金機構へ出します。12月に支給した賞与でも、期限は同じです（12/10に支給したなら、12/15まで）。届け出た額から標準賞与額が決まり、保険料が計算されます。\n保険料の納付は別で、賞与を支払った月の翌月末日までです。賞与の保険料は、毎月の保険料と合わせて、翌月の納入告知書で通知されます。\nまた、この賞与の源泉所得税も、年末調整（今年の給与の総額と源泉徴収税額から、正しい税額を計算し直す手続き）の対象に含まれます。',
    },
  ],
  sources: [SRC_NPS_BONUS, SRC_NTA_2662],
  mandatory: true,
  squareLabel: '冬季賞与',
};

/** 12/20 年末調整の過納額の還付（必須・所得税預り金 ／ 普通預金）。 */
const yearEndAdjustment: Card = {
  id: 'c12_year_end_adjustment',
  kind: 'JOURNAL',
  title: '年末調整の還付',
  date: mkDate(8, 20),
  skill: 'bookkeeping',
  situation:
    '年末調整の計算が終わりました。1年間に給与から預かった所得税のほうが、確定した年税額より多かったので、12月の給与計算に、多く預かった分の払い戻しを反映します。',
  facts: [
    {
      caption: '年末調整の結果（8名の合計）',
      headers: ['項目', '金額'],
      rows: [
        ['1年間に源泉徴収した所得税', ANNUAL_WITHHELD],
        ['年末調整で確定した年税額', ANNUAL_TAX_DETERMINED],
        ['過納額（源泉徴収した額 − 年税額）', PAYMENTS.yearEndRefund],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'journal',
      prompt: `過納額 ${formatYen(PAYMENTS.yearEndRefund)} を、従業員に払い戻します。この仕訳をしてください。`,
      accounts: ['wh_income', 'bank', 'salaries', 'dues', 'wh_resident', 'misc_income'],
      expected: [[dr('wh_income', PAYMENTS.yearEndRefund), cr('bank', PAYMENTS.yearEndRefund)]],
      memo: '年末調整の過納額の還付',
      traps: [
        {
          account: 'salaries',
          side: 'debit',
          message: '払い戻すのは、給与から預かりすぎた所得税です。従業員に払う給料（費用）を増やす処理ではありません。',
        },
        {
          account: 'dues',
          side: 'debit',
          message: '租税公課は、会社が負担する税金の費用です。従業員の所得税は、預かっていたお金なので、会社の費用にはなりません。',
        },
        {
          account: 'wh_income',
          side: 'credit',
          message: '所得税預り金は、返すと減ります（借方）。貸方に書くと、預かりが増えてしまいます。',
        },
      ],
      hints: [
        '預かりすぎた所得税を返すので、預り金が減ります。',
        '返すお金は、普通預金から出ていきます。',
        `借方：所得税預り金 ${formatYen(PAYMENTS.yearEndRefund)} ／ 貸方：普通預金 ${formatYen(PAYMENTS.yearEndRefund)}`,
      ],
      explain: `年末調整で、従業員が1年間に納めるべき所得税（年税額）が確定します。給与から預かった額のほうが多ければ、多い分を従業員に返します。預かっていた「所得税預り金」が減り、お金が出ていくので、借方は所得税預り金、貸方は普通預金です。\nこの還付ぶん、1月20日に納める源泉所得税（納期の特例）は少なくなります。`,
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '年末調整の過納額の還付について、正しい説明はどれですか。',
      options: [
        '従業員に還付した額は、会社の給与（費用）として処理する',
        '従業員に還付した額は、あとで会社が国に納める源泉所得税から差し引く',
        '還付は従業員が自分で確定申告して受けるので、会社は払い戻さない',
        '還付した額は、翌年の給与から少しずつ差し引いて回収する',
      ],
      answer: 1,
      hints: ['多く預かった所得税は、もともと従業員のお金です。', '会社は、預かった所得税をまとめて国に納めています。その納付とのつながりを考えましょう。'],
      explain: `年末調整で過納になった人には、会社が還付します。還付した額は、年末調整を行った月分として会社が納付する源泉所得税から差し引きます（国税庁 No.2675）。納期の特例を使っているミナト商事では、1月20日の納付額が、その分だけ少なくなります。\n会社が国に納める税額が減るだけで、会社の費用にはなりません。従業員が自分で手続きをしなくても、会社が年末調整で払い戻します。`,
    },
  ],
  sources: [SRC_NTA_2675, SRC_NTA_2505],
  mandatory: true,
  squareLabel: '年末調整',
  squareType: 'special',
};

// --- 年末年始の銀行の営業日（12/24〜1/4） ---

const YEAR_END_DAYS: readonly GameDate[] = [
  ...[24, 25, 26, 27, 28, 29, 30, 31].map((d) => mkDate(8, d)),
  ...[1, 2, 3, 4].map((d) => mkDate(9, d)),
];

/**
 * 銀行の営業所が休みの日か。銀行法第15条（日曜日）と銀行法施行令第5条（国民の祝日・12/31〜1/3・土曜日）による。
 * この期間の祝日は元日だけ。
 */
const isBankHoliday = (d: GameDate): boolean => {
  const wd = weekdayOf(d);
  if (wd === 0 || wd === 6) return true;
  return d === mkDate(8, 31) || (d >= mkDate(9, 1) && d <= mkDate(9, 3));
};

const YEAR_END_BUSINESS_DAYS: readonly GameDate[] = YEAR_END_DAYS.filter((d) => !isBankHoliday(d));
/** 年内（12月）に銀行が営業する最後の日。 */
const LAST_BUSINESS_DAY: GameDate = YEAR_END_BUSINESS_DAYS.filter((d) => d <= mkDate(8, 31)).reduce(
  (a, b) => (b > a ? b : a),
  mkDate(8, 24),
);
const LAST_CHOICES: readonly GameDate[] = [mkDate(8, 28), mkDate(8, 29), mkDate(8, 30), mkDate(8, 31)];

/** 12/24 年内の支払いの締め（できごと）。 */
const yearEndPayments: Card = {
  id: 'c12_year_end_payments',
  kind: 'CHANCE',
  title: '年内の支払いを締める',
  date: mkDate(8, 24),
  skill: 'cash',
  situation:
    '年の瀬です。社長から「年内に払うものは、年内に片づけておいてくれ」と頼まれ、取引先の1社からも「12月分の代金は、年内に着金するように振り込んでほしい」と連絡がありました。銀行が開いている日を数えて、支払いの段取りを決めましょう。',
  facts: [
    {
      caption: '年末年始のカレンダー',
      headers: ['日付', 'メモ'],
      rows: YEAR_END_DAYS.map((d) => [
        formatDateWithWeekday(d),
        d === mkDate(8, 24) ? '今日' : d === mkDate(8, 25) ? '給与の支払日' : d === mkDate(9, 1) ? '元日（祝日）' : '',
      ]),
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '年内に、銀行の営業所が開いている最後の日は、いつですか。',
      options: LAST_CHOICES.map((d) => formatDateWithWeekday(d)),
      answer: LAST_CHOICES.indexOf(LAST_BUSINESS_DAY),
      hints: [
        '銀行の休日は、土日・祝日のほかに、法令で年末年始の日が決まっています。',
        '12/31から1/3までは、平日でも銀行が休みです。',
      ],
      explain: `銀行の休日は、日曜日のほか、政令で、国民の祝日、土曜日、12月31日から1月3日と定められています（銀行法第15条、銀行法施行令第5条）。今年は${formatDateWithWeekday(mkDate(8, 31))}が平日でも銀行が休みで、年明けは${formatDateWithWeekday(mkDate(9, 4))}から営業します。したがって、年内に銀行が開いている最後の日は、${formatDateWithWeekday(LAST_BUSINESS_DAY)}です。\n実際には、受付の締切時刻は銀行やサービスで違い、年末は混み合います。「年内に着金」が条件の支払いは、最終営業日ぎりぎりにせず、余裕をもって手続きしましょう。\n※ このゲームの帳簿では、月末の入金や支払いを12/31付で自動で記録しています。実際の入出金は、銀行の営業日にずれます。`,
    },
    {
      id: 'q2',
      type: 'number',
      prompt: `今日（${formatDate(mkDate(8, 24))}）から${formatDate(mkDate(9, 4))}までの間に、銀行の営業日は何日ありますか。（今日と${formatDate(mkDate(9, 4))}も数えます）`,
      unit: 'days',
      answer: YEAR_END_BUSINESS_DAYS.length,
      hints: ['土曜・日曜と、12/31〜1/3を除いて数えます。', '12/26と12/27は、土曜と日曜です。'],
      explain: `営業日は、${YEAR_END_BUSINESS_DAYS.map((d) => formatDateWithWeekday(d)).join('、')}の${YEAR_END_BUSINESS_DAYS.length}日です。12/26・12/27は土日、12/31〜1/3は銀行の休日です。\n年をまたぐ支払いの予定は、銀行の営業日を数えて、組み立てましょう。`,
    },
  ],
  sources: [SRC_BANK_ACT],
  mandatory: false,
  squareLabel: '年内の支払',
};

/** 12/25 固定資産税 第3期（必須・租税公課 ／ 普通預金）。 */
const fixedAssetTax3: Card = {
  id: 'c12_fixed_asset_tax_3',
  kind: 'DEADLINE',
  title: '固定資産税 第3期の納付',
  date: mkDate(8, 25),
  skill: 'tax',
  situation:
    '市から届いた納税通知書を見ながら、固定資産税（償却資産）の第3期分を納めます。納期限は今日（12/25）です。納付書を持って銀行へ行くか、ネットバンキングで納付しましょう。',
  facts: [
    {
      caption: '固定資産税（償却資産）の納付状況',
      headers: ['項目', '金額'],
      rows: [
        ['年税額（4期に分けて納付）', PAYMENTS.fixedAssetTaxInstallment * 4],
        ['第3期の納付額（12月）', PAYMENTS.fixedAssetTaxInstallment],
        ['第1期（4月）・第2期（7月）', '納付済み'],
        ['第4期（2月25日）', '未納'],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '固定資産税の納期限は、どのように確認しますか。',
      options: [
        '国が全国一律で決めているので、どの市町村でも同じ日になる',
        '市町村が条例で決めていて、納税通知書に各期の納期限が書いてある',
        '3月決算の会社は、法人税と同じく決算日の翌日から2か月以内',
        '源泉所得税と同じく、毎月翌月10日までに納める',
      ],
      answer: 1,
      hints: ['固定資産税は、市町村が課す地方税です。', '納める時期は、毎年届く書類で確認できます。'],
      explain:
        '固定資産税（償却資産を含む）の納期は、4月・7月・12月・翌年2月中で、市町村が条例で定めます。特別の事情があるときは、異なる納期にすることもできます（地方税法第362条）。たとえば東京23区は、令和8年度の固定資産税・都市計画税の納期限を、6/30・9/30・12/28・令和9年3/1と公表しています。\n会社がある市町村の納期限は、毎年届く納税通知書（納付書）で確認しましょう。納期限を過ぎると、延滞金がかかります。',
    },
    {
      id: 'q2',
      type: 'journal',
      prompt: `固定資産税（償却資産）の第3期分 ${formatYen(PAYMENTS.fixedAssetTaxInstallment)} を、普通預金から納付しました。この仕訳をしてください。`,
      accounts: ['dues', 'bank', 'corp_tax', 'tax_payable', 'prepaid', 'payable'],
      expected: [[dr('dues', PAYMENTS.fixedAssetTaxInstallment), cr('bank', PAYMENTS.fixedAssetTaxInstallment)]],
      memo: '固定資産税（償却資産）第3期の納付',
      traps: [
        {
          account: 'corp_tax',
          side: 'debit',
          message: '法人税等は、利益にかかる法人税・住民税・事業税です。固定資産税は、「租税公課」で処理します。',
        },
        {
          account: 'tax_payable',
          side: 'debit',
          message: '未払法人税等は、法人税等の負債です。固定資産税は、納めたときに、そのまま租税公課（費用）にします。',
        },
        {
          account: 'prepaid',
          side: 'debit',
          message: '前払費用にするのは、来期のぶんを先に払った場合です。今回の第3期分は今年度の税金なので、費用（租税公課）にします。',
        },
      ],
      hints: [
        '固定資産税は、会社が負担する税金の費用です。',
        '法人税・住民税・事業税（法人税等）とは、別の科目を使います。',
        `借方：租税公課 ${formatYen(PAYMENTS.fixedAssetTaxInstallment)} ／ 貸方：普通預金 ${formatYen(PAYMENTS.fixedAssetTaxInstallment)}`,
      ],
      explain: `固定資産税は、会社が持っている資産にかかる税金で、費用として「租税公課」に計上します（法人税等とは別の科目です）。第3期分の${formatYen(PAYMENTS.fixedAssetTaxInstallment)}を普通預金から納めるので、貸方は普通預金です。`,
    },
  ],
  penalty: { amount: 3_000, reason: '納付が遅れ、延滞金がかかった' },
  sources: [SRC_LOCAL_TAX_ACT, SRC_TOKYO_FIXED],
  mandatory: true,
  squareLabel: '固定資産税',
};

/** 10〜12月のカード。同じ日付のカードは、この並びの順に盤面へ並ぶ。 */
export const cards: CardDef[] = [
  nenchoDocs,
  invoiceLedger,
  nenchoCheck,
  interimCalc,
  interimCorporateTax,
  interimConsumptionTax,
  nenchoCalc,
  residentTax2,
  bonusWinter,
  yearEndAdjustment,
  yearEndPayments,
  fixedAssetTax3,
];
