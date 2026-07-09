// AST for the pseudo language, mirroring the grammar in DESIGN.md §3.2.
// Every node carries a source span. These types are consumed by the checker,
// the execution engine, and the UI, so keep them dependency-free.

import { Span } from './diagnostics';

export interface Identifier {
  name: string;
  span: Span;
}

export type TypeName = 'i32' | '&i32';

export interface TypeNode {
  kind: 'Type';
  name: TypeName;
  span: Span;
}

export interface Program {
  kind: 'Program';
  functions: FunctionDecl[];
  span: Span;
}

export interface FunctionDecl {
  kind: 'FunctionDecl';
  name: Identifier;
  params: Param[];
  /** `null` for unit functions (no `-> type`). */
  returnType: TypeNode | null;
  body: Block;
  span: Span;
}

export interface Param {
  kind: 'Param';
  name: Identifier;
  type: TypeNode;
  span: Span;
}

export interface Block {
  kind: 'Block';
  stmts: Stmt[];
  /** Rust-style trailing expression without `;` — the implicit return. */
  tail: Expr | CallExpr | null;
  span: Span;
}

export type Stmt = LetStmt | CallStmt | ReturnStmt;

export interface LetStmt {
  kind: 'LetStmt';
  name: Identifier;
  /** `null` when the type is inferred from the initializer. */
  typeAnnotation: TypeNode | null;
  init: Expr | CallExpr;
  span: Span;
}

export interface CallStmt {
  kind: 'CallStmt';
  call: CallExpr;
  span: Span;
}

export interface ReturnStmt {
  kind: 'ReturnStmt';
  /** `null` for a bare `return;`. */
  value: Expr | null;
  span: Span;
}

/**
 * Simple expressions — the only forms allowed as call arguments and `return`
 * values. Calls are deliberately not part of this union: they may appear only
 * as a statement, a `let` initializer, or a tail expression (DESIGN.md §3.2),
 * so nested calls are unrepresentable in the AST.
 */
export type Expr = IntLiteral | VarExpr | RefExpr;

export interface IntLiteral {
  kind: 'IntLiteral';
  value: number;
  span: Span;
}

export interface VarExpr {
  kind: 'VarExpr';
  name: Identifier;
  span: Span;
}

/** `&IDENT` — address-of a variable. */
export interface RefExpr {
  kind: 'RefExpr';
  name: Identifier;
  span: Span;
}

export interface CallExpr {
  kind: 'CallExpr';
  callee: Identifier;
  args: Expr[];
  span: Span;
}
