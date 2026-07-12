import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { history } from '@codemirror/commands';
import { highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';

// codemirror's basicSetup minus its keymap, which lives in the swappable
// profile slot instead (see keymapProfiles.ts).
export const baseEditorSetup: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
];
