// x86-64 System V frame layout, -O0 style: arguments arrive in registers and
// are spilled into the frame in declaration order, followed by locals, each
// slot at its natural alignment. All System V constants live here; nothing
// outside this file may depend on them.

import { CheckedFunction, TypeName } from '../lang';
import { CallingConvention, FrameLayout, FrameSlot } from './frame';

const SLOT_SIZE: Record<TypeName, number> = { i32: 4, '&i32': 8 };
const ARGUMENT_REGISTERS = ['rdi', 'rsi', 'rdx'];
const RETURN_REGISTER = 'rax';
const STACK_ALIGNMENT = 16;
const RED_ZONE = 128;
const POINTER_SIZE = 8;

function layoutFrame(fn: CheckedFunction): FrameLayout {
  const slots: FrameSlot[] = [
    { kind: 'return-address', size: POINTER_SIZE, offset: POINTER_SIZE },
    { kind: 'saved-rbp', size: POINTER_SIZE, offset: 0 },
  ];

  // Allocate downward from RBP. `cursor` tracks the lowest allocated byte;
  // each slot's natural alignment equals its size, and any gap the alignment
  // opens between the new slot and the previous one becomes a padding slot.
  let cursor = 0;
  let argIndex = 0;
  for (const variable of fn.variables) {
    const size = SLOT_SIZE[variable.type];
    const offset = Math.floor((cursor - size) / size) * size;
    const gap = cursor - (offset + size);
    if (gap > 0) {
      slots.push({ kind: 'padding', size: gap, offset: offset + size });
    }
    if (variable.origin === 'param') {
      slots.push({
        kind: 'arg',
        name: variable.name,
        type: variable.type,
        size,
        offset,
        register: ARGUMENT_REGISTERS[argIndex++],
      });
    } else {
      slots.push({
        kind: 'local',
        name: variable.name,
        type: variable.type,
        size,
        offset,
      });
    }
    cursor = offset;
  }

  // Round the reserved area up to the stack alignment so RSP is 16-byte
  // aligned at call sites: `call` pushes 8 bytes, the callee's `push rbp`
  // rebalances, so RBP — and with it RSP after an aligned reservation —
  // stays 16-byte aligned in every frame.
  const used = Math.abs(cursor);
  const reservedSize = Math.ceil(used / STACK_ALIGNMENT) * STACK_ALIGNMENT;
  if (reservedSize > used) {
    slots.push({
      kind: 'padding',
      size: reservedSize - used,
      offset: -reservedSize,
    });
  }

  return {
    functionName: fn.decl.name.name,
    slots,
    frameSize: reservedSize + 2 * POINTER_SIZE,
    reservedSize,
  };
}

export const sysvAmd64: CallingConvention = {
  id: 'sysv-amd64',
  layoutFrame,
  argumentRegisters: ARGUMENT_REGISTERS,
  returnRegister: RETURN_REGISTER,
  stackAlignment: STACK_ALIGNMENT,
  redZone: RED_ZONE,
};
