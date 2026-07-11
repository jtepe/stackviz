# StackViz

An interactive web-based visualizer for call stacks on x86-64 System V. Write programs in a small Rust-flavored pseudo language, step through execution, and watch the stack frames animate as they push and pop.

## Purpose

StackViz teaches how stack frames are laid out under the x86-64 System V calling convention (unoptimized, -O0 style). It models function calls, argument passing (via registers rdi/rsi/rdx), frame alignment, saved return addresses, and stack overflow — all visualized byte-for-byte.

## What you're looking at

The right-hand panel is the call stack, drawn to scale. Addresses run from high at the top (`0x7fffffffe000`, the stack base) downward — the stack grows toward lower addresses as calls are made, so the newest frame is always at the bottom and marked **active**.

Each frame shows, from its base downward:

- **return address** — where execution resumes in the caller (or the runtime boundary for `main`).
- **saved rbp** — the caller's frame base, restored on return.
- **arguments** — the first three integer/pointer arguments arrive in registers `rdi`, `rsi`, `rdx`; each argument's register is shown as a badge.
- **locals** — variables declared with `let`.
- **padding** — hatched filler slots inserted to keep each frame 16-byte aligned.

Every slot lists its absolute address, its offset from the frame base (e.g. `-8`), and its size in bytes, so the layout is byte-accurate rather than schematic.

Additional cues:

- The **rax** chip tracks the return-value register: it's `clobbered` between calls and briefly holds a function's result as its frame pops.
- **References** (`&x`) draw an arrow to their pointee. When a referenced frame pops, the reference goes **dangling** and its arrow points into the void — the visualizer's model of a use-after-return.
- Recursing without a base case fills the stack until it hits the guard and reports a **stack overflow**.

Toggle between **bytes** (the byte-accurate view above) and **logical** (a compact variable-only view) with the buttons above the stack.

## Controls

Step through execution with the toolbar above the stack:

- **Step** — advance one micro-step.
- **Step over** — run a call to completion without descending into it.
- **Step out** — finish the current frame and return to its caller.
- **Run** — play through automatically until the program finishes or overflows.
- **Reset** — return to the start.

The toolbar is a keyboard-operable ARIA toolbar: `Tab` moves into it, then the arrow keys move between buttons and `Home`/`End` jump to the ends. The split divider is focusable and resizes with the left/right arrow keys.

## Samples & sharing

Pick a ready-made program — basic calls, references and padding, return values, a dangling reference, a deep call chain, or a stack-overflow demo — from the samples dropdown. Editing a program encodes it into the page URL, so any program (including your own edits) can be shared by copying the link.

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
