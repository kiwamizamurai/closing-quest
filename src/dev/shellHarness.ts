/**
 * shell / books の動作確認用ハーネス（/dev/shell.html）。
 * core の reducer には依存せず、GameStore インターフェースを満たす簡易モックで全画面を確認する。
 */
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';
import { cr, createBook, dr, entry, postEntries, type JournalEntry, type OpeningBalance } from '@/core/accounting';
import type { Action, FinalScore, GameEvent, GameState, GameStore, Phase, Scenario, Square, SquareType, StoreListener } from '@/core/game/types';
import type { CardKind } from '@/core/tasks/types';
import { daysInPeriod, formatYen, mkDate, monthOf, type GameDate } from '@/core/types';
import { el } from '@/ui/dom';
import { createBooksDrawer } from '@/ui/books';
import { createShell } from '@/ui/shell';

// ---------------------------------------------------------------------------
// フィクスチャ: 盤面・シナリオ
// ---------------------------------------------------------------------------

const board: Square[] = [];
const push = (
  type: SquareType,
  period: number,
  day: number,
  label: string,
  kind?: CardKind,
  mandatory = false,
): void => {
  const index = board.length;
  board.push({
    index,
    type,
    period,
    date: mkDate(period, day),
    label,
    mandatory,
    ...(kind ? { cardKind: kind, cardId: `card-${index}` } : {}),
  });
};
push('start', 0, 1, '期首');
for (let p = 0; p < 12; p++) {
  push('normal', p, 8, '請求書の確認', 'JOURNAL');
  push('deadline', p, 10, '源泉税の納付', 'DEADLINE', true);
  push('event', p, 15, 'できごと', 'CHANCE');
  push('normal', p, 20, p % 2 ? '在庫の確認' : '売上の集計', p % 2 ? 'AUDIT' : 'CALC', p % 3 === 0);
  push('monthend', p, daysInPeriod(p), `${monthOf(p)}月月次決算`, 'REPORT', true);
}
push('special', 12, 10, '決算整理', 'JOURNAL', true);
push('special', 13, 15, '法人税の申告', 'DECISION', true);
push('goal', 14, 10, '決算完了', 'REPORT', true);

const opening: OpeningBalance[] = [
  { account: 'cash', side: 'debit', amount: 200_000 },
  { account: 'bank', side: 'debit', amount: 3_000_000 },
  { account: 'ar', side: 'debit', amount: 1_200_000 },
  { account: 'allowance', side: 'credit', amount: 24_000 },
  { account: 'inventory', side: 'debit', amount: 400_000 },
  { account: 'equipment', side: 'debit', amount: 600_000 },
  { account: 'accum_dep', side: 'credit', amount: 150_000 },
  { account: 'ap', side: 'credit', amount: 800_000 },
  { account: 'payable', side: 'credit', amount: 100_000 },
  { account: 'loan', side: 'credit', amount: 500_000 },
  { account: 'capital', side: 'credit', amount: 3_000_000 },
  { account: 'retained', side: 'credit', amount: 826_000 },
];

const scenario: Scenario = {
  id: 'fixture',
  companyName: 'レモン商会株式会社',
  fiscalYearLabel: '令和8年度',
  opening,
  autoEntries: [],
  cardDefs: [],
  cardDefById: {},
  board,
  monthEndInventory: { [-1]: 400_000, 0: 380_000, 1: 350_000, 2: 420_000, 3: 400_000 },
  monthlySalesBudget: { 0: 550_000, 1: 320_000, 2: 700_000, 3: 700_000 },
  intro: {
    title: '経理部への配属',
    paragraphs: [
      'あなたは、雑貨の卸売を営むレモン商会株式会社の経理担当になりました。社長と税理士さんが、あなたの最初の1年を見守ってくれます。',
      'ルーレットを回して盤面を進み、止まったマスの業務に取り組みます。請求書の仕訳、源泉税の納付、月末の月次決算。ひとつずつ帳簿に積み重ねていきましょう。',
      '1年の終わりには、年次決算が待っています。それまでに、会社の数字を信頼できる形に整えておくのがあなたの仕事です。',
    ],
  },
};

