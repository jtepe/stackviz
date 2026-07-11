// The execution engine: a pure state machine over immutable snapshots.
// `step(state)` returns the next snapshot and never mutates its input, so
// rendering stays a pure function of state and any snapshot can be kept
// around (undo, timeline scrubbing) for free.

import {
  CallExpr,
  CheckedFunction,
  CheckedProgram,
  Expr,
  LetStmt,
  Span,
} from '../lang';
import {
  CallingConvention,
  ENTRY_FRAME_BASE,
  FrameLayout,
  VariableSlot,
  calleeFrameBase,
  slotAddress,
} from './frame';
import { RaxValue, Value } from './values';

/** A call that would create a frame beyond this limit overflows the stack. */
export const MAX_FRAMES = 8;

export type ExecutionStatus = 'ready' | 'running' | 'finished' | 'overflow';

/**
 * What a frame does on the step after a callee returns to it: write rax
 * into the slot of the `let` that made the call, or — for a call in tail
 * position — pop itself with the value already in rax.
 */
export type FrameResume = 'write-rax' | 'return-rax';

export interface StackFrame {
  /** Unique per activation; recursive calls get distinct ids. */
  id: number;
  functionName: string;
  layout: FrameLayout;
  /** The frame's RBP value. */
  base: number;
  /** 1-based position on the stack; the entry frame is 1. */
  depth: number;
  /** Span of the call expression that created the frame; null for the entry frame. */
  callSite: Span | null;
  /**
   * Current variable values by name. A missing entry is an uninitialized
   * slot — a local whose `let` has not executed yet.
   */
  values: Readonly<Record<string, Value>>;
  /** Index of the next statement to execute in the function body. */
  pc: number;
  resume: FrameResume | null;
}

/** What the most recent step did, for tests and UI transitions. */
export type StepEvent =
  | { kind: 'push'; functionName: string }
  | { kind: 'pop'; functionName: string }
  | { kind: 'let'; name: string }
  | { kind: 'write-rax'; name: string }
  | { kind: 'overflow' };

/** Static data shared by every snapshot of one execution. */
export interface ExecutionContext {
  functions: ReadonlyMap<string, CheckedFunction>;
  layouts: ReadonlyMap<string, FrameLayout>;
  convention: CallingConvention;
  entry: CheckedFunction;
}

export interface ExecutionState {
  readonly frames: readonly StackFrame[];
  readonly status: ExecutionStatus;
  readonly rax: RaxValue;
  /** Span of what executes next; null once finished. */
  readonly currentLocation: Span | null;
  /** Span of the call that overflowed the stack, once status is `overflow`. */
  readonly overflowSite: Span | null;
  readonly lastStep: StepEvent | null;
  readonly nextFrameId: number;
  readonly context: ExecutionContext;
}

/**
 * Build the initial snapshot — about to enter `main` — for a program that
 * checked without diagnostics.
 */
export function initExecution(
  checked: CheckedProgram,
  convention: CallingConvention,
): ExecutionState {
  if (!checked.main) {
    throw new Error('cannot execute a program without a well-formed `main`');
  }
  const layouts = new Map<string, FrameLayout>();
  for (const [name, fn] of checked.functions) {
    layouts.set(name, convention.layoutFrame(fn));
  }
  const entry = checked.functions.get(checked.main.name.name)!;
  return initialState({
    functions: checked.functions,
    layouts,
    convention,
    entry,
  });
}

/** Advance one micro-step. Finished and overflowed states are fixed points. */
export function step(state: ExecutionState): ExecutionState {
  switch (state.status) {
    case 'finished':
    case 'overflow':
      return state;
    case 'ready':
      return pushFrame(state, state.context.entry, [], null);
    case 'running':
      return stepRunning(state);
  }
}

/**
 * Advance one step; if that step pushes a frame, keep going until the call
 * has fully completed (including the rax write of a `let`-call), stopping
 * at the next statement in the original function.
 */
