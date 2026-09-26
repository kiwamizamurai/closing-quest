/**
 * 再現できる乱数（mulberry32）。状態は uint32 の整数 1 つで、ゲーム状態に保存する。
 * Math.random は使わない（セーブ・再開・seed 指定で同じ展開にするため）。
 */
export const nextRandom = (state: number): { value: number; state: number } => {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
};

/** 0 以上 n 未満の整数。 */
export const nextInt = (state: number, n: number): { value: number; state: number } => {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * n), state: r.state };
};

export const seedToState = (seed: number): number => (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
