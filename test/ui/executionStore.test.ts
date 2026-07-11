import { analyze } from '../../src/lang';
import {
  appReducer,
  appStatus,
  availableControls,
  initialAppState,
  type AppAction,
  type AppState,
  type Command,
} from '../../src/ui/executionStore';

const PROGRAM = `fn f() -> i32 {
    return 1;
}

fn main() {
    let a = f();
    let b = 2;
}
`;

const OVERFLOW_PROGRAM = `fn spin() {
    spin();
}

fn main() {
    spin();
}
`;

function dispatch(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

function command(state: AppState, ...commands: Command[]): AppState {
  return dispatch(
    state,
    ...commands.map((command): AppAction => ({ type: 'command', command })),
  );
}

function analyzed(source: string, state = initialAppState): AppState {
  return appReducer(state, { type: 'analysis', analysis: analyze(source) });
}

function ticksUntilStopped(state: AppState, limit = 200): AppState {
  let s = state;
  for (let i = 0; s.autorun; i++) {
    expect(i).toBeLessThan(limit);
    s = appReducer(s, { type: 'run-tick' });
  }
  return s;
}

describe('executionStore status', () => {
  it('starts in editing with every control disabled', () => {
    expect(appStatus(initialAppState)).toBe('editing');
    expect(Object.values(availableControls(initialAppState))).not.toContain(
      true,
    );
  });

  it('is ready after a valid analysis', () => {
    const state = analyzed(PROGRAM);
    expect(appStatus(state)).toBe('ready');
    expect(state.execution?.frames).toHaveLength(0);
  });

  it('stays editing when the program has diagnostics', () => {
    const state = analyzed('fn main() { let x = y; }');
    expect(appStatus(state)).toBe('editing');
    expect(state.execution).toBeNull();
  });

  it('stays editing when `main` is missing', () => {
    const state = analyzed('fn f() {}\n');
    expect(appStatus(state)).toBe('editing');
    expect(state.execution).toBeNull();
  });
});

describe('executionStore controls', () => {
  it('offers step, step over, and run when ready', () => {
    expect(availableControls(analyzed(PROGRAM))).toEqual({
      step: true,
      stepOver: true,
      stepOut: false,
      run: true,
      reset: false,
    });
  });

  it('offers everything while running', () => {
    const state = command(analyzed(PROGRAM), 'step');
    expect(appStatus(state)).toBe('running');
    expect(Object.values(availableControls(state))).not.toContain(false);
  });

  it('offers only reset after finishing', () => {
    const state = command(analyzed(PROGRAM), 'run');
    const finished = ticksUntilStopped(state);
    expect(appStatus(finished)).toBe('finished');
    expect(availableControls(finished)).toEqual({
      step: false,
      stepOver: false,
      stepOut: false,
      run: false,
      reset: true,
    });
  });

  it('offers only reset after an overflow', () => {
    const finished = ticksUntilStopped(
      command(analyzed(OVERFLOW_PROGRAM), 'run'),
    );
    expect(appStatus(finished)).toBe('overflow');
    expect(availableControls(finished)).toEqual({
      step: false,
      stepOver: false,
      stepOut: false,
      run: false,
      reset: true,
    });
  });

  it('offers only reset while autorunning', () => {
    const state = command(analyzed(PROGRAM), 'run');
    expect(state.autorun).toBe(true);
    expect(availableControls(state)).toEqual({
      step: false,
      stepOver: false,
      stepOut: false,
      run: false,
      reset: true,
    });
  });

  it('ignores commands that are not currently available', () => {
    const ready = analyzed(PROGRAM);
    expect(command(ready, 'reset')).toBe(ready);
    expect(command(ready, 'step-out')).toBe(ready);
    expect(command(initialAppState, 'step')).toBe(initialAppState);
  });
});

describe('executionStore commands', () => {
  it('step enters main', () => {
    const state = command(analyzed(PROGRAM), 'step');
    expect(state.execution?.frames.map((f) => f.functionName)).toEqual([
      'main',
    ]);
  });

  it('step over completes a call including the rax write', () => {
    const state = command(analyzed(PROGRAM), 'step', 'step-over');
    const main = state.execution!.frames[0];
    expect(state.execution!.frames).toHaveLength(1);
    expect(main.values.a).toEqual({ kind: 'i32', value: 1 });
  });

  it('step out pops the current frame', () => {
    const inCall = command(analyzed(PROGRAM), 'step', 'step');
    expect(inCall.execution!.frames).toHaveLength(2);
    const state = command(inCall, 'step-out');
    expect(state.execution!.frames).toHaveLength(1);
  });

  it('run advances one micro-step per tick and stops when finished', () => {
    const running = command(analyzed(PROGRAM), 'run');
    const afterTick = appReducer(running, { type: 'run-tick' });
    expect(afterTick.execution!.frames).toHaveLength(1);
    expect(afterTick.autorun).toBe(true);
    const finished = ticksUntilStopped(afterTick);
    expect(appStatus(finished)).toBe('finished');
    expect(finished.autorun).toBe(false);
  });

  it('ignores ticks when not autorunning', () => {
    const state = command(analyzed(PROGRAM), 'step');
    expect(appReducer(state, { type: 'run-tick' })).toBe(state);
  });

  it('reset returns to about-to-enter-main', () => {
    const finished = ticksUntilStopped(command(analyzed(PROGRAM), 'run'));
    const state = command(finished, 'reset');
    expect(appStatus(state)).toBe('ready');
    expect(state.execution?.frames).toHaveLength(0);
  });
});

describe('executionStore edit-resets-execution', () => {
  it('re-analysis of unchanged source keeps the execution in place', () => {
    const stepped = command(analyzed(PROGRAM), 'step');
    const state = analyzed(PROGRAM, stepped);
    expect(state.execution).toBe(stepped.execution);
    expect(state.resetNotice).toBe(0);
  });

  it('an edit before stepping rebuilds silently', () => {
    const state = analyzed(OVERFLOW_PROGRAM, analyzed(PROGRAM));
    expect(appStatus(state)).toBe('ready');
    expect(state.resetNotice).toBe(0);
  });

  it('an edit while stepping resets execution and raises the notice', () => {
    const stepped = command(analyzed(PROGRAM), 'step');
    const state = analyzed(PROGRAM + '\n', stepped);
    expect(appStatus(state)).toBe('ready');
    expect(state.execution?.frames).toHaveLength(0);
    expect(state.resetNotice).toBe(1);
  });

  it('an invalidating edit while stepping raises the notice too', () => {
    const stepped = command(analyzed(PROGRAM), 'step');
    const state = analyzed('fn main() { let x = y; }', stepped);
    expect(appStatus(state)).toBe('editing');
    expect(state.resetNotice).toBe(1);
  });

  it('back-to-back edits keep bumping the notice counter', () => {
    let state = command(analyzed(PROGRAM), 'step');
    state = analyzed(PROGRAM + '\n', state);
    state = command(state, 'step');
    state = analyzed(PROGRAM + '\n\n', state);
    expect(state.resetNotice).toBe(2);
  });

  it('an edit cancels a run in progress', () => {
    const running = command(analyzed(PROGRAM), 'run');
    const state = analyzed(PROGRAM + '\n', running);
    expect(state.autorun).toBe(false);
  });

  it('dismiss-notice clears the notice', () => {
    const stepped = command(analyzed(PROGRAM), 'step');
    const noticed = analyzed(PROGRAM + '\n', stepped);
    const state = appReducer(noticed, { type: 'dismiss-notice' });
    expect(state.resetNotice).toBe(0);
  });
});
