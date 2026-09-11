import type { DesignReviewRequest, Finding } from '../../src/domain/types';
import { test, expect, type Page, type Route, type Locator } from '@playwright/test';

const PRACTICE = 'lldpractice:practice';
async function start(page: Page, problem = 'Tic-Tac-Toe', language = 'java', full = false) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice low-level design' })).toBeVisible();
  const card = page.locator('article.problem').filter({ has: page.getByRole('heading', { name: problem, exact: true }) });
  await card.getByRole('button', { name: 'Open setup' }).click();
  await card.getByRole('radio', { name: full ? /Full practice/ : /Quick practice/ }).check();
  await card.getByRole('combobox', { name: 'Language', exact: true }).selectOption(language);
  await card.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('heading', { name: problem, exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this browser' })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  const ack = page.getByRole('checkbox', { name: /I acknowledge/ });
  if (await ack.isVisible()) await ack.check();
  await page.getByRole('button', { name: 'Save frozen submission' }).click();
  await expect(page.getByRole('button', { name: 'Evaluate submission' })).toBeVisible();
}
async function mockPlatform(page: Page) {
  const response = await page.request.get("/api/config");
  const config = await response.json();
  await page.route("**/api/config", route => route.fulfill({ json: { ...config, platformAvailable: true } }));
}
function reportFor(input: DesignReviewRequest) { // Transport fixtures deliberately exercise the real browser/domain validators.
  return { kind: 'report', report: { assessment: {
    criteria: ['requirements','responsibilities','relationships','behavior','tradeoffs'].map(criterionId => ({ criterionId, rating: 3, rationale: 'Supported by the frozen evidence.', evidence: [{ section: 'assumptions', field: '$section' }] })), strengths: [], findings: [], priorityFindingIds: [] }, marks: 37.5, configuration: input.input.configuration, evaluatedAt: new Date().toISOString() } };
}
async function fulfillReport(route: Route) {
  const input = route.request().postDataJSON();
  await route.fulfill({ json: { attemptId: input.attemptId, snapshotId: input.snapshotId, runId: input.runId, requestId: crypto.randomUUID(), data: reportFor(input) } });
}
function feedbackReportFor(input: DesignReviewRequest) {
  const base = reportFor(input);
  const evidence = [{ section: 'assumptions' as const, field: '$section' }];
  const findings: Finding[] = [
    ['00000000-0000-4000-8000-000000000001', 'First priority'],
    ['00000000-0000-4000-8000-000000000002', 'Second priority'],
    ['00000000-0000-4000-8000-000000000003', 'Third priority'],
    ['00000000-0000-4000-8000-000000000004', 'Remaining finding'],
    ['00000000-0000-4000-8000-000000000005', 'Non-priority finding'],
  ].map(([id, judgment]) => ({ id, criterionId: 'requirements', requirementIds: [], kind: 'not_demonstrated', evidence, judgment, consequence: `${judgment} consequence.`, suggestion: `${judgment} revision.` }));
  return { ...base, report: { ...base.report, assessment: { ...base.report.assessment,
    strengths: [{ text: 'The scope is explicit.', evidence }], findings,
    priorityFindingIds: findings.slice(0, 3).map(finding => finding.id),
  } } };
}
async function answerAll(page: Page) {
  await page.getByRole('tab', { name: /MCQs/ }).click();
  for (let i = 0; i < 20; i++) {
    await page.locator('.question input[type=radio]').first().check();
    if (i < 19) await page.getByRole('button', { name: /Next question|Continue to Problem OOP/ }).click();
  }
}
for (const problem of ['Tic-Tac-Toe', 'Snake and Ladder']) for (const language of ['java', 'python', 'cpp']) for (const full of [false, true]) {
  test(`${problem} ${language} ${full ? 'full' : 'quick'} browser journey`, async ({ page }) => {
    await mockPlatform(page);
    let calls = 0;
    await page.route('**/api/design/review', async route => { calls++; await fulfillReport(route); });
    await start(page, problem, language, full);
    if (full) await page.getByRole('textbox', { name: 'What is true before the first operation?', exact: true }).fill('One local session with explicit rule ownership.');
    else await expect(page.getByRole('tab', { name: 'Design', exact: true })).toHaveCount(0);
    await answerAll(page);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'MCQs · 20/20' })).toBeVisible();
    if (full) await expect(page.getByRole('textbox', { name: 'What is true before the first operation?', exact: true })).toHaveValue('One local session with explicit rule ownership.');
    await save(page);
    expect(calls).toBe(0);
    await page.getByRole('button', { name: 'Evaluate submission' }).click();
    await expect(page.getByRole('heading', { name: 'Answer review' })).toBeVisible();
    if (full) { await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible(); expect(calls).toBe(1); }
    await page.getByRole('button', { name: 'Create revision' }).click();
    await expect(page.getByRole('tab', { name: 'MCQs · 0/20' })).toBeVisible();
    if (full) await expect(page.getByRole('textbox', { name: 'What is true before the first operation?', exact: true })).toHaveValue('One local session with explicit rule ownership.');
    await page.locator('.left-nav').getByRole('link', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Compare with parent' }).click();
    await expect(page.getByRole('heading', { name: 'Revision comparison' })).toBeVisible();
  });
}

