import { accountTotals, cr, dr, incomeStatement, normalBalance } from '../accounting';
import type { Card, CardContext, CardDef, ChoiceQuestion, JournalQuestion, SourceRef } from '../tasks/types';
import { endOfPeriod, formatYen, mkDate, monthOf, type Yen } from '../types';
import { isBankFeeMonth, monthClosePrimary } from './baseline';
import {
  MONTH_END_COLLECTION,
  MONTH_END_INVENTORY,
  MONTHLY,
  MONTHLY_SALES_BUDGET,
  PAYMENTS,
} from './company';

const SRC_MF: SourceRef = {
  label: 'マネーフォワード 月次決算とは（流れと目的）',
  url: 'https://biz.moneyforward.com/accounting/basic/46320/',
  asOf: '2026-09-26',
  verified: 'secondary',
};

const pct1 = (x: number): string => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

/** 選択肢の並びを月ごとに回して、正解の位置を固定させない。 */
const rotate = <T>(items: readonly T[], answer: number, period: number): { items: T[]; answer: number } => {
  const n = items.length;
  const shift = period % n;
  const out = items.map((_, i) => items[(i + shift) % n] as T);
  return { items: out, answer: (answer - shift + n) % n };
};

const reconcileQuestion = (period: number, bookBank: Yen): { q: ChoiceQuestion; facts: Card['facts'] } => {
  const fee = isBankFeeMonth(period);
  const collected = MONTH_END_COLLECTION;
  const diff = fee ? PAYMENTS.bankFee : collected;
  const bankStatement = bookBank - diff;
  const options = [
    '月末の売掛金の入金が、通帳には翌営業日に載るため（未達）。仕訳は不要',
    '銀行が引き落とした振込手数料を、会社が記帳していないため。手数料の仕訳が必要',
    '売掛金の回収を二重に記帳したため。仕訳の取消しが必要',
    '通帳の記載ミスのため。銀行に訂正を依頼する',
  ];
  const { items, answer } = rotate(options, fee ? 1 : 0, period);
  const detail = fee
    ? ['通帳のみに記載', '振込手数料', PAYMENTS.bankFee]
    : ['帳簿のみに記載（通帳は翌営業日に入金）', '売掛金の回収', collected];
  return {
    facts: [
      {
        caption: '預金残高の照合（普通預金）',
        headers: ['項目', '金額'],
        rows: [
          ['帳簿残高', bookBank],
          ['通帳残高', bankStatement],
          ['差額（帳簿 − 通帳）', diff],
        ],
        numericColumns: [1],
      },
      {
        caption: '差額に対応する明細',
        headers: ['記載', '内容', '金額'],
        rows: [detail],
        numericColumns: [2],
      },
    ],
    q: {
      id: 'reconcile',
      type: 'choice',
      prompt: '帳簿残高と通帳残高の差額の原因として、正しいものはどれですか。',
      options: items,
      answer,
      hints: [
        '差額の金額と、明細の「記載」の欄に注目しましょう。',
        '通帳にだけ載っているものは、会社の記帳が漏れている可能性があります。逆に帳簿にだけ載っているものは、銀行の処理が遅れているだけかもしれません。',
        fee
          ? '通帳にだけ載っている振込手数料は、会社側で記帳する必要があります。'
          : '帳簿にだけ載っている入金は銀行の処理待ちです。会社の帳簿は正しいので、仕訳は要りません。',
      ],
      explain: fee
        ? '通帳にだけ載っている手数料は、会社が記帳していないことが原因です。帳簿を通帳に合わせて、支払手数料を計上します。'
        : '月末の入金が翌営業日に反映される「未達」です。帳簿は正しく、銀行側の処理待ちなので、仕訳は不要です。翌月の通帳で入金を確認します。',
    },
  };
};

