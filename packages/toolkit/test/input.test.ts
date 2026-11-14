// @vitest-environment happy-dom
// Input mapping: the keyboard action map, the input gate, drag gestures and swipe thresholds.
import { afterEach, describe, expect, it } from 'vitest';
import { createInput, swipeDir, type ActionEvent } from '../src/input.ts';

function setup(gateOpen = true) {
  const stage = document.createElement('div');
  stage.tabIndex = 0;
  document.body.appendChild(stage);
  const controller = new AbortController();
  let open = gateOpen;
  const input = createInput({
    stage,
    signal: controller.signal,
    gate: () => open,
    toLocal: (x, y) => ({ x, y }),
    focusOnPointer: true,
    onError: (e) => {
      throw e;
    },
  });
  input.configure({
    actions: {
      left: { codes: ['ArrowLeft', 'KeyA'] },
      undo: { codes: ['KeyZ'], modifiers: { ctrl: true, meta: true } },
    },
  });
  const events: ActionEvent[] = [];
  input.on('left', (e) => events.push(e));
  input.on('undo', (e) => events.push(e));
  const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
    stage.dispatchEvent(e);
    return e;
  };
  return { stage, input, events, key, controller, setGate: (v: boolean) => (open = v) };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('keyboard action map', () => {
  it('maps codes to actions, ignores auto-repeat and prevents page scroll', () => {
    const { events, key, input } = setup();
    const down = key('keydown', 'ArrowLeft');
    key('keydown', 'ArrowLeft', { repeat: true });
    key('keydown', 'KeyA');
    expect(down.defaultPrevented).toBe(true);
    expect(events.map((e) => `${e.action}:${e.phase}`)).toEqual(['left:press', 'left:press']);
    expect(input.isDown('left')).toBe(true);
    key('keyup', 'ArrowLeft');
    expect(input.isDown('left')).toBe(false);
  });

  it('honours declared modifiers only and never prevents unbound or modified keys', () => {
    const { events, key } = setup();
    expect(key('keydown', 'ArrowLeft', { ctrlKey: true }).defaultPrevented).toBe(false);
    key('keydown', 'KeyZ', { ctrlKey: true });
    key('keydown', 'KeyZ', { metaKey: true });
    key('keydown', 'KeyZ', { altKey: true });
    expect(key('keydown', 'Tab').defaultPrevented).toBe(false);
    expect(events.map((e) => e.action)).toEqual(['undo', 'undo']);
  });

  it('drops real input while the gate is closed but still accepts injected input', () => {
    const { events, key, input, setGate } = setup();
    setGate(false);
    expect(key('keydown', 'ArrowLeft').defaultPrevented).toBe(true);
    expect(events).toEqual([]);
    input.inject({ action: 'left', phase: 'press' });
    expect(events.map((e) => e.source)).toEqual(['virtual']);
  });

  it('removes every listener when the signal aborts', () => {
    const { events, key, controller } = setup();
    controller.abort();
    key('keydown', 'ArrowLeft');
    expect(events).toEqual([]);
  });
});

describe('drag gestures', () => {
  it('a pointercancel ends a drag marked cancelled; letting go does not', () => {
    const { stage, input } = setup();
    const ends: Array<{ cancelled?: true }> = [];
    input.onGesture('dragend', (e) => ends.push(e));
    const ptr = (type: string, x: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'touch',
          clientX: x,
          clientY: 0,
          bubbles: true,
        }),
      );
    for (const last of ['pointerup', 'pointercancel']) {
      ptr('pointerdown', 0);
      ptr('pointermove', 40);
      ptr(last, 40);
    }
    expect(ends.map((e) => e.cancelled ?? false)).toEqual([false, true]);
  });
});

describe('swipe thresholds', () => {
  it.each([
    [40, 0, 150, 'right'],
    [-40, 5, 150, 'left'],
    [0, 31, 300, 'down'],
    [3, -60, 100, 'up'],
    [20, 0, 100, null],
    [40, 0, 301, null],
    [40, 30, 100, null],
  ] as const)('dx %s dy %s in %s ms → %s', (dx, dy, ms, dir) => {
    expect(swipeDir(dx, dy, ms)).toBe(dir);
  });
});
