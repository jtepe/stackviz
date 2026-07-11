import { analyze } from '../../src/lang';
import { toEditorDiagnostics } from '../../src/ui/editorDiagnostics';
import type { Diagnostic } from '../../src/lang';

function makeDiagnostic(startOffset: number, endOffset: number): Diagnostic {
  return {
    message: 'boom',
    severity: 'error',
    span: {
      start: { offset: startOffset, line: 1, column: startOffset + 1 },
      end: { offset: endOffset, line: 1, column: endOffset + 1 },
    },
  };
}

describe('toEditorDiagnostics', () => {
  it('maps spans to CodeMirror from/to offsets', () => {
    const result = toEditorDiagnostics([makeDiagnostic(3, 7)], 100);
    expect(result).toEqual([
      { from: 3, to: 7, severity: 'error', message: 'boom' },
    ]);
  });

  it('clamps offsets to the document length', () => {
    const [diagnostic] = toEditorDiagnostics([makeDiagnostic(120, 140)], 100);
    expect(diagnostic.from).toBe(100);
    expect(diagnostic.to).toBe(100);
  });

  it('keeps `to` at least as large as `from`', () => {
    const [diagnostic] = toEditorDiagnostics([makeDiagnostic(50, 10)], 100);
    expect(diagnostic.to).toBeGreaterThanOrEqual(diagnostic.from);
  });
});

describe('analyze', () => {
  it('reports no diagnostics for a valid program', () => {
    const { diagnostics } = analyze('fn main() {\n    let x = 1;\n}\n');
    expect(diagnostics).toEqual([]);
  });

  it('reports an undeclared variable with a rustc-flavored message', () => {
    const { diagnostics } = analyze('fn main() {\n    let x = y;\n}\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe('cannot find value `y` in this scope');
  });

  it('produces spans that map onto the source it was given', () => {
    const source = 'fn main() {\n    let x = y;\n}\n';
    const { diagnostics } = analyze(source);
    const [mapped] = toEditorDiagnostics(diagnostics, source.length);
    expect(source.slice(mapped.from, mapped.to)).toBe('y');
  });
});
