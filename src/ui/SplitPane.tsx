import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** Fraction of the width given to the left panel initially (0–1). */
  initialLeftFraction?: number;
  /** Minimum fraction either panel may shrink to (0–0.5). */
  minFraction?: number;
}

/**
 * Compiler-Explorer-style split view: two side-by-side panels separated by a
 * draggable divider. See DESIGN.md §6.1.
 */
export function SplitPane({
  left,
  right,
  initialLeftFraction = 0.5,
  minFraction = 0.15,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(initialLeftFraction);
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback(
    (fraction: number) =>
      Math.min(1 - minFraction, Math.max(minFraction, fraction)),
    [minFraction],
  );

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0) return;
      setLeftFraction(clamp((clientX - rect.left) / rect.width));
    },
    [clamp],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: MouseEvent) => {
      event.preventDefault();
      updateFromClientX(event.clientX);
    };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, updateFromClientX]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const stepPct = 0.02;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setLeftFraction((f) => clamp(f - stepPct));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setLeftFraction((f) => clamp(f + stepPct));
    }
  };

  const leftPercent = `${leftFraction * 100}%`;

  return (
    <div ref={containerRef} className="split-pane">
      <div className="split-panel" style={{ width: leftPercent }}>
        {left}
      </div>
      <div
        className={`split-divider${dragging ? ' is-dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(leftFraction * 100)}
        aria-valuemin={Math.round(minFraction * 100)}
        aria-valuemax={Math.round((1 - minFraction) * 100)}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="split-divider-handle" aria-hidden="true" />
      </div>
      <div
        className="split-panel"
        style={{ width: `calc(100% - ${leftPercent})` }}
      >
        {right}
      </div>
    </div>
  );
}
