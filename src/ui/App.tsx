import { useState } from 'react';
import { SplitPane } from './SplitPane';
import { EditorPane } from './EditorPane';
import { StackPane } from './StackPane';
import type { Analysis } from '../lang';

export function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">StackViz</h1>
        <span className="app-subtitle">Interactive Call Stack Visualizer</span>
      </header>
      <SplitPane
        left={<EditorPane onAnalysis={setAnalysis} />}
        right={<StackPane analysis={analysis} />}
        initialLeftFraction={0.5}
        minFraction={0.2}
      />
    </div>
  );
}
