/**
 * カードパネルの動作確認用ハーネス（開発専用。本体からは読み込まない）。
 * 全カード種別のフィクスチャと、reducer の約束どおりに動く簡易モックの GameStore を持つ。
 * 開く: http://localhost:3100/dev/card.html （?card=journal|calc|audit|decision|deadline|report）
 */
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';
import { accountName, cr, diffLines, dr, linesEqual, type JournalLine } from '@/core/accounting';
import type { Action, GameEvent, GameState, GameStore, QuestionProgress, QuestionResult, Scenario, StoreListener } from '@/core/game/types';
import type { Answer, Card, Judgement, Question } from '@/core/tasks/types';
import { formatYen, mkDate } from '@/core/types';
import { createCardPanel } from '@/ui/card';
import { el } from '@/ui/dom';

// ---------------------------------------------------------------------------
// フィクスチャ
// ---------------------------------------------------------------------------

const journalCard: Card = {
  id: 'h-journal',
  kind: 'JOURNAL',
  title: '事務用パソコンの購入と支払',
  date: mkDate(0, 25),
  skill: 'bookkeeping',
  situation:
    '営業部の新人が使うノートパソコンを、家電量販店から購入しました。請求書が届いています。代金は翌月に振り込む約束です。消費税は税抜経理で処理します。',
  facts: [
    {
      caption: '請求書（4/25 付）',
      headers: ['品名', '数量', '単価（税抜）', '金額（税込）'],
      rows: [['ノートパソコン', 1, 200000, 220000]],
      numericColumns: [1, 2, 3],
    },
  ],
  questions: [
    {
      id: 'h-j1',
      type: 'journal',
      prompt: '4/25 の購入を仕訳してください（代金は未払）。',
      accounts: ['equipment', 'input_tax', 'payable', 'ap', 'bank', 'supplies', 'cash'],
      expected: [[dr('equipment', 200000), dr('input_tax', 20000), cr('payable', 220000)]],
      memo: 'ノートパソコン購入（未払）',
      traps: [{ account: 'ap', side: 'credit', message: '買掛金は商品の仕入代金に使う科目です。備品の代金は「未払金」で処理します。' }],
      hints: [
        '商品以外のものを買って、代金をまだ払っていないときの科目を考えます。',
        '税抜経理では、消費税 20,000 円は「仮払消費税」として借方に分けます。',
        '借方は 備品 200,000 と 仮払消費税 20,000、貸方は 未払金 220,000 です。',
      ],
      explain:
        'パソコンは長く使う道具なので「備品」（資産）です。代金の未払は商品以外なので「未払金」。\n消費税は税抜経理のため、本体価格と分けて仮払消費税に入れます。',
    },
    {
      id: 'h-j2',
      type: 'journal',
      prompt:
        '翌月、請求書どおりに普通預金から振り込みました。振込手数料 330 円（税込。うち消費税 30 円）は当社負担で、同じ口座から引かれています。',
      accounts: ['payable', 'ap', 'fee', 'input_tax', 'bank', 'cash', 'comm'],
      expected: [[dr('payable', 220000), dr('fee', 300), dr('input_tax', 30), cr('bank', 220330)]],
      memo: 'パソコン代金の支払と振込手数料',
      hints: ['借方が 3 行になります。「＋行を追加」を使いましょう。'],
      explain: '未払金を消し込み、手数料は支払手数料（税抜 300 円）と仮払消費税 30 円に分けます。',
    },
    {
      id: 'h-j3',
      type: 'choice',
      prompt: '購入したパソコンは、貸借対照表のどこに表示されますか。',
      options: ['流動資産', '固定資産', '流動負債', '販売費及び一般管理費'],
      answer: 1,
      explain: '備品は 1 年を超えて使う固定資産です。販売費及び一般管理費は損益計算書の区分です。',
    },
  ],
  sources: [
    { label: '国税庁 タックスアンサー（消費税）', url: 'https://www.nta.go.jp/', asOf: '2026-06-01', verified: 'primary' },
  ],
  monthClose: true,
  mandatory: true,
  squareLabel: '備品購入',
};

