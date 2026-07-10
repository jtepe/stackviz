// Golden tests for the System V AMD64 frame layout: exact slot offsets,
// padding, and frame sizes, plus the 16-byte alignment invariant and the
// synthetic address arithmetic.

import { describe, expect, it } from 'vitest';
import { check, parse } from '../../src/lang';
import {
  ENTRY_FRAME_BASE,
  FrameLayout,
  RUNTIME_BOUNDARY,
  STACK_BASE,
  calleeFrameBase,
  slotAddress,
  sysvAmd64,
} from '../../src/engine';

function layoutOf(source: string, name: string): FrameLayout {
  const parsed = parse(source);
  expect(parsed.diagnostics).toEqual([]);
  const result = check(parsed.program);
  expect(result.diagnostics).toEqual([]);
  const fn = result.checked.functions.get(name);
  expect(fn).toBeDefined();
  return sysvAmd64.layoutFrame(fn!);
}

/**
 * Every layout must be internally consistent: the fixed slots on top, all
 * slots contiguous from the return address down to the low end of the
 * reserved area, and a total size that keeps RSP 16-byte aligned at call
 * sites.
 */
function assertInvariants(layout: FrameLayout): void {
  expect(layout.slots[0]).toEqual({
    kind: 'return-address',
    size: 8,
    offset: 8,
  });
  expect(layout.slots[1]).toEqual({ kind: 'saved-rbp', size: 8, offset: 0 });
  expect(layout.frameSize % sysvAmd64.stackAlignment).toBe(0);
  expect(layout.frameSize).toBe(layout.reservedSize + 16);

  let low = 16;
  for (const slot of layout.slots) {
    expect(slot.offset + slot.size).toBe(low);
    low = slot.offset;
  }
  expect(low + layout.reservedSize).toBe(0);
}

const EXAMPLE = `
fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;
    let px: &i32 = &x;
    let r = helper(x, px);
    helper(n, px);
}

fn main() {
    outer(7);
}
`;

describe('sysv-amd64 convention constants', () => {
  it('exposes the System V register and alignment facts', () => {
    expect(sysvAmd64.id).toBe('sysv-amd64');
    expect(sysvAmd64.argumentRegisters).toEqual(['rdi', 'rsi', 'rdx']);
    expect(sysvAmd64.returnRegister).toBe('rax');
    expect(sysvAmd64.stackAlignment).toBe(16);
    expect(sysvAmd64.redZone).toBe(128);
  });
});

