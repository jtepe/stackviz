// Scripted Helix editing session: mode switches, motions, search,
// undo/redo, and :w, asserting no dead or misrouted keys and a themed
// mode indicator.
//
// Run:
//   npm run dev -- --port 5199 --strictPort   (in the background)
//   npm install --no-save playwright-core     (not a project dependency)
//   node scripts/helix-demo.mjs [path-to-chromium]
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.argv[2],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const steps = [];
function check(name, ok, detail = '') {
  steps.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const modeBadge = () => page.locator('.cm-hx-status-panel > span').first();
const mode = () => modeBadge().textContent();
const lineCol = () =>
  page.locator('.cm-hx-status-panel > span').last().textContent();
const doc = () =>
  page.evaluate(() =>
    // internal but stable enough for a demo script: the content DOM node
    // links back to the EditorView, whose state holds the true document
    document
      .querySelector('.cm-content')
      .cmTile.root.view.state.doc.toString(),
  );

await page.addInitScript(() => localStorage.clear());
await page.goto('http://localhost:5199');
await page.waitForSelector('.cm-content');

await page.selectOption('select[aria-label="Keybindings"]', 'helix');
await page.waitForSelector('.cm-hx-status-panel');
check('helix statusline appears', true);
check('starts in NOR', (await mode()) === 'NOR', await mode());

const norColor = await modeBadge().evaluate((el) => getComputedStyle(el).color);
check(
  'mode indicator uses the app accent color',
  norColor === 'rgb(137, 180, 250)',
  norColor,
);
const panelBg = await page
  .locator('.cm-panels')
  .evaluate((el) => getComputedStyle(el).backgroundColor);
check(
  'statusline background matches the pane headers',
  panelBg === 'rgb(45, 45, 68)',
  panelBg,
);

await page.locator('.cm-content').click();

// Mode switches
await page.keyboard.press('i');
check('i enters INS', (await mode()) === 'INS', await mode());
await page.keyboard.type('// helix was here\n');
await page.keyboard.press('Escape');
check('Escape returns to NOR', (await mode()) === 'NOR', await mode());
check('insert-mode typing edited the doc', (await doc()).includes('// helix was here'));
await page.keyboard.press('v');
check('v enters SEL', (await mode()) === 'SEL', await mode());
const selColor = await modeBadge().evaluate((el) => getComputedStyle(el).color);
check(
  'SEL badge is recolored',
  selColor === 'rgb(203, 166, 247)',
  selColor,
);
await page.keyboard.press('Escape');
check('Escape leaves SEL', (await mode()) === 'NOR', await mode());

// Motions
await page.keyboard.press('g');
await page.keyboard.press('e');
const atEnd = await lineCol();
await page.keyboard.press('g');
await page.keyboard.press('g');
const atStart = await lineCol();
check(
  'ge / gg motions move the cursor',
  atStart === '1:1' && atEnd !== '1:1',
  `end=${atEnd} start=${atStart}`,
);
await page.keyboard.press('w');
check('w moves by word', (await lineCol()) !== '1:1', await lineCol());

// Search: helix prompt via /, and Mod-f routed to the same prompt
await page.keyboard.press('g');
await page.keyboard.press('g');
await page.keyboard.press('/');
const searchInput = page.locator('.cm-hx-command-panel input');
check('/ opens the helix search prompt', await searchInput.isVisible());
await searchInput.type('main');
await searchInput.press('Enter');
await page.waitForTimeout(200);
const selected = await page.evaluate(
  () => window.getSelection()?.toString() ?? '',
);
check('search selects the match', selected.includes('main'), selected);
await page.keyboard.press('Escape');
await page.keyboard.press('Control+f');
check(
  'Ctrl-f routes to helix search, not browser find',
  await searchInput.isVisible(),
);
await searchInput.press('Escape');
await page.waitForTimeout(200);
await page.locator('.cm-content').click();

// Undo/redo: u / U plus the routed Ctrl-z / Ctrl-y chords
const before = await doc();
await page.keyboard.press('g');
await page.keyboard.press('g');
await page.keyboard.press('i');
await page.keyboard.type('EDIT');
await page.keyboard.press('Escape');
const edited = await doc();
check('made an edit to undo', edited !== before);
await page.keyboard.press('u');
check('u undoes', (await doc()) === before);
await page.keyboard.press('Shift+U');
check('U redoes', (await doc()) === edited);
await page.keyboard.press('Control+z');
check('Ctrl-z routes to helix undo', (await doc()) === before);
await page.keyboard.press('Control+y');
check('Ctrl-y routes to helix redo', (await doc()) === edited);
await page.keyboard.press('Control+z');

// :w wired to the auto-save, with a saved notice
await page.evaluate(() => localStorage.removeItem('stackviz:program'));
await page.keyboard.press(':');
const cmdInput = page.locator('.cm-hx-command-panel input');
await cmdInput.type('w');
await cmdInput.press('Enter');
const notice = await page.locator('.cm-hx-command-panel').textContent();
check(':w shows a saved notice', notice.includes('saved'));
const saved = await page.evaluate(() =>
  localStorage.getItem('stackviz:program'),
);
check(
  ':w persisted the program',
  saved !== null && saved === (await doc()),
  saved === null ? 'null' : `${saved.length} chars`,
);

// Escape routing: a completion popup closes first, mode exits second
await page.waitForTimeout(200);
await page.locator('.cm-content').click();
await page.keyboard.press('i');
await page.keyboard.type('f');
await page.waitForTimeout(400);
const completionOpen = await page
  .locator('.cm-tooltip-autocomplete')
  .isVisible()
  .catch(() => false);
await page.keyboard.press('Escape');
if (completionOpen) {
  check(
    'Escape closes the completion popup and stays in INS',
    (await mode()) === 'INS',
    await mode(),
  );
  await page.keyboard.press('Escape');
}
check('Escape exits to NOR', (await mode()) === 'NOR', await mode());
await page.keyboard.press('u');

// Default profile still intact after switching back
await page.selectOption('select[aria-label="Keybindings"]', 'default');
check(
  'statusline removed in the default profile',
  (await page.locator('.cm-hx-status-panel').count()) === 0,
);

const failed = steps.filter((s) => !s.ok).length;
console.log(`\n${steps.length - failed}/${steps.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
