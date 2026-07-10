import { check } from '../../src/lang/checker';
import { parse } from '../../src/lang/parser';

/** Parse (asserting grammatical validity) and check a source string. */
function checkSource(source: string) {
  const { program, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return check(program);
}

function messages(source: string): string[] {
  return checkSource(source).diagnostics.map((d) => d.message);
}

const EXAMPLE = `fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;
    let px: &i32 = &x;
    let r = helper(x, px);
    helper(n, px);
}

fn main() {
    outer(7);
}
`;

describe('checker', () => {
  describe('valid programs', () => {
    it('accepts the reference example', () => {
      expect(messages(EXAMPLE)).toEqual([]);
    });

    it('accepts recursion and mutual recursion via forward references', () => {
      expect(
        messages(`fn main() { ping(3); }
fn ping(n: i32) { pong(n); }
fn pong(n: i32) { ping(n); }
`),
      ).toEqual([]);
    });

    it('accepts a tail expression as the return value', () => {
      expect(
        messages(`fn double(n: i32) -> i32 { n }
fn get() -> i32 { double(2) }
fn main() { let x = get(); }
`),
      ).toEqual([]);
    });

    it('accepts a unit function ending with a bare return', () => {
      expect(messages('fn main() { return; }')).toEqual([]);
    });

    it('accepts returning a reference', () => {
      expect(
        messages(`fn dangle() -> &i32 {
    let local = 1;
    return &local;
}
fn main() { let p = dangle(); }
`),
      ).toEqual([]);
    });
  });

  describe('entry point (rule 1)', () => {
    it('reports a missing main function', () => {
      const { diagnostics } = checkSource('fn helper() {}');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('`main` function not found');
    });

    it('reports main with parameters', () => {
      const { diagnostics } = checkSource('fn main(n: i32) {}');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        '`main` function has wrong signature: expected no parameters',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 9 });
    });

    it('reports main with a return type', () => {
      const { diagnostics } = checkSource('fn main() -> i32 { 1 }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        '`main` function has wrong signature: expected no return type',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 14 });
    });
  });

  describe('function declarations (rule 2)', () => {
    it('reports duplicate function names at the second declaration', () => {
      const { diagnostics } = checkSource(`fn main() {}
fn f() {}
fn f() {}
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'the name `f` is defined multiple times',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 3, column: 4 });
    });
  });

  describe('calls (rule 3)', () => {
    it('reports a call to an undeclared function', () => {
      const { diagnostics } = checkSource('fn main() { missing(); }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'cannot find function `missing` in this scope',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 13 });
    });

    it('reports an arity mismatch', () => {
      const { diagnostics } = checkSource(`fn f(a: i32, b: i32) {}
fn main() { f(1); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'this function takes 2 arguments but 1 argument was supplied',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 2, column: 13 });
    });

    it('reports argument type mismatches per argument', () => {
      const { diagnostics } = checkSource(`fn f(a: i32, p: &i32) {}
fn main() {
    let x = 1;
    let px = &x;
    f(px, x);
}
`);
      expect(diagnostics.map((d) => d.message)).toEqual([
        'mismatched types: expected `i32`, found `&i32`',
        'mismatched types: expected `&i32`, found `i32`',
      ]);
      expect(diagnostics[0].span.start).toMatchObject({ line: 5, column: 7 });
      expect(diagnostics[1].span.start).toMatchObject({ line: 5, column: 11 });
    });
  });

  describe('variable resolution (rule 4)', () => {
    it('reports an unknown variable', () => {
      const { diagnostics } = checkSource('fn main() { let x = y; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'cannot find value `y` in this scope',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 21 });
    });

    it('reports use of a variable declared later in the function', () => {
      const { diagnostics } = checkSource(`fn main() {
    let x = later;
    let later = 1;
}
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'cannot find value `later` in this scope',
      );
    });

    it('reports a duplicate let name', () => {
      const { diagnostics } = checkSource(`fn main() {
    let x = 1;
    let x = 2;
}
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'the name `x` is defined multiple times in this function',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 3, column: 9 });
    });

    it('reports a let shadowing a parameter', () => {
      const { diagnostics } = checkSource(`fn f(a: i32) { let a = 1; }
fn main() { f(1); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'the name `a` is defined multiple times in this function',
      );
    });

    it('reports duplicate parameter names', () => {
      const { diagnostics } = checkSource(`fn f(a: i32, a: i32) {}
fn main() { f(1, 2); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'identifier `a` is bound more than once in this parameter list',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 14 });
    });
  });

  describe('let type checking (rule 5)', () => {
    it('reports an annotation mismatching the initializer', () => {
      const { diagnostics } = checkSource('fn main() { let p: &i32 = 42; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `&i32`, found `i32`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 27 });
    });

    it('reports an annotation mismatching a call return type', () => {
      const { diagnostics } = checkSource(`fn get() -> i32 { 1 }
fn main() { let p: &i32 = get(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `&i32`, found `i32`',
      );
    });

    it('reports a let initialized by a unit-returning call', () => {
      const { diagnostics } = checkSource(`fn noop() {}
fn main() { let x = noop(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected a value, found `()`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 2, column: 21 });
    });

    it('includes the annotated type when a unit call initializes an annotated let', () => {
      const { diagnostics } = checkSource(`fn noop() {}
fn main() { let x: i32 = noop(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `i32`, found `()`',
      );
    });
  });

  describe('references (rule 6)', () => {
    it('reports taking a reference to a reference', () => {
      const { diagnostics } = checkSource(`fn f(p: &i32) { let pp = &p; }
fn main() {
    let x = 1;
    f(&x);
}
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `i32`, found `&i32`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 27 });
    });

    it('reports taking a reference to an unknown variable', () => {
      const { diagnostics } = checkSource('fn main() { let p = &nope; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'cannot find value `nope` in this scope',
      );
    });
  });

  describe('return discipline (rule 7)', () => {
    it('reports a value function that never returns a value', () => {
      const { diagnostics } = checkSource(`fn get() -> i32 { let x = 1; }
fn main() { let x = get(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `i32`, found `()`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 13 });
    });

    it('reports a bare return in a value function', () => {
      const { diagnostics } = checkSource(`fn get() -> i32 { return; }
fn main() { let x = get(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `i32`, found `()`',
      );
    });

    it('reports a value return in a unit function', () => {
      const { diagnostics } = checkSource('fn main() { return 1; }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `()`, found `i32`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 20 });
    });

    it('reports a return value of the wrong type', () => {
      const { diagnostics } = checkSource(`fn get() -> &i32 { return 1; }
fn main() { let p = get(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `&i32`, found `i32`',
      );
    });

    it('reports a value tail expression in a unit function', () => {
      const { diagnostics } = checkSource('fn main() { 42 }');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'mismatched types: expected `()`, found `i32`',
      );
      expect(diagnostics[0].span.start).toMatchObject({ line: 1, column: 13 });
    });

    it('reports statements after a return as unreachable', () => {
      const { diagnostics } = checkSource(`fn main() {
    return;
    let x = 1;
}
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unreachable statement');
      expect(diagnostics[0].span.start).toMatchObject({ line: 3, column: 5 });
    });

    it('reports a tail expression after a return as unreachable', () => {
      const { diagnostics } = checkSource(`fn get() -> i32 {
    return 1;
    2
}
fn main() { let x = get(); }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unreachable expression');
      expect(diagnostics[0].span.start).toMatchObject({ line: 3, column: 5 });
    });
  });

  describe('multiple diagnostics per run', () => {
    it('keeps checking after errors, across statements and functions', () => {
      expect(
        messages(`fn f() {
    let x = missing();
    let y = z;
}
fn g() -> i32 { let a = 1; }
`),
      ).toEqual([
        '`main` function not found',
        'cannot find function `missing` in this scope',
        'cannot find value `z` in this scope',
        'mismatched types: expected `i32`, found `()`',
      ]);
    });
  });

  describe('typed program output', () => {
    it('resolves inferred and annotated variable types per function', () => {
      const { diagnostics, checked } = checkSource(EXAMPLE);
      expect(diagnostics).toEqual([]);
      expect(checked.main?.name.name).toBe('main');

      const helper = checked.functions.get('helper')!;
      expect(helper.returnType).toBe('i32');
      expect(
        helper.variables.map(({ name, type, origin }) => ({
          name,
          type,
          origin,
        })),
      ).toEqual([
        { name: 'a', type: 'i32', origin: 'param' },
        { name: 'p', type: '&i32', origin: 'param' },
        { name: 'local', type: 'i32', origin: 'local' },
      ]);

      const outer = checked.functions.get('outer')!;
      expect(outer.returnType).toBeNull();
      expect(
        outer.variables.map(({ name, type, origin }) => ({
          name,
          type,
          origin,
        })),
      ).toEqual([
        { name: 'n', type: 'i32', origin: 'param' },
        { name: 'x', type: 'i32', origin: 'local' },
        { name: 'px', type: '&i32', origin: 'local' },
        { name: 'r', type: 'i32', origin: 'local' },
      ]);
    });
  });
});
