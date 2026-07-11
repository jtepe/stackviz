import { act, renderHook } from '@testing-library/react';
import {
  prefersReducedMotion,
  usePrefersReducedMotion,
  PUSH_POP_MS,
} from '../../src/ui/motion';
import { popTransition } from '../../src/ui/transitions';
import { stubMatchMedia } from './helpers';
import { analyze } from '../../src/lang';
import {
  initExecution,
  step,
  sysvAmd64,
  type ExecutionState,
} from '../../src/engine';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('defaults to full motion when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reflects the media query', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('updates the hook when the preference changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});

const PROGRAM = `fn double(n: i32) -> i32 {
    let d = n;
    return d;
}

fn main() {
    let x = double(21);
}
`;

function statesUntilPop(): [ExecutionState, ExecutionState] {
  const analysis = analyze(PROGRAM);
  expect(analysis.diagnostics).toEqual([]);
  let prev = initExecution(analysis.checked, sysvAmd64);
  let next = step(prev);
  while (next.lastStep?.kind !== 'pop') {
    prev = next;
    next = step(prev);
  }
  return [prev, next];
}

describe('popTransition', () => {
  it('captures the dying frame and the value riding out in rax', () => {
    const [prev, next] = statesUntilPop();
    const transition = popTransition(prev, next);
    expect(transition).not.toBeNull();
    expect(transition!.frame.functionName).toBe('double');
    expect(transition!.caller?.functionName).toBe('main');
    expect(transition!.rax).toEqual({ kind: 'i32', value: 21 });
  });

  it('ignores transitions that are not pops', () => {
    const analysis = analyze(PROGRAM);
    const prev = initExecution(analysis.checked, sysvAmd64);
    const next = step(prev);
    expect(next.lastStep?.kind).toBe('push');
    expect(popTransition(prev, next)).toBeNull();
    expect(popTransition(null, next)).toBeNull();
    expect(popTransition(prev, prev)).toBeNull();
  });

  it('keeps the pop ghost lifetime in sync with the design timing', () => {
    expect(PUSH_POP_MS).toBe(150);
  });
});
