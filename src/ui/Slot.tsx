import type { ReactNode } from 'react';
import type { FrameSlot, StackFrame } from '../engine';
import { RUNTIME_BOUNDARY, slotAddress } from '../engine';
import type { RefHover } from './hover';
import {
  displayValue,
  formatAddress,
  formatHex32,
  formatOffset,
} from './stackView';

interface SlotProps {
  slot: FrameSlot;
  frame: StackFrame;
  /** The frame below on the stack; null for the entry frame. */
  callerName: string | null;
  callerBase: number | null;
  onRefHover?: (ref: RefHover | null) => void;
}

export function Slot({
  slot,
  frame,
  callerName,
  callerBase,
  onRefHover,
}: SlotProps) {
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
  let slotAddr: number | undefined;
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
      slotAddr = slotAddress(frame.base, slot);
      const raw = frame.values[slot.name];
      const display = displayValue(raw);
      const refHover: RefHover | null =
        raw?.kind === 'ref'
          ? {
              fromAddress: slotAddr,
              toAddress: raw.address,
              dangling: raw.dangling,
            }
          : null;
      value = (
        <>
          <span
            className={`value value-${display.kind}`}
            data-hex={raw?.kind === 'i32' ? formatHex32(raw.value) : undefined}
            onMouseEnter={refHover ? () => onRefHover?.(refHover) : undefined}
            onMouseLeave={refHover ? () => onRefHover?.(null) : undefined}
          >
            {display.text}
          </span>
          {display.dangling && <span className="dangling-badge">dangling</span>}
        </>
      );
      break;
    }
  }

  return (
    <div className={`slot slot-${slot.kind}`} data-slot-addr={slotAddr}>
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
