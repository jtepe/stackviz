import { EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { commands as helixCommands } from 'codemirror-helix';
import {
  DEFAULT_KEYMAP_PROFILE_ID,
  KEYMAP_PROFILES,
  keymapProfileExtension,
  keymapProfileSlotContent,
  loadPersistedKeymapProfileId,
  resolveKeymapProfile,
  saveKeymapProfileId,
  setKeymapProfile,
} from '../../src/ui/keymapProfiles';

describe('keymap profile registry', () => {
  it('resolves the default profile by id', () => {
    const profile = resolveKeymapProfile(DEFAULT_KEYMAP_PROFILE_ID);
    expect(profile).not.toBeNull();
    expect(profile?.id).toBe(DEFAULT_KEYMAP_PROFILE_ID);
    expect(profile?.name).toBe('Default');
  });

  it('returns null for an unknown id', () => {
    expect(resolveKeymapProfile('emacs')).toBeNull();
  });

  it('lists the default and helix profiles', () => {
    expect(KEYMAP_PROFILES.map((p) => p.id)).toEqual([
      DEFAULT_KEYMAP_PROFILE_ID,
      'helix',
    ]);
  });

  it('resolves the helix profile by id', () => {
    const profile = resolveKeymapProfile('helix');
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe('Helix');
  });

  it('produces keybindings for the default profile', () => {
    const state = EditorState.create({
      extensions: [keymapProfileExtension(DEFAULT_KEYMAP_PROFILE_ID)],
    });
    const bindings = state.facet(keymap).flat();
    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.some((b) => b.key === 'Mod-z')).toBe(true);
  });

  it('rejects building an extension for an unknown id', () => {
    expect(() => keymapProfileExtension('emacs')).toThrow(
      /unknown keymap profile/i,
    );
  });
});

describe('runtime keymap slot reconfigure', () => {
  function createView(): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc: 'fn main() {}',
        extensions: [keymapProfileExtension(DEFAULT_KEYMAP_PROFILE_ID)],
      }),
    });
  }

  it('swaps the slot content without rebuilding the editor', () => {
    const view = createView();
    try {
      const before = keymapProfileSlotContent(view);
      expect(before).not.toBeNull();
      expect(setKeymapProfile(view, DEFAULT_KEYMAP_PROFILE_ID)).toBe(true);
      const after = keymapProfileSlotContent(view);
      expect(after).not.toBeNull();
      expect(after).not.toBe(before);
      expect(view.state.facet(keymap).flat().length).toBeGreaterThan(0);
    } finally {
      view.destroy();
    }
  });

  it('switches to helix and back to default', () => {
    const view = createView();
    try {
      expect(view.dom.querySelector('.cm-hx-status-panel')).toBeNull();

      expect(setKeymapProfile(view, 'helix')).toBe(true);
      expect(view.dom.querySelector('.cm-hx-status-panel')).not.toBeNull();

      expect(setKeymapProfile(view, DEFAULT_KEYMAP_PROFILE_ID)).toBe(true);
      expect(view.dom.querySelector('.cm-hx-status-panel')).toBeNull();
      expect(
        view.state
          .facet(keymap)
          .flat()
          .some((b) => b.key === 'Mod-z'),
      ).toBe(true);
    } finally {
      view.destroy();
    }
  });

  it('leaves the editor untouched for an unknown profile id', () => {
    const view = createView();
    try {
      const before = keymapProfileSlotContent(view);
      expect(setKeymapProfile(view, 'emacs')).toBe(false);
      expect(keymapProfileSlotContent(view)).toBe(before);
    } finally {
      view.destroy();
    }
  });
});