const calcCard: Card = {
  id: 'h-calc',
  kind: 'CALC',
  title: '月次の売上と回収の確認',
  date: mkDate(2, 25),
  skill: 'cash',
  situation: '社長から「今月の数字をざっくり教えて」と頼まれました。下の資料から計算してください。',
  facts: [
    {
      caption: '今月の売上・原価（税抜）',
      headers: ['項目', '金額'],
      rows: [
        ['売上', 1500000],
        ['売上原価', 900000],
        ['月末の売掛金残高', 500000],
      ],
      numericColumns: [1],
    },
    {
      caption: '従業員名簿',
      headers: ['氏名', '雇用形態', '週の労働時間'],
      rows: [
        ['佐藤', '正社員', 40],
        ['鈴木', 'パート', 32],
        ['高橋', 'パート', 15],
        ['田中', 'アルバイト', 30],
        ['伊藤', 'アルバイト', 12],
      ],
      numericColumns: [2],
    },
  ],
  questions: [
    {
      id: 'h-c1',
      type: 'number',
      unit: 'yen',
      prompt: '売上（税抜）に対する消費税（10%）はいくらですか。',
      answer: 150000,
      hints: ['税抜の金額に 10% を掛けます。', '1,500,000 × 0.1 です。'],
      explain: '1,500,000 円 × 10% = 150,000 円。仮受消費税として処理します。',
    },
    {
      id: 'h-c2',
      type: 'number',
      unit: 'percent',
      prompt: '売上総利益率は何％ですか（小数点以下があれば入力してください）。',
      answer: 40,
      tolerance: 0.5,
      hints: ['売上総利益 ÷ 売上 × 100 です。'],
      explain: '売上総利益は 1,500,000 − 900,000 = 600,000 円。600,000 ÷ 1,500,000 = 40%。',
    },
    {
      id: 'h-c3',
      type: 'number',
      unit: 'days',
      prompt: '売掛金の回収日数は何日ですか（1 か月を 30 日として計算）。',
      answer: 10,
      explain: '売掛金 500,000 ÷ 売上 1,500,000 × 30 日 = 10 日。',
    },
    {
      id: 'h-c4',
      type: 'number',
      unit: 'people',
      prompt: '週の労働時間が 30 時間以上の従業員は何人ですか。',
      answer: 3,
      hints: ['名簿の右の列を上から見ていきます。'],
      explain: '佐藤（40）・鈴木（32）・田中（30）の 3 人です。',
    },
  ],
  penalty: { amount: 12000, reason: '数字の誤りが申告に使われ、延滞税 12,000 円がかかりました。' },
  sources: [
    { label: '国税庁 タックスアンサー（消費税の税率）', url: 'https://www.nta.go.jp/', asOf: '2026-06-01', verified: 'primary' },
    { label: 'ある会計ブログ「回収日数の見方」', url: 'https://example.com/blog/dso', asOf: '2026-05-20', verified: 'secondary' },
  ],
  mandatory: false,
  squareLabel: '月次の確認',
};

const auditCard: Card = {
  id: 'h-audit',
  kind: 'AUDIT',
  title: '普通預金の通帳と帳簿の突合',
  date: mkDate(0, 30),
  skill: 'audit',
  situation: '月末の預金残高が帳簿と通帳で合いません。1 行ずつ突き合わせて、誤りのある行を見つけてください。',
  facts: [
    {
      caption: '帳簿（普通預金の出納）',
      headers: ['日付', '摘要', '入金', '出金'],
      rows: [
        ['4/10', '売上入金', 320000, ''],
        ['4/15', '家賃', '', 180000],
        ['4/20', '仕入代金', '', 452000],
        ['4/30', '利息', 3, ''],
      ],
      numericColumns: [2, 3],
    },
    {
      caption: '通帳の記帳',
      headers: ['日付', '摘要', '入金', '出金'],
      rows: [
        ['4/10', 'ウリアゲ', 320000, ''],
        ['4/15', 'ヤチン', '', 108000],
        ['4/20', 'シイレ', '', 452000],
        ['4/25', 'フリコミテスウリョウ', '', 330],
        ['4/30', 'リソク', 3, ''],
      ],
      numericColumns: [2, 3],
    },
  ],
  questions: [
    {
      id: 'h-a1',
      type: 'multi',
      prompt: '帳簿と通帳が一致していない行を、すべて選んでください。',
      options: [
        '4/10 売上入金 320,000 円',
        '4/15 家賃 帳簿 180,000 円 ／ 通帳 108,000 円',
        '4/20 仕入代金 452,000 円',
        '4/25 振込手数料 通帳にあるが帳簿に記録なし',
        '4/30 利息 3 円',
      ],
      answer: [1, 3],
      hints: ['金額の桁や数字の並びが入れ替わっていないか見ます。', '通帳にだけある行にも注意します。'],
      explain: '家賃は数字の入れ替わり（180,000 と 108,000）。振込手数料は帳簿に記入漏れです。',
    },
  ],
  mandatory: true,
  squareLabel: '預金突合',
};

