// Static checker: name resolution, type inference and checking, entry-point
// and return-discipline rules. Runs over the parsed AST and reports every
// violation it can find as a rustc-styled diagnostic; it also produces a
// typed view of the program (resolved variable types per function) so the
// engine can lay out frames without re-inferring types.

import {
  CallExpr,
  Expr,
  FunctionDecl,
  LetStmt,
  Program,
  ReturnStmt,
  TypeName,
} from './ast';
import { Diagnostic, Span, error } from './diagnostics';

/**
 * The type of an evaluated expression during checking. `unit` is the result
 * of calling a function with no return type; `error` marks a type that could
 * not be determined and suppresses cascading diagnostics.
 */
type Ty = TypeName | 'unit' | 'error';

export interface VariableInfo {
  name: string;
  type: TypeName;
  origin: 'param' | 'local';
  /** Span of the declaring identifier (the parameter name or `let` name). */
  span: Span;
}

export interface CheckedFunction {
  decl: FunctionDecl;
  returnType: TypeName | null;
  /** Parameters first, then locals, both in declaration order. */
  variables: VariableInfo[];
}

export interface CheckedProgram {
  program: Program;
  /** Keyed by function name; duplicate declarations keep the first. */
  functions: Map<string, CheckedFunction>;
  /** The entry point, when a well-formed `main` exists. */
  main: FunctionDecl | null;
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  /** Only fully trustworthy when `diagnostics` is empty. */
  checked: CheckedProgram;
}

function formatTy(ty: Ty): string {
  return ty === 'unit' ? '`()`' : `\`${ty}\``;
}

function countArguments(n: number): string {
  return n === 1 ? '1 argument' : `${n} arguments`;
}

class Checker {
  readonly diagnostics: Diagnostic[] = [];
  private readonly signatures = new Map<string, FunctionDecl>();
  private readonly checkedFunctions = new Map<string, CheckedFunction>();
  private main: FunctionDecl | null = null;

  check(program: Program): CheckResult {
    this.collectSignatures(program);
    this.checkEntryPoint(program);
    for (const fn of program.functions) {
      this.checkFunction(fn);
    }
    return {
      diagnostics: this.diagnostics,
      checked: {
        program,
        functions: this.checkedFunctions,
        main: this.main,
      },
    };
  }

  private collectSignatures(program: Program): void {
    for (const fn of program.functions) {
      const existing = this.signatures.get(fn.name.name);
      if (existing) {
        this.report(
          `the name \`${fn.name.name}\` is defined multiple times`,
          fn.name.span,
        );
      } else {
        this.signatures.set(fn.name.name, fn);
      }
    }
  }

  private checkEntryPoint(program: Program): void {
    const main = this.signatures.get('main');
    if (!main) {
      this.report('`main` function not found', program.span);
      return;
    }
    let wellFormed = true;
    if (main.params.length > 0) {
      const span = {
        start: main.params[0].span.start,
        end: main.params[main.params.length - 1].span.end,
      };
      this.report(
        '`main` function has wrong signature: expected no parameters',
        span,
      );
      wellFormed = false;
    }
    if (main.returnType) {
      this.report(
        '`main` function has wrong signature: expected no return type',
        main.returnType.span,
      );
      wellFormed = false;
    }
    if (wellFormed) this.main = main;
  }

  private checkFunction(fn: FunctionDecl): void {
    const scope = new Map<string, Ty>();
    const variables: VariableInfo[] = [];

    for (const param of fn.params) {
      if (scope.has(param.name.name)) {
        this.report(
          `identifier \`${param.name.name}\` is bound more than once in this parameter list`,
          param.name.span,
        );
        continue;
      }
      scope.set(param.name.name, param.type.name);
      variables.push({
        name: param.name.name,
        type: param.type.name,
        origin: 'param',
        span: param.name.span,
      });
    }

    const { stmts, tail } = fn.body;
    const declaredReturn: Ty = fn.returnType ? fn.returnType.name : 'unit';
    let endsWithReturn = false;

    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      switch (stmt.kind) {
        case 'LetStmt':
          this.checkLet(stmt, scope, variables);
          break;
        case 'CallStmt':
          this.checkCall(stmt.call, scope);
          break;
        case 'ReturnStmt': {
          this.checkReturn(stmt, scope, declaredReturn);
          const next = i < stmts.length - 1 ? stmts[i + 1] : tail;
          if (next) {
            this.report(
              next.kind === 'IntLiteral' ||
                next.kind === 'VarExpr' ||
                next.kind === 'RefExpr' ||
                next.kind === 'CallExpr'
                ? 'unreachable expression'
                : 'unreachable statement',
              next.span,
            );
          } else {
            endsWithReturn = true;
          }
          break;
        }
      }
    }