const d = (period: number, day: number): GameDate => mkDate(period, day);
const entries: JournalEntry[] = [
  entry('a1', d(0, 5), '4月分 家賃', 'auto', [dr('rent', 150_000), cr('bank', 150_000)]),
  entry('a2', d(0, 10), '商品売上（掛）', 'auto', [dr('ar', 660_000), cr('sales', 600_000), cr('output_tax', 60_000)]),
  entry('a3', d(0, 12), '商品仕入（掛）', 'auto', [dr('purchases', 300_000), dr('input_tax', 30_000), cr('ap', 330_000)]),
  entry('p1', d(0, 25), '4月分 給与支給', 'player', [
    dr('salaries', 280_000),
    cr('wh_income', 12_000),
    cr('wh_social', 34_000),
    cr('bank', 234_000),
  ]),
  entry('a4', d(0, 28), '売掛金の回収', 'auto', [dr('bank', 500_000), cr('ar', 500_000)]),
  entry('a5', d(1, 5), '5月分 家賃', 'auto', [dr('rent', 150_000), cr('bank', 150_000)]),
  entry('a6', d(1, 8), '商品売上（現金）', 'auto', [dr('cash', 330_000), cr('sales', 300_000), cr('output_tax', 30_000)]),
  entry('a7', d(1, 15), '買掛金の支払', 'auto', [dr('ap', 330_000), cr('bank', 330_000)]),
  entry('a8', d(1, 20), '通信費（回線料金）', 'auto', [dr('comm', 12_000), cr('bank', 12_000)]),
  entry('p2', d(1, 25), '5月分 給与支給', 'player', [
    dr('salaries', 280_000),
    cr('wh_income', 12_000),
    cr('wh_social', 34_000),
    cr('bank', 234_000),
  ]),
  entry('a9', d(1, 30), '売掛金の回収', 'auto', [dr('bank', 300_000), cr('ar', 300_000)]),
  entry('a10', d(1, 31), '預金利息', 'auto', [dr('bank', 3_000), cr('misc_income', 3_000)]),
  entry('a11', d(2, 3), '商品仕入（掛）', 'auto', [dr('purchases', 500_000), dr('input_tax', 50_000), cr('ap', 550_000)]),
  entry('a12', d(2, 5), '6月分 家賃', 'auto', [dr('rent', 150_000), cr('bank', 150_000)]),
  entry('a13', d(2, 10), '商品売上（掛）', 'auto', [dr('ar', 880_000), cr('sales', 800_000), cr('output_tax', 80_000)]),
  entry('a14', d(2, 12), '借入金の利息', 'auto', [dr('interest', 4_000), cr('bank', 4_000)]),
  entry('p3', d(2, 12), '法人税等の中間納付分を計上', 'adjust', [dr('corp_tax', 50_000), cr('tax_payable', 50_000)]),
];

const START_POSITION = 13; // 6/15 のマス

const initialState = (): GameState => ({
  version: 1,
  scenarioId: scenario.id,
  seed: 1,
  rngState: 1,
  phase: 'title',
  turn: 12,
  position: START_POSITION,
  date: board[START_POSITION]?.date ?? d(2, 15),
  book: postEntries(createBook(opening), entries),
  autoCursor: 0,
  resources: {
    trust: 72,
    skillPoints: { bookkeeping: 12, tax: 6, labor: 3, cash: 8, audit: 1 },
  },
  records: [],
});

const finalScore = (rank: FinalScore['rank']): FinalScore => ({
  total: { S: 968, A: 842, B: 716, C: 583, D: 402 }[rank],
  rank,
  accuracy: 0.86,
  monthClose: 0.9,
  yearEnd: 0.78,
  cashScore: 0.88,
  trust: 74,
  netIncome: 1_250_000,
  finalCash: 3_480_000,
  penaltyTotal: 30_000,
});

// ---------------------------------------------------------------------------
// 簡易モック GameStore
// ---------------------------------------------------------------------------

interface MockStore extends GameStore {
  set(next: GameState): void;
}

