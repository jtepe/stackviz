import { Compartment, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import {
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';

export interface KeymapProfile {
  id: string;
  name: string;
  extension: () => Extension;
}

export const DEFAULT_KEYMAP_PROFILE_ID = 'default';

// Matches the keymap bundled by codemirror's basicSetup, which the editor
// used before keybindings became a swappable profile slot.
export const KEYMAP_PROFILES: readonly KeymapProfile[] = [
  {
    id: DEFAULT_KEYMAP_PROFILE_ID,
    name: 'Default',
    extension: () =>
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
  },
];

export function resolveKeymapProfile(id: string): KeymapProfile | null {
  return KEYMAP_PROFILES.find((profile) => profile.id === id) ?? null;
}

const keymapProfileSlot = new Compartment();

/** Initial editor extension holding the given profile's keybindings. */
export function keymapProfileExtension(id: string): Extension {
  const profile = resolveKeymapProfile(id);
  if (!profile) {
    throw new Error(`Unknown keymap profile: ${id}`);
  }
  return keymapProfileSlot.of(profile.extension());
}

/**
 * Swaps the live editor's keybindings to the given profile without
 * rebuilding the editor. Returns false when the id is unknown.
 */
export function setKeymapProfile(view: EditorView, id: string): boolean {
  const profile = resolveKeymapProfile(id);
  if (!profile) return false;
  view.dispatch({
    effects: keymapProfileSlot.reconfigure(profile.extension()),
  });
  return true;
}

/** Current content of the keymap profile slot; exposed for tests. */
export function keymapProfileSlotContent(view: EditorView): Extension | null {
  const content = keymapProfileSlot.get(view.state);
  return content === undefined ? null : content;
}
