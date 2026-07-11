// Cross-panel hover model. All hover interactions funnel into one
// HoverState owned by the app; both panes render from it, so the editor
// and the stack panel can never disagree about what the pointer is on.

import type { Program, Span } from '../lang';
import type { StackFrame } from '../engine';

/** A hovered `&i32` value, described by synthetic slot addresses. */
export interface RefHover {
  /** Address of the slot holding the reference. */
  fromAddress: number;
  /** Address of the pointee's slot. */
  toAddress: number;
  dangling: boolean;
}

export interface HoverState {
  /** Frame under the pointer in the stack pane. */
  frameId: number | null;
  /** Call expression under the pointer in the editor. */
  callSpan: Span | null;
  /** Reference value under the pointer, driving the arrow overlay. */
  ref: RefHover | null;
}

export const EMPTY_HOVER: HoverState = {
  frameId: null,
  callSpan: null,
  ref: null,
};

/**
 * Every call expression in the program. The grammar forbids nested calls,
 * so the spans never overlap and containment lookups are unambiguous.
 */
export function collectCallSpans(program: Program): Span[] {
  const spans: Span[] = [];
  for (const fn of program.functions) {
    for (const stmt of fn.body.stmts) {
      if (stmt.kind === 'CallStmt') spans.push(stmt.call.span);
      if (stmt.kind === 'LetStmt' && stmt.init.kind === 'CallExpr') {
        spans.push(stmt.init.span);
      }
    }
    if (fn.body.tail?.kind === 'CallExpr') spans.push(fn.body.tail.span);
  }
  return spans;
}

/** The call span containing `offset`, if any (spans are half-open). */
export function callSpanAt(
  spans: readonly Span[],
  offset: number,
): Span | null {
  return (
    spans.find((s) => offset >= s.start.offset && offset < s.end.offset) ?? null
  );
}

export function sameSpan(a: Span | null, b: Span | null): boolean {
  if (a === null || b === null) return a === b;
  return a.start.offset === b.start.offset && a.end.offset === b.end.offset;
}

/**
 * The live frame a call expression created, or null while none is on the
 * stack. Recursion can put several activations of the same call site on
 * the stack at once; the innermost one is the frame the hover refers to.
 */
export function liveFrameForCallSpan(
  frames: readonly StackFrame[],
  span: Span,
): number | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (sameSpan(frames[i].callSite, span)) return frames[i].id;
  }
  return null;
}

/** Call site of a live frame; null for the entry frame or a popped id. */
export function callSiteOfFrame(
  frames: readonly StackFrame[],
  frameId: number,
): Span | null {
  return frames.find((f) => f.id === frameId)?.callSite ?? null;
}
