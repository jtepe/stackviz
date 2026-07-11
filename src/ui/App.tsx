import { useCallback, useEffect, useReducer } from 'react';
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
import type { Analysis } from '../lang';

const RUN_STEP_MS = 350;
const NOTICE_MS = 2500;

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  const handleAnalysis = useCallback(
    (analysis: Analysis) => dispatch({ type: 'analysis', analysis }),
    [],
  );
  const handleCommand = useCallback(
    (command: Command) => dispatch({ type: 'command', command }),
    [],
  );

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
            <StackPane analysis={state.analysis} state={state.execution} />
          </div>
        }
        initialLeftFraction={0.5}
        minFraction={0.2}
      />
    </div>
  );
}
