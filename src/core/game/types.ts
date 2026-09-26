import type { Book, OpeningBalance } from '../accounting/book';
import type { JournalEntry } from '../accounting/journal';
import type { Answer, Card, CardDef, CardKind, Judgement, SkillId, SquareType } from '../tasks/types';
import type { GameDate, Yen } from '../types';
import type { RollPlan } from './roulette';

export type { RollPlan, SquareType };

// ---------------------------------------------------------------------------
// 盤面
// ---------------------------------------------------------------------------

export interface Square {
  readonly index: number;
  readonly type: SquareType;
  /** 期間インデックス 0〜11=4月〜翌3月、12〜14=決算ステージ（翌4〜6月）。 */
  readonly period: number;
  readonly date: GameDate;
  /** マスに表示する短いラベル（全角6文字程度まで）。 */
  readonly label: string;
  readonly cardId?: string;
  readonly cardKind?: CardKind;
  /** 必須停止。ルーレットで飛び越せない。 */
  readonly mandatory: boolean;
}

// ---------------------------------------------------------------------------
// シナリオ（1年分のデータ一式）
// ---------------------------------------------------------------------------

export interface ScenarioIntro {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface Scenario {
  readonly id: string;
  readonly companyName: string;
  readonly fiscalYearLabel: string;
  readonly opening: readonly OpeningBalance[];
  /** 会社シミュレータが自動で計上する定常取引（日付順）。 */
  readonly autoEntries: readonly JournalEntry[];
  readonly cardDefs: readonly CardDef[];
  /** カード ID から定義を引く表（盤面のマスの cardId で使う）。 */
  readonly cardDefById: Readonly<Record<string, CardDef>>;
  readonly board: readonly Square[];
  /** 月末の商品棚卸高（決算整理前の月次損益・貸借対照表を出すため）。キーは period。-1 は期首。 */
  readonly monthEndInventory: Readonly<Record<number, Yen>>;
  /** 月次の予算売上（税抜）。キーは period。 */
  readonly monthlySalesBudget: Readonly<Record<number, Yen>>;
  readonly intro: ScenarioIntro;
}

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

/**
 *  title    タイトル
 *  intro    導入の説明
 *  idle     ルーレットを回す前
 *  rolling  ルーレット演出中（ANIM_DONE を待つ）
 *  moving   駒の移動演出中（ANIM_DONE を待つ）
 *  question 設問への回答待ち
 *  feedback 回答の結果表示（CONTINUE を待つ）
 *  cardDone カードの結果表示（CONTINUE を待つ）
 *  ended    1年が終わった
 */
export type Phase =
  | 'title'
  | 'intro'
  | 'idle'
  | 'rolling'
  | 'moving'
  | 'question'
  | 'feedback'
  | 'cardDone'
  | 'ended';

export interface QuestionResult {
  readonly questionId: string;
  /** 0〜1。誤答・ヒントで減点された後の得点率。 */
  readonly credit: number;
  readonly wrong: number;
  readonly hints: number;
  /** 3 回誤って正解を自動で計上した。 */
  readonly autoSolved: boolean;
}

export interface QuestionProgress {
  readonly questionIndex: number;
  /** 現在の設問での誤答回数。 */
  readonly wrong: number;
  readonly hintsUsed: number;
  readonly results: readonly QuestionResult[];
  readonly lastAnswer?: Answer;
  readonly lastJudgement?: Judgement;
  /** 3 回誤って正解を見せている。 */
  readonly revealed: boolean;
}

export interface ActiveCard {
  /** 開始時点の帳簿から作った実体（動的カードも保存できるよう固定して持つ）。 */
  readonly card: Card;
  readonly progress: QuestionProgress;
  /** カード開始時の現預金（結果画面の増減表示用）。 */
  readonly startCash: Yen;
  /** カード開始時の信頼。 */
  readonly startTrust: number;
}

export interface CardRecord {
  readonly cardId: string;
  readonly title: string;
  readonly kind: CardKind;
  readonly date: GameDate;
  readonly period: number;
  readonly monthClose: boolean;
  /** 0〜1。設問の平均。 */
  readonly score: number;
  readonly penalty: Yen;
  /** このカードで現預金が増減した額（ペナルティ・納付など）。 */
  readonly cashDelta: Yen;
  /** このカードで信頼が増減した量。 */
  readonly trustDelta: number;
  /** 各設問の結果（結果画面用）。 */
  readonly results: readonly QuestionResult[];
}

export interface Resources {
  /** 信頼（経営者・税理士・銀行からの評価）0〜100。 */
  readonly trust: number;
  readonly skillPoints: Readonly<Record<SkillId, number>>;
}

export interface GameState {
  readonly version: 1;
  readonly scenarioId: string;
  readonly seed: number;
  readonly rngState: number;
  readonly phase: Phase;
  readonly turn: number;
  readonly position: number;
  readonly date: GameDate;
  readonly book: Book;
  /** autoEntries のうち計上済みの件数。 */
  readonly autoCursor: number;
  readonly resources: Resources;
  readonly active?: ActiveCard;
  readonly pendingRoll?: { readonly plan: RollPlan; readonly path: readonly number[]; readonly to: number };
  readonly records: readonly CardRecord[];
  readonly finalScore?: FinalScore;
}

export interface FinalScore {
  /** 0〜1000 */
  readonly total: number;
  readonly rank: 'S' | 'A' | 'B' | 'C' | 'D';
  readonly accuracy: number; // 0〜1 全カード平均
  readonly monthClose: number; // 0〜1 月次決算の平均
  readonly yearEnd: number; // 0〜1 決算ステージの平均
  readonly cashScore: number; // 0〜1
  readonly trust: number; // 0〜100
  readonly netIncome: Yen;
  readonly finalCash: Yen;
  readonly penaltyTotal: Yen;
}

// ---------------------------------------------------------------------------
// アクションとイベント
// ---------------------------------------------------------------------------

export type Action =
  | { readonly type: 'NEW_GAME'; readonly seed: number }
  | { readonly type: 'LOAD'; readonly state: GameState }
  /** intro → idle、cardDone → 次へ。 */
  | { readonly type: 'CONTINUE' }
  /** ルーレットを回す。force は出目を指定する（デバッグ用）。 */
  | { readonly type: 'SPIN'; readonly force?: number }
  /** 演出（ルーレット・駒の移動）が終わった。 */
  | { readonly type: 'ANIM_DONE' }
  | { readonly type: 'SUBMIT'; readonly answer: Answer }
  | { readonly type: 'HINT' };

export type GameEvent =
  | { readonly type: 'rollPlanned'; readonly plan: RollPlan }
  | { readonly type: 'moveStarted'; readonly path: readonly number[] }
  | { readonly type: 'landed'; readonly index: number }
  | { readonly type: 'cardStarted'; readonly cardId: string }
  | { readonly type: 'answered'; readonly verdict: 'correct' | 'partial' | 'wrong' }
  | { readonly type: 'posted'; readonly entryIds: readonly string[] }
  | { readonly type: 'cardCompleted'; readonly cardId: string; readonly score: number; readonly monthClose: boolean }
  | { readonly type: 'penalty'; readonly amount: Yen; readonly reason: string }
  | { readonly type: 'monthClosed'; readonly period: number }
  | { readonly type: 'ended' };

export type StoreListener = (state: GameState, events: readonly GameEvent[]) => void;

/** UI・3D・アプリが共有する窓口。core の reducer を包む。 */
export interface GameStore {
  readonly scenario: Scenario;
  getState(): GameState;
  /** アクションを処理し、その結果起きたイベントを返す（購読者にも通知する）。 */
  dispatch(action: Action): readonly GameEvent[];
  subscribe(listener: StoreListener): () => void;
}
