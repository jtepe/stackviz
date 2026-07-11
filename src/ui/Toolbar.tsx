import { useRef, useState, type KeyboardEvent } from 'react';
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
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  const moveFocus = (from: number, delta: number) => {
    const count = BUTTONS.length;
    for (let step = 1; step <= count; step++) {
      const next = (from + delta * step + count * step) % count;
      if (controls[BUTTONS[next].key]) {
        setFocusIndex(next);
        buttonRefs.current[next]?.focus();
        return;
      }
    }
  };

  const firstEnabled = BUTTONS.findIndex(({ key }) => controls[key]);
  const activeIndex = controls[BUTTONS[focusIndex]?.key]
    ? focusIndex
    : firstEnabled;

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveFocus(-1, 1);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveFocus(0, -1);
    }
  };

  return (
    <div
      className="exec-toolbar"
      role="toolbar"
      aria-label="Execution controls"
    >
      {BUTTONS.map(({ command, label, key }, index) => {
        const enabled = controls[key];
        return (
          <button
            key={command}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            disabled={!enabled}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => onCommand(command)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
