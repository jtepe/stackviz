// Stepper tests: exact push/pop transition sequences, rax modeling,
// dangling references, the 8-frame overflow rule, the driver operations,
// and snapshot immutability.

import { describe, expect, it } from 'vitest';
import { check, parse } from '../../src/lang';
import {
  ExecutionState,
  MAX_FRAMES,
  StepEvent,
  initExecution,
  reset,
  runToEnd,
  step,
  stepOut,
  stepOver,
  sysvAmd64,
} from '../../src/engine';

function initOf(source: string): ExecutionState {
  const parsed = parse(source);
  expect(parsed.diagnostics).toEqual([]);
  const result = check(parsed.program);
  expect(result.diagnostics).toEqual([]);
  return initExecution(result.checked, sysvAmd64);
}

function stepN(state: ExecutionState, n: number): ExecutionState {
  let s = state;
  for (let i = 0; i < n; i++) s = step(s);
  return s;
}

/** Step to termination, collecting each step's event in order. */
function eventsOf(state: ExecutionState): StepEvent[] {
  const events: StepEvent[] = [];
  let s = state;
  while (s.status === 'ready' || s.status === 'running') {
    s = step(s);
    events.push(s.lastStep!);
  }
  return events;
}

/** The snapshot minus the shared static context, for structural comparison. */
function strip(state: ExecutionState) {
  return {
    frames: state.frames,
    status: state.status,
    rax: state.rax,
    currentLocation: state.currentLocation,
    overflowSite: state.overflowSite,
    lastStep: state.lastStep,
    nextFrameId: state.nextFrameId,
  };
}

function top(state: ExecutionState) {
  return state.frames[state.frames.length - 1];
}

const EXAMPLE = `
fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;
    let px: &i32 = &x;
    let r = helper(x, px);
    helper(n, px);
}

fn main() {
    outer(7);
}
`;

describe('initial state', () => {
  it('starts ready, with no frames and a clobbered rax', () => {
    const state = initOf(EXAMPLE);
    expect(state.status).toBe('ready');
    expect(state.frames).toEqual([]);
    expect(state.rax).toBe('clobbered');
    expect(state.lastStep).toBeNull();
    expect(state.currentLocation?.start.line).toBe(14);
  });

  it('refuses a program without a well-formed main', () => {
    const parsed = parse('fn main(x: i32) {}');
    const result = check(parsed.program);
    expect(() => initExecution(result.checked, sysvAmd64)).toThrow(/main/);
  });
});

describe('transition sequence for the example program', () => {
  it('produces the exact ordered list of push/pop/let/write steps', () => {
    expect(eventsOf(initOf(EXAMPLE))).toEqual([
      { kind: 'push', functionName: 'main' },
      { kind: 'push', functionName: 'outer' },
      { kind: 'let', name: 'x' },
      { kind: 'let', name: 'px' },
      { kind: 'push', functionName: 'helper' },
      { kind: 'let', name: 'local' },
      { kind: 'pop', functionName: 'helper' },
      { kind: 'write-rax', name: 'r' },
      { kind: 'push', functionName: 'helper' },
      { kind: 'let', name: 'local' },
      { kind: 'pop', functionName: 'helper' },
      { kind: 'pop', functionName: 'outer' },
      { kind: 'pop', functionName: 'main' },
    ]);
  });

  it('finishes with an empty stack and a clobbered rax', () => {
    const end = runToEnd(initOf(EXAMPLE));
    expect(end.status).toBe('finished');
    expect(end.frames).toEqual([]);
    expect(end.rax).toBe('clobbered');
    expect(end.currentLocation).toBeNull();
  });
});

describe('push transition', () => {
  it('spills arguments into the new frame and leaves locals uninitialized', () => {
    const state = stepN(initOf(EXAMPLE), 5);
    const helper = top(state);
    expect(helper.functionName).toBe('helper');
    expect(helper.depth).toBe(3);
    expect(helper.values).toEqual({
      a: { kind: 'i32', value: 42 },
      p: {
        kind: 'ref',
        address: 0x7fffffffdfd8,
        target: 'outer::x',
        targetFrameId: 2,
        dangling: false,
      },
    });
    expect(helper.values['local']).toBeUndefined();
  });

  it('stacks frame bases contiguously below the entry frame', () => {
    const state = stepN(initOf(EXAMPLE), 5);
    expect(state.frames.map((f) => f.base)).toEqual([
      0x7fffffffdff0, 0x7fffffffdfe0, 0x7fffffffdfb0,
    ]);
    expect(state.frames.map((f) => f.depth)).toEqual([1, 2, 3]);
  });

  it('records the call site on every frame except the entry frame', () => {
    const state = stepN(initOf(EXAMPLE), 5);
    const [main, outer, helper] = state.frames;
    expect(main.callSite).toBeNull();
    expect(outer.callSite?.start.line).toBe(15);
    expect(helper.callSite?.start.line).toBe(10);
  });

  it('clobbers rax on every push', () => {
    const afterWrite = stepN(initOf(EXAMPLE), 8);
    expect(afterWrite.rax).toEqual({ kind: 'i32', value: 42 });
    const afterPush = step(afterWrite);
    expect(afterPush.lastStep).toEqual({
      kind: 'push',
      functionName: 'helper',
    });
    expect(afterPush.rax).toBe('clobbered');
  });
});

