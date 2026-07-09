import { render, screen } from '@testing-library/react';
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
});