test('feedback leads with scores, strengths, three priorities, and focusable frozen evidence', async ({ page }) => {
  await mockPlatform(page);
  await page.route('**/api/design/review', async route => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: { attemptId: input.attemptId, snapshotId: input.snapshotId, runId: input.runId, requestId: crypto.randomUUID(), data: feedbackReportFor(input) } });
  });
  await start(page, 'Tic-Tac-Toe', 'java', true);
  await page.getByRole('textbox', { name: 'What is true before the first operation?', exact: true }).fill('Two local players share one board.');
  await save(page);
  await page.getByRole('button', { name: 'Evaluate submission' }).click();

  const feedback = page.locator('.feedback');
  await expect(feedback.getByRole('heading', { name: 'Priority improvements' })).toBeVisible();
  await expect(feedback.getByRole('heading', { name: 'Answer review' })).toBeVisible();
  await expect(feedback.getByText('Answer-key scored', { exact: true })).toBeVisible();
  await expect(feedback.getByText('0%', { exact: true })).toHaveCount(3);
  await expect(feedback.getByText('AI-assessed', { exact: true })).toBeVisible();
  await expect(feedback.locator('.feedback-priorities .finding')).toHaveCount(3);
  await expect(feedback.getByText('Remaining finding', { exact: true })).toBeHidden();
  await expect(feedback.getByText('Non-priority finding', { exact: true })).toBeHidden();
  expect(await feedback.locator('.scores, .feedback-strengths, .feedback-priorities, .feedback-rubric, .feedback-remaining').evaluateAll(elements => elements.map(element => element.className))).toEqual([
    'scores', 'feedback-strengths', 'feedback-priorities', 'feedback-rubric disclosure', 'feedback-remaining disclosure',
  ]);

  const evidenceAction = feedback.locator('.feedback-strengths').getByRole('button', { name: 'View frozen evidence' }).first();
  const targetId = await evidenceAction.getAttribute('aria-controls');
  expect(targetId).toMatch(/^frozen-evidence-[a-z0-9-]+-strength-0-0$/);
  await evidenceAction.click();
  await expect(page.locator(`#${targetId}`)).toBeFocused();
  await expect(page.locator(`#${targetId}`)).toContainText('Two local players share one board.');

  await feedback.getByText('Detailed rubric', { exact: false }).click();
  await expect(feedback.locator('.feedback-rubric .criteria article')).toHaveCount(5);
  await feedback.getByText('More findings · 2', { exact: true }).click();
  await expect(feedback.getByText('Remaining finding', { exact: true })).toBeVisible();
  await expect(feedback.getByText('Non-priority finding', { exact: true })).toBeVisible();
});