describe('return values and rax', () => {
  it('rides the return value out in rax and writes it on the let-call step', () => {
    const afterPop = stepN(initOf(EXAMPLE), 7);
    expect(afterPop.lastStep).toEqual({ kind: 'pop', functionName: 'helper' });
    expect(afterPop.rax).toEqual({ kind: 'i32', value: 42 });
    expect(top(afterPop).values['r']).toBeUndefined();
    expect(afterPop.currentLocation?.start.line).toBe(10);

    const afterWrite = step(afterPop);
    expect(afterWrite.lastStep).toEqual({ kind: 'write-rax', name: 'r' });
    expect(top(afterWrite).values['r']).toEqual({ kind: 'i32', value: 42 });
    expect(afterWrite.currentLocation?.start.line).toBe(11);
  });

  it('discards the result of a statement-call without touching any slot', () => {
    const beforePop = stepN(initOf(EXAMPLE), 10);
    const callerValues = (s: ExecutionState) => s.frames[1].values;
    const afterPop = step(beforePop);
    expect(afterPop.lastStep).toEqual({ kind: 'pop', functionName: 'helper' });
    expect(afterPop.rax).toEqual({ kind: 'i32', value: 7 });
    expect(callerValues(afterPop)).toEqual(callerValues(beforePop));

    const afterOuterPop = step(afterPop);
    expect(afterOuterPop.lastStep).toEqual({
      kind: 'pop',
      functionName: 'outer',
    });
    expect(afterOuterPop.rax).toBe('clobbered');
  });

  it('returns a tail expression in one pop step', () => {
    const source = `
      fn id(n: i32) -> i32 { n }
      fn main() { let x = id(3); }
    `;
    const state = initOf(source);
    expect(eventsOf(state)).toEqual([
      { kind: 'push', functionName: 'main' },
      { kind: 'push', functionName: 'id' },
      { kind: 'pop', functionName: 'id' },
      { kind: 'write-rax', name: 'x' },
      { kind: 'pop', functionName: 'main' },
    ]);
  });

  it('passes a tail-position call result through without re-evaluating', () => {
    const source = `
      fn one() -> i32 { 1 }
      fn wrap() -> i32 { one() }
      fn main() { let x = wrap(); }
    `;
    const state = initOf(source);
    expect(eventsOf(state)).toEqual([
      { kind: 'push', functionName: 'main' },
      { kind: 'push', functionName: 'wrap' },
      { kind: 'push', functionName: 'one' },
      { kind: 'pop', functionName: 'one' },
      { kind: 'pop', functionName: 'wrap' },
      { kind: 'write-rax', name: 'x' },
      { kind: 'pop', functionName: 'main' },
    ]);
    const beforeWrite = stepN(state, 5);
    expect(beforeWrite.rax).toEqual({ kind: 'i32', value: 1 });
    expect(top(step(beforeWrite)).values['x']).toEqual({
      kind: 'i32',
      value: 1,
    });
  });
});

describe('dangling references', () => {
  const source = `
fn dangle() -> &i32 {
    let x = 5;
    &x
}

fn main() {
    let p = dangle();
}
`;

  it('marks a returned &local dangling the moment its frame pops', () => {
    const beforePop = stepN(initOf(source), 3);
    expect(top(beforePop).functionName).toBe('dangle');

    const afterPop = step(beforePop);
    expect(afterPop.lastStep).toEqual({ kind: 'pop', functionName: 'dangle' });
    expect(afterPop.rax).toEqual({
      kind: 'ref',
      address: 0x7fffffffdfcc,
      target: 'dangle::x',
      targetFrameId: 2,
      dangling: true,
    });

    const afterWrite = step(afterPop);
    expect(top(afterWrite).values['p']).toEqual({
      kind: 'ref',
      address: 0x7fffffffdfcc,
      target: 'dangle::x',
      targetFrameId: 2,
      dangling: true,
    });
  });

  it('keeps references into live frames non-dangling', () => {
    const state = stepN(initOf(EXAMPLE), 4);
    expect(top(state).values['px']).toEqual({
      kind: 'ref',
      address: 0x7fffffffdfd8,
      target: 'outer::x',
      targetFrameId: 2,
      dangling: false,
    });
  });
});

