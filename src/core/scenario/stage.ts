import { accountTotals, cr, dr, incomeStatement, normalBalance, type AccountId, type Book } from '../accounting';
import type { Card, CardContext, CardDef, SourceRef } from '../tasks/types';
import { endOfPeriod, formatYen, mkDate, type GameDate, type Yen } from '../types';
import { COMPANY, MONTH_END_INVENTORY } from './company';

/** 決算ステージのカード（翌4〜6月）。決算整理仕訳の日付は期末日（3/31）で計上する。 */

const FY_END: GameDate = endOfPeriod(11);

const SRC_YAYOI: SourceRef = {
  label: '弥生 経理業務がわかる年間スケジュール（法人向け）',
  url: 'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/keri-schedule/',
  asOf: '2026-09-26',
  verified: 'secondary',
};
const SRC_INVOICE: SourceRef = {
  label: '請求ABC 経理の仕事内容を一覧で解説（日次・月次・年次）',
  url: 'https://media.invoice.ne.jp/column/industry-tips/accounting-Schedule.html',
  asOf: '2026-09-26',
  verified: 'secondary',
};

const bal = (book: Book, id: AccountId, upTo: GameDate = FY_END): Yen =>
  normalBalance(accountTotals(book, { upTo }), id);

const ROUND_DOWN_100 = (n: Yen): Yen => Math.floor(n / 100) * 100;

// ---------------------------------------------------------------------------
// 4月：決算整理
// ---------------------------------------------------------------------------

