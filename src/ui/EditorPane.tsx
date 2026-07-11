import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { rust } from '@codemirror/lang-rust';
import { linter, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { analyze, type Analysis } from '../lang';
import { SEED_PROGRAM } from '../samples';
import { toEditorDiagnostics } from './editorDiagnostics';
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

function loadInitialProgram(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch {
    return SEED_PROGRAM;
  }
  return SEED_PROGRAM;
}

function saveProgram(source: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch {
    return;
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

  return (
    <section className="pane editor-pane" aria-label="Editor">
      <div className="pane-header">editor</div>
      <div ref={hostRef} className="pane-body editor-host" />
    </section>
  );
}
