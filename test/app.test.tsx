import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/ui/App';
import { SEED_PROGRAM } from '../src/samples';
import { decodeProgramFromHash, encodeProgramToHash } from '../src/ui/share';

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
    expect(screen.getByLabelText(/Execution status/)).toHaveTextContent(
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
    expect(screen.getByLabelText(/Execution status/)).toHaveTextContent(
      'running',
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
  });

  it('reset returns to the ready state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText(/Execution status/)).toHaveTextContent(
      'ready',
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('samples and sharing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  function editorText() {
    return document.querySelector('.cm-content')?.textContent ?? '';
  }

  it('loads a sample from the dropdown', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Load sample program'), {
      target: { value: 'overflow-demo' },
    });
    expect(editorText()).toContain('spiral');
    expect(localStorage.getItem('stackviz:program')).toContain('spiral');
  });

  it('asks before replacing a program that is not persisted', () => {
    window.location.hash = encodeProgramToHash(
      'fn unsaved_work() {}\nfn main() { unsaved_work(); }',
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Load sample program'), {
      target: { value: 'overflow-demo' },
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(editorText()).toContain('unsaved_work');
    confirm.mockRestore();
  });

  it('prefers the URL fragment over localStorage', () => {
    localStorage.setItem(
      'stackviz:program',
      'fn stored_program() {}\nfn main() { stored_program(); }',
    );
    window.location.hash = encodeProgramToHash(
      'fn shared_program() {}\nfn main() { shared_program(); }',
    );
    render(<App />);
    expect(editorText()).toContain('shared_program');
  });

  it('falls back to localStorage on a malformed fragment', () => {
    localStorage.setItem(
      'stackviz:program',
      'fn stored_program() {}\nfn main() { stored_program(); }',
    );
    window.location.hash = '#program=???';
    render(<App />);
    expect(editorText()).toContain('stored_program');
  });

  it('switches keybindings to Helix and back via the dropdown', () => {
    render(<App />);
    const dropdown = screen.getByLabelText('Keybindings');
    expect(dropdown).toHaveValue('default');
    expect(document.querySelector('.cm-hx-status-panel')).toBeNull();

    fireEvent.change(dropdown, { target: { value: 'helix' } });
    expect(dropdown).toHaveValue('helix');
    expect(document.querySelector('.cm-hx-status-panel')).not.toBeNull();

    fireEvent.change(dropdown, { target: { value: 'default' } });
    expect(dropdown).toHaveValue('default');
    expect(document.querySelector('.cm-hx-status-panel')).toBeNull();
  });

  it('share encodes the program into the URL and copies the link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByText('Link copied');
    expect(decodeProgramFromHash(window.location.hash)).toBe(SEED_PROGRAM);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });
});
