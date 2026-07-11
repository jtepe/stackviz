import { analyze } from '../src/lang';
import {
  MAX_FRAMES,
  initExecution,
  runToEnd,
  step,
  sysvAmd64,
  type ExecutionState,
} from '../src/engine';
import { SAMPLES, SEED_PROGRAM } from '../src/samples';

function start(source: string): ExecutionState {
  const analysis = analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  expect(analysis.checked.main).not.toBeNull();
  return initExecution(analysis.checked, sysvAmd64);
}

describe('sample programs', () => {
  it('offers six samples with unique ids and names', () => {
    expect(SAMPLES).toHaveLength(6);
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(6);
    expect(new Set(SAMPLES.map((s) => s.name)).size).toBe(6);
  });

  it('seeds first-time visitors with the basic-calls sample', () => {
    expect(SAMPLES[0].source).toBe(SEED_PROGRAM);
  });

  for (const sample of SAMPLES) {
    it(`"${sample.name}" parses, checks, and runs to ${sample.outcome}`, () => {
      const final = runToEnd(start(sample.source));
      expect(final.status).toBe(sample.outcome);
      if (sample.outcome === 'overflow') {
        expect(final.frames).toHaveLength(MAX_FRAMES);
        expect(final.overflowSite).not.toBeNull();
      }
    });
  }

  it('the deep call chain reaches exactly the frame limit', () => {
    let state = start(SAMPLES.find((s) => s.id === 'deep-call-chain')!.source);
    let deepest = 0;
    while (state.status === 'ready' || state.status === 'running') {
      state = step(state);
      deepest = Math.max(deepest, state.frames.length);
    }
    expect(deepest).toBe(MAX_FRAMES);
    expect(state.status).toBe('finished');
  });
});
