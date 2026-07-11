import type { Analysis } from '../lang';

interface StackPaneProps {
  analysis: Analysis | null;
}

export function StackPane({ analysis }: StackPaneProps) {
  const errorCount = analysis?.diagnostics.length ?? 0;
  const status =
    analysis === null
      ? 'Waiting for a program…'
      : errorCount === 0
        ? 'Program is valid. Call stack visualization goes here.'
        : `${errorCount} problem${errorCount === 1 ? '' : 's'} to fix before running.`;

  return (
    <section className="pane stack-pane" aria-label="Stack">
      <div className="pane-header">stack</div>
      <div className="pane-body pane-placeholder">{status}</div>
    </section>
  );
}
