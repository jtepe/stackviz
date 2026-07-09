// Tokenizer for the pseudo language (DESIGN.md §3.2). Produces a flat token
// list plus diagnostics; every token carries a source span. No DOM/React
// dependencies (DESIGN.md §7).

import { Diagnostic, Position, Span, error } from './diagnostics';

export type Keyword = 'fn' | 'let' | 'return' | 'i32';

export type Punct = '(' | ')' | '{' | '}' | ',' | ':' | ';' | '->' | '&' | '=';

export type TokenKind = Keyword | Punct | 'ident' | 'int' | 'eof';

export interface Token {
  kind: TokenKind;
  /** The exact source text of the token (empty for `eof`). */
  text: string;
  span: Span;
  /** Numeric value, present on `int` tokens only. */
  value?: number;
}

export interface TokenizeResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

const KEYWORDS: ReadonlySet<string> = new Set(['fn', 'let', 'return', 'i32']);

const SINGLE_PUNCT: ReadonlySet<string> = new Set([
  '(',
  ')',
  '{',
  '}',
  ',',
  ':',
  ';',
  '&',
  '=',
]);

export const I32_MIN = -2147483648;
export const I32_MAX = 2147483647;

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentContinue(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

class Tokenizer {
  private offset = 0;
  private line = 1;
  private column = 1;
  readonly tokens: Token[] = [];
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly source: string) {}

  run(): TokenizeResult {
    while (!this.atEnd()) {
      const start = this.pos();
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '/') {
        this.comment(start);
      } else if (isIdentStart(ch)) {
        this.identOrKeyword(start);
      } else if (isDigit(ch)) {
        this.intLiteral(start);
      } else if (ch === '-') {
        this.advance();
        if (this.peek() === '>') {
          this.advance();
          this.push('->', '->', start);
        } else if (isDigit(this.peek())) {
          this.intLiteral(start);
        } else {
          this.diagnostics.push(
            error('unknown start of token: `-`', this.span(start)),
          );
        }
      } else if (SINGLE_PUNCT.has(ch)) {
        this.advance();
        this.push(ch as Punct, ch, start);
      } else {
        this.advance();
        this.diagnostics.push(
          error(`unknown start of token: \`${ch}\``, this.span(start)),
        );
      }
    }
    const end = this.pos();
    this.tokens.push({ kind: 'eof', text: '', span: { start: end, end } });
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private comment(start: Position): void {
    this.advance(); // '/'
    if (this.peek() === '/') {
      while (!this.atEnd() && this.peek() !== '\n') this.advance();
    } else if (this.peek() === '*') {
      this.advance();
      // Block comments nest, as in Rust.
      let depth = 1;
      while (depth > 0 && !this.atEnd()) {
        if (this.peek() === '/' && this.peekAt(1) === '*') {
          this.advance();
          this.advance();
          depth++;
        } else if (this.peek() === '*' && this.peekAt(1) === '/') {
          this.advance();
          this.advance();
          depth--;
        } else {
          this.advance();
        }
      }
      if (depth > 0) {
        this.diagnostics.push(
          error('unterminated block comment', this.span(start)),
        );
      }
    } else {
      this.diagnostics.push(
        error('unknown start of token: `/`', this.span(start)),
      );
    }
  }

  private identOrKeyword(start: Position): void {
    while (!this.atEnd() && isIdentContinue(this.peek())) this.advance();
    const text = this.source.slice(start.offset, this.offset);
    this.push(KEYWORDS.has(text) ? (text as Keyword) : 'ident', text, start);
  }

  private intLiteral(start: Position): void {
    while (!this.atEnd() && (isDigit(this.peek()) || this.peek() === '_'))
      this.advance();
    const digitsEnd = this.offset;
    if (!this.atEnd() && isIdentStart(this.peek())) {
      while (!this.atEnd() && isIdentContinue(this.peek())) this.advance();
      const suffix = this.source.slice(digitsEnd, this.offset);
      this.diagnostics.push(
        error(
          `invalid suffix \`${suffix}\` for number literal`,
          this.span(start),
        ),
      );
    }
    const text = this.source.slice(start.offset, this.offset);
    // The slice includes the leading '-' when the literal is negative.
    const digits = this.source.slice(start.offset, digitsEnd).replace(/_/g, '');
    const value = Number(digits);
    if (value < I32_MIN || value > I32_MAX) {
      this.diagnostics.push(
        error('literal out of range for `i32`', this.span(start)),
      );
    }
    const span = this.span(start);
    this.tokens.push({ kind: 'int', text, span, value });
  }

  private push(kind: TokenKind, text: string, start: Position): void {
    this.tokens.push({ kind, text, span: this.span(start) });
  }

  private span(start: Position): Span {
    return { start, end: this.pos() };
  }

  private pos(): Position {
    return { offset: this.offset, line: this.line, column: this.column };
  }

  private peek(): string {
    return this.source[this.offset] ?? '';
  }

  private peekAt(delta: number): string {
    return this.source[this.offset + delta] ?? '';
  }

  private advance(): void {
    if (this.source[this.offset] === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.offset++;
  }

  private atEnd(): boolean {
    return this.offset >= this.source.length;
  }
}

export function tokenize(source: string): TokenizeResult {
  return new Tokenizer(source).run();
}