export function stepOver(state: ExecutionState): ExecutionState {
  if (state.status !== 'running') return step(state);
  const depth = state.frames.length;
  let s = step(state);
  while (
    s.status === 'running' &&
    (s.frames.length > depth ||
      (s.frames.length === depth && s.frames[depth - 1].resume === 'write-rax'))
  ) {
    s = step(s);
  }
  return s;
}

/** Run until the current frame pops. */
export function stepOut(state: ExecutionState): ExecutionState {
  if (state.status !== 'running') return step(state);
  const depth = state.frames.length;
  let s = state;
  do {
    s = step(s);
  } while (s.status === 'running' && s.frames.length >= depth);
  return s;
}

/** Run to completion or to stack overflow. */
export function runToEnd(state: ExecutionState): ExecutionState {
  let s = state;
  while (s.status === 'ready' || s.status === 'running') {
    s = step(s);
  }
  return s;
}

/** Back to the initial state: about to enter `main`. */
export function reset(state: ExecutionState): ExecutionState {
  return initialState(state.context);
}

function initialState(context: ExecutionContext): ExecutionState {
  return {
    frames: [],
    status: 'ready',
    rax: 'clobbered',
    currentLocation: context.entry.decl.name.span,
    overflowSite: null,
    lastStep: null,
    nextFrameId: 1,
    context,
  };
}

function functionOf(state: ExecutionState, frame: StackFrame): CheckedFunction {
  return state.context.functions.get(frame.functionName)!;
}

function locationOf(frame: StackFrame, fn: CheckedFunction): Span {
  const { stmts, tail } = fn.decl.body;
  if (frame.resume === 'return-rax') return tail!.span;
  if (frame.pc < stmts.length) return stmts[frame.pc].span;
  if (tail) return tail.span;
  return fn.decl.body.span;
}

function stepRunning(state: ExecutionState): ExecutionState {
  const frame = state.frames[state.frames.length - 1];
  const fn = functionOf(state, frame);
  const { stmts, tail } = fn.decl.body;

  if (frame.resume === 'write-rax') {
    const stmt = stmts[frame.pc] as LetStmt;
    const name = stmt.name.name;
    const updated: StackFrame = {
      ...frame,
      values: { ...frame.values, [name]: state.rax as Value },
      pc: frame.pc + 1,
      resume: null,
    };
    return withTopFrame(state, updated, fn, { kind: 'write-rax', name });
  }

  if (frame.resume === 'return-rax') {
    return popFrame(state, fn.returnType ? (state.rax as Value) : null);
  }

  if (frame.pc < stmts.length) {
    const stmt = stmts[frame.pc];
    switch (stmt.kind) {
      case 'LetStmt': {
        if (stmt.init.kind === 'CallExpr') return performCall(state, stmt.init);
        const name = stmt.name.name;
        const updated: StackFrame = {
          ...frame,
          values: { ...frame.values, [name]: evaluate(stmt.init, frame) },
          pc: frame.pc + 1,
        };
        return withTopFrame(state, updated, fn, { kind: 'let', name });
      }
      case 'CallStmt':
        return performCall(state, stmt.call);
      case 'ReturnStmt':
        return popFrame(state, stmt.value ? evaluate(stmt.value, frame) : null);
    }
  }

  if (tail) {
    if (tail.kind === 'CallExpr') return performCall(state, tail);
    return popFrame(state, evaluate(tail, frame));
  }
  return popFrame(state, null);
}

function withTopFrame(
  state: ExecutionState,
  frame: StackFrame,
  fn: CheckedFunction,
  lastStep: StepEvent,
): ExecutionState {
  return {
    ...state,
    frames: [...state.frames.slice(0, -1), frame],
    currentLocation: locationOf(frame, fn),
    lastStep,
  };
}

function performCall(state: ExecutionState, call: CallExpr): ExecutionState {
  if (state.frames.length >= MAX_FRAMES) {
    return {
      ...state,
      status: 'overflow',
      overflowSite: call.span,
      currentLocation: call.span,
      lastStep: { kind: 'overflow' },
    };
  }
  const caller = state.frames[state.frames.length - 1];
  const args = call.args.map((arg) => evaluate(arg, caller));
  const callee = state.context.functions.get(call.callee.name)!;
  return pushFrame(state, callee, args, call.span);
}

