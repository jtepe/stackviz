import { useCallback, useState } from 'react';
import type { Analysis } from '../lang';
import type { ExecutionState } from '../engine';
import { STACK_BASE } from '../engine';
import { Frame } from './Frame';
import { RefArrowOverlay } from './RefArrowOverlay';
import type { RefHover } from './hover';
import {
  activationOrdinal,
  displayRax,
  formatAddress,
  formatHex32,
  frameHues,
  type DetailMode,
} from './stackView';

interface StackPaneProps {
  analysis: Analysis | null;
  state: ExecutionState | null;
  /** Frame linked to the call expression hovered in the editor. */
  linkedFrameId?: number | null;
  /** Reference value currently hovered, for the arrow overlay. */
  refHover?: RefHover | null;
  onFrameHover?: (frameId: number | null) => void;
  onRefHover?: (ref: RefHover | null) => void;
}

function placeholder(analysis: Analysis | null): string {
  if (analysis === null) return 'Waiting for a program…';
  const errorCount = analysis.diagnostics.length;
  if (errorCount > 0) {
    return `${errorCount} problem${errorCount === 1 ? '' : 's'} to fix before running.`;
  }
  return 'Program needs a `main` function to run.';
}

export function StackPane({
  analysis,
  state,
  linkedFrameId = null,
  refHover = null,
  onFrameHover,
  onRefHover,
}: StackPaneProps) {
  const [mode, setMode] = useState<DetailMode>('bytes');
  const [body, setBody] = useState<HTMLElement | null>(null);
  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    setBody(node);
  }, []);

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
  const rawRax = state.rax;

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
          <span
            className={`value value-${rax.kind}`}
            data-hex={
              rawRax !== 'clobbered' && rawRax.kind === 'i32'
                ? formatHex32(rawRax.value)
                : undefined
            }
          >
            {rax.text}
          </span>
          {rax.dangling && <span className="dangling-badge">dangling</span>}
        </span>
      </div>
      <div className="pane-body stack-body" ref={bodyRef}>
        <div className="stack-base-label">{formatAddress(STACK_BASE)}</div>
        {state.frames.length === 0 ? (
          <div className="stack-empty">
            {state.status === 'ready'
              ? 'Ready — step to enter main.'
              : 'Program finished — stack is empty.'}
          </div>
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
              linked={frame.id === linkedFrameId}
              onFrameHover={onFrameHover}
              onRefHover={onRefHover}
            />
          ))
        )}
        {refHover?.dangling && (
          <div className="ghost-target" data-ghost-target>
            popped frame — pointee no longer exists
          </div>
        )}
        <div className="stack-grow-cue">↓ stack grows downward</div>
        <RefArrowOverlay container={body} refHover={refHover} />
      </div>
    </section>
  );
}
