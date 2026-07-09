import { SplitPane } from './SplitPane';
import { EditorPane } from './EditorPane';
import { StackPane } from './StackPane';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">StackViz</h1>
        <span className="app-subtitle">Interactive Call Stack Visualizer</span>
      </header>
      <SplitPane
        left={<EditorPane />}
        right={<StackPane />}
        initialLeftFraction={0.5}
        minFraction={0.2}
      />
    </div>
  );
}
