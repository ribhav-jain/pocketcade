// Test-only fixture: leaks one window listener per mount, so the leak test must report it.
import { SDK_API_VERSION, type GameDefinition } from '@pocketcade/sdk';

const def: GameDefinition = {
  meta: {
    id: 'fixture-leaky-game',
    apiVersion: SDK_API_VERSION,
    version: '0.0.1',
    inputs: ['keyboard'],
    orientation: 'any',
    aspectRatio: 'fill',
    minSize: { width: 100, height: 100 },
    saveSchemaVersion: 1,
    leaderboards: [],
  },
  create() {
    return {
      async mount(container) {
        container.append(document.createElement('div'));
        window.addEventListener('resize', () => {}); // never removed
      },
      async unmount() {},
      pause() {},
      resume() {},
    };
  },
};
export default def;
