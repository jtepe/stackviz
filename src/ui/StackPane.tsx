import { useState } from 'react';
import type { Analysis } from '../lang';
import type { ExecutionState } from '../engine';
import { STACK_BASE } from '../engine';
import { Frame } from './Frame';
import {
  activationOrdinal,
  displayRax,
  formatAddress,
  frameHues,
  type DetailMode,
} from './stackView';

interface StackPaneProps {
  analysis: Analysis | null;
  state: ExecutionState | null;
}

function placeholder(analysis: Analysis | null): string {
  if (analysis === null) return 'Waiting for a program…';
  const errorCount = analysis.diagnostics.length;
  if (errorCount > 0) {
    return `${errorCount} problem${errorCount === 1 ? '' : 's'} to fix before running.`;
  }
  return 'Program needs a `main` function to run.';
}

export function StackPane({ analysis, state }: StackPaneProps) {
  const [mode, setMode] = useState<DetailMode>('bytes');

  if (state === null) {
    return (
      <section className="pane stack-pane" aria-label="Stack">
        <div className="pane-header">stack</div>
        <div className="pane-body pane-placeholder">
          {placeholder(analysis)}
        </div>
      </section>
    );
  }

  const hues = frameHues(state);
  const rax = displayRax(state.rax);

  return (
    <section className="pane stack-pane" aria-label="Stack">
      <div className="pane-header">stack</div>
      <div className="stack-toolbar">
        <div className="detail-toggle" role="group" aria-label="Detail mode">
          <button
            type="button"
            aria-pressed={mode === 'bytes'}
            onClick={() => setMode('bytes')}
          >
            bytes
          </button>
          <button
            type="button"
            aria-pressed={mode === 'logical'}
            onClick={() => setMode('logical')}
          >
            logical
          </button>
        </div>
        <span className="rax-chip" aria-label="rax register">
          rax
          <span className={`value value-${rax.kind}`}>{rax.text}</span>
          {rax.dangling && <span className="dangling-badge">dangling</span>}
        </span>
      </div>
      <div className="pane-body stack-body">
        <div className="stack-base-label">{formatAddress(STACK_BASE)}</div>
        {state.frames.length === 0 ? (
          <div className="stack-empty">Program finished — stack is empty.</div>
        ) : (
          state.frames.map((frame, index) => (
            <Frame
              key={frame.id}
              frame={frame}
              caller={index > 0 ? state.frames[index - 1] : null}
              hue={hues.get(frame.functionName) ?? 0}
              ordinal={activationOrdinal(state.frames, index)}
              active={index === state.frames.length - 1}
              mode={mode}
            />
          ))
        )}
        <div className="stack-grow-cue">↓ stack grows downward</div>
      </div>
    </section>
  );
}
