# StackViz — Interactive Call Stack Visualizer

## 1. Overview

StackViz is a fully client-side web application for visualizing the call
stack of a small Rust-flavored pseudo language. The user types a program
into a code editor; the app parses it, executes it step by step, and
renders the call stack as colored frames laid out the way an x86-64
System V stack actually looks in memory.

The layout follows Compiler Explorer: two side-by-side panels, source on
the left, visualization on the right.

### Goals

- Teach/illustrate how stack frames are laid out under the x86-64 System V
  calling convention (as an unoptimized compiler would emit them).
- Let the user step through execution and watch frames push and pop.
- Keep the language deliberately tiny so the stack is the star.

### Non-goals (for now)

- No arithmetic, control flow, heap, or dereferencing.
- No real code generation or execution — the "machine" is a model.
- No backend; the app ships as static files.

## 2. Decisions

These were settled explicitly during design review:

| Topic | Decision |
|---|---|
| Language flavor | A strict subset of Rust syntax (see §3); every valid StackViz program should look like plausible Rust |
| Frame detail | Byte-accurate (offsets, addresses, sizes, padding, saved RBP, return address) with a toggle to collapse to a simple logical view |
| Interaction | Step-through execution: step, step over, run, reset; current source line highlighted; frames animate on push/pop |
| Argument passing | -O0 style: args arrive in registers (rdi/rsi/rdx) and the prologue spills them into the callee's frame, so every frame visibly contains its arguments |
| Return values | Supported (§3, §4.4): scalar returns travel in `rax` |
| Tech stack | React + TypeScript + Vite; CodeMirror 6 for the editor; Vitest for tests |
| Calling convention | x86-64 System V, behind a `CallingConvention` interface so others (Windows x64, ARM AAPCS, cdecl) can be added later |
| Stack depth | Maximum 8 live frames; a 9th call is a visualized stack overflow |

Standing assumptions (raised during review, not objected to):

- Recursion, including mutual recursion, is allowed — it is the natural
  way to reach the frame limit. Forward references between functions are
  therefore legal.
- Two primitive types: `i32` (4 bytes, signed) and the reference `&i32`
  (8 bytes — a pointer at the machine level). The size mismatch makes
  alignment and padding visible in the frame layout.
- References are created only with `&variable`; no dereference, no
  reference-to-reference (`&&i32`), no arithmetic.

## 3. The pseudo language

A strict subset of Rust: every StackViz program is syntactically valid
Rust (module a few semantic liberties listed in §3.5), so Rust syntax
highlighting and user intuition carry over directly.

### 3.1 Example

```rust
fn helper(a: i32, p: &i32) -> i32 {
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
```

### 3.2 Grammar (EBNF)

```
program    := function+
function   := "fn" IDENT "(" [ params ] ")" [ "->" type ] block
params     := param { "," param }          // at most 3
param      := IDENT ":" type
type       := "i32" | "&" "i32"
block      := "{" { stmt } [ tailExpr ] "}"
stmt       := letStmt | callStmt | returnStmt
letStmt    := "let" IDENT [ ":" type ] "=" init ";"
init       := expr | callExpr
callStmt   := callExpr ";"
callExpr   := IDENT "(" [ args ] ")"
returnStmt := "return" [ expr ] ";"
tailExpr   := expr | callExpr              // Rust-style implicit return
args       := expr { "," expr }
expr       := INT_LITERAL | IDENT | "&" IDENT
```

- Line comments with `//`, block comments with `/* */`.
- Identifiers: Rust rules — `[A-Za-z_][A-Za-z0-9_]*`, excluding the
  keywords used here (`fn`, `let`, `return`, `i32`).
- `INT_LITERAL`: optional `-`, decimal digits, optional `_` separators
  (`1_000`); must fit in a signed 32-bit integer.
- The type annotation on `let` is optional, as in Rust; the type is
  inferred from the initializer (which always has a known type: literal
  → `i32`, `&x` → `&i32`, variable → its type, call → return type).
