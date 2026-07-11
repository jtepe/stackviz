import { EditorState, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import {
  hoverRange,
  overflowRange,
  setHoverRange,
  setOverflowRange,
} from '../../src/ui/editorHighlight';

const DOC = 'fn main() { rec(1); }';

function marks(
  state: EditorState,
  field: StateField<DecorationSet>,
): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  const iter = state.field(field).iter();
  while (iter.value) {
    found.push({ from: iter.from, to: iter.to });
    iter.next();
  }
  return found;
}

describe('overflow call-site highlight', () => {
  it('marks the offending call and clears on null', () => {
    let state = EditorState.create({ doc: DOC, extensions: [overflowRange] });
    state = state.update({
      effects: setOverflowRange.of({ from: 12, to: 18 }),
    }).state;
    expect(marks(state, overflowRange)).toEqual([{ from: 12, to: 18 }]);
    state = state.update({ effects: setOverflowRange.of(null) }).state;
    expect(marks(state, overflowRange)).toEqual([]);
  });

  it('clears the mark when the document changes', () => {
    let state = EditorState.create({ doc: DOC, extensions: [overflowRange] });
    state = state.update({
      effects: setOverflowRange.of({ from: 12, to: 18 }),
    }).state;
    state = state.update({ changes: { from: 0, insert: ' ' } }).state;
    expect(marks(state, overflowRange)).toEqual([]);
  });

  it('keeps the overflow mark independent of the hover mark', () => {
    let state = EditorState.create({
      doc: DOC,
      extensions: [hoverRange, overflowRange],
    });
    state = state.update({
      effects: [
        setOverflowRange.of({ from: 12, to: 18 }),
        setHoverRange.of({ from: 3, to: 7 }),
      ],
    }).state;
    state = state.update({ effects: setHoverRange.of(null) }).state;
    expect(marks(state, hoverRange)).toEqual([]);
    expect(marks(state, overflowRange)).toEqual([{ from: 12, to: 18 }]);
  });
});
