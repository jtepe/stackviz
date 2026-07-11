import { type ExecutionState, step } from '../../src/engine';

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
