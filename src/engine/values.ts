// Runtime values that live in stack slots and in rax.

export interface I32Value {
  kind: 'i32';
  value: number;
}

/** The address-of a variable, with enough symbolic context to annotate it. */
export interface RefValue {
  kind: 'ref';
  /** Synthetic absolute address of the pointee's slot. */
  address: number;
  /** Human-readable pointee, e.g. `outer::x`. */
  target: string;
  /** Id of the frame the pointee lives in; used to detect danglings. */
  targetFrameId: number;
  /** True once the pointee's frame has popped. */
  dangling: boolean;
}

export type Value = I32Value | RefValue;

/**
 * The rax register: it carries a return value out of a pop and is
 * clobbered/undefined between calls — never a stale value.
 */
export type RaxValue = Value | 'clobbered';
