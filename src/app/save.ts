import type { GameState } from '@/core/game/types';

const KEY = 'closing-quest:save:v1';

/** localStorage は使えない環境（プライベートモード等）もあるので、すべて try/catch で包む。 */
const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isState = (v: unknown): v is GameState => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<GameState>;
  return s.version === 1 && typeof s.scenarioId === 'string' && typeof s.position === 'number' && !!s.book && !!s.resources;
};

export const loadSave = (scenarioId: string): GameState | null => {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) && parsed.scenarioId === scenarioId ? parsed : null;
  } catch {
    return null;
  }
};

export const hasSave = (scenarioId: string): boolean => loadSave(scenarioId) !== null;

export const writeSave = (state: GameState): void => {
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    // 容量超過などは無視する（遊べなくなるわけではない）
  }
};

export const clearSave = (): void => {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // 何もしない
  }
};
