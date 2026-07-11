import { vi } from 'vitest';
import { type ExecutionState, step } from '../../src/engine';

export interface MatchMediaStub {
  set: (matches: boolean) => void;
}

/**
 * Replace window.matchMedia with a controllable stub; call `set` to flip
 * the match and notify change listeners. Undo with vi.unstubAllGlobals().
 */
export function stubMatchMedia(matches: boolean): MatchMediaStub {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query));
  return {
    set(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Run execution to its deepest first moment — right before the first frame
 * pops — or to the terminal state if the run overflows first. A convenient
 * snapshot for rendering tests: every function has a live frame.
 */
export function previewSnapshot(initial: ExecutionState): ExecutionState {
  let current = initial;
  for (;;) {
    const next = step(current);
    if (next.lastStep?.kind === 'pop') return current;
    if (next.status === 'finished' || next.status === 'overflow') return next;
    current = next;
  }
}
