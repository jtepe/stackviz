// CodeMirror extensions for execution-linked highlights: the line that
// executes next, the call expression linked to the hovered frame, and the
// call site that overflowed the stack. Marks are addressed by document
// offset; a doc change clears them immediately since the pending
// re-analysis will reset execution anyway.

import { StateEffect, StateEffectType, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

export const setCurrentStepLine = StateEffect.define<number | null>();

const stepLineDecoration = Decoration.line({ class: 'cm-step-line' });

export const currentStepLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = tr.docChanged ? Decoration.none : decorations;
    for (const effect of tr.effects) {
      if (effect.is(setCurrentStepLine)) {
        if (effect.value === null) {
          next = Decoration.none;
        } else {
          const offset = Math.min(effect.value, tr.state.doc.length);
          const line = tr.state.doc.lineAt(offset);
          next = Decoration.set([stepLineDecoration.range(line.from)]);
        }
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface HighlightRange {
  from: number;
  to: number;
}

function markField(
  setRange: StateEffectType<HighlightRange | null>,
  markClass: string,
): StateField<DecorationSet> {
  const mark = Decoration.mark({ class: markClass });
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, tr) {
      let next = tr.docChanged ? Decoration.none : decorations;
      for (const effect of tr.effects) {
        if (effect.is(setRange)) {
          const range = effect.value;
          const to = range ? Math.min(range.to, tr.state.doc.length) : 0;
          next =
            range === null || range.from >= to
              ? Decoration.none
              : Decoration.set([mark.range(range.from, to)]);
        }
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

export const setHoverRange = StateEffect.define<HighlightRange | null>();

export const hoverRange = markField(setHoverRange, 'cm-hover-call');

export const setOverflowRange = StateEffect.define<HighlightRange | null>();

export const overflowRange = markField(setOverflowRange, 'cm-overflow-call');
