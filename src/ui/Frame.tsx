import type { CSSProperties } from 'react';
import type { StackFrame, VariableSlot } from '../engine';
import { slotAddress } from '../engine';
import type { RefHover } from './hover';
import { Slot } from './Slot';
import { displayValue, formatHex32, type DetailMode } from './stackView';

interface FrameProps {
  frame: StackFrame;
  /** The frame directly below on the stack; null for the entry frame. */
  caller: StackFrame | null;
  hue: number;
  /** Prior activations of the same function on the stack. */
  ordinal: number;
  active: boolean;
  mode: DetailMode;
  /** True while the frame's call site is hovered in the editor. */
  linked?: boolean;
  /** Variable that just received rax after a `let`-call returned. */
  landedSlot?: string | null;
  onFrameHover?: (frameId: number | null) => void;
  onRefHover?: (ref: RefHover | null) => void;
}

export function Frame({
  frame,
  caller,
  hue,
  ordinal,
  active,
  mode,
  linked = false,
  landedSlot = null,
  onFrameHover,
  onRefHover,
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
      className={`frame${active ? ' frame-active' : ''}${linked ? ' frame-linked' : ''}`}
      style={style}
      aria-label={`${frame.functionName} frame`}
      aria-current={active || undefined}
      onMouseEnter={() => onFrameHover?.(frame.id)}
      onMouseLeave={() => onFrameHover?.(null)}
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
              landed={
                (slot.kind === 'arg' || slot.kind === 'local') &&
                slot.name === landedSlot
              }
              onRefHover={onRefHover}
            />
          ))}
        </div>
      ) : (
        <div className="frame-chips">
          {variables.length === 0 && (
            <span className="frame-chips-empty">no variables</span>
          )}
          {variables.map((slot) => {
            const raw = frame.values[slot.name];
            const display = displayValue(raw);
            const refHover: RefHover | null =
              raw?.kind === 'ref'
                ? {
                    fromAddress: slotAddress(frame.base, slot),
                    toAddress: raw.address,
                    dangling: raw.dangling,
                  }
                : null;
            return (
              <span
                key={slot.name}
                className={`chip chip-${display.kind}${display.dangling ? ' chip-dangling' : ''}${slot.name === landedSlot ? ' chip-landed' : ''}`}
                data-slot-addr={slotAddress(frame.base, slot)}
                data-hex={
                  raw?.kind === 'i32' ? formatHex32(raw.value) : undefined
                }
                onMouseEnter={
                  refHover ? () => onRefHover?.(refHover) : undefined
                }
                onMouseLeave={refHover ? () => onRefHover?.(null) : undefined}
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
