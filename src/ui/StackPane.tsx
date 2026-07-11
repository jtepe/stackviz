import { useCallback, useState } from 'react';
import type { Analysis } from '../lang';
import type { ExecutionState } from '../engine';
import { STACK_BASE } from '../engine';
import { Frame } from './Frame';
import { RefArrowOverlay } from './RefArrowOverlay';
import type { RefHover } from './hover';
import { usePrefersReducedMotion } from './motion';
import { usePopGhost } from './transitions';
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
  const reducedMotion = usePrefersReducedMotion();
  const popGhost = usePopGhost(state);

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
  const landedSlot =
    state.lastStep?.kind === 'write-rax' ? state.lastStep.name : null;
  const ghostRax = popGhost ? displayRax(popGhost.rax) : null;

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
        {state.frames.length === 0 && popGhost === null ? (
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
              landedSlot={index === state.frames.length - 1 ? landedSlot : null}
              onFrameHover={onFrameHover}
              onRefHover={onRefHover}
            />
          ))
        )}
        {popGhost && (
          <div className="frame-ghost" data-testid="pop-ghost" aria-hidden>
            <Frame
              frame={popGhost.frame}
              caller={popGhost.caller}
              hue={popGhost.hue}
              ordinal={popGhost.ordinal}
              active={false}
              mode={mode}
            />
            {ghostRax && ghostRax.kind !== 'clobbered' && (
              <span className="rax-rideout">rax = {ghostRax.text}</span>
            )}
          </div>
        )}
        {state.status === 'overflow' && (
          <div
            role="alert"
            className={`overflow-marker${
              reducedMotion ? ' overflow-marker-static' : ''
            }`}
          >
            ☠ stack overflow
          </div>
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
