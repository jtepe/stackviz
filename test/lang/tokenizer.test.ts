import { tokenize } from '../../src/lang/tokenizer';

function kinds(source: string): string[] {
  return tokenize(source).tokens.map((t) => t.kind);
}

describe('tokenizer', () => {
  describe('keywords and identifiers', () => {
    it('recognizes the four keywords', () => {
      expect(kinds('fn let return i32')).toEqual([
        'fn',
        'let',
        'return',
        'i32',
        'eof',
      ]);
    });

    it('treats words merely containing keywords as identifiers', () => {
      const { tokens, diagnostics } = tokenize(
        'fnx lets returned i32x _foo _ a1_b2',
      );
      expect(diagnostics).toEqual([]);
      expect(tokens.map((t) => t.kind)).toEqual([
        'ident',
        'ident',
        'ident',
        'ident',
        'ident',
        'ident',
        'ident',
        'eof',
      ]);
      expect(tokens[0].text).toBe('fnx');
    });
  });

  describe('punctuation', () => {
    it('tokenizes all punctuation including the arrow', () => {
      expect(kinds('( ) { } , : ; -> & =')).toEqual([
        '(',
        ')',
        '{',
        '}',
        ',',
        ':',
        ';',
        '->',
        '&',
        '=',
        'eof',
      ]);
    });
  });

  describe('integer literals', () => {
    it('parses plain, negative, and underscore-separated literals', () => {
      const { tokens, diagnostics } = tokenize('42 -7 1_000 0 -1_2_3');
      expect(diagnostics).toEqual([]);
      expect(tokens.slice(0, -1).map((t) => t.value)).toEqual([
        42, -7, 1000, 0, -123,
      ]);
    });

    it('accepts the exact i32 bounds', () => {
      const { tokens, diagnostics } = tokenize('2147483647 -2147483648');
      expect(diagnostics).toEqual([]);
      expect(tokens[0].value).toBe(2147483647);
      expect(tokens[1].value).toBe(-2147483648);
    });

    it('reports literals just past the i32 bounds', () => {
      for (const source of ['2147483648', '-2147483649', '99999999999999']) {
        const { diagnostics } = tokenize(source);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe('literal out of range for `i32`');
        expect(diagnostics[0].span.start.column).toBe(1);
        expect(diagnostics[0].span.end.column).toBe(1 + source.length);
      }
    });

    it('reports an identifier glued onto a number as an invalid suffix', () => {
      const { diagnostics } = tokenize('123abc');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(
        'invalid suffix `abc` for number literal',
      );
    });
  });

  describe('comments', () => {
    it('skips line comments to the end of the line', () => {
      const { tokens, diagnostics } = tokenize('let // x = ; junk @\nfoo');
      expect(diagnostics).toEqual([]);
      expect(tokens.map((t) => t.kind)).toEqual(['let', 'ident', 'eof']);
      expect(tokens[1].span.start).toEqual({ offset: 20, line: 2, column: 1 });
    });

    it('skips block comments, including multi-line ones', () => {
      const { tokens, diagnostics } = tokenize('fn /* one\ntwo */ main');
      expect(diagnostics).toEqual([]);
      expect(tokens.map((t) => t.text)).toEqual(['fn', 'main', '']);
      expect(tokens[1].span.start).toEqual({ offset: 17, line: 2, column: 8 });
    });

    it('supports nested block comments, as in Rust', () => {
      const { tokens, diagnostics } = tokenize('/* a /* b */ c */ fn');
      expect(diagnostics).toEqual([]);
      expect(tokens.map((t) => t.kind)).toEqual(['fn', 'eof']);
    });

    it('reports an unterminated block comment', () => {
      const { diagnostics } = tokenize('fn /* oops');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unterminated block comment');
      expect(diagnostics[0].span.start.column).toBe(4);
    });
  });

  describe('errors', () => {
    it('reports unknown characters with their span', () => {
      const { diagnostics } = tokenize('fn @');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unknown start of token: `@`');
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].span.start).toEqual({
        offset: 3,
        line: 1,
        column: 4,
      });
      expect(diagnostics[0].span.end).toEqual({
        offset: 4,
        line: 1,
        column: 5,
      });
    });

    it('reports a `-` that starts neither an arrow nor a literal', () => {
      const { diagnostics } = tokenize('a - b');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unknown start of token: `-`');
    });

    it('reports a lone `/`', () => {
      const { diagnostics } = tokenize('a / b');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('unknown start of token: `/`');
    });
  });

  describe('spans', () => {
    it('assigns 1-based line/column spans with exclusive ends', () => {
      const { tokens } = tokenize('fn main\n  ()');
      const [fn, main, lparen, rparen] = tokens;
      expect(fn.span).toEqual({
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 2, line: 1, column: 3 },
      });
      expect(main.span).toEqual({
        start: { offset: 3, line: 1, column: 4 },
        end: { offset: 7, line: 1, column: 8 },
      });
      expect(lparen.span.start).toEqual({ offset: 10, line: 2, column: 3 });
      expect(rparen.span.start).toEqual({ offset: 11, line: 2, column: 4 });
    });

    it('ends with a zero-width eof token', () => {
      const { tokens } = tokenize('fn');
      const eof = tokens[tokens.length - 1];
      expect(eof.kind).toBe('eof');
      expect(eof.span.start).toEqual(eof.span.end);
    });
  });
});
