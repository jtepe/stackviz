---
name: verify
description: Build, launch, and drive StackViz to verify changes end-to-end.
---

# Verifying StackViz

StackViz is a fully client-side Vite + React app; its surface is the browser.

## Launch

```bash
npm ci                                  # if node_modules is missing
npm run dev -- --port 5199 --strictPort # background it
```

## Drive (headless Chromium via Playwright)

Playwright is not a project dependency; install `playwright-core` in a
scratch directory and launch the pre-installed browser:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
```

Useful selectors: `.exec-toolbar button` (Step / Step over / Step out /
Run / Reset), `.status-badge`, `article.frame` (aria-label like
`main frame`), `.cm-step-line` (current-line highlight), `.run-notice`
(edit-reset notice), `.cm-content` (editor document).

## Gotchas

- Diagnostics re-check on a ~300 ms debounce: after typing into the
  editor, wait ~1 s before asserting the badge or clicking Run —
  otherwise you race the re-analysis.
- Typing `{`/`(` in CodeMirror auto-closes brackets; type closing
  brackets anyway (the editor types over them) and log `.cm-content`
  text when a program mysteriously fails to analyze.
- The editor persists to localStorage, so a fresh page in the same
  browser context reloads the last typed program, not the seed.
- The seed program finishes fast: Step → Step over → Step pops `main`
  and lands on `finished` with every control but Reset disabled.