function pushFrame(
  state: ExecutionState,
  fn: CheckedFunction,
  args: Value[],
  callSite: Span | null,
): ExecutionState {
  const caller = state.frames[state.frames.length - 1];
  const layout = state.context.layouts.get(fn.decl.name.name)!;
  const values: Record<string, Value> = {};
  fn.decl.params.forEach((param, i) => {
    values[param.name.name] = args[i];
  });
  const frame: StackFrame = {
    id: state.nextFrameId,
    functionName: fn.decl.name.name,
    layout,
    base: caller
      ? calleeFrameBase(caller.base, caller.layout)
      : ENTRY_FRAME_BASE,
    depth: state.frames.length + 1,
    callSite,
    values,
    pc: 0,
    resume: null,
  };
  return {
    ...state,
    frames: [...state.frames, frame],
    status: 'running',
    rax: 'clobbered',
    currentLocation: locationOf(frame, fn),
    lastStep: { kind: 'push', functionName: frame.functionName },
    nextFrameId: state.nextFrameId + 1,
  };
}

function popFrame(state: ExecutionState, value: Value | null): ExecutionState {
  const popped = state.frames[state.frames.length - 1];
  const rax: RaxValue = value ? markDangling(value, popped.id) : 'clobbered';
  const remaining = state.frames
    .slice(0, -1)
    .map((frame) => markFrameDanglings(frame, popped.id));
  const lastStep: StepEvent = {
    kind: 'pop',
    functionName: popped.functionName,
  };

  if (remaining.length === 0) {
    return {
      ...state,
      frames: remaining,
      status: 'finished',
      rax,
      currentLocation: null,
      lastStep,
    };
  }

  const caller = remaining[remaining.length - 1];
  const fn = functionOf(state, caller);
  const { stmts } = fn.decl.body;
  let resumed: StackFrame;
  if (caller.pc < stmts.length) {
    resumed =
      stmts[caller.pc].kind === 'LetStmt'
        ? { ...caller, resume: 'write-rax' }
        : { ...caller, pc: caller.pc + 1 };
  } else {
    resumed = { ...caller, resume: 'return-rax' };
  }
  remaining[remaining.length - 1] = resumed;

  return {
    ...state,
    frames: remaining,
    status: 'running',
    rax,
    currentLocation: locationOf(resumed, fn),
    lastStep,
  };
}

function markFrameDanglings(frame: StackFrame, frameId: number): StackFrame {
  let values: Record<string, Value> | null = null;
  for (const [name, value] of Object.entries(frame.values)) {
    const marked = markDangling(value, frameId);
    if (marked !== value) {
      values ??= { ...frame.values };
      values[name] = marked;
    }
  }
  return values ? { ...frame, values } : frame;
}

function markDangling(value: Value, frameId: number): Value {
  if (value.kind === 'ref' && value.targetFrameId === frameId) {
    return { ...value, dangling: true };
  }
  return value;
}

function evaluate(expr: Expr, frame: StackFrame): Value {
  switch (expr.kind) {
    case 'IntLiteral':
      return { kind: 'i32', value: expr.value };
    case 'VarExpr': {
      const value = frame.values[expr.name.name];
      if (!value) {
        throw new Error(`use of uninitialized variable \`${expr.name.name}\``);
      }
      return value;
    }
    case 'RefExpr': {
      const name = expr.name.name;
      const slot = frame.layout.slots.find(
        (s): s is VariableSlot =>
          (s.kind === 'arg' || s.kind === 'local') && s.name === name,
      )!;
      return {
        kind: 'ref',
        address: slotAddress(frame.base, slot),
        target: `${frame.functionName}::${name}`,
        targetFrameId: frame.id,
        dangling: false,
      };
    }
  }
}