test('settings makes a personal key revealable and identifies Groq review handling', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Groq', { exact: true })).toBeVisible();
  await expect(page.getByText('openai/gpt-oss-120b', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Groq data controls' })).toHaveAttribute('href', 'https://console.groq.com/docs/your-data');
  await page.getByRole('radio', { name: /Use my own API key/ }).check();
  const key = page.getByLabel('Groq API key', { exact: true });
  await key.fill('gsk_visible_fixture');
  const reveal = page.getByRole('button', { name: 'Show key' });
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(key).toHaveAttribute('type', 'password');
  await reveal.click();
  await expect(page.getByRole('button', { name: 'Hide key' })).toHaveAttribute('aria-pressed', 'true');
  await expect(key).toHaveAttribute('type', 'text');
});

test('complete worksheet, scratchpad, generated UML, and structural deletion protection', async ({ page }) => {
  await start(page, 'Tic-Tac-Toe', 'java', true);
  await page.getByRole('textbox', { name: 'What is true before the first operation?', exact: true }).fill('Two local players; no network.');
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await expect(page.locator('#requirementHandling textarea')).toHaveCount(3);
  for (const field of await page.locator('#requirementHandling textarea').all()) await field.fill('Game validates the input before Board applies the change.');
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  for (const name of ['Game', 'Board']) {
    await page.getByRole('button', { name: 'Add class or interface' }).click();
    const item = page.locator('#classes > details').last();
    await item.locator('summary').click();
    await item.getByLabel('Class name', { exact: true }).fill(name);
    await item.getByLabel('What does this collaborator own?', { exact: true }).fill(name === 'Game' ? 'Owns turn and terminal status.' : 'Owns cells and board legality.');
    await item.getByRole('button', { name: 'Add field', exact: true }).click();
    await item.getByLabel('Field name', { exact: true }).fill('state');
    await item.getByLabel('Field type', { exact: true }).fill('State');
    await item.getByRole('button', { name: 'Add method', exact: true }).click();
    await item.getByLabel('Method name', { exact: true }).fill('move');
    await item.getByLabel('Return type', { exact: true }).fill('Result');
    await item.getByLabel('Contract: preconditions, outcome, rejected inputs').fill('Reject invalid moves without mutating state.');
  }
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await page.getByRole('button', { name: 'Add relationship', exact: true }).click();
  await page.getByRole('combobox', { name: 'Owner or source', exact: true }).selectOption({ label: 'Game' });
  await page.getByRole('combobox', { name: 'Collaborator or target', exact: true }).selectOption({ label: 'Board' });
  await page.getByRole('combobox', { name: 'Relationship kind', exact: true }).selectOption('composition');
  await page.getByLabel('How many?', { exact: true }).fill('1');
  await page.getByLabel('Why does this relationship exist?', { exact: true }).fill('Game owns one board for its lifetime.');
  for (const kind of ['normal', 'failure']) {
    await page.getByRole('button', { name: 'Next section', exact: true }).click();
    const section = page.locator(kind === 'normal' ? '#normalScenario' : '#failureScenario');
    await section.getByLabel('What scenario are you demonstrating?', { exact: true }).first().fill(kind);
    await section.getByRole('button', { name: `Add ${kind} step`, exact: true }).click();
    await section.getByRole('combobox', { name: 'Acting class', exact: true }).selectOption({ label: 'Game' });
    await section.getByRole('combobox', { name: 'Method', exact: true }).selectOption({ label: 'move' });
    await section.getByLabel('What happens?', { exact: true }).fill(kind === 'normal' ? 'Place X at (0,0)' : 'Place O in occupied cell');
    await section.getByLabel('What must be true afterward?', { exact: true }).fill(kind === 'normal' ? 'Turn advances to O' : 'State remains unchanged');
  }
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Back section', exact: true }).click();
  await page.locator('#classes > details').first().locator('summary').click();
  await expect(page.getByRole('button', { name: 'Remove class Game', exact: true })).toBeDisabled();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await page.getByLabel('What approach did you choose?').fill('Single game coordinator');
  await page.getByLabel('What credible alternative did you consider?').fill('Command per move');
  await page.getByLabel('Why is the choice right here, and what does it cost?').fill('Small scope favors simpler coordination; command history is unnecessary.');
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await page.getByRole('textbox', { name: 'Scratchpad note' }).fill('Private scratchpad sentinel');
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByText('Generated UML · from your worksheet', { exact: true }).click();
  await expect(page.locator('.uml article')).toHaveCount(2);
  await answerAll(page);
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByText('7 of 7 design sections complete')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /I acknowledge/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save frozen submission' }).click();
  await expect(page.getByRole('button', { name: 'Evaluate submission' })).toBeVisible();
});

test('answered and skipped clarification is frozen before final review', async ({ page }) => {
  await mockPlatform(page);
  let calls = 0;
  await page.route('**/api/design/review', async route => {
    const input = route.request().postDataJSON(); calls++;
    if (input.input.phase === 'final') {
      expect(input.input.answers.map((a: {status:string}) => a.status)).toEqual(['answered', 'skipped']);
      await fulfillReport(route); return;
    }
    await route.fulfill({ json: { attemptId: input.attemptId, snapshotId: input.snapshotId, runId: input.runId, requestId: crypto.randomUUID(), data: { kind: 'clarification', clarification: { id: crypto.randomUUID(), sessionId: input.input.sessionId, snapshotId: input.snapshotId, configuration: input.input.configuration, questions: [{ id: crypto.randomUUID(), text: 'Who rejects an occupied cell?', reference: { section: 'classes', field: '$section' } }, { id: crypto.randomUUID(), text: 'Who owns the turn?', reference: { section: 'classes', field: '$section' } }] } } } });
  });
  await start(page, 'Tic-Tac-Toe', 'python', true);
  await save(page); await page.getByRole('button', { name: 'Evaluate submission' }).click();
  await expect(page.getByRole('heading', { name: 'One clarification round' })).toBeVisible();
  await page.getByLabel('Your answer', { exact: true }).first().fill('Board checks occupancy; Game preserves the turn on rejection.');
  await page.getByLabel('Skip this question', { exact: true }).last().check();
  await page.getByRole('button', { name: 'Save answers & final review' }).click();
  await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible(); expect(calls).toBe(2);
  await page.reload(); await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible();
});

test('failed snapshot saves send zero evaluation requests', async ({ page }) => {
  let calls = 0; page.on('request', r => { if (/api\/(mcq\/score|design\/review)/.test(r.url())) calls++; });
  await start(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'lldpractice:practice' && value.includes('"status":"submitted"')) throw new DOMException('Quota exceeded', 'QuotaExceededError'); original.call(this, key, value); }; });
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('checkbox', { name: /I acknowledge/ }).check();
  await page.getByRole('button', { name: 'Save frozen submission' }).click();
  await expect(page.getByText(/Your draft remains editable/)).toBeVisible();
  await page.getByRole('tab', { name: /MCQs/ }).click();
  await expect(page.locator('.question input[type=radio]').first()).toBeEnabled(); expect(calls).toBe(0);
});

