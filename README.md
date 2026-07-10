# StackViz

An interactive web-based visualizer for call stacks on x86-64 System V. Write programs in a small Rust-flavored pseudo language, step through execution, and watch the stack frames animate as they push and pop.

## Purpose

StackViz teaches how stack frames are laid out under the x86-64 System V calling convention (unoptimized, -O0 style). It models function calls, argument passing (via registers rdi/rsi/rdx), frame alignment, saved return addresses, and stack overflow — all visualized byte-for-byte.

## Building

```bash
npm install
npm run build
```

The build outputs static files to `dist/`.

## Running

**Development:**

```bash
npm run dev
```

Opens a local dev server with hot reload.

**Preview:**

```bash
npm run preview
```

Serves the built app locally for testing.

**Tests:**

```bash
npm run test           # Run once
npm run test:watch     # Watch mode
```

**Linting & formatting:**

```bash
npm run lint           # Check code style (ESLint)
npm run format         # Apply formatting (Prettier)
```

## Project Structure

- `src/lang/` — Tokenizer, parser, AST, type checker, diagnostics
- `src/engine/` — Stack model, frame layout, calling convention, stepper
- `src/ui/` — React components (editor, stack visualizer, controls)
- `src/samples/` — Example programs
- `test/` — Unit tests (parser, layout, stepper)

## Tech Stack

- **React 18** + **TypeScript** for the UI
- **Vite** for bundling and dev server
- **CodeMirror 6** for syntax highlighting and editing
- **Vitest** for testing
- **ESLint** + **Prettier** for code quality

See `DESIGN.md` for the full language spec, semantics, and implementation details.
