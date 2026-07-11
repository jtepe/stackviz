import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/ui/App';

describe('App shell', () => {
  it('renders both panels of the split view', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Stack' })).toBeInTheDocument();
  });

  it('renders a draggable divider', () => {
    render(<App />);
    const divider = screen.getByRole('separator');
    expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    expect(divider).toHaveAttribute('tabindex', '0');
  });

  it('starts the seed program ready to step', () => {
    render(<App />);
    expect(screen.getByLabelText('Execution status')).toHaveTextContent(
      'ready',
    );
    expect(screen.getByText('0x7fffffffe000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Step' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('steps into main and updates the status badge', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(
      screen.getByRole('article', { name: 'main frame' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Execution status')).toHaveTextContent(
      'running',
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
  });

  it('reset returns to the ready state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Execution status')).toHaveTextContent(
      'ready',
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