- Returning a value works either with `return expr;` or Rust-style as a
  trailing expression without a semicolon at the end of the body.
- A call may appear as a statement (result discarded, if any), as the
  entire initializer of a `let`, or as the tail expression — but not
  nested inside arguments (`foo(bar(x))` is invalid), keeping evaluation
  order trivial.

### 3.3 Static semantics

Checked after parsing; all violations are reported with line/column,
styled after rustc diagnostics:

1. A function named `main` with zero parameters and no return type must
   exist; it is the entry point.
2. Function names must be unique; at most 3 parameters per function.
3. Called functions must be declared somewhere in the program (forward
   references allowed). Call arity and argument types must match the
   declaration.
4. Variable references resolve to a parameter or an earlier `let` in the
   same function. Duplicate names within a function are an error (no
   shadowing — a deviation from Rust, see §3.5).
5. Types must match: an `i32` slot takes an int literal or an `i32`
   variable; an `&i32` slot takes `&x` (where `x: i32`) or an `&i32`
   variable. A `let` initialized by a call requires the callee's return
   type to match; calling a unit-returning function in a `let` is an
   error.
6. `&x` requires `x` to be a visible local or parameter of type `i32`.
7. Return discipline: since there is no control flow, a function with a
   declared return type must end with exactly one `return expr;` or a
   tail expression of the matching type, as its final element. A
   unit-returning function may end with a bare `return;` or nothing.
   A `return` anywhere but the last statement is an error (unreachable
   code).

### 3.4 Dynamic semantics

Execution is a straightforward tree walk over statements:

- `let` evaluates its initializer and writes the value into the local's
  stack slot.
- A call evaluates arguments in the caller, models the register handoff,
  pushes a new frame, spills the arguments into it, and executes the
  callee's body. On return (explicit `return`, tail expression, or the
  end of a unit body) the frame pops, the return value — if any —
  travels back in `rax`, and control returns to the call site: a
  `let`-call writes `rax` into the new local's slot, a statement-call
  discards it.
- Execution ends when `main`'s body ends.
- If a call would create a 9th live frame, execution halts in a
  **stack overflow** state (see §5.4).

### 3.5 Deviations from real Rust

Deliberate, in service of the visualization:

- **No borrow checker.** `&x` is syntactically a borrow but semantically
  a raw address-of. Returning `&local` is legal here and produces a
  visibly *dangling* reference once the frame pops (§4.2) — exactly the
  bug safe Rust exists to prevent, which makes it the app's best
  teaching moment.
- **No shadowing, no `mut`.** Locals are single-assignment and names are
  unique per function; there is no mutation at all.
- **Two types only.** `i32` and `&i32`; no `&&i32`, no other widths.
- **No nested call expressions**, no arithmetic, no control flow.

Everything the language *does* accept is valid Rust syntax, so the editor
can reuse an off-the-shelf Rust grammar for highlighting (§6.2).

## 4. Stack model (x86-64 System V, -O0 style)

### 4.1 Frame layout

Addresses are synthetic: the stack base starts at `0x7fffffffe000` and
grows downward. Each frame, from high to low addresses:

```
  higher addresses
┌──────────────────────────────┐
│ return address        (8 B)  │  pushed by `call`
├──────────────────────────────┤
│ saved RBP             (8 B)  │  pushed by prologue; RBP points here
├──────────────────────────────┤
│ spilled arg 1 … arg N        │  copied from rdi/rsi/rdx, in decl order
├──────────────────────────────┤
│ locals, in decl order        │
├──────────────────────────────┤
│ alignment padding (0–15 B)   │  so RSP is 16-byte aligned at call sites
└──────────────────────────────┘
  lower addresses ← RSP
```

- Slots are allocated downward from RBP, each aligned to its natural
  alignment (`i32`: 4, `&i32`: 8). Gaps created by alignment are
  rendered explicitly as padding.
- Every slot knows its RBP-relative offset (e.g. `-0x8`), absolute
  synthetic address, size, name, type, and current value.