describe('stack overflow', () => {
  const chain = `
fn f7(n: i32) {}
fn f6(n: i32) { f7(n); }
fn f5(n: i32) { f6(n); }
fn f4(n: i32) { f5(n); }
fn f3(n: i32) { f4(n); }
fn f2(n: i32) { f3(n); }
fn f1(n: i32) { f2(n); }

fn main() {
    f1(0);
}
`;

  const recursive = `
fn r(n: i32) {
    r(n);
}

fn main() {
    r(0);
}
`;

  it('lets a call chain reach exactly 8 live frames and finish', () => {
    let s = initOf(chain);
    let maxDepth = 0;
    while (s.status !== 'finished') {
      s = step(s);
      maxDepth = Math.max(maxDepth, s.frames.length);
    }
    expect(maxDepth).toBe(MAX_FRAMES);
    expect(s.status).toBe('finished');
  });

  it('halts with overflow when a call would create a 9th frame', () => {
    const end = runToEnd(initOf(recursive));
    expect(end.status).toBe('overflow');
    expect(end.lastStep).toEqual({ kind: 'overflow' });
    expect(end.frames).toHaveLength(MAX_FRAMES);
    expect(end.frames.map((f) => f.depth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(end.frames.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('records the offending call site and keeps the frames intact', () => {
    const end = runToEnd(initOf(recursive));
    expect(end.overflowSite?.start.line).toBe(3);
    expect(end.overflowSite?.start.column).toBe(5);
    expect(end.currentLocation).toEqual(end.overflowSite);
    expect(step(end)).toBe(end);
  });
});

describe('drivers', () => {
  it('stepOver on a plain statement is a single step', () => {
    const state = stepN(initOf(EXAMPLE), 2);
    expect(strip(stepOver(state))).toEqual(strip(step(state)));
  });

  it('stepOver runs a let-call to completion including the rax write', () => {
    const beforeCall = stepN(initOf(EXAMPLE), 4);
    const after = stepOver(beforeCall);
    expect(after.frames).toHaveLength(2);
    expect(top(after).values['r']).toEqual({ kind: 'i32', value: 42 });
    expect(after.lastStep).toEqual({ kind: 'write-rax', name: 'r' });
    expect(after.currentLocation?.start.line).toBe(11);
  });

  it('stepOver runs a statement-call to completion', () => {
    const beforeCall = stepN(initOf(EXAMPLE), 9);
    expect(beforeCall.lastStep).toEqual({
      kind: 'push',
      functionName: 'helper',
    });
    const after = stepOver(stepOut(beforeCall));
    expect(after.lastStep).toEqual({ kind: 'pop', functionName: 'outer' });
  });

  it('stepOut runs until the current frame pops', () => {
    const inHelper = stepN(initOf(EXAMPLE), 5);
    const after = stepOut(inHelper);
    expect(after.frames).toHaveLength(2);
    expect(after.lastStep).toEqual({ kind: 'pop', functionName: 'helper' });
    expect(after.rax).toEqual({ kind: 'i32', value: 42 });
  });

  it('runToEnd stops at overflow as well as at completion', () => {
    const overflowSource = 'fn r() { r(); }\nfn main() { r(); }';
    expect(runToEnd(initOf(overflowSource)).status).toBe('overflow');
    expect(runToEnd(initOf(EXAMPLE)).status).toBe('finished');
  });

  it('reset returns to the initial about-to-enter-main state', () => {
    const initial = initOf(EXAMPLE);
    const mid = stepN(initial, 6);
    expect(strip(reset(mid))).toEqual(strip(initial));
    expect(reset(mid).context).toBe(mid.context);
  });

  it('step is a fixed point on a finished state', () => {
    const end = runToEnd(initOf(EXAMPLE));
    expect(step(end)).toBe(end);
  });
});

describe('immutability and determinism', () => {
  it('stepping never mutates a prior snapshot', () => {
    const mid = stepN(initOf(EXAMPLE), 5);
    const before = JSON.parse(JSON.stringify(strip(mid)));
    runToEnd(mid);
    expect(strip(mid)).toEqual(before);
  });

  it('stepping the same snapshot twice yields identical results', () => {
    const mid = stepN(initOf(EXAMPLE), 6);
    expect(strip(step(mid))).toEqual(strip(step(mid)));
    expect(strip(runToEnd(mid))).toEqual(strip(runToEnd(mid)));
  });
});
