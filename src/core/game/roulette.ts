import { nextInt, nextRandom } from './rng';

/**
 * ルーレットの区画。回転盤を 8 等分し、時計回りに index 0〜7。
 * 回転角 0 のとき、区画 0 の中心が指針（真上）に来る。区画 i の中心は 360/8*i 度（時計回り）。
 * 出目の分布は 1:2/8, 2:3/8, 3:2/8, 4:1/8。
 */
export const ROULETTE_SEGMENTS = [1, 2, 3, 2, 4, 1, 3, 2] as const;
export const ROULETTE_SEGMENT_COUNT = ROULETTE_SEGMENTS.length;
export const ROULETTE_SEGMENT_DEG = 360 / ROULETTE_SEGMENT_COUNT;

export interface RollPlan {
  /** 止まる区画の番号 0〜7。 */
  readonly segment: number;
  /** 出目（1〜4）。 */
  readonly roll: number;
  /** 区画の中での停止位置のずれ。-0.4〜0.4（区画の半幅に対する割合）。見た目のゆらぎ用。 */
  readonly jitter: number;
  /** 余分に回す周回数（3〜5）。 */
  readonly turns: number;
  /** 演出の長さ（ミリ秒）。 */
  readonly durationMs: number;
}

/**
 * ルーレットの結果を先に確定する。ロジックは演出を待たない。
 * force を渡すと、その出目になる最初の区画で止まる（デバッグ・操作確認用）。
 */
export const planSpin = (
  rngState: number,
  force?: number,
): { plan: RollPlan; rngState: number } => {
  let s = rngState;
  const seg = nextInt(s, ROULETTE_SEGMENT_COUNT);
  s = seg.state;
  const jit = nextRandom(s);
  s = jit.state;
  const turns = nextInt(s, 3);
  s = turns.state;

  let segment = seg.value;
  if (force !== undefined) {
    const idx = ROULETTE_SEGMENTS.findIndex((v) => v === force);
    if (idx >= 0) segment = idx;
  }
  const roll = ROULETTE_SEGMENTS[segment] ?? 1;
  return {
    plan: {
      segment,
      roll,
      jitter: (jit.value - 0.5) * 0.8,
      turns: 3 + turns.value,
      durationMs: 3200 + turns.value * 400,
    },
    rngState: s,
  };
};

/**
 * 回転盤の最終角度（度、時計回り）。指針は真上で固定なので、盤を「反時計回りに区画の中心分」回す
 * のと同じ。render はこの値まで減速しながら回せばよい。
 */
export const finalWheelAngleDeg = (plan: RollPlan): number =>
  plan.turns * 360 - (plan.segment + plan.jitter) * ROULETTE_SEGMENT_DEG;
