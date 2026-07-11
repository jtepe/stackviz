// CodeMirror extensions for execution-linked highlights: the line that
// executes next, and the call expression linked to the hovered frame.
// Marks are addressed by document offset; a doc change clears them
// immediately since the pending re-analysis will reset execution anyway.

import { StateEffect, StateField } from '@codemirror/state';
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

export const setHoverRange = StateEffect.define<HighlightRange | null>();

const hoverMark = Decoration.mark({ class: 'cm-hover-call' });

export const hoverRange = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = tr.docChanged ? Decoration.none : decorations;
    for (const effect of tr.effects) {
      if (effect.is(setHoverRange)) {
        const range = effect.value;
        const to = range ? Math.min(range.to, tr.state.doc.length) : 0;
        next =
          range === null || range.from >= to
            ? Decoration.none
            : Decoration.set([hoverMark.range(range.from, to)]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