- Frame size is rounded up so that `RSP % 16 == 0` at the point of the
  next `call` (System V requirement; the `call` then pushes 8 bytes,
  which the callee's `push rbp` rebalances).
- Argument slots are marked as such and show which register they arrived
  in (`rdi`, `rsi`, `rdx`).
- `main`'s frame sits on top of a small synthetic "runtime" boundary
  (its return address slot reads `<runtime>`).

### 4.2 Values

- `i32` slots display as signed decimal (hex on hover/toggle).
- `&i32` slots display the pointee's synthetic address and, since we
  know the model, a friendly annotation like `→ outer::x`. A reference
  to a popped frame's slot renders as **dangling** — see §3.5.
- Slots that exist but are not yet initialized (locals whose `let` hasn't
  executed) render as uninitialized (`??`), mirroring how the prologue
  reserves the whole frame up front.

### 4.3 The `CallingConvention` interface

The engine asks a convention object to lay out a frame; System V is the
only implementation for now:

```ts
interface CallingConvention {
  id: string;                       // "sysv-amd64"
  layoutFrame(fn: FunctionDecl): FrameLayout;   // slots, offsets, padding, size
  argumentRegisters: string[];      // ["rdi", "rsi", "rdx", ...]
  returnRegister: string;           // "rax"
  stackAlignment: number;           // 16
  redZone?: number;                 // 128 (informational)
}
```

Everything downstream (stepper, renderer) consumes `FrameLayout` and never
hardcodes System V details, so adding Windows x64 (shadow space, rcx/rdx/r8)
later is a new implementation plus a dropdown entry.

### 4.4 Return values

Per System V, a scalar return value (`i32` or `&i32` — both fit) travels
in `rax`; nothing about returning touches the stack layout. The model
tracks `rax` as a single named register value:

- During a **pop** transition of a value-returning function, the returned
  value is shown leaving the dying frame in an `rax` chip; if the call
  site was a `let`, the next step writes it into the caller's new local
  slot.
- Between calls `rax` is displayed as clobbered/undefined — a small
  honest detail that discourages reading meaning into stale values.
- Returning `&local` is legal and produces a reference that is
  **dangling** the moment its frame pops (§3.5, §4.2) — the classic
  return-address-of-local bug, visualized.

## 5. Execution engine

### 5.1 Stepper

The engine is a pure state machine: `step(state) -> state`, where state is
an immutable snapshot `{ frames, currentLocation, status }`. This makes
undo/redo and a future timeline scrubber trivial, and keeps rendering a
pure function of state.

Micro-steps per statement:

- `let` with a plain expression: one step — evaluate, write slot.
- call: two visible transitions — **push** (new frame appears with args
  spilled, locals uninitialized) and, after the body completes, **pop**
  (frame disappears, return value rides out in the `rax` chip, control
  returns to caller). For a `let`-call, the pop is followed by one more
  step that writes `rax` into the caller's slot. Prologue/epilogue are
  modeled inside these transitions, not stepped individually.
- `return` / tail expression: evaluates into `rax` and triggers the pop.

### 5.2 Controls

| Control | Behavior |
|---|---|
| Step | Advance one micro-step (into calls) |
| Step over | Run a call to completion, stop at next statement in current function |
| Step out | Run until the current frame pops |
| Run | Execute to completion (or to stack overflow), animating |
| Reset | Back to initial state (about to enter `main`) |

Editing the source while stepping resets execution (with a subtle notice).

### 5.3 Status

`status ∈ { editing/invalid, ready, running, finished, overflow }` — shown
as a small badge above the stack panel.

### 5.4 Stack overflow

When a call would push a 9th frame:

- The 8 existing frames remain rendered; a flashing "☠ stack overflow"
  marker appears below the last frame where the 9th would go.
- The offending call site is highlighted in the editor.
- Execution halts; only Reset is enabled.

## 6. Frontend

### 6.1 Layout

Compiler-Explorer-style split view (draggable divider):

```
┌────────────────────────┬──────────────────────────────┐
│  Editor (CodeMirror 6) │  Toolbar: step | over | out  │
│                        │  run | reset   [detail ⇄]    │
│  - syntax highlighting ├──────────────────────────────┤
│  - inline diagnostics  │  0x7fffffffe000              │
│  - current-line marker │  ┌─ main ──────────────┐     │
│  - call-site highlight │  │ ret addr  <runtime> │     │
│                        │  │ saved rbp           │     │
│                        │  │ x: i32 = 42   -0x4  │     │
│                        │  └─────────────────────┘     │
│                        │  ┌─ outer ─────────────┐     │
│                        │  │ ...                 │     │
│                        │  └─────────────────────┘     │
│                        │  ↓ stack grows downward      │
└────────────────────────┴──────────────────────────────┘
```

- Frames are stacked with **high addresses at the top**, new frames
  appearing below — matching real memory direction.
- Each function gets a stable color from a categorical palette; recursive
  activations of the same function share the hue with varying shade, and
  each frame shows a depth badge (`#3`) plus the call site it came from.
- Byte-accurate mode: each slot is a row with address, RBP offset, size,
  name/type, value; padding rows are visually distinct (hatched).
  The detail toggle collapses to logical mode: function name + `name = value`
  chips only.
- The active frame is emphasized; hovering a frame highlights its call
  site in the editor, hovering a call in the editor highlights the frame
  it created. Hovering an `&i32` value draws an arrow to the pointee
  slot.
- Push/pop animate (slide/fade, ~150 ms, disabled under
  `prefers-reduced-motion`).

### 6.2 Editor

- CodeMirror 6. Because the language is a strict Rust subset, the
  off-the-shelf `@codemirror/lang-rust` grammar provides highlighting
  for free; StackViz's own parser supplies the diagnostics.
- Diagnostics from the parser/checker as underlines + gutter markers,
  re-checked on a ~300 ms debounce, with rustc-flavored messages
  (e.g. ``cannot find value `x` in this scope``).
- A samples dropdown seeds the editor (basic calls, references & padding,
  return values, dangling `return &local`, recursion to exactly 8 frames,
  overflow demo).
- Program persisted to `localStorage`; a share button encodes it into the
  URL fragment.

### 6.3 State management

React + a small reducer/store (React `useReducer` or Zustand — decided at
implementation time by whichever stays simpler). The engine is
framework-free TypeScript; React only renders snapshots.

## 7. Project structure

```
stackviz/
  DESIGN.md
  src/
    lang/          # tokenizer, parser, AST, checker, diagnostics
    engine/        # values, frame layout, CallingConvention, sysv.ts, stepper
    ui/            # App, EditorPane, StackPane, Frame, Slot, Toolbar, StatusBadge
    samples/       # example programs
  test/            # vitest: lang + engine unit tests, layout golden tests
  index.html, vite.config.ts, package.json, tsconfig.json
```

`lang/` and `engine/` have no DOM or React dependencies and are covered by
unit tests (parser fixtures, layout golden tests asserting exact offsets,
padding, and frame sizes; stepper tests asserting push/pop sequences and
the overflow rule).

## 8. Milestones

1. **Scaffold** — Vite + React + TS project, lint/format, Vitest wired up.
2. **Language core** — tokenizer, parser, checker, diagnostics; tests.
3. **Engine** — System V frame layout + stepper + overflow; golden tests.
4. **UI shell** — split layout, CodeMirror with highlighting/diagnostics,
   static frame rendering from a snapshot.
5. **Interactivity** — step controls, line highlighting, hover linking,
   animations, detail toggle, samples, overflow visuals.
6. **Polish** — README, share links, reduced-motion support.

## 9. Future extensions (explicitly out of scope now)

- Additional calling conventions (Windows x64 shadow space is the most
  instructive contrast) via the `CallingConvention` interface.
- Arithmetic and dereference expressions; nested call expressions.
- More Rust types (`i64`, `bool`, `&&i32`), shadowing, `mut`.
- Red zone visualization, callee-saved register modeling.
- Timeline scrubber over the immutable snapshot history.
