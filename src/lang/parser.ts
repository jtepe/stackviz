// Recursive-descent parser for the pseudo language grammar. Reports
// rustc-styled diagnostics with precise spans and recovers at statement and
// function boundaries so multiple errors can be reported in one pass.

import {
  Block,
  CallExpr,
  Expr,
  FunctionDecl,
  Identifier,
  LetStmt,
  Param,
  Program,
  ReturnStmt,
  Stmt,
  TypeNode,
} from './ast';
import { Diagnostic, Position, Span, error } from './diagnostics';
import { Token, TokenKind, tokenize } from './tokenizer';

export interface ParseResult {
  /** Always present; on errors it contains whatever parsed cleanly. */
  program: Program;
  diagnostics: Diagnostic[];
}

/**
 * Parameter arity is enforced here in the parser; the checker does not
 * re-check it. Three matches the modeled argument registers rdi/rsi/rdx.
 */
export const MAX_PARAMS = 3;

/** Internal panic signal for parser recovery; never escapes `parse`. */
class ParseError extends Error {}

class Parser {
  private pos = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Program {
    const start = this.peek().span.start;
    const functions: FunctionDecl[] = [];
    while (!this.at('eof')) {
      if (this.at('fn')) {
        try {
          functions.push(this.parseFunction());
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
          this.syncToFunction();
        }
      } else {
        this.report(
          `expected \`fn\`, found ${this.describe(this.peek())}`,
          this.peek().span,
        );
        this.advance();
        this.syncToFunction();
      }
    }
    if (functions.length === 0 && this.diagnostics.length === 0) {
      this.report('expected `fn`, found end of file', this.peek().span);
    }
    return {
      kind: 'Program',
      functions,
      span: this.span(start, this.peek().span.end),
    };
  }

  // function := "fn" IDENT "(" [ params ] ")" [ "->" type ] block
  private parseFunction(): FunctionDecl {
    const fnTok = this.expect('fn');
    const name = this.expectIdent();
    this.expect('(');
    const params: Param[] = [];
    if (!this.at(')')) {
      params.push(this.parseParam());
      while (this.at(',')) {
        this.advance();
        params.push(this.parseParam());
      }
    }
    for (const extra of params.slice(MAX_PARAMS)) {
      this.report(
        `functions may have at most ${MAX_PARAMS} parameters`,
        extra.span,
      );
    }
    this.expect(')');
    let returnType: TypeNode | null = null;
    if (this.at('->')) {
      this.advance();
      returnType = this.parseType();
    }
    const body = this.parseBlock();
    return {
      kind: 'FunctionDecl',
      name,
      params,
      returnType,
      body,
      span: this.span(fnTok.span.start, body.span.end),
    };
  }

  // param := IDENT ":" type
  private parseParam(): Param {
    const name = this.expectIdent();
    this.expect(':');
    const type = this.parseType();
    return {
      kind: 'Param',
      name,
      type,
      span: this.span(name.span.start, type.span.end),
    };
  }

  // type := "i32" | "&" "i32"
  private parseType(): TypeNode {
    if (this.at('i32')) {
      const tok = this.advance();
      return { kind: 'Type', name: 'i32', span: tok.span };
    }
    if (this.at('&')) {
      const amp = this.advance();
      const tok = this.expect('i32');
      return {
        kind: 'Type',
        name: '&i32',
        span: this.span(amp.span.start, tok.span.end),
      };
    }
    throw this.fail(
      `expected type, found ${this.describe(this.peek())}`,
      this.peek().span,
    );
  }

  // block := "{" { stmt } [ tailExpr ] "}"
  private parseBlock(): Block {
    const open = this.expect('{');
    const stmts: Stmt[] = [];
    let tail: Expr | CallExpr | null = null;
    while (!this.at('}') && !this.at('eof') && !this.at('fn')) {
      try {
        if (this.at('let')) {
          stmts.push(this.parseLetStmt());
        } else if (this.at('return')) {
          stmts.push(this.parseReturnStmt());
        } else {
          const expr = this.parseExprOrCall();
          if (this.at(';')) {
            const semi = this.advance();
            if (expr.kind === 'CallExpr') {
              stmts.push({
                kind: 'CallStmt',
                call: expr,
                span: this.span(expr.span.start, semi.span.end),
              });
            } else {
              this.report(
                'only call expressions may be used as statements',
                expr.span,
              );
            }
          } else if (this.at('}')) {
            tail = expr; // implicit return; loop exits at the `}`
          } else {
            throw this.fail(
              `expected \`;\`, found ${this.describe(this.peek())}`,
              this.peek().span,
            );
          }
        }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.syncToStatement();
      }
    }
    const close = this.expect('}');
    return {
      kind: 'Block',
      stmts,
      tail,
      span: this.span(open.span.start, close.span.end),
    };
  }

