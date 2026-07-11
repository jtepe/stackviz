// CodeMirror extension marking the source line that executes next. The
// line is addressed by document offset; a doc change clears the mark
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