test('a received report survives local save failure without another provider request', async ({ page }) => {
  await mockPlatform(page); let calls = 0;
  await page.route('**/api/design/review', async route => { calls++; await fulfillReport(route); });
  await start(page, 'Tic-Tac-Toe', 'java', true); await save(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; (window as Window & { failResultSave?: boolean }).failResultSave = true; Storage.prototype.setItem = function(key, value) { if ((window as Window & { failResultSave?: boolean }).failResultSave && key === 'lldpractice:practice' && value.includes('"succeeded"')) throw new DOMException('Quota exceeded', 'QuotaExceededError'); original.call(this, key, value); }; });
  await page.getByRole('button', { name: 'Evaluate submission' }).click();
  await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry local save' })).toBeVisible();
  await page.evaluate(() => { (window as Window & { failResultSave?: boolean }).failResultSave = false; });
  await page.getByRole('button', { name: 'Retry local save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this browser' })).toBeVisible(); expect(calls).toBe(1);
});

test('ownership transfers only after the other tab closes', async ({ page, context }) => {
  await start(page); const url = page.url(); const other = await context.newPage(); await other.goto(url);
  await expect(other.getByText(/This tab is read-only/)).toBeVisible();
  await other.reload(); await expect(other.getByText(/This tab is read-only/)).toBeVisible();
  await expect(other.locator('.question input[type=radio]').first()).toBeDisabled();
  await page.close(); await other.getByRole('button', { name: 'Take over editing' }).click();
  await expect(other.locator('.question input[type=radio]').first()).toBeEnabled();
});