const primaryQuestion = (period: number): { q: JournalQuestion; situation: string; fact: NonNullable<Card['facts']>[number] } => {
  if (monthClosePrimary(period) === 'depreciation') {
    return {
      situation: '備品の減価償却費を、月割で計上します。',
      fact: {
        caption: '減価償却の条件',
        headers: ['項目', '内容'],
        rows: [
          ['取得価額', 6_000_000],
          ['耐用年数', '10年'],
          ['償却方法', '定額法・残存価額ゼロ・間接法'],
          ['1か月の減価償却費', '取得価額 ÷ 10年 ÷ 12か月'],
        ],
        numericColumns: [1],
      },
      q: {
        id: 'primary',
        type: 'journal',
        prompt: `今月の減価償却費を仕訳してください。`,
        accounts: ['depreciation', 'accum_dep', 'equipment', 'repair', 'supplies', 'prepaid'],
        expected: [[dr('depreciation', MONTHLY.depreciation), cr('accum_dep', MONTHLY.depreciation)]],
        memo: '減価償却費の計上',
        traps: [
          { account: 'equipment', side: 'credit', message: '備品を直接減らすのは直接法です。このゲームでは間接法（減価償却累計額）で処理します。' },
        ],
        hints: [
          '6,000,000 ÷ 10年 ÷ 12か月 で 1 か月ぶんの金額が出ます。',
          '費用は借方、備品の価値の減りは「減価償却累計額」（貸方）に積み上げます。',
          '借方：減価償却費 50,000 ／ 貸方：減価償却累計額 50,000',
        ],
        explain: `6,000,000円 ÷ 10年 ÷ 12か月 = ${formatYen(MONTHLY.depreciation)}。間接法では、備品そのものは減らさず、減価償却累計額を貸方に積み上げます。`,
      },
    };
  }
  return {
    situation: '年払いした火災保険料のうち、今月ぶんを費用にします。',
    fact: {
      caption: '保険料の条件',
      headers: ['項目', '内容'],
      rows: [
        ['年払いの保険料', PAYMENTS.insuranceAnnual],
        ['保険期間', '12か月'],
        ['1か月の保険料', '年払い保険料 ÷ 12か月'],
        ['払ったときの処理', '前払費用（資産）にしてある'],
      ],
      numericColumns: [1],
    },
    q: {
      id: 'primary',
      type: 'journal',
      prompt: '今月の保険料（前払費用の取り崩し）を仕訳してください。',
      accounts: ['insurance', 'prepaid', 'payable', 'accrued', 'misc', 'bank'],
      expected: [[dr('insurance', MONTHLY.insurance), cr('prepaid', MONTHLY.insurance)]],
      memo: '保険料の月割',
      traps: [{ account: 'bank', side: 'credit', message: '保険料は年払い時に払い済みです。今月は現金・預金は動きません。' }],
      hints: [
        '120,000 ÷ 12か月 で 1 か月ぶんの金額が出ます。',
        '払ったときに資産（前払費用）にしたものを、月ごとに費用へ移します。',
        '借方：保険料 10,000 ／ 貸方：前払費用 10,000',
      ],
      explain: `120,000円 ÷ 12か月 = ${formatYen(MONTHLY.insurance)}。先に払った保険料は前払費用（資産）で、月がたつごとに保険料（費用）へ振り替えます。`,
    },
  };
};

