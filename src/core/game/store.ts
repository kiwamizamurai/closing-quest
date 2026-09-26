import { createInitialState, reduce } from './machine';
import type { Action, GameEvent, GameState, GameStore, Scenario, StoreListener } from './types';

/** reducer を包んだ購読可能なストア。UI・3D・アプリはこれだけを見る。 */
export const createGameStore = (scenario: Scenario, initial?: GameState): GameStore => {
  let state: GameState = initial ?? createInitialState(scenario, 1);
  const listeners = new Set<StoreListener>();

  return {
    scenario,
    getState: () => state,
    dispatch: (action: Action): readonly GameEvent[] => {
      const result = reduce(state, action, scenario);
      state = result.state;
      for (const l of [...listeners]) l(state, result.events);
      return result.events;
    },
    subscribe: (listener: StoreListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
