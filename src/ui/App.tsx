import { useMemo, useState } from 'react';
import { SplitPane } from './SplitPane';
import { EditorPane } from './EditorPane';
import { StackPane } from './StackPane';
import { previewSnapshot } from './stackView';
import { initExecution, sysvAmd64 } from '../engine';
import type { Analysis } from '../lang';

export function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const execution = useMemo(() => {
    if (
      analysis === null ||
      analysis.diagnostics.length > 0 ||
      !analysis.checked.main
    ) {
      return null;
    }
    return previewSnapshot(initExecution(analysis.checked, sysvAmd64));
  }, [analysis]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">StackViz</h1>
        <span className="app-subtitle">Interactive Call Stack Visualizer</span>
      </header>
      <SplitPane
        left={<EditorPane onAnalysis={setAnalysis} />}
        right={<StackPane analysis={analysis} state={execution} />}
        initialLeftFraction={0.5}
        minFraction={0.2}
      />
    </div>
  );
}
