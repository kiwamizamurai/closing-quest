import { cashOnHand, createBook, cr, dr, entry, postEntry, type Book, type JournalEntry } from '../accounting';
import { canonicalJournal, hintCount, judge } from '../tasks/judge';
import type { Card, SkillId } from '../tasks/types';
import { periodOf } from '../types';
import { computeMove, resolveCard } from './board';
import { planSpin } from './roulette';
import { seedToState } from './rng';
import { computeFinalScore } from './score';
import type {
  Action,
  ActiveCard,
  CardRecord,
  GameEvent,
  GameState,
  QuestionProgress,
  QuestionResult,
  Scenario,
} from './types';

export interface ReduceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const SKILLS: readonly SkillId[] = ['bookkeeping', 'tax', 'labor', 'cash', 'audit'];

/** 誤答 1 回ごとの減点、ヒント 1 段階ごとの減点、自動計上になる誤答回数。 */
export const WRONG_PENALTY = 0.3;
export const HINT_PENALTY = 0.1;
export const MAX_WRONG = 3;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const createInitialState = (scenario: Scenario, seed: number): GameState => {
  const first = scenario.board[0];
  if (!first) throw new Error('board is empty');
  return {
    version: 1,
    scenarioId: scenario.id,
    seed,
    rngState: seedToState(seed),
    phase: 'title',
    turn: 0,
    position: 0,
    date: first.date,
    book: createBook(scenario.opening),
    autoCursor: 0,
    resources: {
      trust: 50,
      skillPoints: { bookkeeping: 0, tax: 0, labor: 0, cash: 0, audit: 0 },
    },
    records: [],
  };
};

// ---------------------------------------------------------------------------
// 帳簿への計上
// ---------------------------------------------------------------------------

/** 会社シミュレータの定常取引を、指定日までぶん計上する。 */
const postAutoUpTo = (state: GameState, scenario: Scenario, date: number): { book: Book; cursor: number; ids: string[] } => {
  let book = state.book;
  let cursor = state.autoCursor;
  const ids: string[] = [];
  for (;;) {
    const e = scenario.autoEntries[cursor];
    if (!e || e.date > date) break;
    book = postEntry(book, e);
    ids.push(e.id);
    cursor += 1;
  }
  return { book, cursor, ids };
};

const hasEntry = (book: Book, id: string): boolean => book.entries.some((e) => e.id === id);

const postOnce = (book: Book, e: JournalEntry): Book => (hasEntry(book, e.id) ? book : postEntry(book, e));

// ---------------------------------------------------------------------------
// カード
// ---------------------------------------------------------------------------

const freshProgress = (results: readonly QuestionResult[], questionIndex: number): QuestionProgress => ({
  questionIndex,
  wrong: 0,
  hintsUsed: 0,
  results,
  revealed: false,
});

const startCard = (state: GameState, card: Card): ActiveCard => ({
  card,
  progress: freshProgress([], 0),
  startCash: cashOnHand(state.book, state.date),
  startTrust: state.resources.trust,
});

/** マスに着地する。定常取引を計上し、カードがあれば開始する。 */
const landOn = (state: GameState, scenario: Scenario, index: number, events: GameEvent[]): GameState => {
  const square = scenario.board[index];
  if (!square) throw new Error(`invalid square ${index}`);
  const auto = postAutoUpTo(state, scenario, square.date);
  let next: GameState = {
    ...state,
    position: index,
    date: square.date,
    book: auto.book,
    autoCursor: auto.cursor,
  };
  events.push({ type: 'landed', index });
  if (auto.ids.length > 0) events.push({ type: 'posted', entryIds: auto.ids });

  const def = square.cardId ? scenario.cardDefById[square.cardId] : undefined;
  if (!def) return { ...next, phase: 'idle' };
  const card = resolveCard(def, { book: next.book, date: square.date });
  next = { ...next, phase: 'question', active: startCard(next, card) };
  events.push({ type: 'cardStarted', cardId: card.id });
  return next;
};