describe('helix profile', () => {
  function createHelixView(doc = 'fn main() {}'): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [keymapProfileExtension('helix')],
      }),
    });
  }

  function press(view: EditorView, key: string, mods?: KeyboardEventInit) {
    runScopeHandlers(
      view,
      new KeyboardEvent('keydown', { key, ...mods }),
      'editor',
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('registers a :write command aliased to :w', () => {
    const view = createHelixView();
    try {
      const write = view.state
        .facet(helixCommands)
        .flat()
        .find((command) => command.name === 'write');
      expect(write).toBeDefined();
      expect(write?.aliases).toContain('w');
    } finally {
      view.destroy();
    }
  });

  it(':write saves the program and reports a notice', () => {
    const view = createHelixView('fn saved() {}');
    try {
      const write = view.state
        .facet(helixCommands)
        .flat()
        .find((command) => command.name === 'write');
      const result = write?.handler(view, []);
      expect(localStorage.getItem('stackviz:program')).toBe('fn saved() {}');
      expect(result).toEqual({ message: 'saved' });
    } finally {
      view.destroy();
    }
  });

  it('mirrors the current mode onto the statusline data attribute', () => {
    const view = createHelixView();
    try {
      const panel = () =>
        view.dom.querySelector<HTMLElement>('.cm-hx-status-panel');

      press(view, 'i');
      expect(panel()?.dataset.hxMode).toBe('INS');

      press(view, 'Escape');
      expect(panel()?.dataset.hxMode).toBe('NOR');

      press(view, 'v');
      expect(panel()?.dataset.hxMode).toBe('SEL');
    } finally {
      view.destroy();
    }
  });

  it('routes Mod-z / Mod-y to helix undo and redo', () => {
    const view = createHelixView('fn main() {}');
    try {
      press(view, 'i');
      view.dispatch({ changes: { from: 0, insert: 'X' } });
      press(view, 'Escape');
      expect(view.state.doc.toString()).toBe('Xfn main() {}');

      press(view, 'z', { ctrlKey: true });
      expect(view.state.doc.toString()).toBe('fn main() {}');

      press(view, 'y', { ctrlKey: true });
      expect(view.state.doc.toString()).toBe('Xfn main() {}');
    } finally {
      view.destroy();
    }
  });

  it('routes Mod-f to the helix search prompt', () => {
    const view = createHelixView();
    try {
      expect(view.dom.querySelector('.cm-hx-command-panel input')).toBeNull();
      press(view, 'f', { ctrlKey: true });
      expect(
        view.dom.querySelector('.cm-hx-command-panel input'),
      ).not.toBeNull();
    } finally {
      view.destroy();
    }
  });

  it('binds the aliased chords in the helix profile keymap', () => {
    const state = EditorState.create({
      extensions: [keymapProfileExtension('helix')],
    });
    const keys = state
      .facet(keymap)
      .flat()
      .map((binding) => binding.key);
    for (const key of ['Mod-z', 'Mod-y', 'Mod-Shift-z', 'Mod-f']) {
      expect(keys).toContain(key);
    }
  });
});

describe('keymap profile persistence', () => {
  const STORAGE_KEY = 'stackviz:keymap-profile';

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves the selected profile id', () => {
    saveKeymapProfileId('helix');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('helix');
  });

  it('restores a saved profile id', () => {
    localStorage.setItem(STORAGE_KEY, 'helix');
    expect(loadPersistedKeymapProfileId()).toBe('helix');
  });

  it('falls back to default when nothing is stored', () => {
    expect(loadPersistedKeymapProfileId()).toBe(DEFAULT_KEYMAP_PROFILE_ID);
  });

  it('falls back to default for an unknown stored id', () => {
    localStorage.setItem(STORAGE_KEY, 'emacs');
    expect(loadPersistedKeymapProfileId()).toBe(DEFAULT_KEYMAP_PROFILE_ID);
  });

  it('falls back to default when storage is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    try {
      expect(loadPersistedKeymapProfileId()).toBe(DEFAULT_KEYMAP_PROFILE_ID);
    } finally {
      getItem.mockRestore();
    }
  });

  it('ignores save failures when storage is unavailable', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    try {
      expect(() => saveKeymapProfileId('helix')).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });
});