describe('layoutFrame golden values', () => {
  it('lays out a function with no args and no locals as the bare 16 bytes', () => {
    const layout = layoutOf('fn empty() {}\nfn main() { empty(); }', 'empty');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'empty',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
      ],
      frameSize: 16,
      reservedSize: 0,
    });
  });

  it('lays out helper from the design example with interior and trailing padding', () => {
    const layout = layoutOf(EXAMPLE, 'helper');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'helper',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
        {
          kind: 'arg',
          name: 'a',
          type: 'i32',
          size: 4,
          offset: -4,
          register: 'rdi',
        },
        { kind: 'padding', size: 4, offset: -8 },
        {
          kind: 'arg',
          name: 'p',
          type: '&i32',
          size: 8,
          offset: -16,
          register: 'rsi',
        },
        { kind: 'local', name: 'local', type: 'i32', size: 4, offset: -20 },
        { kind: 'padding', size: 12, offset: -32 },
      ],
      frameSize: 48,
      reservedSize: 32,
    });
  });

  it('lays out outer from the design example with locals in declaration order', () => {
    const layout = layoutOf(EXAMPLE, 'outer');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'outer',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
        {
          kind: 'arg',
          name: 'n',
          type: 'i32',
          size: 4,
          offset: -4,
          register: 'rdi',
        },
        { kind: 'local', name: 'x', type: 'i32', size: 4, offset: -8 },
        { kind: 'local', name: 'px', type: '&i32', size: 8, offset: -16 },
        { kind: 'local', name: 'r', type: 'i32', size: 4, offset: -20 },
        { kind: 'padding', size: 12, offset: -32 },
      ],
      frameSize: 48,
      reservedSize: 32,
    });
  });

  it('lays out main from the design example as an empty 16-byte frame', () => {
    const layout = layoutOf(EXAMPLE, 'main');
    assertInvariants(layout);
    expect(layout.frameSize).toBe(16);
    expect(layout.reservedSize).toBe(0);
  });

  it('pads only at the low end when a reference precedes an i32', () => {
    const source = `
      fn f(p: &i32, a: i32) {}
      fn main() { let x = 1; f(&x, x); }
    `;
    const layout = layoutOf(source, 'f');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'f',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
        {
          kind: 'arg',
          name: 'p',
          type: '&i32',
          size: 8,
          offset: -8,
          register: 'rdi',
        },
        {
          kind: 'arg',
          name: 'a',
          type: 'i32',
          size: 4,
          offset: -12,
          register: 'rsi',
        },
        { kind: 'padding', size: 4, offset: -16 },
      ],
      frameSize: 32,
      reservedSize: 16,
    });
  });

  it('assigns rdi, rsi, rdx across the maximum of three arguments', () => {
    const source = `
      fn g(a: i32, b: &i32, c: i32) {}
      fn main() { let x = 1; g(x, &x, 2); }
    `;
    const layout = layoutOf(source, 'g');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'g',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
        {
          kind: 'arg',
          name: 'a',
          type: 'i32',
          size: 4,
          offset: -4,
          register: 'rdi',
        },
        { kind: 'padding', size: 4, offset: -8 },
        {
          kind: 'arg',
          name: 'b',
          type: '&i32',
          size: 8,
          offset: -16,
          register: 'rsi',
        },
        {
          kind: 'arg',
          name: 'c',
          type: 'i32',
          size: 4,
          offset: -20,
          register: 'rdx',
        },
        { kind: 'padding', size: 12, offset: -32 },
      ],
      frameSize: 48,
      reservedSize: 32,
    });
  });

  it('needs no padding when slots already fill the alignment exactly', () => {
    const source = `
      fn h(a: i32, b: i32) { let p = &a; }
      fn main() { h(1, 2); }
    `;
    const layout = layoutOf(source, 'h');
    assertInvariants(layout);
    expect(layout).toEqual({
      functionName: 'h',
      slots: [
        { kind: 'return-address', size: 8, offset: 8 },
        { kind: 'saved-rbp', size: 8, offset: 0 },
        {
          kind: 'arg',
          name: 'a',
          type: 'i32',
          size: 4,
          offset: -4,
          register: 'rdi',
        },
        {
          kind: 'arg',
          name: 'b',
          type: 'i32',
          size: 4,
          offset: -8,
          register: 'rsi',
        },
        { kind: 'local', name: 'p', type: '&i32', size: 8, offset: -16 },
      ],
      frameSize: 32,
      reservedSize: 16,
    });
  });
});

describe('synthetic addresses', () => {
  it('anchors the entry frame just below the stack base', () => {
    expect(STACK_BASE).toBe(0x7fffffffe000);
    expect(ENTRY_FRAME_BASE).toBe(0x7fffffffdff0);
    expect(RUNTIME_BOUNDARY).toBe('<runtime>');
  });

  it('computes absolute slot addresses from a frame base', () => {
    const main = layoutOf(EXAMPLE, 'main');
    const [returnAddress, savedRbp] = main.slots;
    expect(slotAddress(ENTRY_FRAME_BASE, returnAddress)).toBe(0x7fffffffdff8);
    expect(
      slotAddress(ENTRY_FRAME_BASE, returnAddress) + returnAddress.size,
    ).toBe(STACK_BASE);
    expect(slotAddress(ENTRY_FRAME_BASE, savedRbp)).toBe(ENTRY_FRAME_BASE);
  });

  it('stacks callee frames contiguously below their callers', () => {
    const main = layoutOf(EXAMPLE, 'main');
    const outer = layoutOf(EXAMPLE, 'outer');
    const helper = layoutOf(EXAMPLE, 'helper');

    const outerBase = calleeFrameBase(ENTRY_FRAME_BASE, main);
    expect(outerBase).toBe(0x7fffffffdfe0);
    expect(outerBase % 16).toBe(0);

    const helperBase = calleeFrameBase(outerBase, outer);
    expect(helperBase).toBe(0x7fffffffdfb0);
    expect(helperBase % 16).toBe(0);

    const n = outer.slots.find((s) => s.kind === 'arg' && s.name === 'n')!;
    expect(slotAddress(outerBase, n)).toBe(0x7fffffffdfdc);

    const helperReturnAddress = helper.slots[0];
    expect(
      slotAddress(helperBase, helperReturnAddress) + helperReturnAddress.size,
    ).toBe(outerBase - outer.reservedSize);
  });
});
