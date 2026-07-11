import type { Command, ControlSet } from './executionStore';

interface ToolbarProps {
  controls: ControlSet;
  onCommand: (command: Command) => void;
}

const BUTTONS: { command: Command; label: string; key: keyof ControlSet }[] = [
  { command: 'step', label: 'Step', key: 'step' },
  { command: 'step-over', label: 'Step over', key: 'stepOver' },
  { command: 'step-out', label: 'Step out', key: 'stepOut' },
  { command: 'run', label: 'Run', key: 'run' },
  { command: 'reset', label: 'Reset', key: 'reset' },
];

export function Toolbar({ controls, onCommand }: ToolbarProps) {
  return (
    <div
      className="exec-toolbar"
      role="toolbar"
      aria-label="Execution controls"
    >
      {BUTTONS.map(({ command, label, key }) => (
        <button
          key={command}
          type="button"
          disabled={!controls[key]}
          onClick={() => onCommand(command)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