const decisionCard: Card = {
  id: 'h-decision',
  kind: 'DECISION',
  title: '資金繰りが厳しい月の支払判断',
  date: mkDate(4, 5),
  skill: 'cash',
  situation:
    '来週に仕入先への支払 800,000 円と、社会保険料の納付があります。普通預金の残高は足りますが、月末に大きな支払が続きます。社長から「どうしたらいい？」と相談されました。',
  questions: [
    {
      id: 'h-d1',
      type: 'choice',
      prompt: 'あなたならどう提案しますか。',
      options: [
        '納付期限のある社会保険料を先に払い、仕入先には事情を話して支払日の相談をする',
        '仕入先の支払を優先し、社会保険料は来月まとめて納付する',
        '支払日が近いものから順に、相談せずにそのまま払う',
        '銀行から借入れて全部払う',
      ],
      answer: 0,
      partial: [2],
      hints: ['法定の納期限があるものは、延ばせません。'],
      explain: '社会保険料は納期限を過ぎると延滞金がかかります。取引先との支払日は、事前の相談で調整できる場合があります。',
    },
    {
      id: 'h-d2',
      type: 'choice',
      prompt: '社長に月末までの資金の見通しを伝えるために、最初に作る資料はどれですか。',
      options: ['資金繰り表', '貸借対照表', '固定資産台帳'],
      answer: 0,
      explain: '入出金の予定を月単位・週単位で並べる資金繰り表が、資金の見通しを一番よく伝えます。',
    },
  ],
  mandatory: false,
  squareLabel: '資金相談',
};

const deadlineCard: Card = {
  id: 'h-deadline',
  kind: 'DEADLINE',
  title: '源泉所得税の納付期限',
  date: mkDate(3, 10),
  skill: 'tax',
  situation: '従業員 9 人以下の会社なので、源泉所得税の納期の特例を受けています。今日は 7/10（金）です。',
  questions: [
    {
      id: 'h-dl1',
      type: 'choice',
      prompt: '納期の特例を受けている場合、1〜6 月に支払った給与の源泉所得税の納付期限はいつですか。',
      options: ['7 月 10 日', '6 月 30 日', '8 月 10 日', '翌年 1 月 20 日'],
      answer: 0,
      hints: ['年に 2 回あります。', '半年分をまとめて、翌月の 10 日までです。'],
      explain: '納期の特例では、1〜6 月分は 7 月 10 日、7〜12 月分は翌年 1 月 20 日が期限です。',
    },
  ],
  postings: [{ id: 'h-dl-p1', memo: '源泉所得税の納付（1〜6 月分）', lines: [dr('wh_income', 180000), cr('bank', 180000)] }],
  penalty: { amount: 5000, reason: '期限に遅れたため、不納付加算税と延滞税 5,000 円がかかりました。' },
  sources: [
    { label: '国税庁 源泉所得税の納期の特例', url: 'https://www.nta.go.jp/', asOf: '2026-06-01', verified: 'primary' },
    { label: '解説サイト「納期の特例のポイント」', url: 'https://example.com/tokurei', asOf: '2026-05-20', verified: 'secondary' },
  ],
  mandatory: true,
  squareLabel: '源泉納付',
};