const createMockStore = (): MockStore => {
  let state = initialState();
  const listeners = new Set<StoreListener>();
  const emit = (events: readonly GameEvent[] = []): void => {
    for (const l of [...listeners]) l(state, events);
  };
  const set = (next: GameState): void => {
    state = next;
    emit();
  };
  let seq = 100;

  const dispatch = (action: Action): readonly GameEvent[] => {
    switch (action.type) {
      case 'NEW_GAME':
        set({ ...initialState(), phase: 'intro' });
        break;
      case 'LOAD':
        set({ ...state, phase: 'idle' });
        break;
      case 'CONTINUE':
        if (state.phase === 'intro' || state.phase === 'cardDone') set({ ...state, phase: 'idle' });
        break;
      case 'SPIN': {
        if (state.phase !== 'idle') break;
        const roll = action.force ?? [1, 2, 2, 3, 3, 4][Math.floor(Math.random() * 6)] ?? 1;
        const to = Math.min(state.position + roll, board.length - 1);
        const path: number[] = [];
        for (let i = state.position + 1; i <= to; i++) path.push(i);
        set({
          ...state,
          phase: 'rolling',
          pendingRoll: { plan: { segment: 0, roll, jitter: 0, turns: 3, durationMs: 1200 }, path, to },
        });
        break;
      }
      case 'ANIM_DONE': {
        if (state.phase === 'rolling') {
          set({ ...state, phase: 'moving' });
        } else if (state.phase === 'moving' && state.pendingRoll) {
          const to = state.pendingRoll.to;
          const sq = board[to];
          const gain = Math.random() < 0.6;
          const amount = 20_000 + Math.floor(Math.random() * 8) * 10_000;
          const e = entry(
            `m${seq++}`,
            sq?.date ?? state.date,
            gain ? '売掛金の回収' : '経費の支払',
            'player',
            gain ? [dr('bank', amount), cr('ar', amount)] : [dr('supplies', amount), cr('bank', amount)],
          );
          const { pendingRoll: _drop, ...rest } = state;
          void _drop;
          set({
            ...rest,
            phase: 'idle',
            turn: state.turn + 1,
            position: to,
            date: sq?.date ?? state.date,
            book: postEntries(state.book, [e]),
            resources: {
              trust: Math.max(0, Math.min(100, state.resources.trust + (gain ? 2 : -3))),
              skillPoints: { ...state.resources.skillPoints, bookkeeping: state.resources.skillPoints.bookkeeping + 1 },
            },
          });
        }
        break;
      }
      default:
        break;
    }
    return [];
  };

  return {
    scenario,
    getState: () => state,
    dispatch,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set,
  };
};

// ---------------------------------------------------------------------------
// 画面の組み立て
// ---------------------------------------------------------------------------

const store = createMockStore();
let hasSave = true;

const ui = document.getElementById('ui');
const devbar = document.getElementById('devbar');
if (!ui || !devbar) throw new Error('harness root not found');

const shell = createShell(store, {
  hasSave: () => hasSave,
  onNewGame: () => store.dispatch({ type: 'NEW_GAME', seed: 1 }),
  onLoad: () => store.dispatch({ type: 'LOAD', state: store.getState() }),
});
const books = createBooksDrawer(store);

// カードパネルの代役（右側・幅 var(--panel-w)）。フォーカスとショートカットの相互作用を確かめる
const mockCard = el(
  'aside',
  { class: 'mock-card', attrs: { hidden: true } },
  el('h2', { text: '（カードパネルの代役）' }),
  el('p', { text: '本物は別担当が作ります。ここは右側の領域と重ならないことの確認用。' }),
  el('label', {}, '回答: ', el('input', { attrs: { type: 'text', placeholder: 'ここで B を打っても帳簿は開かない' } })),
  el('p', {}, el('button', { text: '次へ（CONTINUE）', attrs: { type: 'button' }, on: { click: () => store.dispatch({ type: 'CONTINUE' }) } })),
);
ui.append(shell.el, books.el, mockCard);

store.subscribe((state) => {
  mockCard.hidden = !(state.phase === 'question' || state.phase === 'feedback' || state.phase === 'cardDone');
});
mockCard.hidden = true;

