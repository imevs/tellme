import type { AppState, StateListener } from './types';
 
const INITIAL_STATE: AppState = {
  map:          null,
  userMarker:   null,
  clickedMarker:null,
  markers:      [],
  pois:         [],
  activeCat:    'all',
  activeIdx:    -1,
  history:      [],
};

class Store {
  private state: AppState = INITIAL_STATE;
  private readonly listeners: StateListener[] = [];

  get(): Readonly<AppState> {
    return this.state;
  }

  update(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn(this.state);
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.push(fn);
    // Return unsubscribe function
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }
}

/** Singleton store — import this everywhere instead of a global variable */
export const store = new Store();
