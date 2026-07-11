import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StackPane } from '../../src/ui/StackPane';
import { formatHex32 } from '../../src/ui/stackView';
import type { RefHover } from '../../src/ui/hover';
import { previewSnapshot, stubMatchMedia } from './helpers';
import { analyze, type Analysis } from '../../src/lang';
import {
  initExecution,
  runToEnd,
  slotAddress,
  step,
  sysvAmd64,
  ENTRY_FRAME_BASE,
  MAX_FRAMES,
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

describe('StackPane hover linking', () => {
  it('reports frame hovers with the frame id', () => {
    const [analysis, state] = preview(PROGRAM);
    const hovered: (number | null)[] = [];
    render(
      <StackPane
        analysis={analysis}
        state={state}
        onFrameHover={(id) => hovered.push(id)}
      />,
    );
    const helper = screen.getByRole('article', { name: 'helper frame' });
    fireEvent.mouseEnter(helper);
    fireEvent.mouseLeave(helper);
    expect(hovered).toEqual([state.frames[2].id, null]);
  });

  it('marks the frame linked to the hovered call site', () => {
    const [analysis, state] = preview(PROGRAM);
    render(
      <StackPane
        analysis={analysis}
        state={state}
        linkedFrameId={state.frames[1].id}
      />,
    );
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(outer.className).toContain('frame-linked');
    const main = screen.getByRole('article', { name: 'main frame' });
    expect(main.className).not.toContain('frame-linked');
  });

  it('reports ref hovers with source and pointee addresses', () => {
    const [analysis, state] = preview(PROGRAM);
    const hovered: (RefHover | null)[] = [];
    render(
      <StackPane
        analysis={analysis}
        state={state}
        onRefHover={(ref) => hovered.push(ref)}
      />,
    );
    const outerFrame = state.frames[1];
    const pxSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'px',
    )!;
    const xSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'x',
    )!;
    const outer = screen.getByRole('article', { name: 'outer frame' });
    const refText = `0x${slotAddress(outerFrame.base, xSlot).toString(16)} → outer::x`;
    const refValue = within(outer).getAllByText(refText)[0];
    fireEvent.mouseEnter(refValue);
    fireEvent.mouseLeave(refValue);
    expect(hovered).toEqual([
      {
        fromAddress: slotAddress(outerFrame.base, pxSlot),
        toAddress: slotAddress(outerFrame.base, xSlot),
        dangling: false,
      },
      null,
    ]);
  });

  it('tags variable rows with their address for the arrow overlay', () => {
    const [analysis, state] = preview(PROGRAM);
    const { container } = renderPane(analysis, state);
    const outerFrame = state.frames[1];
    const xSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'x',
    )!;
    const address = slotAddress(outerFrame.base, xSlot);
    expect(
      container.querySelector(`[data-slot-addr="${address}"]`),
    ).not.toBeNull();
  });

  it('draws the arrow overlay while a live ref is hovered', () => {
    const [analysis, state] = preview(PROGRAM);
    const outerFrame = state.frames[1];
    const pxSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'px',
    )!;
    const xSlot = outerFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'x',
    )!;
    render(
      <StackPane
        analysis={analysis}
        state={state}
        refHover={{
          fromAddress: slotAddress(outerFrame.base, pxSlot),
          toAddress: slotAddress(outerFrame.base, xSlot),
          dangling: false,
        }}
      />,
    );
    expect(screen.getByTestId('ref-arrow')).toBeInTheDocument();
    expect(screen.queryByText(/popped frame/)).not.toBeInTheDocument();
  });

  it('renders a ghost target for a hovered dangling ref', () => {
    const analysis = analyzed(DANGLE_PROGRAM);
    let state = initExecution(analysis.checked, sysvAmd64);
    while (state.lastStep?.kind !== 'write-rax') {
      state = step(state);
    }
    const mainFrame = state.frames[0];
    const pSlot = mainFrame.layout.slots.find(
      (s) => s.kind === 'local' && s.name === 'p',
    )!;
    const p = mainFrame.values['p'];
    expect(p.kind).toBe('ref');
    render(
      <StackPane
        analysis={analysis}
        state={state}
        refHover={{
          fromAddress: slotAddress(mainFrame.base, pSlot),
          toAddress: p.kind === 'ref' ? p.address : 0,
          dangling: true,
        }}
      />,
    );
    const ghost = screen.getByText(/popped frame/);
    expect(ghost).toHaveAttribute('data-ghost-target');
    expect(screen.getByTestId('ref-arrow')).toBeInTheDocument();
  });
});

