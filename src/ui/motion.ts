// Motion preferences: one shared subscription to `prefers-reduced-motion`
// so components can swap animations for an instant, static presentation.

import { useSyncExternalStore } from 'react';

/** Duration of the push/pop frame transitions. */
export const PUSH_POP_MS = 150;

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;
}

export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

function subscribe(onChange: () => void): () => void {
  const query = mediaQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion);
}
