// Interactive execution state: a pure reducer that maps toolbar commands
// onto the engine's driver operations and keeps the current analysis in
// sync with the running snapshot. React renders this state; the engine
// stays framework-free.

import type { Analysis } from '../lang';
import {
  ExecutionState,
  initExecution,
  reset as resetExecution,
  step,
  stepOut,
  stepOver,
  sysvAmd64,
} from '../engine';

/** The engine's status, plus `editing` while the program has problems. */
export type AppStatus =
  'editing' | 'ready' | 'running' | 'finished' | 'overflow';

export type Command = 'step' | 'step-over' | 'step-out' | 'run' | 'reset';

export interface AppState {
  analysis: Analysis | null;
  execution: ExecutionState | null;
  /** True while Run is animating steps on a timer. */
  autorun: boolean;
  /**
   * Bumped each time an edit throws away an in-progress execution; 0 means
   * no notice is showing. A counter (not a flag) so back-to-back edits
   * restart the auto-dismiss timer.
   */
  resetNotice: number;
}

export type AppAction =
  | { type: 'analysis'; analysis: Analysis }
  | { type: 'command'; command: Command }
  | { type: 'run-tick' }
  | { type: 'dismiss-notice' };

export const initialAppState: AppState = {
  analysis: null,
  execution: null,
  autorun: false,
  resetNotice: 0,
};

export function appStatus(state: AppState): AppStatus {
  return state.execution === null ? 'editing' : state.execution.status;
}

export interface ControlSet {
  step: boolean;
  stepOver: boolean;
  stepOut: boolean;
  run: boolean;
  reset: boolean;
}

const NO_CONTROLS: ControlSet = {
  step: false,
  stepOver: false,
  stepOut: false,
  run: false,
  reset: false,
};

export function availableControls(state: AppState): ControlSet {
  if (state.autorun) return { ...NO_CONTROLS, reset: true };
  switch (appStatus(state)) {
    case 'editing':
      return NO_CONTROLS;
    case 'ready':
      return { ...NO_CONTROLS, step: true, stepOver: true, run: true };
    case 'running':
      return {
        step: true,
        stepOver: true,
        stepOut: true,
        run: true,
        reset: true,
      };
    case 'finished':
    case 'overflow':
      return { ...NO_CONTROLS, reset: true };
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'analysis':
      return applyAnalysis(state, action.analysis);
    case 'command':
      return applyCommand(state, action.command);
    case 'run-tick': {
      if (!state.autorun || state.execution === null) return state;
      const next = step(state.execution);
      const done = next.status === 'finished' || next.status === 'overflow';
      return { ...state, execution: next, autorun: !done };
    }
    case 'dismiss-notice':
      return state.resetNotice === 0 ? state : { ...state, resetNotice: 0 };
  }
}

function applyAnalysis(state: AppState, analysis: Analysis): AppState {
  if (state.analysis?.source === analysis.source) {
    return { ...state, analysis };
  }
  const valid =
    analysis.diagnostics.length === 0 && analysis.checked.main !== null;
  const wasStepping =
    state.execution !== null && state.execution.status !== 'ready';
  return {
    analysis,
    execution: valid ? initExecution(analysis.checked, sysvAmd64) : null,
    autorun: false,
    resetNotice: wasStepping ? state.resetNotice + 1 : state.resetNotice,
  };
}

function applyCommand(state: AppState, command: Command): AppState {
  const controls = availableControls(state);
  const execution = state.execution;
  if (execution === null) return state;
  switch (command) {
    case 'step':
      if (!controls.step) return state;
      return { ...state, execution: step(execution) };
    case 'step-over':
      if (!controls.stepOver) return state;
      return { ...state, execution: stepOver(execution) };
    case 'step-out':
      if (!controls.stepOut) return state;
      return { ...state, execution: stepOut(execution) };
    case 'run':
      if (!controls.run) return state;
      return { ...state, autorun: true };
    case 'reset':
      if (!controls.reset) return state;
      return { ...state, execution: resetExecution(execution), autorun: false };
  }
}
