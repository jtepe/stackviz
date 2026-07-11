import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { SplitPane } from './SplitPane';
import { EditorPane } from './EditorPane';
import { StackPane } from './StackPane';
import { Toolbar } from './Toolbar';
import { StatusBadge } from './StatusBadge';
import {
  appReducer,
  appStatus,
  availableControls,
  initialAppState,
  type Command,
} from './executionStore';
import {
  EMPTY_HOVER,
  callSiteOfFrame,
  callSpanAt,
  collectCallSpans,
  liveFrameForCallSpan,
  sameSpan,
  type HoverState,
  type RefHover,
} from './hover';
import type { Analysis, Span } from '../lang';

const RUN_STEP_MS = 350;
const NOTICE_MS = 2500;

function toRange(span: Span | null) {
  return span ? { from: span.start.offset, to: span.end.offset } : null;
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [hover, setHover] = useState<HoverState>(EMPTY_HOVER);

  const handleAnalysis = useCallback((analysis: Analysis) => {
    dispatch({ type: 'analysis', analysis });
  }, []);
  const handleCommand = useCallback((command: Command) => {
    dispatch({ type: 'command', command });
    setHover(EMPTY_HOVER);
  }, []);

  const callSpans = useMemo(
    () => (state.analysis ? collectCallSpans(state.analysis.program) : []),
    [state.analysis],
  );

  const handleHoverOffset = useCallback(
    (offset: number | null) => {
      const span = offset === null ? null : callSpanAt(callSpans, offset);
      setHover((prev) =>
        sameSpan(prev.callSpan, span) ? prev : { ...prev, callSpan: span },
      );
    },
    [callSpans],
  );

  const handleFrameHover = useCallback((frameId: number | null) => {
    setHover((prev) =>
      prev.frameId === frameId ? prev : { ...prev, frameId },
    );
  }, []);

  const handleRefHover = useCallback((ref: RefHover | null) => {
    setHover((prev) => (prev.ref === ref ? prev : { ...prev, ref }));
  }, []);

  useEffect(() => {
    if (!state.autorun) return;
    const id = window.setInterval(
      () => dispatch({ type: 'run-tick' }),
      RUN_STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [state.autorun]);

  useEffect(() => {
    if (state.resetNotice === 0) return;
    const id = window.setTimeout(
      () => dispatch({ type: 'dismiss-notice' }),
      NOTICE_MS,
    );
    return () => window.clearTimeout(id);
  }, [state.resetNotice]);

  const currentOffset = state.execution?.currentLocation?.start.offset ?? null;
  const frames = state.execution?.frames;

  const highlightRange = useMemo(() => {
    if (frames && hover.frameId !== null) {
      return toRange(callSiteOfFrame(frames, hover.frameId));
    }
    return toRange(hover.callSpan);
  }, [frames, hover.frameId, hover.callSpan]);

  const linkedFrameId = useMemo(
    () =>
      frames && hover.callSpan
        ? liveFrameForCallSpan(frames, hover.callSpan)
        : null,
    [frames, hover.callSpan],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">StackViz</h1>
        <span className="app-subtitle">Interactive Call Stack Visualizer</span>
      </header>
      <SplitPane
        left={
          <EditorPane
            onAnalysis={handleAnalysis}
            currentOffset={currentOffset}
            highlightRange={highlightRange}
            onHoverOffset={handleHoverOffset}
          />
        }
        right={
          <div className="run-pane">
            <div className="run-toolbar">
              <Toolbar
                controls={availableControls(state)}
                onCommand={handleCommand}
              />
              <StatusBadge status={appStatus(state)} />
            </div>
            {state.resetNotice > 0 && (
              <div className="run-notice" role="status">
                Program changed — execution reset.
              </div>
            )}
            <StackPane
              analysis={state.analysis}
              state={state.execution}
              linkedFrameId={linkedFrameId}
              refHover={hover.ref}
              onFrameHover={handleFrameHover}
              onRefHover={handleRefHover}
            />
          </div>
        }
        initialLeftFraction={0.5}
        minFraction={0.2}
      />
    </div>
  );
}
