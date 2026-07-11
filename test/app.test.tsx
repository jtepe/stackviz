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

  it('renders the seed program as real stack frames', () => {
    render(<App />);
    expect(
      screen.getByRole('article', { name: 'main frame' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'helper frame' }),
    ).toBeInTheDocument();
    expect(screen.getByText('0x7fffffffe000')).toBeInTheDocument();
  });
});
