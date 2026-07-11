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
}

export function EditorPane({ onAnalysis }: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onAnalysisRef = useRef(onAnalysis);

  useEffect(() => {
    onAnalysisRef.current = onAnalysis;
  }, [onAnalysis]);

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

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          rust(),
          lintGutter(),
          stackvizLinter,
          persist,
          oneDark,
          EditorView.theme({ '&': { height: '100%' } }),
        ],
      }),
    });

    onAnalysisRef.current?.(analyze(initial));

    return () => view.destroy();
  }, []);

  return (
    <section className="pane editor-pane" aria-label="Editor">
      <div className="pane-header">editor</div>
      <div ref={hostRef} className="pane-body editor-host" />
    </section>
  );
}