const questionCredit = (base: number, wrong: number, hints: number): number =>
  clamp(base - WRONG_PENALTY * wrong - HINT_PENALTY * hints, 0, 1);

/** 設問を終えたとき（正解・部分点・正解を見せた）、標準の仕訳を帳簿に計上する。 */
const finishQuestion = (
  state: GameState,
  active: ActiveCard,
  result: QuestionResult,
  events: GameEvent[],
): GameState => {
  const q = active.card.questions[active.progress.questionIndex];
  let book = state.book;
  const lines = q ? canonicalJournal(q) : undefined;
  if (q && q.type === 'journal' && lines) {
    const id = `${active.card.id}:${q.id}`;
    if (!hasEntry(book, id)) {
      const kind = active.card.bookDate === undefined ? 'player' : 'adjust';
      book = postEntry(book, entry(id, active.card.bookDate ?? active.card.date, q.memo, kind, lines));
      events.push({ type: 'posted', entryIds: [id] });
    }
  }
  return {
    ...state,
    book,
    active: {
      ...active,
      progress: { ...active.progress, results: [...active.progress.results, result] },
    },
  };
};

/** カードを完了する。無条件の計上、ペナルティ、信頼・スキルの更新、記録。 */
const completeCard = (state: GameState, events: GameEvent[]): GameState => {
  const active = state.active;
  if (!active) return state;
  const { card, progress } = active;
  const score = progress.results.length === 0 ? 0 : progress.results.reduce((s, r) => s + r.credit, 0) / progress.results.length;

  let book = state.book;
  const bookDate = card.bookDate ?? card.date;
  const postKind = card.bookDate === undefined ? 'player' : 'adjust';
  for (const p of card.postings ?? []) {
    book = postOnce(book, entry(`${card.id}:${p.id}`, bookDate, p.memo, postKind, p.lines));
  }
  let penalty = 0;
  if (card.penalty && score < 0.5) {
    penalty = card.penalty.amount;
    book = postOnce(
      book,
      entry(`${card.id}:penalty`, card.date, card.penalty.reason, 'player', [dr('dues', penalty), cr('bank', penalty)]),
    );
    events.push({ type: 'penalty', amount: penalty, reason: card.penalty.reason });
  }

  const trustDelta = (score >= 0.8 ? 2 : score >= 0.5 ? 1 : -3) - (penalty > 0 ? 2 : 0);
  const trust = clamp(state.resources.trust + trustDelta, 0, 100);
  const skillPoints = { ...state.resources.skillPoints };
  for (const s of SKILLS) if (s === card.skill) skillPoints[s] += score >= 0.8 ? 2 : score >= 0.5 ? 1 : 0;

  const record: CardRecord = {
    cardId: card.id,
    title: card.title,
    kind: card.kind,
    date: card.date,
    period: periodOf(card.date),
    monthClose: card.monthClose === true,
    score,
    penalty,
    cashDelta: cashOnHand(book, state.date) - active.startCash,
    trustDelta: trust - active.startTrust,
    results: progress.results,
  };
  events.push({ type: 'cardCompleted', cardId: card.id, score, monthClose: record.monthClose });
  if (record.monthClose) events.push({ type: 'monthClosed', period: record.period });
  return {
    ...state,
    phase: 'cardDone',
    book,
    resources: { trust, skillPoints },
    records: [...state.records, record],
  };
};

// ---------------------------------------------------------------------------
// reducer
// ---------------------------------------------------------------------------

