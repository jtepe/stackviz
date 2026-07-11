import type { ReactNode } from 'react';
import type { FrameSlot, StackFrame } from '../engine';
import { RUNTIME_BOUNDARY, slotAddress } from '../engine';
import { displayValue, formatAddress, formatOffset } from './stackView';

interface SlotProps {
  slot: FrameSlot;
  frame: StackFrame;
  /** The frame below on the stack; null for the entry frame. */
  callerName: string | null;
  callerBase: number | null;
}

export function Slot({ slot, frame, callerName, callerBase }: SlotProps) {
  const address = formatAddress(slotAddress(frame.base, slot));
  const offset = formatOffset(slot.offset);

  if (slot.kind === 'padding') {
    return (
      <div className="slot slot-padding">
        <span className="slot-address">{address}</span>
        <span className="slot-offset">{offset}</span>
        <span className="slot-size">{slot.size} B</span>
        <span className="slot-label">padding</span>
        <span className="slot-value" />
      </div>
    );
  }

  let label: string;
  let register: string | null = null;
  let value: ReactNode;

  switch (slot.kind) {
    case 'return-address':
      label = 'return address';
      value = callerName === null ? RUNTIME_BOUNDARY : `→ ${callerName}`;
      break;
    case 'saved-rbp':
      label = 'saved rbp';
      value =
        callerBase === null ? RUNTIME_BOUNDARY : formatAddress(callerBase);
      break;
    case 'arg':
    case 'local': {
      label = `${slot.name}: ${slot.type}`;
      if (slot.kind === 'arg') register = slot.register;
      const display = displayValue(frame.values[slot.name]);
      value = (
        <>
          <span className={`value value-${display.kind}`}>{display.text}</span>
          {display.dangling && <span className="dangling-badge">dangling</span>}
        </>
      );
      break;
    }
  }

  return (
    <div className={`slot slot-${slot.kind}`}>
      <span className="slot-address">{address}</span>
      <span className="slot-offset">{offset}</span>
      <span className="slot-size">{slot.size} B</span>
      <span className="slot-label">
        {label}
        {register && <span className="register-badge">{register}</span>}
      </span>
      <span className="slot-value">{value}</span>
    </div>
  );
}