/** 実地棚卸の結果から、期末商品棚卸高を確定する。 */
const stocktake: Card = {
  id: 's01_stocktake',
  kind: 'AUDIT',
  title: '実地棚卸の結果を確認する',
  date: mkDate(12, 2),
  skill: 'audit',
  situation:
    '3月末の実地棚卸の集計表が届きました。倉庫には他社の物も、すでに売った物も置かれています。決算に使う「期末商品棚卸高」を確定しましょう。',
  facts: [
    {
      caption: '実地棚卸の集計表（3/31）',
      headers: ['区分', '金額'],
      rows: [
        ['倉庫の通常在庫', 5_250_000],
        ['棚に置いてある見本品（自社の物）', 150_000],
        ['取引先からの預かり品（他社の物）', 200_000],
        ['得意先へ出荷済みの商品（売上に計上済み）', 300_000],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'multi',
      prompt: '期末商品棚卸高に「含めてはいけない」区分を、すべて選んでください。',
      options: ['倉庫の通常在庫', '棚に置いてある見本品（自社の物）', '取引先からの預かり品（他社の物）', '得意先へ出荷済みの商品（売上に計上済み）'],
      answer: [2, 3],
      hints: [
        '期末商品は「会社が所有している、まだ売れていない商品」です。',
        '他社の物は会社の資産ではありません。売上に計上した商品は、すでに会社の物ではありません。',
      ],
      explain:
        '預かり品は他社の物なので、会社の資産ではありません。出荷済みで売上に計上した商品は、すでに売れているので在庫ではありません。二重に数えると、売上原価が小さくなり、利益が実際より大きくなってしまいます。',
    },
    {
      id: 'q2',
      type: 'number',
      prompt: '期末商品棚卸高はいくらですか。',
      unit: 'yen',
      answer: MONTH_END_INVENTORY[11] ?? 0,
      hints: ['含めてよい区分を足します。'],
      explain: `通常在庫 5,250,000円 ＋ 見本品 150,000円 ＝ ${formatYen(MONTH_END_INVENTORY[11] ?? 0)}。`,
    },
  ],
  sources: [SRC_YAYOI],
  mandatory: true,
  squareLabel: '実地棚卸',
  squareType: 'special',
};

/** 売上原価の算定（三分法の決算整理）。 */
const adjustInventory: Card = {
  id: 's02_adj_inventory',
  kind: 'JOURNAL',
  title: '売上原価を算定する（決算整理）',
  date: mkDate(12, 5),
  bookDate: FY_END,
  skill: 'bookkeeping',
  situation:
    '三分法では、期中に「仕入」で処理した商品のうち売れ残りを、決算で「繰越商品」に振り替えて売上原価を出します。期首の商品を仕入へ、期末の商品を繰越商品へ、2本の仕訳を切ります。',
  facts: [
    {
      caption: '商品の棚卸高',
      headers: ['項目', '金額'],
      rows: [
        ['期首商品棚卸高（繰越商品の期首残高）', MONTH_END_INVENTORY[-1] ?? 0],
        ['期末商品棚卸高（実地棚卸で確定）', MONTH_END_INVENTORY[11] ?? 0],
      ],
      numericColumns: [1],
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'journal',
      prompt: '① 期首商品棚卸高を、仕入に振り替える仕訳。',
      accounts: ['purchases', 'inventory', 'sales', 'ap', 'misc', 'cash'],
      expected: [[dr('purchases', MONTH_END_INVENTORY[-1] ?? 0), cr('inventory', MONTH_END_INVENTORY[-1] ?? 0)]],
      memo: '期首商品棚卸高の仕入への振替',
      hints: ['期首の商品は、期中に売れたと考えて費用（仕入）に加えます。', '借方：仕入 ／ 貸方：繰越商品'],
      explain: '期首にあった商品は、当期に売れたものとして「仕入」に加えます。繰越商品は貸方に記入して、いったんゼロにします。',
    },
    {
      id: 'q2',
      type: 'journal',
      prompt: '② 期末商品棚卸高を、繰越商品に振り替える仕訳。',
      accounts: ['purchases', 'inventory', 'sales', 'ap', 'misc', 'cash'],
      expected: [[dr('inventory', MONTH_END_INVENTORY[11] ?? 0), cr('purchases', MONTH_END_INVENTORY[11] ?? 0)]],
      memo: '期末商品棚卸高の繰越商品への振替',
      hints: ['売れ残った商品は資産（繰越商品）に戻し、その分の仕入（費用）を減らします。', '借方：繰越商品 ／ 貸方：仕入'],
      explain: '期末に売れ残った商品は、来期に売る資産なので「繰越商品」にします。同じ額だけ「仕入」を減らすと、仕入の残高が売上原価になります。',
    },
  ],
  sources: [SRC_INVOICE],
  mandatory: true,
  squareLabel: '売上原価',
};

/** 貸倒引当金（差額補充法）。期末売掛金は帳簿から。 */
const adjustAllowance = (ctx: CardContext): Card => {
  const ar = bal(ctx.book, 'ar');
  const target = Math.round(ar * COMPANY.allowanceRate);
  const existing = bal(ctx.book, 'allowance');
  const add = target - existing;
  return {
    id: 's03_adj_allowance',
    kind: 'JOURNAL',
    title: '貸倒引当金を設定する（決算整理）',
    date: mkDate(12, 8),
    bookDate: FY_END,
    skill: 'bookkeeping',
    situation:
      '得意先の中には、来期に代金を回収できなくなる会社が出るかもしれません。期末の売掛金の一定割合を「貸倒引当金」として見積もります。すでにある残高との差額だけを繰り入れます（差額補充法）。',
    facts: [
      {
        caption: '貸倒引当金の設定条件',
        headers: ['項目', '内容'],
        rows: [
          ['期末の売掛金', ar],
          ['設定率', `${COMPANY.allowanceRate * 100}%`],
          ['貸倒引当金の現在の残高', existing],
        ],
        numericColumns: [1],
      },
    ],
    questions: [
      {
        id: 'q1',
        type: 'number',
        prompt: '期末に必要な貸倒引当金の額（売掛金 × 設定率）はいくらですか。',
        unit: 'yen',
        answer: target,
        hints: [`${formatYen(ar)} × ${COMPANY.allowanceRate * 100}% を計算します。`],
        explain: `${formatYen(ar)} × ${COMPANY.allowanceRate * 100}% = ${formatYen(target)}。`,
      },
      {
        id: 'q2',
        type: 'number',
        prompt: '今回、貸倒引当金繰入として計上する額（差額補充法）はいくらですか。',
        unit: 'yen',
        answer: add,
        hints: ['必要な額から、すでにある残高を引きます。'],
        explain: `必要な額 ${formatYen(target)} − 現在の残高 ${formatYen(existing)} = ${formatYen(add)}。差額だけを補充するので、残高全体を入れ直さないのがポイントです。`,
      },
      {
        id: 'q3',
        type: 'journal',
        prompt: '貸倒引当金を設定する仕訳をしてください。',
        accounts: ['bad_debt_exp', 'allowance', 'bad_debt_loss', 'ar', 'misc', 'inventory'],
        expected: [[dr('bad_debt_exp', add), cr('allowance', add)]],
        memo: '貸倒引当金の設定（差額補充法）',
        traps: [{ account: 'bad_debt_loss', side: 'debit', message: '貸倒損失は、実際に回収できなくなったときの科目です。見積もりの繰入は「貸倒引当金繰入」です。' }],
        hints: ['費用は貸倒引当金繰入、貸方は評価勘定の貸倒引当金です。', `借方：貸倒引当金繰入 ${formatYen(add)} ／ 貸方：貸倒引当金 ${formatYen(add)}`],
        explain: '見積もりの費用は「貸倒引当金繰入」、評価勘定は「貸倒引当金」です。売掛金そのものは減らしません。',
      },
    ],
    sources: [SRC_INVOICE],
    mandatory: true,
    squareLabel: '貸倒引当金',
  };
};

/** 消費税の精算（税抜経理）。 */
const adjustConsumptionTax = (ctx: CardContext): Card => {
  const output = bal(ctx.book, 'output_tax');
  const input = bal(ctx.book, 'input_tax');
  const net = output - input;
  const interim = -bal(ctx.book, 'ct_payable'); // 中間納付は借方残高なので符号を反転
  const final = net - interim;
  return {
    id: 's04_adj_consumption_tax',
    kind: 'JOURNAL',
    title: '消費税を精算する（決算整理）',
    date: mkDate(12, 12),
    bookDate: FY_END,
    skill: 'tax',
    situation:
      '税抜経理では、期中に「仮受消費税」「仮払消費税」を記録してきました。決算で両方を相殺し、納める消費税を「未払消費税等」に振り替えます。すでに払った中間納付は、未払消費税等の借方に残っています。',
    facts: [
      {
        caption: '消費税の残高（3/31）',
        headers: ['項目', '金額'],
        rows: [
          ['仮受消費税（貸方残高）', output],
          ['仮払消費税（借方残高）', input],
          ['中間納付済みの額（未払消費税等の借方残高）', interim],
        ],
        numericColumns: [1],
      },
    ],
    questions: [
      {
        id: 'q1',
        type: 'number',
        prompt: '仮受消費税から仮払消費税を差し引いた、1年間の納税額（中間納付前）はいくらですか。',
        unit: 'yen',
        answer: net,
        hints: ['仮受 − 仮払 です。'],
        explain: `${formatYen(output)} − ${formatYen(input)} = ${formatYen(net)}。`,
      },
      {
        id: 'q2',
        type: 'number',
        prompt: '確定申告で、あらためて納める額（中間納付を差し引いた後）はいくらですか。',
        unit: 'yen',
        answer: final,
        hints: ['1年間の納税額から、中間納付した額を引きます。'],
        explain: `${formatYen(net)} − 中間納付 ${formatYen(interim)} = ${formatYen(final)}。`,
      },
      {
        id: 'q3',
        type: 'journal',
        prompt: '仮受消費税と仮払消費税を相殺し、差額を未払消費税等にする仕訳をしてください。',
        accounts: ['output_tax', 'input_tax', 'ct_payable', 'dues', 'tax_payable', 'payable'],
        expected: [[dr('output_tax', output), cr('input_tax', input), cr('ct_payable', net)]],
        memo: '消費税の精算',
        hints: [
          '仮受消費税は貸方に残っているので、借方に書いて消します。仮払消費税は借方に残っているので、貸方に書いて消します。',
          `差額 ${formatYen(net)} が、納めるべき消費税です。`,
          `借方：仮受消費税 ${formatYen(output)} ／ 貸方：仮払消費税 ${formatYen(input)}、未払消費税等 ${formatYen(net)}`,
        ],
        explain: `仮受と仮払を消し、差額の${formatYen(net)}を「未払消費税等」の貸方に入れます。中間納付でできていた借方の残高と打ち消し合い、未払消費税等の残高は${formatYen(final)}になります。`,
      },
    ],
    sources: [SRC_INVOICE],
    mandatory: true,
    squareLabel: '消費税精算',
  };
};

/** 法人税等の計上。税引前当期純利益は、ここまでの決算整理を反映した帳簿から。 */
const adjustCorporateTax = (ctx: CardContext): Card => {
  const pretax = incomeStatement(ctx.book).incomeBeforeTax;
  const total = Math.max(0, ROUND_DOWN_100(pretax * COMPANY.effectiveTaxRate));
  const interim = bal(ctx.book, 'tax_prepaid');
  const unpaid = total - interim;
  return {
    id: 's05_adj_corporate_tax',
    kind: 'CALC',
    title: '法人税等を計上する（決算整理）',
    date: mkDate(12, 15),
    bookDate: FY_END,
    skill: 'tax',
    situation:
      '税理士の先生から、今期の法人税等（法人税・住民税・事業税）の概算を出してほしいと依頼がありました。税引前当期純利益に実効税率をかけて（100円未満切捨て）、中間納付ぶんを差し引いた額を「未払法人税等」にします。',
    facts: [
      {
        caption: '法人税等の計算条件（教育用の仮定）',
        headers: ['項目', '内容'],
        rows: [
          ['税引前当期純利益（決算整理後）', pretax],
          ['実効税率', `${COMPANY.effectiveTaxRate * 100}%`],
          ['中間納付済みの額（仮払法人税等）', interim],
        ],
        numericColumns: [1],
      },
    ],
    questions: [
      {
        id: 'q1',
        type: 'number',
        prompt: '今期の法人税等の額（税引前当期純利益 × 実効税率、100円未満切捨て）はいくらですか。',
        unit: 'yen',
        answer: total,
        hints: [`${formatYen(pretax)} × ${COMPANY.effectiveTaxRate * 100}% を計算し、100円未満を切り捨てます。`],
        explain: `${formatYen(pretax)} × ${COMPANY.effectiveTaxRate * 100}% ＝ ${formatYen(pretax * COMPANY.effectiveTaxRate)}。100円未満を切り捨てて ${formatYen(total)}。`,
      },
      {
        id: 'q2',
        type: 'number',
        prompt: '未払法人税等として計上する額（中間納付を差し引いた後）はいくらですか。',
        unit: 'yen',
        answer: unpaid,
        hints: ['法人税等の額から、すでに納めた中間納付額を引きます。'],
        explain: `${formatYen(total)} − 中間納付 ${formatYen(interim)} = ${formatYen(unpaid)}。`,
      },
      {
        id: 'q3',
        type: 'journal',
        prompt: '法人税等を計上する仕訳をしてください。',
        accounts: ['corp_tax', 'tax_prepaid', 'tax_payable', 'dues', 'ct_payable', 'bank'],
        expected: [
          [
            dr('corp_tax', total),
            ...(interim > 0 ? [cr('tax_prepaid', interim)] : []),
            cr('tax_payable', unpaid),
          ],
        ],
        memo: '法人税等の計上',
        hints: [
          '費用は「法人税等」。中間納付で資産になっていた「仮払法人税等」は貸方で消します。',
          `借方：法人税等 ${formatYen(total)} ／ 貸方：仮払法人税等 ${formatYen(interim)}、未払法人税等 ${formatYen(unpaid)}`,
        ],
        explain: `法人税等${formatYen(total)}を費用にし、中間納付した仮払法人税等を消し、残りを未払法人税等（負債）にします。5月末に納付します。`,
      },
    ],
    sources: [SRC_YAYOI],
    mandatory: true,
    squareLabel: '法人税等',
  };
};

/** 決算書の確認。 */
const statementsCheck = (ctx: CardContext): Card => {
  const ni = incomeStatement(ctx.book).netIncome;
  return {
    id: 's06_statements',
    kind: 'REPORT',
    title: '決算書を確認する',
    date: mkDate(12, 25),
    skill: 'audit',
    situation:
      '決算整理がひととおり終わりました。左の「帳簿」から損益計算書と貸借対照表を開いて、数字を確認しましょう。社長に提出する前に、記帳漏れや誤りがないかを点検します。',
    questions: [
      {
        id: 'q1',
        type: 'number',
        prompt: '損益計算書の「当期純利益」はいくらですか。（帳簿を開いて確認）',
        unit: 'yen',
        answer: ni,
        hints: ['帳簿の「損益計算書」タブで、「累計」に切り替えて、いちばん下の当期純利益を読みます。'],
        explain: `当期純利益は${formatYen(ni)}です。損益計算書の最後の行で、貸借対照表の純資産の「当期純利益」と同じ金額になります。`,
      },
      {
        id: 'q2',
        type: 'choice',
        prompt: '貸借対照表の「資産合計」と、必ず一致するものはどれですか。',
        options: ['負債合計と純資産合計の和', '負債合計だけ', '損益計算書の売上高', '純資産合計だけ'],
        answer: 0,
        hints: ['貸借対照表の左側と右側は、いつも同じ金額になります。'],
        explain: '資産 ＝ 負債 ＋ 純資産（会計の基本等式）です。左側（資産）と右側（負債と純資産）の合計は、必ず一致します。',
      },
      {
        id: 'q3',
        type: 'choice',
        prompt: '会社法上、株式会社が作る「計算書類」に含まれるものの組み合わせはどれですか。',
        options: [
          '貸借対照表・損益計算書・株主資本等変動計算書・個別注記表',
          '貸借対照表・損益計算書・キャッシュ・フロー計算書',
          '損益計算書・試算表・総勘定元帳',
          '貸借対照表・試算表・月次報告書',
        ],
        answer: 0,
        hints: ['キャッシュ・フロー計算書は、上場会社などが作るものです。'],
        explain:
          '株式会社の計算書類は、貸借対照表、損益計算書、株主資本等変動計算書、個別注記表です。キャッシュ・フロー計算書は、金融商品取引法の適用がある会社などが作ります（会社計算規則で確認）。',
      },
    ],
    sources: [{ ...SRC_YAYOI, label: '弥生（決算書の作成）※会社計算規則で要確認' }],
    mandatory: true,
    squareLabel: '決算書',
    squareType: 'special',
  };
};

// ---------------------------------------------------------------------------
// 5月：申告と納付
// ---------------------------------------------------------------------------

const filing: Card = {
  id: 's07_tax_filing',
  kind: 'DEADLINE',
  title: '法人税・消費税の申告',
  date: mkDate(13, 15),
  skill: 'tax',
  situation: '税理士の先生から「申告書はいつまでに、どこへ出しますか」と確認の電話です。3月決算の会社の申告と納付を、期限内に終わらせましょう。',
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '3月決算の法人税・消費税の確定申告と納付の期限はいつですか。',
      options: ['5月31日（決算日の翌日から2か月以内）', '4月30日（決算日から1か月以内）', '6月30日（決算日から3か月以内）', '7月10日（納期の特例と同じ）'],
      answer: 0,
      hints: ['期限は「事業年度終了の日の翌日から2か月以内」です。'],
      explain: '法人税・消費税とも、事業年度終了の日の翌日から2か月以内が申告と納付の期限です。3月決算なら5月末（5/31）です。期限を過ぎると延滞税などがかかります。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '消費税の確定申告書は、どこへ提出しますか。',
      options: ['所轄の税務署', '都道府県税事務所', '市区町村', '日本年金機構'],
      answer: 0,
      hints: ['消費税は国税です。'],
      explain: '消費税・法人税は国税なので、所轄の税務署へ提出します。法人事業税は都道府県税事務所、法人住民税は市町村へ、それぞれ提出します。',
    },
    {
      id: 'q3',
      type: 'choice',
      prompt: '決算作業が間に合わないとき、法人税の申告期限を延ばす方法はどれですか。',
      options: [
        '「申告期限の延長の特例」を申請して、1か月延長する',
        '期限を過ぎてから、まとめて申告する',
        '延長はできない',
        '税理士に頼めば自動で延長される',
      ],
      answer: 0,
      hints: ['やむを得ない事情があるときの制度があります。'],
      explain:
        'やむを得ない理由で期限内に申告できないときは「申告期限の延長の特例」の申請で、1か月の延長が認められる場合があります（弥生の解説より。ただし納付期限は延長されないので注意）。',
    },
  ],
  sources: [SRC_YAYOI],
  mandatory: true,
  squareLabel: '申告書',
  squareType: 'deadline',
};

