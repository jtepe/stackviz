import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  DEFAULT_KEYMAP_PROFILE_ID,
  KEYMAP_PROFILES,
  keymapProfileExtension,
  keymapProfileSlotContent,
  resolveKeymapProfile,
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

  it('lists the default profile as its only entry', () => {
    expect(KEYMAP_PROFILES.map((p) => p.id)).toEqual([
      DEFAULT_KEYMAP_PROFILE_ID,
    ]);
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