const reportQuestion = (period: number, sales: Yen, budget: Yen, grossMargin: number): { q: ChoiceQuestion; fact: NonNullable<Card['facts']>[number] } => {
  const diff = sales - budget;
  const up = diff >= 0;
  const abs = Math.abs(diff);
  const dir = up ? '上回った' : '下回った';
  const opp = up ? '下回った' : '上回った';
  const options = [
    `売上高は予算を${formatYen(abs)}（${pct1(abs / budget)}）${dir}。売上総利益率は ${pct1(grossMargin)}。`,
    `売上高は予算を${formatYen(abs)}${opp}。売上総利益率は ${pct1(grossMargin)}。`,
    '売上高は予算どおりだったので、月次報告で触れなくてよい。',
    `売上高は予算を${formatYen(abs)}${dir}。売上総利益率は ${pct1(Math.min(0.99, grossMargin + 0.06))}。`,
  ];
  const { items, answer } = rotate(options, 0, period + 1);
  return {
    fact: {
      caption: `${monthOf(period)}月の実績（税抜・決算整理前）`,
      headers: ['項目', '実績', '予算', '差'],
      rows: [['売上高', sales, budget, diff]],
      numericColumns: [1, 2, 3],
    },
    q: {
      id: 'report',
      type: 'choice',
      prompt: '社長への月次報告の一文として、数字と合っているものはどれですか。',
      options: items,
      answer,
      hints: [
        '予算との差は「実績 − 予算」です。プラスなら予算を上回っています。',
        '売上総利益率は、売上総利益 ÷ 売上高 です。',
        '差の向きと、売上総利益率の両方が表の数字と合っている文を選びます。',
      ],
      explain:
        '月次報告は「予算との差（向きと大きさ）」と「利益率」を、数字のとおりに伝えるのが基本です。数字と食い違う報告は、経営判断を誤らせます。',
    },
  };
};

/** その月の月次決算カード。帳簿の数字から作る動的カード。 */
export const monthCloseCard = (period: number): CardDef => {
  const date = endOfPeriod(period);
  const m = monthOf(period);
  return (ctx: CardContext): Card => {
    const totals = accountTotals(ctx.book, { upTo: mkDate(period, 99) });
    const bookBank = normalBalance(totals, 'bank');
    const rec = reconcileQuestion(period, bookBank);
    const primary = primaryQuestion(period);

    const invPrev = MONTH_END_INVENTORY[period - 1] ?? MONTH_END_INVENTORY[-1] ?? 0;
    const invEnd = MONTH_END_INVENTORY[period] ?? 0;
    const pl = incomeStatement(ctx.book, {
      from: mkDate(period, 1),
      to: date,
      inventoryStart: invPrev,
      inventoryEnd: invEnd,
    });
    const budget = MONTHLY_SALES_BUDGET[period] ?? 0;
    const report = reportQuestion(period, pl.sales, budget, pl.sales === 0 ? 0 : pl.grossProfit / pl.sales);

    const feeJournal: JournalQuestion[] = isBankFeeMonth(period)
      ? [
          {
            id: 'fee',
            type: 'journal',
            prompt: '通帳にだけ載っていた振込手数料を、帳簿に記帳してください。',
            accounts: ['fee', 'bank', 'cash', 'misc', 'dues', 'comm'],
            expected: [[dr('fee', PAYMENTS.bankFee), cr('bank', PAYMENTS.bankFee)]],
            memo: '銀行の振込手数料の記帳',
            hints: ['手数料は費用です。預金は減ります。', '借方：支払手数料 ／ 貸方：普通預金'],
            explain: '銀行が引き落とした手数料は、会社の費用（支払手数料）です。預金が減るので、貸方は普通預金になります。',
          },
        ]
      : [];

    return {
      id: `m${String(m).padStart(2, '0')}_close`,
      kind: 'REPORT',
      title: `${m}月の月次決算`,
      date,
      skill: 'audit',
      situation:
        `月末です。社長が「今月の数字を、来月5営業日までに見せてほしい」と言っています。` +
        `通帳と帳簿を照合し、月次の決算整理をして、予算との差を報告しましょう。`,
      facts: [...(rec.facts ?? []), primary.fact, report.fact],
      questions: [rec.q, ...feeJournal, { ...primary.q, prompt: `${primary.situation}\n${primary.q.prompt}` }, report.q],
      sources: [SRC_MF],
      monthClose: true,
      mandatory: true,
      squareLabel: `${m}月締め`,
      squareType: 'monthend',
      keywords: ['月次決算', '残高照合', '予実報告'],
      summary: '通帳と帳簿を照合し、月次の決算整理をして、予算との差を報告する。',
    };
  };
};

export const allMonthCloseCards = (): CardDef[] => Array.from({ length: 12 }, (_, p) => monthCloseCard(p));