const payTaxes = (ctx: CardContext): Card => {
  const corp = bal(ctx.book, 'tax_payable');
  const ct = bal(ctx.book, 'ct_payable');
  return {
    id: 's08_tax_payment',
    kind: 'DEADLINE',
    title: '法人税等・消費税を納付する',
    date: mkDate(13, 31),
    skill: 'cash',
    situation: '申告書ができました。納付期限は今日（5/31）です。決算で計上した「未払法人税等」と「未払消費税等」を、普通預金から納付します。',
    facts: [
      {
        caption: '納付する額（決算後の残高）',
        headers: ['科目', '金額'],
        rows: [
          ['未払法人税等（法人税・住民税・事業税）', corp],
          ['未払消費税等（消費税・地方消費税）', ct],
          ['合計', corp + ct],
        ],
        numericColumns: [1],
      },
    ],
    questions: [
      {
        id: 'q1',
        type: 'number',
        prompt: '今日、普通預金から納付する総額はいくらですか。',
        unit: 'yen',
        answer: corp + ct,
        hints: ['2つの未払を足します。'],
        explain: `${formatYen(corp)} ＋ ${formatYen(ct)} ＝ ${formatYen(corp + ct)}。納付すると、負債の未払法人税等と未払消費税等はゼロになります。`,
      },
    ],
    postings: [
      {
        id: 'pay',
        memo: '法人税等・消費税の納付',
        lines: [dr('tax_payable', corp), dr('ct_payable', ct), cr('bank', corp + ct)],
      },
    ],
    penalty: { amount: 30_000, reason: '納付が遅れ、延滞税が発生した' },
    sources: [SRC_YAYOI],
    mandatory: true,
    squareLabel: '納付',
    squareType: 'deadline',
  };
};

