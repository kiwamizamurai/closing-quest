import type { AccountId } from '../accounting/accounts';
import type { JournalLine } from '../accounting/journal';
import type { GameDate, Yen } from '../types';

/** 経理スキルの系統。上がるとヒントが安くなる。 */
export type SkillId = 'bookkeeping' | 'tax' | 'labor' | 'cash' | 'audit';

export const SKILL_LABEL: Record<SkillId, string> = {
  bookkeeping: '簿記',
  tax: '税務',
  labor: '労務',
  cash: '資金繰り',
  audit: '確認・突合',
};

/**
 * 業務カードの型。
 *  JOURNAL 仕訳／DEADLINE 書類・期限・提出先／CALC 計算／AUDIT 誤り探し・突合／
 *  DECISION 判断／REPORT 月次報告・分析／CHANCE 突発イベント（帳簿に影響しない知識問題）
 */
export type CardKind = 'JOURNAL' | 'DEADLINE' | 'CALC' | 'AUDIT' | 'DECISION' | 'REPORT' | 'CHANCE';

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  JOURNAL: '仕訳',
  DEADLINE: '期限・提出',
  CALC: '計算',
  AUDIT: '突合・確認',
  DECISION: '判断',
  REPORT: '報告・分析',
  CHANCE: 'できごと',
};

/**
 * マスの種別。
 *  start 期首／normal 通常業務／deadline 期限マス（必須停止）／event 突発イベント／
 *  monthend 月末（月次決算・必須停止）／special 特別（半期・年末調整など）／goal ゴール（決算ステージの最後）
 */
export type SquareType = 'start' | 'normal' | 'deadline' | 'event' | 'monthend' | 'special' | 'goal';

/** 出典。verified=primary は国税庁・厚労省など一次情報で確認済み、secondary は民間解説のみ。 */
export interface SourceRef {
  readonly label: string;
  readonly url: string;
  /** 確認日 YYYY-MM-DD */
  readonly asOf: string;
  readonly verified: 'primary' | 'secondary';
}

/** 状況説明に添える資料（請求書・通帳・台帳などを表で表す）。 */
export interface FactTable {
  readonly caption?: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | number)[])[];
  /** 数値列を右寄せ・桁区切りにする列番号（0始まり）。 */
  readonly numericColumns?: readonly number[];
}

interface QuestionBase {
  readonly id: string;
  readonly prompt: string;
  /** 解答後に必ず表示する解説。 */
  readonly explain: string;
  /** 段階的ヒント（最大3つ。段階が進むほど答えに近い）。 */
  readonly hints?: readonly string[];
}

/** 択一。DECISION・DEADLINE・REPORT・CHANCE で使う。partial は部分点（0.5）の選択肢。 */
export interface ChoiceQuestion extends QuestionBase {
  readonly type: 'choice';
  readonly options: readonly string[];
  readonly answer: number;
  readonly partial?: readonly number[];
}

/** 複数選択（誤りのある行をすべて選ぶ等）。AUDIT で使う。 */
export interface MultiQuestion extends QuestionBase {
  readonly type: 'multi';
  readonly options: readonly string[];
  /** 正解の選択肢番号の集合（順不同）。 */
  readonly answer: readonly number[];
}

/** 数値入力。CALC で使う。 */
export interface NumberQuestion extends QuestionBase {
  readonly type: 'number';
  readonly unit: 'yen' | 'plain' | 'percent' | 'days' | 'people';
  readonly answer: number;
  /** 許容誤差（省略時は 0＝完全一致）。 */
  readonly tolerance?: number;
}

/** 仕訳入力。expected のいずれか（順不同・同科目同側は合算）と一致すれば正解。 */
export interface JournalQuestion extends QuestionBase {
  readonly type: 'journal';
  /** 選択肢に出す科目（引っかけの科目を含める）。 */
  readonly accounts: readonly AccountId[];
  /** 正解の仕訳（別解を並べられる）。先頭が帳簿に計上される標準解。 */
  readonly expected: readonly (readonly JournalLine[])[];
  /** 帳簿に計上するときの摘要。 */
  readonly memo: string;
  /** 特定の誤りに対する専用のフィードバック。 */
  readonly traps?: readonly JournalTrap[];
}

export interface JournalTrap {
  /** 入力にこの科目・側の行が含まれていたら発動する。 */
  readonly account: AccountId;
  readonly side: 'debit' | 'credit';
  readonly message: string;
}

export type Question = ChoiceQuestion | MultiQuestion | NumberQuestion | JournalQuestion;

/** カード完了時に無条件で帳簿へ計上する仕訳（納付・支払など、仕訳入力を求めない処理）。 */
export interface Posting {
  readonly id: string;
  readonly memo: string;
  readonly lines: readonly JournalLine[];
}

export interface Card {
  readonly id: string;
  readonly kind: CardKind;
  readonly title: string;
  readonly date: GameDate;
  /** 帳簿に計上する日付。省略時は date。決算整理仕訳など、期末日（3/31）で計上したいときに指定する。 */
  readonly bookDate?: GameDate;
  readonly skill: SkillId;
  /** 状況説明（1〜3文。誰が何を依頼してきたか）。 */
  readonly situation: string;
  readonly facts?: readonly FactTable[];
  readonly questions: readonly Question[];
  /** 完了時に無条件で計上する仕訳。 */
  readonly postings?: readonly Posting[];
  /** 得点が半分未満だったときのペナルティ（延滞税など。現預金から引く）。 */
  readonly penalty?: { readonly amount: Yen; readonly reason: string };
  readonly sources?: readonly SourceRef[];
  /** 月次決算のカード。 */
  readonly monthClose?: boolean;
  /** 必須マス（期限・月末など）か。false のカードは止まったときだけ発生する。 */
  readonly mandatory: boolean;
  /** 盤面のマスに表示する短いラベル。 */
  readonly squareLabel: string;
  /** マスの種別を明示する（省略時は kind・mandatory・monthClose から決める）。start / special / goal の指定に使う。 */
  readonly squareType?: SquareType;
}

/** カードの実体は固定でも、その時点の帳簿から作る動的なものでもよい。 */
export interface CardContext {
  readonly book: import('../accounting/book').Book;
  readonly date: GameDate;
}

export type CardDef = Card | ((ctx: CardContext) => Card);

// ---------------------------------------------------------------------------
// 回答
// ---------------------------------------------------------------------------

export type Answer =
  | { readonly type: 'choice'; readonly index: number }
  | { readonly type: 'multi'; readonly indices: readonly number[] }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'journal'; readonly lines: readonly JournalLine[] };

export type Verdict = 'correct' | 'partial' | 'wrong';

export interface Judgement {
  readonly verdict: Verdict;
  /** 0〜1。partial は 0.5。 */
  readonly credit: number;
  /** 誤りの説明（UI にそのまま出す短文）。correct のときは空。 */
  readonly messages: readonly string[];
}
