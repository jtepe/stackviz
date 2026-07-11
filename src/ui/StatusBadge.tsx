import type { AppStatus } from './executionStore';

const LABELS: Record<AppStatus, string> = {
  editing: 'editing / invalid',
  ready: 'ready',
  running: 'running',
  finished: 'finished',
  overflow: 'overflow',
};

export function StatusBadge({ status }: { status: AppStatus }) {
  return (
    <span
      className={`status-badge status-badge-${status}`}
      aria-label="Execution status"
    >
      {LABELS[status]}
    </span>
  );
}