const reportCard: Card = {
  id: 'h-report',
  kind: 'REPORT',
  title: '月次報告：先月との比較と原因の説明',
  date: mkDate(5, 30),
  skill: 'bookkeeping',
  situation:
    '月次決算がまとまりました。社長への報告会で、先月と比べた変化とその原因を説明します。売上は伸びたのに、利益が思ったほど増えていません。何が起きているのか、資料から読み取ってください。報告のポイントを 1 つ選びます。',
  facts: [
    {
      caption: '月次損益の比較（税抜・円）',
      headers: ['項目', '先月', '今月', '増減', '予算', '達成率'],
      rows: [
        ['売上', 1200000, 1500000, 300000, 1400000, '107%'],
        ['売上原価', 720000, 990000, 270000, 840000, '118%'],
        ['売上総利益', 480000, 510000, 30000, 560000, '91%'],
        ['販売費及び一般管理費', 350000, 360000, 10000, 350000, '103%'],
        ['営業利益', 130000, 150000, 20000, 210000, '71%'],
      ],
      numericColumns: [1, 2, 3, 4, 5],
    },
  ],
  questions: [
    {
      id: 'h-r1',
      type: 'choice',
      prompt: '売上は予算を上回ったのに営業利益が予算に届いていません。報告のポイントとして最も適切なものはどれですか。',
      options: [
        '売上原価率が上がっている（60% → 66%）ので、仕入れ価格や値引きの状況を確認する',
        '販売費及び一般管理費が予算より増えたので、経費の削減を最優先に伝える',
        '売上が予算を上回っているので、問題はないと報告する',
        '営業利益は前月より増えているので、そのまま報告する',
        '営業外収益を増やす方法を提案する',
        '在庫を減らして原価を下げる',
        '決算まで様子を見る',
        '税理士に相談してから報告する',
        '来月の予算を引き下げる',
        '先月の数字は忘れて今月だけ説明する',
      ],
      answer: 0,
      hints: ['売上総利益率が先月から下がっていないか見ます。', '原価率＝売上原価 ÷ 売上 です。', '先月 60%、今月 66% です。'],
      explain:
        '売上原価の伸び（118%）が売上の伸び（107%）を上回り、売上総利益が予算に届いていません。\n原価率が 6 ポイント悪化した原因（仕入れ値・値引き・返品など）を確認して説明するのが要点です。\n\n経費は予算の 103% とほぼ計画どおりで、主因ではありません。',
    },
  ],
  mandatory: true,
  monthClose: true,
  squareLabel: '月次報告',
};

const FIXTURES: readonly { readonly key: string; readonly label: string; readonly card: Card }[] = [
  { key: 'journal', label: 'JOURNAL 仕訳（月次決算・3問）', card: journalCard },
  { key: 'calc', label: 'CALC 計算（4問・ペナルティ）', card: calcCard },
  { key: 'audit', label: 'AUDIT 誤り探し（複数選択）', card: auditCard },
  { key: 'decision', label: 'DECISION 判断（部分点・2問）', card: decisionCard },
  { key: 'deadline', label: 'DEADLINE 期限（自動計上・出典）', card: deadlineCard },
  { key: 'report', label: 'REPORT 長文・10択・広い表', card: reportCard },
];

// ---------------------------------------------------------------------------
// 簡易モックの GameStore（reducer の約束どおりに動く）
// ---------------------------------------------------------------------------

const MAX_WRONG = 3;
const START_CASH = 1_200_000;