export const reduce = (state: GameState, action: Action, scenario: Scenario): ReduceResult => {
  const events: GameEvent[] = [];
  const done = (s: GameState): ReduceResult => ({ state: s, events });

  switch (action.type) {
    case 'NEW_GAME': {
      const fresh = createInitialState(scenario, action.seed);
      return done({ ...fresh, phase: 'intro' });
    }

    case 'LOAD': {
      if (action.state.scenarioId !== scenario.id) return done(state);
      return done(action.state);
    }

    case 'CONTINUE': {
      if (state.phase === 'intro') return done(landOn(state, scenario, 0, events));

      if (state.phase === 'feedback' && state.active) {
        const { progress, card } = state.active;
        const judged = progress.lastJudgement;
        const finished = judged !== undefined && (judged.verdict !== 'wrong' || progress.revealed);
        if (!finished) {
          return done({ ...state, phase: 'question' });
        }
        const nextIndex = progress.questionIndex + 1;
        if (nextIndex < card.questions.length) {
          return done({
            ...state,
            phase: 'question',
            active: { ...state.active, progress: freshProgress(progress.results, nextIndex) },
          });
        }
        return done(completeCard(state, events));
      }

      if (state.phase === 'cardDone') {
        const last = state.position >= scenario.board.length - 1;
        const cleared: GameState = { ...state, active: undefined };
        if (last) {
          const withScore: GameState = { ...cleared, phase: 'ended' };
          events.push({ type: 'ended' });
          return done({ ...withScore, finalScore: computeFinalScore(withScore, scenario) });
        }
        return done({ ...cleared, phase: 'idle' });
      }
      return done(state);
    }

    case 'SPIN': {
      if (state.phase !== 'idle') return done(state);
      const spun = planSpin(state.rngState, action.force);
      const move = computeMove(scenario.board, state.position, spun.plan.roll);
      events.push({ type: 'rollPlanned', plan: spun.plan });
      return done({
        ...state,
        phase: 'rolling',
        turn: state.turn + 1,
        rngState: spun.rngState,
        pendingRoll: { plan: spun.plan, path: move.path, to: move.to },
      });
    }

    case 'ANIM_DONE': {
      const pending = state.pendingRoll;
      if (!pending) return done(state);
      if (state.phase === 'rolling') {
        events.push({ type: 'moveStarted', path: pending.path });
        return done({ ...state, phase: 'moving' });
      }
      if (state.phase === 'moving') {
        const arrived = landOn({ ...state, pendingRoll: undefined }, scenario, pending.to, events);
        return done(arrived);
      }
      return done(state);
    }

    case 'HINT': {
      if (state.phase !== 'question' || !state.active) return done(state);
      const { card, progress } = state.active;
      const q = card.questions[progress.questionIndex];
      if (!q || progress.hintsUsed >= hintCount(q)) return done(state);
      return done({
        ...state,
        active: { ...state.active, progress: { ...progress, hintsUsed: progress.hintsUsed + 1 } },
      });
    }

    case 'SUBMIT': {
      if (state.phase !== 'question' || !state.active) return done(state);
      const active = state.active;
      const q = active.card.questions[active.progress.questionIndex];
      if (!q) return done(state);
      const judgement = judge(q, action.answer);
      events.push({ type: 'answered', verdict: judgement.verdict });

      if (judgement.verdict === 'wrong') {
        const wrong = active.progress.wrong + 1;
        const revealed = wrong >= MAX_WRONG;
        const progress: QuestionProgress = {
          ...active.progress,
          wrong,
          revealed,
          lastAnswer: action.answer,
          lastJudgement: judgement,
        };
        const updated: ActiveCard = { ...active, progress };
        const next: GameState = { ...state, phase: 'feedback', active: updated };
        if (!revealed) return done(next);
        const result: QuestionResult = {
          questionId: q.id,
          credit: 0,
          wrong,
          hints: progress.hintsUsed,
          autoSolved: true,
        };
        return done(finishQuestion(next, updated, result, events));
      }

      const progress: QuestionProgress = {
        ...active.progress,
        lastAnswer: action.answer,
        lastJudgement: judgement,
      };
      const result: QuestionResult = {
        questionId: q.id,
        credit: questionCredit(judgement.credit, active.progress.wrong, active.progress.hintsUsed),
        wrong: active.progress.wrong,
        hints: active.progress.hintsUsed,
        autoSolved: false,
      };
      const updated: ActiveCard = { ...active, progress };
      const next: GameState = { ...state, phase: 'feedback', active: updated };
      return done(finishQuestion(next, updated, result, events));
    }
  }
};
