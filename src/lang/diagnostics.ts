// Source positions, spans, and the diagnostics data model. Diagnostics are
// produced by the tokenizer and parser here, and by the checker in a later
// milestone; the UI renders them as editor underlines.

/** A point in the source. `line` and `column` are 1-based, `offset` is the 0-based character index. */
export interface Position {
  offset: number;
  line: number;
  column: number;
}

/** A half-open source range: `start` is inclusive, `end` is exclusive. */
export interface Span {
  start: Position;
  end: Position;
}

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  message: string;
  span: Span;
  severity: Severity;
}

export function error(message: string, span: Span): Diagnostic {
  return { message, span, severity: 'error' };
}
