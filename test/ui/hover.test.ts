import { analyze } from '../../src/lang';
import { initExecution, step, sysvAmd64 } from '../../src/engine';
import {
  callSiteOfFrame,
  callSpanAt,
  collectCallSpans,
  liveFrameForCallSpan,
  sameSpan,
} from '../../src/ui/hover';
import { previewSnapshot } from './helpers';

const PROGRAM = `fn helper(a: i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let r = helper(n);
    helper(r);
}

fn main() {
    outer(7);
}
`;

const RECURSIVE = `fn down(n: i32) {
    down(n);
}

fn main() {
    down(3);
}
`;

function analyzed(source: string) {
  const analysis = analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  return analysis;
}

describe('collectCallSpans', () => {
  it('finds let-bound, statement, and tail calls', () => {
    const source = `fn f() -> i32 { 1 }
fn g() -> i32 { f() }
fn main() {
    let a = f();
    g();
}
`;
    const analysis = analyzed(source);
    const spans = collectCallSpans(analysis.program);
    const texts = spans.map((s) => source.slice(s.start.offset, s.end.offset));
    expect(texts.sort()).toEqual(['f()', 'f()', 'g()']);
  });

  it('returns spans usable for containment lookups', () => {
    const analysis = analyzed(PROGRAM);
    const spans = collectCallSpans(analysis.program);
    const outerCall = PROGRAM.indexOf('outer(7)');
    const span = callSpanAt(spans, outerCall);
    expect(span).not.toBeNull();
    expect(PROGRAM.slice(span!.start.offset, span!.end.offset)).toBe(
      'outer(7)',
    );
  });
});

describe('callSpanAt', () => {
  const analysis = analyzed(PROGRAM);
  const spans = collectCallSpans(analysis.program);
  const start = PROGRAM.indexOf('helper(n)');

  it('is half-open: start inclusive, end exclusive', () => {
    expect(callSpanAt(spans, start)).not.toBeNull();
    expect(callSpanAt(spans, start + 'helper(n)'.length - 1)).not.toBeNull();
    expect(callSpanAt(spans, start + 'helper(n)'.length)).toBeNull();
  });

  it('returns null between calls', () => {
    expect(callSpanAt(spans, PROGRAM.indexOf('let local'))).toBeNull();
  });
});

describe('frame ⇄ call-site lookups', () => {
  it('maps a call span to the live frame it created and back', () => {
    const analysis = analyzed(PROGRAM);
    const state = previewSnapshot(initExecution(analysis.checked, sysvAmd64));
    const spans = collectCallSpans(analysis.program);
    const helperSpan = callSpanAt(spans, PROGRAM.indexOf('helper(n)'))!;

    const frameId = liveFrameForCallSpan(state.frames, helperSpan);
    expect(frameId).toBe(state.frames[2].id);
    expect(sameSpan(callSiteOfFrame(state.frames, frameId!), helperSpan)).toBe(
      true,
    );
  });

  it('returns null when no live frame matches', () => {
    const analysis = analyzed(PROGRAM);
    const state = step(initExecution(analysis.checked, sysvAmd64));
    const spans = collectCallSpans(analysis.program);
    const helperSpan = callSpanAt(spans, PROGRAM.indexOf('helper(n)'))!;
    expect(liveFrameForCallSpan(state.frames, helperSpan)).toBeNull();
  });

  it('picks the innermost activation for a recursive call site', () => {
    const analysis = analyzed(RECURSIVE);
    const state = previewSnapshot(initExecution(analysis.checked, sysvAmd64));
    const spans = collectCallSpans(analysis.program);
    const span = callSpanAt(spans, RECURSIVE.indexOf('down(n)'))!;
    const matches = state.frames.filter((f) => sameSpan(f.callSite, span));
    expect(matches.length).toBeGreaterThan(1);
    expect(liveFrameForCallSpan(state.frames, span)).toBe(
      matches[matches.length - 1].id,
    );
  });

  it('has no call site for the entry frame', () => {
    const analysis = analyzed(PROGRAM);
    const state = step(initExecution(analysis.checked, sysvAmd64));
    expect(callSiteOfFrame(state.frames, state.frames[0].id)).toBeNull();
    expect(callSiteOfFrame(state.frames, 999)).toBeNull();
  });
});