const judge = (q: Question, a: Answer): Judgement => {
  const wrong = (messages: string[]): Judgement => ({ verdict: 'wrong', credit: 0, messages });
  const ok: Judgement = { verdict: 'correct', credit: 1, messages: [] };
  switch (q.type) {
    case 'choice': {
      if (a.type !== 'choice') return wrong(['回答の形式が違います。']);
      if (a.index === q.answer) return ok;
      if (q.partial?.includes(a.index)) {
        return { verdict: 'partial', credit: 0.5, messages: ['方向性は合っていますが、最善の対応ではありません。'] };
      }
      return wrong(['その選択肢は適切ではありません。状況をもう一度見直しましょう。']);
    }
    case 'multi': {
      if (a.type !== 'multi') return wrong(['回答の形式が違います。']);
      const mine = new Set(a.indices);
      const right = new Set(q.answer);
      const extra = [...mine].filter((i) => !right.has(i));
      const missing = [...right].filter((i) => !mine.has(i));
      if (extra.length === 0 && missing.length === 0) return ok;
      const msgs: string[] = [];
      if (extra.length > 0) msgs.push(`誤りではない行が ${extra.length} 件、選ばれています。`);
      if (missing.length > 0) msgs.push(`見落としている誤りが ${missing.length} 件あります。`);
      return wrong(msgs);
    }
    case 'number': {
      if (a.type !== 'number') return wrong(['回答の形式が違います。']);
      return Math.abs(a.value - q.answer) <= (q.tolerance ?? 0) ? ok : wrong(['計算をやり直してみましょう。単位と桁も確かめます。']);
    }
    case 'journal': {
      if (a.type !== 'journal') return wrong(['回答の形式が違います。']);
      if (q.expected.some((e) => linesEqual(e, a.lines))) return ok;
      const msgs: string[] = [];
      for (const t of q.traps ?? []) {
        if (a.lines.some((l) => l.account === t.account && l.side === t.side)) msgs.push(t.message);
      }
      const side = (s: JournalLine['side']): string => (s === 'debit' ? '借方' : '貸方');
      for (const d of diffLines(q.expected[0] ?? [], a.lines)) {
        if (d.type === 'missing') msgs.push(`${side(d.line.side)}に「${accountName(d.line.account)}」が必要です。`);
        else if (d.type === 'extra') msgs.push(`${side(d.line.side)}の「${accountName(d.line.account)}」は不要です。`);
        else if (d.type === 'wrong_amount') msgs.push(`「${accountName(d.account)}」の金額が違います（入力 ${formatYen(d.actual)}）。`);
        else msgs.push(`「${accountName(d.account)}」は${side(d.expectedSide)}に書きます。`);
      }
      return wrong(msgs);
    }
  }
};

type MockStore = GameStore & { start(card: Card): void };

