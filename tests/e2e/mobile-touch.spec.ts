import { test, expect, devices, Page } from '@playwright/test';
import path from 'node:path';

/** Real-phone style run: Pixel 7 touch emulation, Android Chrome UA, 4× CPU throttling, tap() only. */
test.use({
  ...devices['Pixel 7'],
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
});

const fx = (f: string) => path.join(import.meta.dirname, '..', 'fixtures', f);

/** The element at the centre of `sel` must be `sel` itself (or inside it): nothing covers it. */
async function notCovered(page: Page, sel: string) {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return 'missing';
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const b = el.getBoundingClientRect();
    const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return t && (t === el || el.contains(t)) ? 'ok' : `covered by ${t?.outerHTML.slice(0, 100)}`;
  }, sel);
  expect(r, sel).toBe('ok');
}

async function swipe(page: Page, sel: string, dx: number) {
  const b = (await page.locator(sel).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = b.y + b.height / 2, x0 = b.x + b.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch: every control responds to taps; import, edit, chat, export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/import failed/.test(m.text())) errors.push(m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('./');
  await expect(page.getByTestId('home-version')).toContainText('v');
  for (const s of ['[data-testid=new-vlog]', '[data-testid=install]']) await notCovered(page, s);
  await page.getByTestId('new-vlog').tap();

  // Feedback with no clips.
  await page.getByTestId('export').tap();
  await expect(page.getByTestId('toast')).toContainText('Add a clip first');
  await page.locator('[data-tool=split]').tap();
  await expect(page.getByTestId('toast')).toContainText('Add a clip first');

  // Chat never fails silently.
  await page.getByTestId('chat-input').tap();
  await page.getByTestId('chat-input').fill('make it cinematic');
  await page.getByTestId('chat-send').tap();
  await expect(page.getByTestId('msg-user').last()).toHaveText('make it cinematic');
  await expect(page.getByTestId('msg-error').last()).toContainText('add your API key');
  await page.getByLabel('Resize AI chat').tap(); // half → full
  await page.getByLabel('Resize AI chat').tap(); // full → collapsed

  // Settings show the version; key stays local.
  await page.getByTestId('ai-settings').tap();
  await expect(page.getByTestId('app-version')).toContainText('VlogUp v');
  await page.getByTestId('ai-key').fill('xai-test');
  await page.getByTestId('ai-save').tap();
  expect(await page.evaluate(() => localStorage.getItem('vlogup.ai.v1'))).toContain('xai-test');

  // The visible ＋ buttons are not covered and open the native file chooser on tap.
  for (const s of ['[data-testid=empty-add]', '[data-testid=add-clips]']) await notCovered(page, s);
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.getByTestId('add-clips').tap()]);
  expect(fc.isMultiple()).toBe(true);
  await fc.setFiles([fx('clipA.mp4'), fx('clipB.mp4'), fx('photo.png'), fx('hevc.mp4')]);
  await expect(page.getByTestId('importing')).toHaveCount(0, { timeout: 60_000 });
  const n = await page.getByTestId('clip').count();
  expect(n).toBeGreaterThanOrEqual(3); // HEVC is either imported or reported, never stuck
  if (await page.getByTestId('import-report').count()) {
    await expect(page.getByTestId('import-report')).toContainText('HEVC');
    await page.getByRole('button', { name: 'OK', exact: true }).tap();
  }

  // Every tool-row button responds to a tap (panel opens or a toast explains).
  const tools = await page.locator('[data-tool]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tool')!));
  for (const t of tools) {
    const btn = page.locator(`[data-tool=${t}]`);
    await btn.scrollIntoViewIfNeeded();
    await notCovered(page, `[data-tool=${t}]`);
    await btn.tap();
    const panel = page.locator('.panel');
    const ok = await Promise.race([
      panel.waitFor({ timeout: 3000 }).then(() => true),
      page.getByTestId('toast').waitFor({ timeout: 3000 }).then(() => true),
    ]).catch(() => false);
    expect(ok, `tool ${t} gave no feedback`).toBe(true);
    if (await panel.count()) await page.getByLabel('Close panel').tap();
    if (t === 'delete') await page.getByLabel('Undo').tap();
    if (t === 'text') { /* text added → closed above */ }
  }

  // Timeline swipe with a finger moves the playhead; tap selects a clip; Trim with touch.
  await swipe(page, '[data-testid=timeline]', -150);
  await expect(page.locator('.tl-time b')).not.toHaveText('0:00.0');
  await page.getByTestId('clip').first().tap();
  await expect(page.locator('.tl-clip.sel')).toHaveCount(1);
  await page.locator('[data-tool=trim]').tap();
  await page.getByTestId('trim-end').fill('2');
  await page.getByLabel('Close panel').tap();

  // Play/pause by tapping the preview.
  await page.getByTestId('play').tap();
  await page.waitForTimeout(800);
  await page.getByTestId('preview').tap();

  // Export (720p to keep CI fast).
  await page.getByTestId('export').tap();
  await page.getByRole('button', { name: '720p' }).tap();
  await page.getByTestId('export-start').tap();
  await expect(page.getByTestId('export-done').or(page.getByTestId('export-error'))).toBeVisible({ timeout: 150_000 });
  const exportErr = await page.getByTestId('export-error').textContent().catch(() => null);
  if (exportErr) {
    // Only acceptable failure: the HEVC clip can't be decoded on this browser, explained clearly.
    expect(exportErr).toContain("can't decode");
    // Remove the HEVC clip (last) and export again → must succeed.
    await page.getByLabel('Close').tap();
    await page.getByTestId('clip').last().tap();
    await page.locator('[data-tool=delete]').tap();
    await page.getByTestId('export').tap();
    await page.getByRole('button', { name: '720p' }).tap();
    await page.getByTestId('export-start').tap();
    await expect(page.getByTestId('export-done')).toBeVisible({ timeout: 150_000 });
  }
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});
