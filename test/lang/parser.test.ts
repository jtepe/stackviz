import { MAX_PARAMS, parse } from '../../src/lang/parser';
import { stripSpans } from './helpers';

/** Parse a source string that is expected to be grammatically valid. */
function parseOk(source: string) {
  const { program, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return program;
}

// A reference program exercising every statement and expression form.
const EXAMPLE = `fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;                       // type inferred: i32
    let px: &i32 = &x;
    let r = helper(x, px);            // type inferred: i32
    helper(n, px);                    // result discarded
}

fn main() {
    outer(7);
}
`;

describe('parser', () => {
  it('parses the reference example into the expected AST shape', () => {
    const program = parseOk(EXAMPLE);
    expect(stripSpans(program)).toEqual({
      kind: 'Program',
      functions: [
        {
          kind: 'FunctionDecl',
          name: { name: 'helper' },
          params: [
            {
              kind: 'Param',
              name: { name: 'a' },
              type: { kind: 'Type', name: 'i32' },
            },
            {
              kind: 'Param',
              name: { name: 'p' },
              type: { kind: 'Type', name: '&i32' },
            },
          ],
          returnType: { kind: 'Type', name: 'i32' },
          body: {
            kind: 'Block',
            stmts: [
              {
                kind: 'LetStmt',
                name: { name: 'local' },
                typeAnnotation: { kind: 'Type', name: 'i32' },
                init: { kind: 'VarExpr', name: { name: 'a' } },
              },
              {
                kind: 'ReturnStmt',
                value: { kind: 'VarExpr', name: { name: 'local' } },
              },
            ],
            tail: null,
          },
        },
        {
          kind: 'FunctionDecl',
          name: { name: 'outer' },
          params: [
            {
              kind: 'Param',
              name: { name: 'n' },
              type: { kind: 'Type', name: 'i32' },
            },
          ],
          returnType: null,
          body: {
            kind: 'Block',
            stmts: [
              {
                kind: 'LetStmt',
                name: { name: 'x' },
                typeAnnotation: null,
                init: { kind: 'IntLiteral', value: 42 },
              },
              {
                kind: 'LetStmt',
                name: { name: 'px' },
                typeAnnotation: { kind: 'Type', name: '&i32' },
                init: { kind: 'RefExpr', name: { name: 'x' } },
              },
              {
                kind: 'LetStmt',
                name: { name: 'r' },
                typeAnnotation: null,
                init: {
                  kind: 'CallExpr',
                  callee: { name: 'helper' },
                  args: [
                    { kind: 'VarExpr', name: { name: 'x' } },
                    { kind: 'VarExpr', name: { name: 'px' } },
                  ],
                },
              },
              {
                kind: 'CallStmt',
                call: {
                  kind: 'CallExpr',
                  callee: { name: 'helper' },
                  args: [
                    { kind: 'VarExpr', name: { name: 'n' } },
                    { kind: 'VarExpr', name: { name: 'px' } },
                  ],
                },
              },
            ],
            tail: null,
          },
        },
        {
          kind: 'FunctionDecl',
          name: { name: 'main' },
          params: [],
          returnType: null,
          body: {
            kind: 'Block',
            stmts: [
              {
                kind: 'CallStmt',
                call: {
                  kind: 'CallExpr',
                  callee: { name: 'outer' },
                  args: [{ kind: 'IntLiteral', value: 7 }],
                },
              },
            ],
            tail: null,
          },
        },
      ],
    });
  });

  describe('grammar productions', () => {
    it('parses a tail expression as the implicit return', () => {
      const program = parseOk('fn f(a: i32) -> i32 { a }');
      const body = program.functions[0].body;
      expect(body.stmts).toEqual([]);
      expect(stripSpans(body.tail)).toEqual({
        kind: 'VarExpr',
        name: { name: 'a' },
      });
    });

    it('parses a call as the tail expression', () => {
      const program = parseOk('fn f() -> i32 { let x = 1; g(x, &x, -2) }');
      const tail = program.functions[0].body.tail;
      expect(stripSpans(tail)).toEqual({
        kind: 'CallExpr',
        callee: { name: 'g' },
        args: [
          { kind: 'VarExpr', name: { name: 'x' } },
          { kind: 'RefExpr', name: { name: 'x' } },
          { kind: 'IntLiteral', value: -2 },
        ],
      });
    });

    it('parses a bare `return;` and a `return expr;`', () => {
      const program = parseOk(
        'fn f() { return; }\nfn g() -> i32 { return 1_000; }',
      );
      expect(stripSpans(program.functions[0].body.stmts[0])).toEqual({
        kind: 'ReturnStmt',
        value: null,
      });
      expect(stripSpans(program.functions[1].body.stmts[0])).toEqual({
        kind: 'ReturnStmt',
        value: { kind: 'IntLiteral', value: 1000 },
      });
    });

    it('parses an empty body and an empty argument list', () => {
      const program = parseOk('fn main() { f(); }\nfn f() {}');
      const main = program.functions[0];
      expect(stripSpans(main.body.stmts[0])).toEqual({
        kind: 'CallStmt',
        call: { kind: 'CallExpr', callee: { name: 'f' }, args: [] },
      });
      expect(program.functions[1].body).toMatchObject({
        stmts: [],
        tail: null,
      });
    });

    it('parses exactly MAX_PARAMS parameters without complaint', () => {
      const program = parseOk('fn f(a: i32, b: &i32, c: i32) {}');
      expect(program.functions[0].params).toHaveLength(MAX_PARAMS);
    });

    it('parses block comments inside a function body', () => {
      const program = parseOk(
        'fn main() { /* set up\n   nothing */ let x = 1; }',
      );
      expect(program.functions[0].body.stmts).toHaveLength(1);
    });
  });

  describe('spans', () => {
    it('records precise spans on nodes', () => {
      const program = parseOk('fn main() {\n    let x = 42;\n}');
      const fn = program.functions[0];
      expect(fn.span.start).toMatchObject({ line: 1, column: 1 });
      expect(fn.span.end).toMatchObject({ line: 3, column: 2 });
      const letStmt = fn.body.stmts[0];
      expect(letStmt.span.start).toMatchObject({ line: 2, column: 5 });
      expect(letStmt.span.end).toMatchObject({ line: 2, column: 16 });
    });
  });

  describe('diagnostics', () => {
    it('reports a missing semicolon rustc-style, at the offending token', () => {
      const { diagnostics } = parse('fn main() {\n    let x = 1\n}');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('expected `;`, found `}`');
      expect(diagnostics[0].span.start).toMatchObject({ line: 3, column: 1 });
    });

    it('rejects a call nested inside call arguments', () => {
      const { diagnostics } = parse('fn main() { foo(bar(x)); }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'call expressions cannot be nested inside call arguments; bind the inner call with `let` first',
      );
      // The span covers exactly `bar(x)`.
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 17 });
      expect(diagnostics[0].span.end).toMatchObject({ line: 1, column: 23 });
    });

    it('rejects a call in a return statement', () => {
      const { diagnostics } = parse('fn f() -> i32 { return g(); }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'call expressions are not allowed in `return`; bind the call with `let` or use a tail expression',
      );
    });

    it('rejects more than MAX_PARAMS parameters, pointing at the extras', () => {
      const { program, diagnostics } = parse(
        'fn f(a: i32, b: i32, c: i32, d: i32) {}',
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        `functions may have at most ${MAX_PARAMS} parameters`,
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 30 });
      expect(program.functions[0].params).toHaveLength(4);
    });

    it('rejects a non-call expression used as a statement', () => {
      const { diagnostics } = parse('fn main() { 42; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'only call expressions may be used as statements',
      );
    });

    it('surfaces tokenizer diagnostics through parse()', () => {
      const { diagnostics } = parse('fn main() { let x = 2147483648; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('literal out of range for `i32`');
    });

    it('reports an unknown type name', () => {
      const { diagnostics } = parse('fn f(a: bool) {}');
      expect(diagnostics[0].message).toBe('expected type, found `bool`');
    });

    it('reports a keyword used as an identifier', () => {
      const { diagnostics } = parse('fn let() {}');
      expect(diagnostics[0].message).toBe(
        'expected identifier, found keyword `let`',
      );
    });

    it('reports stray tokens at the top level', () => {
      const { diagnostics } = parse('let x = 1;');
      expect(diagnostics[0].message).toBe('expected `fn`, found keyword `let`');
    });

    it('reports an empty program', () => {
      const { diagnostics } = parse('');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('expected `fn`, found end of file');
    });

    it('reports an unclosed function body at end of file', () => {
      const { diagnostics } = parse('fn main() {');
      expect(diagnostics[0].message).toBe('expected `}`, found end of file');
    });
  });

  describe('recovery', () => {
    it('recovers after a bad statement and still parses later functions', () => {
      const { program, diagnostics } = parse(
        'fn broken() { let = 1; let y = 2; }\nfn ok() { ok2(); }',
      );
      expect(diagnostics[0].message).toBe('expected identifier, found `=`');
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 19 });
      expect(program.functions.map((f) => f.name.name)).toEqual([
        'broken',
        'ok',
      ]);
      // The statement after the bad one was recovered.
      expect(program.functions[0].body.stmts).toHaveLength(1);
    });
  });
});