describe('StackPane hex on hover', () => {
  it('annotates i32 values with their hex form', () => {
    const [analysis, state] = preview(PROGRAM);
    renderPane(analysis, state);
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('42')).toHaveAttribute(
      'data-hex',
      '0x0000002a',
    );
  });

  it("annotates logical-mode chips and negative values in two's complement", () => {
    expect(formatHex32(-1)).toBe('0xffffffff');
    const [analysis, state] = preview(PROGRAM);
    const { container } = renderPane(analysis, state);
    fireEvent.click(screen.getByRole('button', { name: 'logical' }));
    const chip = container.querySelector('.chip[data-hex="0x0000002a"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('x = 42');
  });

  it('leaves refs and uninitialized values without hex annotations', () => {
    const [analysis, state] = preview(PROGRAM);
    renderPane(analysis, state);
    const outer = screen.getByRole('article', { name: 'outer frame' });
    expect(within(outer).getByText('??')).not.toHaveAttribute('data-hex');
  });
});

const OVERFLOW_PROGRAM = `fn rec(n: i32) {
    rec(n);
}

fn main() {
    rec(1);
}
`;

function steppedTo(
  source: string,
  kind: string,
): [Analysis, ExecutionState, ExecutionState] {
  const analysis = analyzed(source);
  let prev = initExecution(analysis.checked, sysvAmd64);
  let next = step(prev);
  while (next.lastStep?.kind !== kind) {
    prev = next;
    next = step(prev);
  }
  return [analysis, prev, next];
}

describe('StackPane pop choreography', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps a ghost of the popped frame with the value riding out in rax', () => {
    vi.useFakeTimers();
    const [analysis, prev, next] = steppedTo(PROGRAM, 'pop');
    const { rerender } = renderPane(analysis, prev);
    rerender(<StackPane analysis={analysis} state={next} />);
    const ghost = screen.getByTestId('pop-ghost');
    expect(
      within(ghost).getByRole('article', {
        name: 'helper frame',
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(within(ghost).getByText('rax = 42')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('pop-ghost')).not.toBeInTheDocument();
  });

  it('skips the ghost entirely under reduced motion', () => {
    stubMatchMedia(true);
    vi.useFakeTimers();
    const [analysis, prev, next] = steppedTo(PROGRAM, 'pop');
    const { rerender } = renderPane(analysis, prev);
    rerender(<StackPane analysis={analysis} state={next} />);
    expect(screen.queryByTestId('pop-ghost')).not.toBeInTheDocument();
  });

  it('flashes the slot that just received rax after a let-call', () => {
    const [analysis, , next] = steppedTo(PROGRAM, 'write-rax');
    const { container } = renderPane(analysis, next);
    const landed = container.querySelector('.slot-landed');
    expect(landed).not.toBeNull();
    expect(landed!.textContent).toContain('r: i32');
    fireEvent.click(screen.getByRole('button', { name: 'logical' }));
    const chip = container.querySelector('.chip-landed');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('r = 42');
  });
});

describe('StackPane stack overflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function overflowed(): [Analysis, ExecutionState] {
    const analysis = analyzed(OVERFLOW_PROGRAM);
    const state = runToEnd(initExecution(analysis.checked, sysvAmd64));
    expect(state.status).toBe('overflow');
    return [analysis, state];
  }

  it('keeps the live frames rendered with a marker where the next would go', () => {
    const [analysis, state] = overflowed();
    renderPane(analysis, state);
    expect(screen.getAllByRole('article')).toHaveLength(MAX_FRAMES);
    const marker = screen.getByRole('alert');
    expect(marker).toHaveTextContent('☠ stack overflow');
    const body = marker.parentElement!;
    const frames = body.querySelectorAll('article.frame');
    expect(
      frames[frames.length - 1].compareDocumentPosition(marker) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(marker.className).not.toContain('overflow-marker-static');
  });

  it('renders a static high-contrast marker under reduced motion', () => {
    stubMatchMedia(true);
    const [analysis, state] = overflowed();
    renderPane(analysis, state);
    expect(screen.getByRole('alert').className).toContain(
      'overflow-marker-static',
    );
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
