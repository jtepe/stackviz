// View-model helpers for the stack panel: value/address formatting and
// frame coloring. Everything here is a pure function of engine state.

import { ExecutionState, RaxValue, StackFrame, Value } from '../engine';

export type DetailMode = 'bytes' | 'logical';

export function formatAddress(address: number): string {
  return `0x${address.toString(16)}`;
}

export function formatOffset(offset: number): string {
  const sign = offset < 0 ? '-' : '+';
  return `${sign}0x${Math.abs(offset).toString(16)}`;
}

export interface DisplayValue {
  text: string;
  kind: 'i32' | 'ref' | 'uninitialized' | 'clobbered';
  dangling: boolean;
}

/** How a slot's current value renders; a missing value is uninitialized. */
export function displayValue(value: Value | undefined): DisplayValue {
  if (!value) {
    return { text: '??', kind: 'uninitialized', dangling: false };
  }
  if (value.kind === 'i32') {
    return { text: String(value.value), kind: 'i32', dangling: false };
  }
  return {
    text: `${formatAddress(value.address)} → ${value.target}`,
    kind: 'ref',
    dangling: value.dangling,
  };
}

export function displayRax(rax: RaxValue): DisplayValue {
  if (rax === 'clobbered') {
    return { text: 'clobbered', kind: 'clobbered', dangling: false };
  }
  return displayValue(rax);
}

const FRAME_HUES = [210, 140, 30, 280, 350, 170, 60, 320];

/**
 * Stable hue per function, assigned from the program's declaration order so
 * a function keeps its color across snapshots of the same execution.
 */
export function frameHues(state: ExecutionState): Map<string, number> {
  const hues = new Map<string, number>();
  let index = 0;
  for (const name of state.context.functions.keys()) {
    hues.set(name, FRAME_HUES[index++ % FRAME_HUES.length]);
  }
  return hues;
}

/**
 * How many activations of the same function sit below this one — recursive
 * frames share their function's hue but shift shade by this ordinal.
 */
export function activationOrdinal(
  frames: readonly StackFrame[],
  index: number,
): number {
  let ordinal = 0;
  for (let i = 0; i < index; i++) {
    if (frames[i].functionName === frames[index].functionName) ordinal++;
  }
  return ordinal;
}
