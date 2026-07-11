import { fireEvent, render, screen, within } from '@testing-library/react';
import { StackPane } from '../../src/ui/StackPane';
import { previewSnapshot } from '../../src/ui/stackView';
import { analyze, type Analysis } from '../../src/lang';
import {
  initExecution,
  slotAddress,
  step,
  sysvAmd64,
  ENTRY_FRAME_BASE,
  type ExecutionState,
} from '../../src/engine';

const PROGRAM = `fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;
    let px: &i32 = &x;
    let r = helper(x, px);
    helper(n, px);
}

fn main() {
    outer(7);
}
`;

const DANGLE_PROGRAM = `fn dangle() -> &i32 {
    let x = 99;
    return &x;
}

fn main() {
    let p = dangle();
    let q = p;
}
`;

function analyzed(source: string): Analysis {
  const analysis = analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  return analysis;
}

function preview(source: string): [Analysis, ExecutionState] {
  const analysis = analyzed(source);
  return [
    analysis,
    previewSnapshot(initExecution(analysis.checked, sysvAmd64)),
  ];
}

function renderPane(analysis: Analysis, state: ExecutionState) {
  return render(<StackPane analysis={analysis} state={state} />);
}

describe('StackPane byte-accurate mode', () => {
  it('shows the stack base label and downward-growth cue', () => {
    renderPane(...preview(PROGRAM));
    expect(screen.getByText('0x7fffffffe000')).toBeInTheDocument();
    expect(screen.getByText('↓ stack grows downward')).toBeInTheDocument();
  });

  it('renders frames in memory order with depth badges and call sites', () => {
    renderPane(...preview(PROGRAM));
    const frames = screen.getAllByRole('article');
    expect(frames.map((f) => f.getAttribute('aria-label'))).toEqual([
      'main frame',
      'outer frame',
      'helper frame',
    ]);
    expect(within(frames[0]).getByText('#1')).toBeInTheDocument();
    expect(within(frames[0]).getByText('program entry')).toBeInTheDocument();
    expect(within(frames[2]).getByText('#3')).toBeInTheDocument();
    expect(within(frames[2]).getByText('from line 9')).toBeInTheDocument();
  });

  it('emphasizes only the innermost frame as active', () => {
    renderPane(...preview(PROGRAM));
    const helper = screen.getByRole('article', { name: 'helper frame' });
    expect(helper).toHaveAttribute('aria-current');
    expect(within(helper).getByText('active')).toBeInTheDocument();
    const main = screen.getByRole('article', { name: 'main frame' });
    expect(main).not.toHaveAttribute('aria-current');
  });

  it("renders main's boundary slots as <runtime>", () => {
    renderPane(...preview(PROGRAM));
    const main = screen.getByRole('article', { name: 'main frame' });
    expect(within(main).getAllByText('<runtime>')).toHaveLength(2);
  });

  it('links a callee frame back to its caller', () => {
    const [, state] = preview(PROGRAM);
    renderPane(analyzed(PROGRAM), state);
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('→ main')).toBeInTheDocument();
    expect(
      within(outer).getByText(`0x${ENTRY_FRAME_BASE.toString(16)}`),
    ).toBeInTheDocument();
  });

  it('shows addresses, offsets, sizes, and register badges for slots', () => {
    const [analysis, state] = preview(PROGRAM);
    renderPane(analysis, state);
    const helperFrame = state.frames[2];
    const aSlot = helperFrame.layout.slots.find(
      (s) => s.kind === 'arg' && s.name === 'a',
    )!;
    const helper = screen.getByRole('article', { name: 'helper frame' });
    const address = `0x${slotAddress(helperFrame.base, aSlot).toString(16)}`;
    expect(within(helper).getByText(address)).toBeInTheDocument();
    expect(within(helper).getByText('-0x4')).toBeInTheDocument();
    expect(within(helper).getByText('rdi')).toBeInTheDocument();
    expect(within(helper).getByText('rsi')).toBeInTheDocument();
    expect(within(helper).getByText('a: i32')).toBeInTheDocument();
  });

  it('renders alignment padding as distinct hatched rows', () => {
    const { container } = renderPane(...preview(PROGRAM));
    const paddingRows = container.querySelectorAll('.slot-padding');
    expect(paddingRows.length).toBeGreaterThan(0);
    expect(paddingRows[0].textContent).toContain('padding');
  });

  it('formats i32 values as signed decimal and refs with annotations', () => {
    const [analysis, state] = preview(PROGRAM);
    renderPane(analysis, state);
    const outerFrame = state.frames[1];
    const xSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'x',
    )!;
    const xAddress = slotAddress(outerFrame.base, xSlot);
    const refText = `0x${xAddress.toString(16)} → outer::x`;
    expect(screen.getAllByText(refText).length).toBeGreaterThan(0);
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('42')).toBeInTheDocument();
  });

  it('renders uninitialized locals as ??', () => {
    renderPane(...preview(PROGRAM));
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('??')).toBeInTheDocument();
  });

  it('flags dangling references', () => {
    const analysis = analyzed(DANGLE_PROGRAM);
    let state = initExecution(analysis.checked, sysvAmd64);
    while (state.lastStep?.kind !== 'write-rax') {
      state = step(state);
    }
    renderPane(analysis, state);
    const main = screen.getByRole('article', { name: 'main frame' });
    expect(within(main).getByText('dangling')).toBeInTheDocument();
  });
});

describe('StackPane rax chip', () => {
  it('shows rax as clobbered between calls', () => {
    renderPane(...preview(PROGRAM));
    const chip = screen.getByLabelText('rax register');
    expect(chip).toHaveTextContent('clobbered');
  });

  it('shows the returned value in rax right after a pop', () => {
    const analysis = analyzed(PROGRAM);
    let state = initExecution(analysis.checked, sysvAmd64);
    while (state.lastStep?.kind !== 'pop') {
      state = step(state);
    }
    renderPane(analysis, state);
    const chip = screen.getByLabelText('rax register');
    expect(chip).toHaveTextContent('42');
  });
});

describe('StackPane detail toggle', () => {
  it('collapses frames to name = value chips in logical mode', () => {
    renderPane(...preview(PROGRAM));
    fireEvent.click(screen.getByRole('button', { name: 'logical' }));
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('x = 42')).toBeInTheDocument();
    expect(within(outer).getByText('r = ??')).toBeInTheDocument();
    expect(within(outer).queryByText('-0x4')).not.toBeInTheDocument();
    expect(within(outer).queryByText('saved rbp')).not.toBeInTheDocument();
  });

  it('returns to byte-accurate rows when toggled back', () => {
    renderPane(...preview(PROGRAM));
    fireEvent.click(screen.getByRole('button', { name: 'logical' }));
    fireEvent.click(screen.getByRole('button', { name: 'bytes' }));
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('saved rbp')).toBeInTheDocument();
  });
});

describe('StackPane placeholders', () => {
  it('keeps the waiting message before any analysis arrives', () => {
    render(<StackPane analysis={null} state={null} />);
    expect(screen.getByText('Waiting for a program…')).toBeInTheDocument();
  });

  it('reports the problem count for invalid programs', () => {
    const analysis = analyze('fn main() { let x = y; }');
    render(<StackPane analysis={analysis} state={null} />);
    expect(screen.getByText(/problem/)).toBeInTheDocument();
  });
});