const createMockStore = (): MockStore => {
  const scenario = { id: 'harness', companyName: 'ハーネス商店' } as unknown as Scenario;
  const initial: GameState = {
    version: 1,
    scenarioId: 'harness',
    seed: 1,
    rngState: 1,
    phase: 'idle',
    turn: 1,
    position: 0,
    date: mkDate(0, 1),
    book: { opening: [], entries: [] },
    autoCursor: 0,
    resources: { trust: 50, skillPoints: { bookkeeping: 0, tax: 0, labor: 0, cash: 0, audit: 0 } },
    records: [],
  };
  let state = initial;
  const listeners = new Set<StoreListener>();
  const emit = (events: readonly GameEvent[] = []): void => {
    for (const l of [...listeners]) l(state, events);
  };

  const progressOf = (p: Partial<QuestionProgress>): QuestionProgress => ({
    questionIndex: 0,
    wrong: 0,
    hintsUsed: 0,
    results: [],
    revealed: false,
    ...p,
  });

  const dispatch = (action: Action): readonly GameEvent[] => {
    const active = state.active;
    if (!active) return [];
    const { card, progress } = active;
    const q = card.questions[progress.questionIndex];

    if (action.type === 'HINT' && state.phase === 'question' && q) {
      const max = q.hints?.length ?? 0;
      if (progress.hintsUsed < max) {
        state = { ...state, active: { ...active, progress: { ...progress, hintsUsed: progress.hintsUsed + 1 } } };
        emit();
      }
      return [];
    }

    if (action.type === 'SUBMIT' && state.phase === 'question' && q) {
      const j = judge(q, action.answer);
      let next: QuestionProgress = { ...progress, lastAnswer: action.answer, lastJudgement: j };
      if (j.verdict === 'wrong') {
        const wrong = progress.wrong + 1;
        next = { ...next, wrong, revealed: wrong >= MAX_WRONG };
      }
      if (j.verdict !== 'wrong' || next.revealed) {
        const base = j.verdict === 'partial' ? 0.5 : j.verdict === 'correct' ? 1 : 0;
        const credit = next.revealed ? 0 : Math.max(0, Math.round((base - 0.1 * progress.hintsUsed - 0.2 * next.wrong) * 100) / 100);
        const result: QuestionResult = { questionId: q.id, credit, wrong: next.wrong, hints: progress.hintsUsed, autoSolved: next.revealed };
        next = { ...next, results: [...progress.results, result] };
      }
      state = { ...state, phase: 'feedback', active: { ...active, progress: next } };
      emit([{ type: 'answered', verdict: j.verdict }]);
      return [];
    }

    if (action.type === 'CONTINUE') {
      if (state.phase === 'feedback' && q) {
        const j = progress.lastJudgement;
        if (j?.verdict === 'wrong' && !progress.revealed) {
          state = { ...state, phase: 'question' }; // 再挑戦（前回の回答は残す）
        } else if (progress.questionIndex + 1 < card.questions.length) {
          // 次の設問へ。lastAnswer は消さない（パネルが古い回答を引き継がないことの確認）
          state = {
            ...state,
            phase: 'question',
            active: { ...active, progress: { ...progress, questionIndex: progress.questionIndex + 1, wrong: 0, hintsUsed: 0, revealed: false } },
          };
        } else {
          const score = progress.results.reduce((s, r) => s + r.credit, 0) / Math.max(1, progress.results.length);
          const penalty = score < 0.5 && card.penalty ? card.penalty.amount : 0;
          const posted = (card.postings ?? []).flatMap((p) => p.lines).reduce((s, l) => {
            if (l.account !== 'bank' && l.account !== 'cash') return s;
            return l.side === 'debit' ? s + l.amount : s - l.amount;
          }, 0);
          state = {
            ...state,
            phase: 'cardDone',
            records: [
              ...state.records,
              {
                cardId: card.id,
                title: card.title,
                kind: card.kind,
                date: card.date,
                period: 0,
                monthClose: card.monthClose ?? false,
                score,
                penalty,
                cashDelta: posted - penalty,
                trustDelta: score >= 0.8 ? 2 : score < 0.5 ? -3 : 0,
                results: progress.results,
              },
            ],
          };
        }
        emit();
      } else if (state.phase === 'cardDone') {
        const { active: _drop, ...rest } = state;
        state = { ...rest, phase: 'idle' };
        emit();
      }
    }
    return [];
  };

  return {
    scenario,
    getState: () => state,
    dispatch,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    start: (card) => {
      state = { ...initial, phase: 'question', records: state.records, active: { card, progress: progressOf({}), startCash: START_CASH, startTrust: 50 } };
      emit([{ type: 'cardStarted', cardId: card.id }]);
    },
  };
};

// ---------------------------------------------------------------------------
// ハーネスの画面
// ---------------------------------------------------------------------------

const store = createMockStore();
const log = el('pre');
const logLines: string[] = [];
const origDispatch = store.dispatch;
const logged: MockStore = {
  ...store,
  dispatch: (a) => {
    logLines.unshift(a.type === 'SUBMIT' ? `SUBMIT ${JSON.stringify(a.answer)}` : a.type);
    logLines.length = Math.min(logLines.length, 6);
    log.textContent = logLines.join('\n');
    return origDispatch(a);
  },
};

const ui = document.getElementById('ui');
if (!ui) throw new Error('#ui not found');
const panel = createCardPanel(logged);
ui.append(panel.el);

const startBy = (key: string): void => {
  const f = FIXTURES.find((x) => x.key === key) ?? FIXTURES[0];
  if (f) store.start(f.card);
};

const harness = el(
  'div',
  { attrs: { id: 'harness' } },
  el('h1', { text: 'カードパネル ハーネス' }),
  ...FIXTURES.map((f) => el('button', { text: f.label, attrs: { type: 'button' }, on: { click: () => startBy(f.key) } })),
  el('pre', { text: 'ログ（最新が上）:' }),
  log,
);
ui.append(harness);

// 画面外の自動操作（動作確認用）から触れるようにする
Object.assign(window, { cqStore: logged, cqStart: startBy });

startBy(new URLSearchParams(location.search).get('card') ?? 'journal');
