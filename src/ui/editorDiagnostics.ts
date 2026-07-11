import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Diagnostic } from '../lang';

export function toEditorDiagnostics(
  diagnostics: Diagnostic[],
  docLength: number,
): CmDiagnostic[] {
  return diagnostics.map((d) => {
    const from = Math.min(d.span.start.offset, docLength);
    const to = Math.max(from, Math.min(d.span.end.offset, docLength));
    return {
      from,
      to,
      severity: d.severity,
      message: d.message,
    };
  });
}
