import { act, fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from '../../src/ui/Toolbar';
import type { ControlSet } from '../../src/ui/executionStore';

const ALL_ENABLED: ControlSet = {
  step: true,
  stepOver: true,
  stepOut: true,
  run: true,
  reset: true,
};

describe('Toolbar keyboard navigation', () => {
  it('exposes a single tab stop and moves focus with arrow keys', () => {
    render(<Toolbar controls={ALL_ENABLED} onCommand={() => {}} />);
    const step = screen.getByRole('button', { name: 'Step' });
    const stepOver = screen.getByRole('button', { name: 'Step over' });

    expect(step).toHaveAttribute('tabindex', '0');
    expect(stepOver).toHaveAttribute('tabindex', '-1');

    act(() => step.focus());
    fireEvent.keyDown(step, { key: 'ArrowRight' });
    expect(stepOver).toHaveFocus();
    expect(stepOver).toHaveAttribute('tabindex', '0');
  });

  it('wraps around and skips disabled buttons', () => {
    const controls: ControlSet = { ...ALL_ENABLED, run: false };
    render(<Toolbar controls={controls} onCommand={() => {}} />);
    const stepOut = screen.getByRole('button', { name: 'Step out' });
    const reset = screen.getByRole('button', { name: 'Reset' });

    act(() => stepOut.focus());
    fireEvent.keyDown(stepOut, { key: 'ArrowRight' });
    expect(reset).toHaveFocus();
  });

  it('keeps a reachable tab stop when the focused button becomes disabled', () => {
    const { rerender } = render(
      <Toolbar controls={ALL_ENABLED} onCommand={() => {}} />,
    );
    act(() => screen.getByRole('button', { name: 'Reset' }).focus());

    rerender(
      <Toolbar
        controls={{ ...ALL_ENABLED, reset: false }}
        onCommand={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Step' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
});
