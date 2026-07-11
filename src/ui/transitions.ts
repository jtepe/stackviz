// Pop choreography: when a snapshot transition removes the top frame, the
// stack panel briefly keeps rendering it as an exiting ghost with the
// returned value riding out in a rax chip. The engine's snapshots stay
// pure — this module only compares consecutive snapshots on the UI side.

import { useEffect, useState } from 'react';
import type { ExecutionState, RaxValue, StackFrame } from '../engine';
import { PUSH_POP_MS, usePrefersReducedMotion } from './motion';
import { activationOrdinal, frameHues } from './stackView';

export interface PopTransition {
  frame: StackFrame;
  caller: StackFrame | null;
  hue: number;
  ordinal: number;
  /** The value riding out of the dying frame; clobbered for unit returns. */
  rax: RaxValue;
}

/** The pop that turned `prev` into `next`, if that is what happened. */
export function popTransition(
  prev: ExecutionState | null,
  next: ExecutionState | null,
): PopTransition | null {
  if (!prev || !next) return null;
  if (next.lastStep?.kind !== 'pop') return null;
  if (prev.frames.length !== next.frames.length + 1) return null;
  const index = prev.frames.length - 1;
  const frame = prev.frames[index];
  if (frame.functionName !== next.lastStep.functionName) return null;
  return {
    frame,
    caller: index > 0 ? prev.frames[index - 1] : null,
    hue: frameHues(prev).get(frame.functionName) ?? 0,
    ordinal: activationOrdinal(prev.frames, index),
    rax: next.rax,
  };
}

/**
 * The ghost of a just-popped frame, shown for PUSH_POP_MS after the
 * snapshot changes. Under reduced motion pops are instant: never a ghost.
 */
export function usePopGhost(
  state: ExecutionState | null,
): PopTransition | null {
  const reduced = usePrefersReducedMotion();
  const [prev, setPrev] = useState(state);
  const [ghost, setGhost] = useState<PopTransition | null>(null);

  if (state !== prev) {
    setPrev(state);
    setGhost(popTransition(prev, state));
  }

  useEffect(() => {
    if (!ghost) return;
    const id = window.setTimeout(() => setGhost(null), PUSH_POP_MS);
    return () => window.clearTimeout(id);
  }, [ghost]);

  return reduced ? null : ghost;
}