test('backup export, clear, restore, and corrupt storage recovery', async ({ page }) => {
  await start(page); await page.goto('/settings');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export practice data' }).click();
  const backup = await downloadEvent; const path = await backup.path(); expect(path).toBeTruthy();
  page.on('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Clear all local data' }).click();
  await expect(page.getByText('All local practice data cleared.', { exact: true })).toBeVisible();
  await page.getByLabel('Import backup', { exact: true }).setInputFiles(path!);
  await page.getByRole('button', { name: 'Replace practice with backup' }).click();
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  await page.goto('/history'); await expect(page.locator('.history-item')).toHaveCount(1);
  await page.evaluate(key => localStorage.setItem(key, '{broken'), PRACTICE); await page.reload();
  await expect(page.getByText(/Saved data could not be read/)).toBeVisible();
  await page.goto('/settings'); await page.getByLabel('Import backup', { exact: true }).setInputFiles(path!);
  await page.getByRole('button', { name: 'Replace practice with backup' }).click();
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
});

test('mobile keyboard workflow and desktop/mobile screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice low-level design' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile-catalogue.png', fullPage: true });
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  const target = page.locator('article.problem').first().getByRole('button', { name: 'Open setup' });
  for (let i = 0; i < 8 && !await target.evaluate(e => e === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(target).toBeFocused(); await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Tab'); // language
  await page.keyboard.press('Tab'); // start
  await expect(page.getByRole('button', { name: 'Start practice' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('tab', { name: /MCQs/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/mobile-workspace.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'artifacts/desktop-workspace.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const tabTo = async (target: Locator) => {
    for (let i = 0; i < 100 && !await target.evaluate(e => e === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
  };
  await tabTo(page.locator('.question input[type=radio]').first()); await page.keyboard.press('Space');
  await tabTo(page.getByRole('tab', { name: /MCQs/ })); await page.keyboard.press('ArrowRight');
  await tabTo(page.getByRole('checkbox', { name: /I acknowledge/ })); await page.keyboard.press('Space');
  await tabTo(page.getByRole('button', { name: 'Save frozen submission' })); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Evaluate submission' })).toBeVisible();
  await tabTo(page.getByRole('button', { name: 'Evaluate submission' })); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Answer review' })).toBeVisible();
  await tabTo(page.getByRole('button', { name: 'Create revision' })); await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'MCQs · 0/20' })).toBeVisible();
  await tabTo(page.getByRole('button', { name: 'Menu', exact: true })); await page.keyboard.press('Enter');
  await tabTo(page.locator('.mobile-nav').getByRole('link', { name: 'History', exact: true })); await page.keyboard.press('Enter');
  await expect(page.locator('.history-item')).toHaveCount(2);
  await tabTo(page.getByRole('button', { name: 'Compare with parent' })); await page.keyboard.press('Enter');
  await expect(page.locator('#comparison')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/desktop-history.png', fullPage: true });
});

for (const designFirst of [true, false]) test(`duplicate-safe independent response order: ${designFirst ? 'design first' : 'MCQ first'}`, async ({ page }) => {
  await mockPlatform(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(designFirst ? '**/api/mcq/score' : '**/api/design/review', async route => { await waiting; if (designFirst) await route.continue(); else await fulfillReport(route); });
  if (designFirst) await page.route('**/api/design/review', fulfillReport);
  await start(page, 'Snake and Ladder', 'cpp', true); await save(page);
  await page.getByRole('button', { name: 'Evaluate submission' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  if (designFirst) await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Answer review' })).toBeVisible();
  await expect(page.locator('.scores').first()).toContainText('Pending');
  release();
  await expect(page.getByText('37.5 / 150', { exact: true })).toBeVisible();
});

test('invalid evidence preserves MCQ success and explicit retry replaces only design', async ({ page }) => {
  await mockPlatform(page); let calls = 0;
  await page.route('**/api/design/review', async route => {
    calls++; const input = route.request().postDataJSON();
    if (calls > 1) { await fulfillReport(route); return; }
    const data = reportFor(input);
    data.report.assessment.criteria[0].evidence = [{ section: 'assumptions', field: 'nonexistent' }];
    await route.fulfill({ json: { attemptId: input.attemptId, snapshotId: input.snapshotId, runId: input.runId, requestId: crypto.randomUUID(), data } });
  });
  await start(page, 'Tic-Tac-Toe', 'java', true); await save(page);
  await page.getByRole('button', { name: 'Evaluate submission' }).click();
  await expect(page.getByRole('heading', { name: 'Answer review' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Design review failed' })).toBeVisible();
  await expect(page.getByText('37.5 / 50', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry design review' }).click();
  await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible(); expect(calls).toBe(2);
});

for (const action of ['clear', 'import']) test(`${action} during evaluation invalidates late results`, async ({ page }) => {
  await mockPlatform(page);
  let requestStarted!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { requestStarted = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/design/review', async route => { requestStarted(); await waiting; try { await fulfillReport(route); } catch { /* browser correctly cancelled request */ } });
  await start(page, 'Tic-Tac-Toe', 'java', true); await save(page);
  const backup = await page.evaluate(key => { const envelope = JSON.parse(localStorage.getItem(key)!); return JSON.stringify({ format: 'lldpractice-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), data: envelope.data }); }, PRACTICE);
  await page.getByRole('button', { name: 'Evaluate submission' }).click(); await started;
  await page.locator('.left-nav').getByRole('link', { name: 'Settings', exact: true }).click();
  if (action === 'clear') { page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Clear all local data' }).click(); }
  else { await page.getByLabel('Import backup', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) }); await page.getByRole('button', { name: 'Replace practice with backup' }).click(); await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible(); }
  release();
  await page.goto('/history');
  if (action === 'clear') await expect(page.getByText('No attempts saved on this browser.')).toBeVisible();
  else { await page.getByRole('link', { name: 'Open submission', exact: true }).click(); await expect(page.getByRole('button', { name: 'Evaluate submission' })).toBeVisible(); await expect(page.getByText('37.5 / 50', { exact: true })).toHaveCount(0); }
});

test('external conflict preserves unsaved work and exposes export/reload recovery', async ({ page, context }) => {
  await start(page); const other = await context.newPage(); await other.goto('/history');
  await other.evaluate(key => { const disk = JSON.parse(localStorage.getItem(key)!); disk.revision++; disk.writerId = crypto.randomUUID(); localStorage.setItem(key, JSON.stringify(disk)); }, PRACTICE);
  await expect(page.getByText(/Saved practice changed in another tab/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export backup', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload saved data', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take over editing' })).toHaveCount(0);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Reload saved data', exact: true }).click();
  await expect(page.locator('.question input[type=radio]').first()).toBeEnabled();
});

test('partial clearing identifies failed storage and suspends writes until retry', async ({ page }) => {
  await start(page); await page.goto('/settings');
  await page.evaluate(() => { const original = Storage.prototype.removeItem; (window as Window & { failClear?: boolean }).failClear = true; Storage.prototype.removeItem = function(key) { if ((window as Window & { failClear?: boolean }).failClear && key === 'lldpractice:practice') throw new Error('Removal denied'); original.call(this, key); }; });
  page.on('dialog', d => d.accept()); await page.getByRole('button', { name: 'Clear all local data' }).click();
  await expect(page.getByText(/Clearing was incomplete/)).toBeVisible();
  await page.locator('.left-nav').getByRole('link', { name: 'Practice', exact: true }).click();
  await expect(page.getByText(/Local removal failed/)).toBeVisible();
  await page.getByRole('button', { name: 'Open setup' }).first().click();
  await expect(page.getByRole('button', { name: 'Start practice' })).toBeDisabled();
  await page.goto('/settings');
  await page.evaluate(() => { (window as Window & { failClear?: boolean }).failClear = false; });
  await page.getByRole('button', { name: 'Clear all local data' }).click();
  await expect(page.getByText('All local practice data cleared.', { exact: true })).toBeVisible();
});

test('learner credentials are request-scoped, memory-only by default, and excluded from backups', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Use my own API key/ }).check();
  await page.getByLabel('Groq API key', { exact: true }).fill('gsk_browser_fixture_only');
  await page.getByRole('button', { name: 'Save key preference' }).click();
  expect(await page.evaluate(() => localStorage.getItem('lldpractice:credentials'))).not.toContain('gsk_browser_fixture_only');
  let sentKey: string | undefined;
  await page.route('**/api/design/review', async route => { sentKey = route.request().headers()['x-lld-provider-key']; expect(route.request().postDataJSON().credentialMode).toBe('user'); await fulfillReport(route); });
  // Client navigation keeps a memory-only credential alive for this browser session.
  await page.locator('.left-nav').getByRole('link', { name: 'Practice', exact: true }).click();
  const card = page.locator('article.problem').first(); await card.getByRole('button', { name: 'Open setup' }).click();
  await card.getByRole('radio', { name: /Full practice/ }).check();
  await card.getByRole('button', { name: 'Start practice' }).click(); await save(page);
  await page.getByRole('button', { name: 'Evaluate submission' }).click(); await expect(page.getByText('37.5 / 50', { exact: true })).toBeVisible();
  expect(sentKey).toBe('gsk_browser_fixture_only');
  expect(await page.evaluate(key => localStorage.getItem(key), PRACTICE)).not.toContain('gsk_browser_fixture_only');
  await page.goto('/settings'); await expect(page.getByLabel('Groq API key', { exact: true })).toHaveValue('');
  await page.getByLabel('Groq API key', { exact: true }).fill('gsk_browser_remember_fixture');
  await page.getByRole('checkbox', { name: 'Remember this key on this browser' }).check();
  await page.getByRole('button', { name: 'Save key preference' }).click(); await page.reload();
  await expect(page.getByLabel('Groq API key', { exact: true })).toHaveValue('gsk_browser_remember_fixture');
  await page.getByRole('button', { name: 'Forget key' }).click();
  expect(await page.evaluate(() => localStorage.getItem('lldpractice:credentials'))).not.toContain('gsk_browser_remember_fixture');
});

test('failed import during evaluation preserves original work with an explicit retry', async ({ page }) => {
  await mockPlatform(page); let requestStarted!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { requestStarted = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/design/review', async route => { requestStarted(); await waiting; try { await fulfillReport(route); } catch {} });
  await start(page, 'Tic-Tac-Toe', 'java', true); await save(page);
  await page.getByRole('button', { name: 'Evaluate submission' }).click(); await started;
  await page.locator('.left-nav').getByRole('link', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => { const original = Storage.prototype.setItem; (window as Window & { failImport?: boolean }).failImport = true; Storage.prototype.setItem = function(key, value) { if ((window as Window & { failImport?: boolean }).failImport && key === 'lldpractice:practice') throw new Error('Storage full'); original.call(this, key, value); }; });
  await page.getByLabel('Import backup', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'lldpractice-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { attempts: [] } })) });
  await page.getByRole('button', { name: 'Replace practice with backup' }).click();
  await expect(page.getByText(/Backup was not restored/)).toBeVisible(); release();
  await page.evaluate(() => { (window as Window & { failImport?: boolean }).failImport = false; });
  await page.getByRole('button', { name: 'Retry local save' }).click();
  await page.locator('.left-nav').getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('link', { name: 'Open submission', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Design review interrupted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry design review' })).toBeEnabled();
  await expect(page.getByText('37.5 / 50', { exact: true })).toHaveCount(0);
});

test('maximum-length learner identifiers stay inside mobile and tablet layouts', async ({ page }) => {
  await start(page, 'Tic-Tac-Toe', 'java', true);
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await page.getByRole('button', { name: 'Add class or interface' }).click();
  await page.locator('#classes > details').last().locator('summary').click();
  await page.getByRole('textbox', { name: 'Class name', exact: true }).fill('C'.repeat(120));
  await page.getByRole('button', { name: 'Add method', exact: true }).click();
  await page.getByRole('textbox', { name: 'Method name', exact: true }).fill('m'.repeat(120));
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/mobile-long-name.png', fullPage: true });
});
