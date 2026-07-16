import { Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  runScopeHandlers,
  type KeyBinding,
} from '@codemirror/view';
import {
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import {
  helix,
  commands as helixCommands,
  type TypableCommand,
} from 'codemirror-helix';
import { saveProgram } from './programStorage';

export interface KeymapProfile {
  id: string;
  name: string;
  extension: () => Extension;
}

export const DEFAULT_KEYMAP_PROFILE_ID = 'default';

const helixWriteCommand: TypableCommand = {
  name: 'write',
  aliases: ['w'],
  help: 'Save the program to browser storage',
  handler(view) {
    saveProgram(view.state.doc.toString());
    return { message: 'saved' };
  },
};

// Re-dispatches a chord as one of Helix's own keys, so familiar shortcuts
// route into Helix's modal handlers (its checkpoint history, its search
// prompt) instead of the base editor's or the browser's. Always consumes
// the chord: letting it fall through would trigger native browser undo or
// find, bypassing both the Helix keymap and the editor entirely.
function forwardToHelixKey(key: string): KeyBinding['run'] {
  return (view) => {
    runScopeHandlers(view, new KeyboardEvent('keydown', { key }), 'editor');
    return true;
  };
}

const helixChordAliases: readonly KeyBinding[] = [
  { key: 'Mod-z', run: forwardToHelixKey('u') },
  { key: 'Mod-y', run: forwardToHelixKey('U') },
  { key: 'Mod-Shift-z', run: forwardToHelixKey('U') },
  { key: 'Mod-f', run: forwardToHelixKey('/') },
];

// Mirrors the statusline's mode text (NOR/INS/SEL) onto a data attribute
// so the mode indicator can be styled per mode from index.css.
const helixModeAttribute = EditorView.updateListener.of((update) => {
  const panel = update.view.dom.querySelector('.cm-hx-status-panel');
  if (!(panel instanceof HTMLElement)) return;
  const mode = panel.firstElementChild?.textContent ?? '';
  if (panel.dataset.hxMode !== mode) {
    panel.dataset.hxMode = mode;
  }
});

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
  {
    id: 'helix',
    name: 'Helix',
    // drawSelection is disabled because baseEditorSetup already provides it.
    extension: () => [
      helix({ drawSelection: false }),
      helixCommands.of([helixWriteCommand]),
      keymap.of([...helixChordAliases]),
      helixModeAttribute,
    ],
  },
];

export function resolveKeymapProfile(id: string): KeymapProfile | null {
  return KEYMAP_PROFILES.find((profile) => profile.id === id) ?? null;
}

const PROFILE_STORAGE_KEY = 'stackviz:keymap-profile';

export function loadPersistedKeymapProfileId(): string {
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored !== null && resolveKeymapProfile(stored)) return stored;
  } catch {
    // fall through to the default
  }
  return DEFAULT_KEYMAP_PROFILE_ID;
}

export function saveKeymapProfileId(id: string): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
  } catch {
    return;
  }
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