// ---------------------------------------------------------------------------
// 6月：株主総会（ゴール）
// ---------------------------------------------------------------------------

const agm: Card = {
  id: 's09_agm',
  kind: 'REPORT',
  title: '定時株主総会・1年のふりかえり',
  date: mkDate(14, 25),
  skill: 'audit',
  situation:
    '決算書が承認され、1年が終わりました。3月決算の会社では、株主総会を6月に開くのが一般的です。最後に、この1年で学んだことをふりかえりましょう。',
  questions: [
    {
      id: 'q1',
      type: 'choice',
      prompt: '月次決算を毎月行う目的として、もっとも適切なものはどれですか。',
      options: [
        '経営状況をタイムリーに把握し、早く手を打つため',
        '法律で毎月の提出が義務づけられているため',
        '株主総会で毎月の承認が必要なため',
        '税務署に毎月申告するため',
      ],
      answer: 0,
      hints: ['月次決算は、法律で決められた決算ではありません。'],
      explain:
        '月次決算は法律で義務づけられたものではなく、経営者が状況を素早くつかみ、予算との差に早く対応するための仕組みです。毎月きちんと締めておくと、年次決算の負担も軽くなります。',
    },
    {
      id: 'q2',
      type: 'choice',
      prompt: '3月決算の会社で、定時株主総会を開く時期として一般的なのはいつですか。',
      options: ['6月', '4月', '8月', '12月'],
      answer: 0,
      hints: ['決算書ができて、申告を終えたあとです。'],
      explain: '3月決算の会社は、決算書の作成と申告のあと、6月に定時株主総会を開くのが一般的です（弥生・請求ABC の年間スケジュールより）。',
    },
  ],
  sources: [SRC_YAYOI, SRC_INVOICE],
  mandatory: true,
  squareLabel: '株主総会',
  squareType: 'goal',
};

export const stageCards = (): CardDef[] => [
  stocktake,
  adjustInventory,
  adjustAllowance,
  adjustConsumptionTax,
  adjustCorporateTax,
  statementsCheck,
  filing,
  payTaxes,
  agm,
];