    if (tail) {
      const ty =
        tail.kind === 'CallExpr'
          ? this.checkCall(tail, scope)
          : this.typeOf(tail, scope);
      if (ty !== 'error' && ty !== declaredReturn) {
        this.report(
          `mismatched types: expected ${formatTy(declaredReturn)}, found ${formatTy(ty)}`,
          tail.span,
        );
      }
    } else if (fn.returnType && !endsWithReturn) {
      this.report(
        `mismatched types: expected ${formatTy(declaredReturn)}, found \`()\``,
        fn.returnType.span,
      );
    }

    if (!this.checkedFunctions.has(fn.name.name)) {
      this.checkedFunctions.set(fn.name.name, {
        decl: fn,
        returnType: fn.returnType ? fn.returnType.name : null,
        variables,
      });
    }
  }

  private checkLet(
    stmt: LetStmt,
    scope: Map<string, Ty>,
    variables: VariableInfo[],
  ): void {
    const initTy =
      stmt.init.kind === 'CallExpr'
        ? this.checkCall(stmt.init, scope)
        : this.typeOf(stmt.init, scope);

    const annotated = stmt.typeAnnotation?.name ?? null;
    if (initTy === 'unit') {
      this.report(
        `mismatched types: expected ${annotated ? formatTy(annotated) : 'a value'}, found \`()\``,
        stmt.init.span,
      );
    } else if (initTy !== 'error' && annotated && initTy !== annotated) {
      this.report(
        `mismatched types: expected ${formatTy(annotated)}, found ${formatTy(initTy)}`,
        stmt.init.span,
      );
    }

    if (scope.has(stmt.name.name)) {
      this.report(
        `the name \`${stmt.name.name}\` is defined multiple times in this function`,
        stmt.name.span,
      );
      return;
    }

    const ty: Ty =
      annotated ?? (initTy === 'unit' || initTy === 'error' ? 'error' : initTy);
    scope.set(stmt.name.name, ty);
    variables.push({
      name: stmt.name.name,
      type: ty === 'error' ? 'i32' : (ty as TypeName),
      origin: 'local',
      span: stmt.name.span,
    });
  }

  private checkReturn(
    stmt: ReturnStmt,
    scope: Map<string, Ty>,
    declaredReturn: Ty,
  ): void {
    if (!stmt.value) {
      if (declaredReturn !== 'unit') {
        this.report(
          `mismatched types: expected ${formatTy(declaredReturn)}, found \`()\``,
          stmt.span,
        );
      }
      return;
    }
    const ty = this.typeOf(stmt.value, scope);
    if (ty !== 'error' && ty !== declaredReturn) {
      this.report(
        `mismatched types: expected ${formatTy(declaredReturn)}, found ${formatTy(ty)}`,
        stmt.value.span,
      );
    }
  }

  private checkCall(call: CallExpr, scope: Map<string, Ty>): Ty {
    const argTypes = call.args.map((arg) => this.typeOf(arg, scope));
    const callee = this.signatures.get(call.callee.name);
    if (!callee) {
      this.report(
        `cannot find function \`${call.callee.name}\` in this scope`,
        call.callee.span,
      );
      return 'error';
    }
    if (call.args.length !== callee.params.length) {
      this.report(
        `this function takes ${countArguments(callee.params.length)} but ${countArguments(call.args.length)} ${call.args.length === 1 ? 'was' : 'were'} supplied`,
        call.span,
      );
    }
    const checkable = Math.min(call.args.length, callee.params.length);
    for (let i = 0; i < checkable; i++) {
      const expected = callee.params[i].type.name;
      const found = argTypes[i];
      if (found !== 'error' && found !== expected) {
        this.report(
          `mismatched types: expected ${formatTy(expected)}, found ${formatTy(found)}`,
          call.args[i].span,
        );
      }
    }
    return callee.returnType ? callee.returnType.name : 'unit';
  }

  private typeOf(expr: Expr, scope: Map<string, Ty>): Ty {
    switch (expr.kind) {
      case 'IntLiteral':
        return 'i32';
      case 'VarExpr': {
        const ty = scope.get(expr.name.name);
        if (ty === undefined) {
          this.report(
            `cannot find value \`${expr.name.name}\` in this scope`,
            expr.name.span,
          );
          return 'error';
        }
        return ty;
      }
      case 'RefExpr': {
        const ty = scope.get(expr.name.name);
        if (ty === undefined) {
          this.report(
            `cannot find value \`${expr.name.name}\` in this scope`,
            expr.name.span,
          );
          return 'error';
        }
        if (ty === 'error') return 'error';
        if (ty !== 'i32') {
          this.report(
            `mismatched types: expected \`i32\`, found ${formatTy(ty)}`,
            expr.name.span,
          );
          return 'error';
        }
        return '&i32';
      }
    }
  }

  private report(message: string, span: Span): void {
    this.diagnostics.push(error(message, span));
  }
}

/**
 * Check the static semantics of a parsed program. Call this only on a
 * program that parsed without diagnostics; the checker assumes a
 * grammatically well-formed AST.
 */
export function check(program: Program): CheckResult {
  return new Checker().check(program);
}
