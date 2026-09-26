import { cashOnHand } from '../accounting';
import { correctAnswer, wrongAnswer } from '../tasks/judge';
import { nextRandom, seedToState } from './rng';
import { createInitialState, reduce } from './machine';
import type { GameState, Scenario } from './types';

export interface AutoplayOptions {
  /** 各設問で最初に誤答する確率 0〜1。1 にすると毎回 3 回誤って自動計上になる。 */
  readonly mistakeRate?: number;
  /** 安全のための最大ステップ数。 */
  readonly maxSteps?: number;
}

export interface AutoplayResult {
  readonly state: GameState;
  readonly steps: number;
  /** 各カード完了時点の現預金の最小値（資金繰りの確認用）。 */
  readonly minCash: number;
  readonly ok: boolean;
}

/**
 * ゲームを最後まで自動で進める。整合性チェックとデバッグ用（画面は使わない）。
 * 誤答率を指定すると、間違えて再挑戦・自動計上になる経路も通る。
 */
export const autoplay = (scenario: Scenario, seed: number, opts: AutoplayOptions = {}): AutoplayResult => {
  const mistakeRate = opts.mistakeRate ?? 0;
  const maxSteps = opts.maxSteps ?? 20_000;
  let rng = seedToState(seed ^ 0x5bd1e995);
  const roll = (): number => {
    const r = nextRandom(rng);
    rng = r.state;
    return r.value;
  };

  let state = reduce(createInitialState(scenario, seed), { type: 'NEW_GAME', seed }, scenario).state;
  let steps = 0;
  let minCash = Number.POSITIVE_INFINITY;
  const step = (action: Parameters<typeof reduce>[1]): void => {
    state = reduce(state, action, scenario).state;
    steps += 1;
  };

  while (state.phase !== 'ended' && steps < maxSteps) {
    switch (state.phase) {
      case 'intro':
      case 'feedback':
      case 'cardDone':
        step({ type: 'CONTINUE' });
        break;
      case 'idle':
        step({ type: 'SPIN' });
        break;
      case 'rolling':
      case 'moving':
        step({ type: 'ANIM_DONE' });
        break;
      case 'question': {
        const a = state.active;
        const q = a?.card.questions[a.progress.questionIndex];
        if (!a || !q) return { state, steps, minCash, ok: false };
        const wrongFirst = a.progress.wrong === 0 && roll() < mistakeRate;
        const failing = a.progress.wrong > 0 && mistakeRate >= 1;
        step({ type: 'SUBMIT', answer: wrongFirst || failing ? wrongAnswer(q) : correctAnswer(q) });
        break;
      }
      case 'title':
        step({ type: 'NEW_GAME', seed });
        break;
    }
    if (state.phase === 'cardDone' || state.phase === 'idle') {
      const cash = cashOnHand(state.book, state.date);
      if (cash < minCash) minCash = cash;
    }
  }
  return { state, steps, minCash, ok: state.phase === 'ended' };
};
