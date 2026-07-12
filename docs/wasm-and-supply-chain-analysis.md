# StackViz: WebAssembly Feasibility & Supply-Chain Security Analysis

Date: 2026-07-12

## 1. Can StackViz run in WebAssembly?

### Current architecture

StackViz is a pure client-side TypeScript/React single-page application built with Vite:

- `src/lang/` — tokenizer, parser, checker for the Rust-flavored pseudo language (pure TS, no I/O).
- `src/engine/` — the System V stack model and stepper (pure TS, no I/O).
- `src/ui/` — React components, CodeMirror editor, DOM rendering.

There is no native code, no Node-only API usage in `src/`, and the build output (`dist/`) is
static files that already run entirely in the browser. **The app already runs on the web
platform; WebAssembly would not enable anything that is currently impossible.**

### What "running in Wasm" would actually mean

TypeScript itself does not compile to WebAssembly, and Wasm modules have no DOM access, so
the React/CodeMirror UI layer must remain JavaScript regardless. The realistic conversion is
therefore a **hybrid**: rewrite the compute core (`src/lang` + `src/engine`, ~15 files of
pure logic) in a Wasm-targeting language and keep the UI in TS/React calling into it.

Verdict: **feasible, but a rewrite of the core, not a recompile.** The engine is a good
candidate shape-wise (pure functions, serializable state, no I/O), but it is small and fast
enough in JS that the motivation would be pedagogical (e.g., "the stack visualizer is itself
written in real Rust") rather than performance.

### Conversion plan (if pursued)

**Language/toolchain — Rust + wasm-bindgen (recommended).** The pseudo language is already
Rust-flavored, so a Rust port is thematically fitting. Alternative: AssemblyScript
(TS-like syntax, cheapest port of existing code, but weaker ecosystem).

1. **Code**
   - Create `engine-wasm/` Rust crate (`crate-type = ["cdylib"]`) porting `src/lang/*` and
     `src/engine/*`. Expose a small API via `wasm-bindgen`: `parse(source) -> Diagnostics`,
     `create_session(source)`, `step()/step_over()/step_out()/reset()`, and a
     `snapshot() -> JsValue` returning the same frame/slot state shape `src/ui/executionStore.ts`
     consumes today (serialize with `serde-wasm-bindgen` so the UI layer barely changes).
   - Keep the TS types in `src/engine/index.ts` as the interface contract; the UI keeps
     importing the same shapes.

2. **Build system**
   - Add `wasm-pack build --target web` (or the `vite-plugin-wasm` + `wasm-bindgen` flow) as a
     pre-step: `"build": "wasm-pack build engine-wasm --target web && tsc --noEmit && vite build"`.
   - Vite config: add `vite-plugin-wasm` and `vite-plugin-top-level-await`; the emitted
     `.wasm` is fingerprinted into `dist/` like any other asset. `base: './'` continues to work.
   - CI: install the Rust toolchain (`dtolnay/rust-toolchain`) with the `wasm32-unknown-unknown`
     target plus `wasm-pack`; cache `~/.cargo` and `target/`.
   - Tests: engine unit tests move to `cargo test` (native, fast); `vitest` keeps covering the
     UI against the Wasm module via jsdom (Node ≥ 20 loads Wasm fine) or against a TS mock.

3. **Run instructions** — unchanged for users: `npm install && npm run build`, serve `dist/`
   as static files; `npm run dev` still works (wasm-pack watch or a `predev` build step).
   One new constraint: the dev/preview server must serve `application/wasm` with the correct
   MIME type — Vite does this out of the box.

**Effort estimate:** the port is the dominant cost (tokenizer/parser/checker/stepper are
non-trivial); the build/CI wiring is roughly a day. Not recommended unless the Rust-core
angle is a goal in itself.

## 2. Supply-chain security posture

### Dependency footprint

- 335 packages in `package-lock.json`: **24 production**, 312 dev (49 optional/platform).
- Production runtime surface is small and reputable: React, ReactDOM, and six CodeMirror
  packages. Everything ships as static files — there is no server-side runtime to compromise.
- All lockfile entries resolve to `registry.npmjs.org` with `sha512` integrity hashes — no
  git/tarball/alternate-registry dependencies.
- Only two packages carry install scripts: `esbuild` and `fsevents` (both well-known; still,
  install scripts are the main npm-worm vector — see mitigations).

### Known vulnerabilities (`npm audit`, 2026-07-12)

**All five findings are in the dev toolchain; zero affect the shipped production bundle.**

| Package | Severity | Advisory | Exposure |
|---|---|---|---|
| vitest ≤3.2.5 | Critical | GHSA-5xrq-8626-4rwp — Vitest UI server allows arbitrary file read/execute | Only if `vitest --ui` server is run and exposed; not used in CI |
| vite ≤6.4.2 | High | GHSA-fx2h-pf6j-xcff — `server.fs.deny` bypass (Windows) | Dev server only |
| vite | Moderate | GHSA-4w7w-66w2-5vf9 — path traversal in optimized-deps `.map` handling | Dev server only |
| vite | Moderate | GHSA-v6wh-96g9-6wx3 — launch-editor NTLMv2 hash disclosure (Windows) | Dev server only |
| esbuild ≤0.24.2 | Moderate | GHSA-67mh-4wv8-2f99 — any website can query the dev server | Dev server only |

All are dev-server attack surface (a malicious website attacking a developer's local `npm run
dev` / `vitest --ui`). Remediation is a coordinated major upgrade: **vite 5 → 7/8 and
vitest 2 → 4** (which drags `@vitest/mocker`, `vite-node`, and esbuild forward). This is a
breaking-change bump (`npm audit fix --force` proposes vite 8.1.4 / vitest 4.1.10) but the
project's Vite usage is minimal (`vite.config.ts` is 15 lines), so migration risk is low.

### Gaps

1. CI (`.github/workflows/ci.yml`) runs `npm ci` + prettier + tests only — no audit, no lint
   step (despite a `lint` script existing), no dependency review on PRs.
2. No automated dependency updates (no Dependabot/Renovate config), so security bumps rely on
   humans noticing.
3. `npm ci` in CI executes lifecycle/install scripts by default — the primary execution vector
   in the 2024–2025 npm worm incidents.
4. GitHub Actions are pinned by tag (`actions/checkout@v4`), not by commit SHA — tags are
   mutable and were the vector in the `tj-actions` compromise.

### Recommendation A — separate dependency-audit CI job: **yes, straightforward**

Add an independent job (so audit failures don't block/obscure test results):

```yaml
  audit:
    name: Dependency audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm audit --omit=dev --audit-level=high   # gate on prod deps
      - run: npm audit --audit-level=critical           # gate on dev deps at critical only
        continue-on-error: false

  dependency-review:            # PRs only: flags newly-introduced vulnerable/malicious deps
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with: { fail-on-severity: high }
```

Splitting prod (`--omit=dev`, gate at high) from dev (gate at critical) keeps the signal
useful: dev-toolchain advisories won't permanently red-flag the build, while anything
touching the shipped bundle fails fast. Optionally add a weekly `schedule:` trigger so
advisories surface between PRs, and consider OSV-Scanner (`google/osv-scanner-action`) as a
second data source beyond the npm advisory DB.

### Recommendation B — dependency cooldown: **yes, two complementary mechanisms**

A cooldown (only adopt versions ≥ N days old) is the single most effective defense against
compromised-release attacks, which are typically detected and unpublished within days.

1. **At update time (Dependabot, native support):**

   ```yaml
   # .github/dependabot.yml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /
       schedule: { interval: weekly }
       cooldown:
         default-days: 7
         semver-major-days: 30
       groups:
         dev-tooling:
           dependency-type: development
   ```

   (Renovate equivalent: `minimumReleaseAge: "7 days"` — richer options if Renovate is
   preferred.)

2. **At install time (npm ≥ 11.6 / Node 22+ ships it):**

   ```ini
   # .npmrc
   minimum-release-age = 10080   # minutes = 7 days; applies when resolving new versions
   ignore-scripts = true          # also blocks install-script execution
   ```

   `ignore-scripts=true` is safe here: `esbuild` since ~0.18 works without its postinstall
   (falls back to `@esbuild/*` platform packages), and `fsevents` is macOS-only/optional.
   Verify once with a clean `npm ci && npm run build && npm test`.

Because `package-lock.json` is committed and CI uses `npm ci`, day-to-day builds are already
pinned; cooldown only governs *new* resolutions, which is exactly where the risk lives.

### Additional low-cost hardening

- Pin GitHub Actions to commit SHAs (`actions/checkout@<sha> # v4`).
- Add `permissions: { contents: read }` at the workflow top level (currently default-inherited).
- Run the existing `npm run lint` in CI while touching the workflow.
- After the vite/vitest major bump, re-run `npm audit` to confirm a clean baseline so the new
  audit job starts green.

### Bottom line

The production supply-chain posture is strong (8 direct runtime deps, static output, fully
pinned lockfile, npmjs-only sources). The real exposure is the dev toolchain: five known
advisories fixed by a vite/vitest major upgrade, plus missing automation. Adding the audit +
dependency-review jobs, a Dependabot cooldown, and `ignore-scripts` closes the meaningful gaps
in under an hour of work.
