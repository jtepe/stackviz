import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { rust } from '@codemirror/lang-rust';
import { linter, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { analyze, type Analysis } from '../lang';
import { SAMPLES, SEED_PROGRAM } from '../samples';
import { toEditorDiagnostics } from './editorDiagnostics';
import {
  decodeProgramFromHash,
  encodeProgramToHash,
  isProgramHash,
} from './share';
import {
  currentStepLine,
  hoverRange,
  overflowRange,
  setCurrentStepLine,
  setHoverRange,
  setOverflowRange,
  type HighlightRange,
} from './editorHighlight';

const STORAGE_KEY = 'stackviz:program';
const DIAGNOSTIC_DEBOUNCE_MS = 300;
const SHARE_NOTICE_MS = 2000;

function loadPersistedProgram(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadInitialProgram(): string {
  const shared = decodeProgramFromHash(window.location.hash);
  if (shared !== null) return shared;
  return loadPersistedProgram() ?? SEED_PROGRAM;
}

function saveProgram(source: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch {
    return;
  }
}

function clearProgramHash(): void {
  if (isProgramHash(window.location.hash)) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  }
}

interface EditorPaneProps {
  onAnalysis?: (analysis: Analysis) => void;
  /** Document offset of what executes next; null hides the line marker. */
  currentOffset?: number | null;
  /** Source range to highlight for the hovered frame or call; null clears it. */
  highlightRange?: HighlightRange | null;
  /** Call site that overflowed the stack; null clears the highlight. */
  overflowSite?: HighlightRange | null;
  /** Fires with the document offset under the pointer; null off-text. */
  onHoverOffset?: (offset: number | null) => void;
}

export function EditorPane({
  onAnalysis,
  currentOffset = null,
  highlightRange = null,
  overflowSite = null,
  onHoverOffset,
}: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onAnalysisRef = useRef(onAnalysis);
  const onHoverOffsetRef = useRef(onHoverOffset);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  useEffect(() => {
    onAnalysisRef.current = onAnalysis;
    onHoverOffsetRef.current = onHoverOffset;
  }, [onAnalysis, onHoverOffset]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initial = loadInitialProgram();

    const stackvizLinter = linter(
      (view) => {
        const source = view.state.doc.toString();
        const analysis = analyze(source);
        onAnalysisRef.current?.(analysis);
        return toEditorDiagnostics(analysis.diagnostics, source.length);
      },
      { delay: DIAGNOSTIC_DEBOUNCE_MS },
    );

    const persist = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        saveProgram(update.state.doc.toString());
        clearProgramHash();
      }
    });

    const hoverEvents = EditorView.domEventHandlers({
      mousemove: (event, view) => {
        const offset = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        onHoverOffsetRef.current?.(offset);
      },
      mouseleave: () => {
        onHoverOffsetRef.current?.(null);
      },
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          rust(),
          lintGutter(),
          stackvizLinter,
          currentStepLine,
          hoverRange,
          overflowRange,
          hoverEvents,
          persist,
          oneDark,
          EditorView.theme({ '&': { height: '100%' } }),
        ],
      }),
    });

    viewRef.current = view;
    onAnalysisRef.current?.(analyze(initial));

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (shareNotice === null) return;
    const id = window.setTimeout(() => setShareNotice(null), SHARE_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [shareNotice]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setCurrentStepLine.of(currentOffset),
    });
  }, [currentOffset]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setHoverRange.of(highlightRange),
    });
  }, [highlightRange]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setOverflowRange.of(overflowSite),
    });
  }, [overflowSite]);

  const handleSampleChange = (id: string) => {
    const view = viewRef.current;
    const sample = SAMPLES.find((s) => s.id === id);
    if (!view || !sample) return;
    const current = view.state.doc.toString();
    if (current === sample.source) return;
    const persisted = loadPersistedProgram() ?? SEED_PROGRAM;
    if (
      current !== persisted &&
      !window.confirm(
        'Loading this sample will replace the current program, which has not been saved. Continue?',
      )
    ) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: sample.source },
    });
  };

  const handleShare = async () => {
    const view = viewRef.current;
    if (!view) return;
    const hash = encodeProgramToHash(view.state.doc.toString());
    window.history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice('Link copied');
    } catch {
      setShareNotice('Link is in the address bar');
    }
  };

  return (
    <section className="pane editor-pane" aria-label="Editor">
      <div className="pane-header editor-header">
        <span>editor</span>
        <div className="editor-actions">
          {shareNotice !== null && (
            <span className="share-notice" role="status">
              {shareNotice}
            </span>
          )}
          <select
            aria-label="Load sample program"
            value=""
            onChange={(event) => handleSampleChange(event.target.value)}
          >
            <option value="" disabled>
              Samples…
            </option>
            {SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleShare}>
            Share
          </button>
        </div>
      </div>
      <div ref={hostRef} className="pane-body editor-host" />
    </section>
  );
}