// 演出の代わり（ANIM_DONE を自動で送る。操作バーのチェックで止められる）
let autoAnim = true;
store.subscribe((state) => {
  if (autoAnim && (state.phase === 'rolling' || state.phase === 'moving')) {
    const phase = state.phase;
    window.setTimeout(() => {
      if (store.getState().phase === phase) store.dispatch({ type: 'ANIM_DONE' });
    }, 1100);
  }
});

// ---- 操作バー ----
const btn = (text: string, fn: () => void): HTMLButtonElement =>
  el('button', { text, attrs: { type: 'button' }, on: { click: fn } });
const sep = (): HTMLElement => el('span', { class: 'sep' });
const setPhase = (phase: Phase): void => {
  const s = store.getState();
  const next: GameState = { ...s, phase };
  if (phase === 'ended') store.set({ ...next, finalScore: finalScore('A') });
  else store.set(next);
};
const jump = (position: number): void => {
  const s = store.getState();
  store.set({ ...s, position, date: board[position]?.date ?? s.date });
};
const bookWith = (e: JournalEntry): void => {
  const s = store.getState();
  store.set({ ...s, book: postEntries(s.book, [e]) });
};
let entrySeq = 500;
const cashDelta = (amount: number): void => {
  const s = store.getState();
  bookWith(
    entry(
      `h${entrySeq++}`,
      s.date,
      amount > 0 ? '入金（テスト）' : '支払（テスト）',
      'player',
      amount > 0 ? [dr('bank', amount), cr('ar', amount)] : [dr('supplies', -amount), cr('bank', -amount)],
    ),
  );
};
const trustDelta = (n: number): void => {
  const s = store.getState();
  store.set({ ...s, resources: { ...s.resources, trust: Math.max(0, Math.min(100, s.resources.trust + n)) } });
};

const saveBox = el('input', { attrs: { type: 'checkbox', checked: true } });
saveBox.addEventListener('change', () => {
  hasSave = saveBox.checked;
});
const animBox = el('input', { attrs: { type: 'checkbox', checked: true } });
animBox.addEventListener('change', () => {
  autoAnim = animBox.checked;
});
/** 出目 roll・移動先 to を持つ moving 状態にする（表示確認用）。 */
const showMoving = (roll: number, steps: number): void => {
  const s = store.getState();
  const path: number[] = [];
  for (let i = 1; i <= steps; i++) path.push(s.position + i);
  store.set({
    ...s,
    phase: 'moving',
    pendingRoll: { plan: { segment: 0, roll, jitter: 0, turns: 3, durationMs: 1200 }, path, to: s.position + steps },
  });
};

devbar.append(
  ...(['title', 'intro', 'idle', 'rolling', 'moving', 'question', 'ended'] as const).map((p) => btn(p, () => setPhase(p))),
  sep(),
  btn('現預金+50万', () => cashDelta(500_000)),
  btn('現預金-50万', () => cashDelta(-500_000)),
  btn('大赤字', () => cashDelta(-6_000_000)),
  btn('信頼+10', () => trustDelta(10)),
  btn('信頼-10', () => trustDelta(-10)),
  sep(),
  btn('4月へ', () => jump(2)),
  btn('6月(既定)', () => jump(START_POSITION)),
  btn('1月へ', () => jump(46)),
  btn('決算ステージ', () => jump(board.length - 2)),
  sep(),
  btn('帳簿 開閉', () => books.toggle()),
  btn('背景 机/明', () => {
    document.body.dataset.bg = document.body.dataset.bg === 'light' ? 'desk' : 'light';
  }),
  el('label', {}, saveBox, 'セーブあり'),
  el('label', {}, animBox, '自動進行'),
  btn('moving 3', () => showMoving(3, 3)),
  btn('moving 4→2', () => showMoving(4, 2)),
  sep(),
  ...(['S', 'A', 'B', 'C', 'D'] as const).map((r) =>
    btn(`終了${r}`, () => store.set({ ...store.getState(), phase: 'ended', finalScore: finalScore(r) })),
  ),
  el('span', { text: `例: ${formatYen(-1234567)}` }),
);

Object.assign(window, { __cq: { store, books, shell } });
