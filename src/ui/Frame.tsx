import type { CSSProperties } from 'react';
import type { StackFrame, VariableSlot } from '../engine';
import { Slot } from './Slot';
import { displayValue, type DetailMode } from './stackView';

interface FrameProps {
  frame: StackFrame;
  /** The frame directly below on the stack; null for the entry frame. */
  caller: StackFrame | null;
  hue: number;
  /** Prior activations of the same function on the stack. */
  ordinal: number;
  active: boolean;
  mode: DetailMode;
}

export function Frame({
  frame,
  caller,
  hue,
  ordinal,
  active,
  mode,
}: FrameProps) {
  const style = {
    '--frame-hue': hue,
    '--frame-shade': ordinal,
  } as CSSProperties;
  const origin = frame.callSite
    ? `from line ${frame.callSite.start.line}`
    : 'program entry';
  const variables = frame.layout.slots.filter(
    (slot): slot is VariableSlot =>
      slot.kind === 'arg' || slot.kind === 'local',
  );

  return (
    <article
      className={`frame${active ? ' frame-active' : ''}`}
      style={style}
      aria-label={`${frame.functionName} frame`}
      aria-current={active || undefined}
    >
      <header className="frame-header">
        <span className="frame-name">{frame.functionName}</span>
        <span className="frame-depth">#{frame.depth}</span>
        <span className="frame-origin">{origin}</span>
        {active && <span className="frame-active-tag">active</span>}
      </header>
      {mode === 'bytes' ? (
        <div className="frame-slots">
          {frame.layout.slots.map((slot) => (
            <Slot
              key={slot.offset}
              slot={slot}
              frame={frame}
              callerName={caller?.functionName ?? null}
              callerBase={caller?.base ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="frame-chips">
          {variables.length === 0 && (
            <span className="frame-chips-empty">no variables</span>
          )}
          {variables.map((slot) => {
            const display = displayValue(frame.values[slot.name]);
            return (
              <span
                key={slot.name}
                className={`chip chip-${display.kind}${display.dangling ? ' chip-dangling' : ''}`}
              >
                {slot.name} = {display.text}
                {display.dangling && (
                  <span className="dangling-badge">dangling</span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}
