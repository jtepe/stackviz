// Frame layout model: the shapes a calling convention produces and the
// synthetic address arithmetic the rest of the engine builds on. Nothing in
// here is specific to System V; downstream code (stepper, renderer) consumes
// only these types.

import { CheckedFunction, TypeName } from '../lang';

/** The return address pushed by `call`; the highest slot of every frame. */
export interface ReturnAddressSlot {
  kind: 'return-address';
  size: number;
  /** RBP-relative offset of the slot's lowest byte. */
  offset: number;
}

/** The caller's RBP pushed by the prologue; RBP points at this slot. */
export interface SavedBasePointerSlot {
  kind: 'saved-rbp';
  size: number;
  offset: number;
}

/** An argument spilled from its arrival register into the frame. */
export interface ArgumentSlot {
  kind: 'arg';
  name: string;
  type: TypeName;
  size: number;
  offset: number;
  /** The register the argument arrived in (e.g. `rdi`). */
  register: string;
}

/** A local variable's slot, reserved up front by the prologue. */
export interface LocalSlot {
  kind: 'local';
  name: string;
  type: TypeName;
  size: number;
  offset: number;
}

/** Bytes skipped for alignment, between slots or at the frame's low end. */
export interface PaddingSlot {
  kind: 'padding';
  size: number;
  offset: number;
}

export type FrameSlot =
  | ReturnAddressSlot
  | SavedBasePointerSlot
  | ArgumentSlot
  | LocalSlot
  | PaddingSlot;

export type VariableSlot = ArgumentSlot | LocalSlot;

export interface FrameLayout {
  functionName: string;
  /** All slots, contiguous, ordered from high to low addresses. */
  slots: FrameSlot[];
  /**
   * Total bytes the frame occupies, return address included. Always a
   * multiple of the convention's stack alignment.
   */
  frameSize: number;
  /**
   * Bytes reserved below RBP for arguments, locals, and padding — what the
   * prologue subtracts from RSP.
   */
  reservedSize: number;
}

/**
 * A calling convention turns a checked function into a byte-accurate frame
 * layout. System V AMD64 is the only implementation for now; others plug in
 * behind this interface.
 */
export interface CallingConvention {
  id: string;
  layoutFrame(fn: CheckedFunction): FrameLayout;
  argumentRegisters: string[];
  returnRegister: string;
  stackAlignment: number;
  redZone?: number;
}

/** Synthetic address the stack grows downward from. */
export const STACK_BASE = 0x7fffffffe000;

/**
 * RBP value of the entry frame: the stack base minus the entry frame's
 * return-address and saved-RBP slots.
 */
export const ENTRY_FRAME_BASE = STACK_BASE - 16;

/**
 * What the entry frame's return-address slot displays — `main` returns into
 * a synthetic runtime, not another frame.
 */
export const RUNTIME_BOUNDARY = '<runtime>';

/**
 * Absolute synthetic address of a slot's lowest byte, given the frame's base
 * address (its RBP value).
 */
export function slotAddress(frameBase: number, slot: FrameSlot): number {
  return frameBase + slot.offset;
}

/**
 * Base address (RBP value) of the frame a function at `frameBase` would push
 * with a call: the caller's frame ends, the callee's begins right below.
 */
export function calleeFrameBase(
  frameBase: number,
  layout: FrameLayout,
): number {
  return frameBase - layout.frameSize;
}