  // letStmt := "let" IDENT [ ":" type ] "=" init ";"
  private parseLetStmt(): LetStmt {
    const letTok = this.expect('let');
    const name = this.expectIdent();
    let typeAnnotation: TypeNode | null = null;
    if (this.at(':')) {
      this.advance();
      typeAnnotation = this.parseType();
    }
    this.expect('=');
    const init = this.parseExprOrCall();
    const semi = this.expect(';');
    return {
      kind: 'LetStmt',
      name,
      typeAnnotation,
      init,
      span: this.span(letTok.span.start, semi.span.end),
    };
  }

  // returnStmt := "return" [ expr ] ";"
  private parseReturnStmt(): ReturnStmt {
    const returnTok = this.expect('return');
    let value: Expr | null = null;
    if (!this.at(';')) {
      value = this.parseExpr();
      if (value.kind === 'VarExpr' && this.at('(')) {
        // `return foo(...);` — parse the call for recovery, but reject it.
        const call = this.parseCallTail(value.name);
        this.report(
          'call expressions are not allowed in `return`; bind the call with `let` or use a tail expression',
          call.span,
        );
      }
    }
    const semi = this.expect(';');
    return {
      kind: 'ReturnStmt',
      value,
      span: this.span(returnTok.span.start, semi.span.end),
    };
  }

  // init/callStmt/tailExpr position: expr | callExpr
  private parseExprOrCall(): Expr | CallExpr {
    const expr = this.parseExpr();
    if (expr.kind === 'VarExpr' && this.at('(')) {
      return this.parseCallTail(expr.name);
    }
    return expr;
  }

  // expr := INT_LITERAL | IDENT | "&" IDENT
  private parseExpr(): Expr {
    if (this.at('int')) {
      const tok = this.advance();
      return { kind: 'IntLiteral', value: tok.value ?? 0, span: tok.span };
    }
    if (this.at('&')) {
      const amp = this.advance();
      const name = this.expectIdent();
      return {
        kind: 'RefExpr',
        name,
        span: this.span(amp.span.start, name.span.end),
      };
    }
    if (this.at('ident')) {
      const name = this.ident(this.advance());
      return { kind: 'VarExpr', name, span: name.span };
    }
    throw this.fail(
      `expected expression, found ${this.describe(this.peek())}`,
      this.peek().span,
    );
  }

  // callExpr := IDENT "(" [ args ] ")", with the callee already consumed.
  private parseCallTail(callee: Identifier): CallExpr {
    this.expect('(');
    const args: Expr[] = [];
    if (!this.at(')')) {
      this.parseArg(args);
      while (this.at(',')) {
        this.advance();
        this.parseArg(args);
      }
    }
    const close = this.expect(')');
    return {
      kind: 'CallExpr',
      callee,
      args,
      span: this.span(callee.span.start, close.span.end),
    };
  }

  private parseArg(args: Expr[]): void {
    const arg = this.parseExprOrCall();
    if (arg.kind === 'CallExpr') {
      // Nested call: parsed for recovery, reported, and excluded from args.
      this.report(
        'call expressions cannot be nested inside call arguments; bind the inner call with `let` first',
        arg.span,
      );
    } else {
      args.push(arg);
    }
  }

  // --- error reporting and recovery ---

  private expectIdent(): Identifier {
    if (this.at('ident')) return this.ident(this.advance());
    throw this.fail(
      `expected identifier, found ${this.describe(this.peek())}`,
      this.peek().span,
    );
  }

  private expect(kind: TokenKind): Token {
    if (this.at(kind)) return this.advance();
    throw this.fail(
      `expected \`${kind}\`, found ${this.describe(this.peek())}`,
      this.peek().span,
    );
  }

  private describe(token: Token): string {
    switch (token.kind) {
      case 'eof':
        return 'end of file';
      case 'fn':
      case 'let':
      case 'return':
      case 'i32':
        return `keyword \`${token.text}\``;
      default:
        return `\`${token.text}\``;
    }
  }

  private report(message: string, span: Span): void {
    this.diagnostics.push(error(message, span));
  }

  private fail(message: string, span: Span): ParseError {
    this.report(message, span);
    return new ParseError(message);
  }

  /** Skip to the next `fn` (or end of input) after an unrecoverable error. */
  private syncToFunction(): void {
    while (!this.at('eof') && !this.at('fn')) this.advance();
  }

  /** Skip past the next `;`, or stop before `}` / `fn` / end of input. */
  private syncToStatement(): void {
    while (!this.at('eof') && !this.at('}') && !this.at('fn')) {
      if (this.advance().kind === ';') return;
    }
  }

  // --- token cursor ---

  private ident(token: Token): Identifier {
    return { name: token.text, span: token.span };
  }

  private span(start: Position, end: Position): Span {
    return { start, end };
  }

  private at(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    if (token.kind !== 'eof') this.pos++;
    return token;
  }
}

/**
 * Tokenize and parse a source string. The returned diagnostics combine
 * tokenizer errors (first) and parser errors; an empty list means the
 * program is grammatically valid (static semantics are checked separately
 * by the checker).
 */
export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = tokenize(source);
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  return { program, diagnostics: [...diagnostics, ...parser.diagnostics] };
}
