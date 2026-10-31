import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const fx = (f: string) => path.join(import.meta.dirname, '..', 'fixtures', f);

test('loads, imports clips, edits, saves and exports a 1080p MP4', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.text()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'VlogUp' })).toBeVisible();
  await expect(page.getByTestId('install')).toBeVisible();
  const manifest = await page.request.get('manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();

  await page.getByTestId('new-vlog').click();
  await page.getByTestId('file-input').setInputFiles([fx('clipA.mp4'), fx('clipB.mp4'), fx('photo.png')]);
  await expect(page.getByTestId('clip')).toHaveCount(3, { timeout: 60_000 });
  await page.screenshot({ path: info.outputPath('editor.png') });

  // Templates tab lists the bundled templates (placeholder until M4).
  await page.locator('[data-tool=templates]').click();
  await expect(page.getByText('AI apply coming in M4')).toBeVisible();
  expect(await page.getByTestId('template').count()).toBeGreaterThanOrEqual(10);
  await page.locator('[data-tool=templates]').click();

  // Trim clip 1 to 2.0 s via the Trim panel.
  await page.getByTestId('clip').first().click();
  await page.locator('[data-tool=trim]').click();
  await page.getByTestId('trim-end').fill('2');
  // Split: seek the playhead into clip 2 by scrolling the timeline, then split.
  await page.locator('[data-tool=trim]').click();
  await page.getByTestId('timeline').evaluate((el) => { el.scrollLeft = 3 * 48; el.dispatchEvent(new Event('scroll')); });
  await page.locator('[data-tool=split]').click();
  await expect(page.getByTestId('clip')).toHaveCount(4);
  // Reorder: move last (photo) up one.
  await page.locator('[data-tool=order]').click();
  await page.getByRole('button', { name: 'Move up' }).last().click();
  await page.locator('[data-tool=order]').click();
  // Volume of selected clip.
  await page.locator('[data-tool=text]').click();
  await page.getByLabel('Text', { exact: true }).fill('Hello VlogUp');
  await page.getByLabel('Text', { exact: true }).blur();
  await page.getByLabel('Close panel').click();

  // BYO key stored locally only.
  await page.getByTestId('ai-settings').click();
  await page.getByTestId('ai-key').fill('xai-test-0000');
  await page.getByTestId('ai-save').click();
  const stored = await page.evaluate(() => localStorage.getItem('vlogup.ai.v1'));
  expect(stored).toContain('xai-test-0000');

  // Persistence across reload.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('clip')).toHaveCount(4, { timeout: 30_000 });

  // Play a bit.
  await page.getByTestId('play').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('play').click();
  await page.screenshot({ path: info.outputPath('preview.png') });

  // Export 1080p.
  await page.getByTestId('export').click();
  await page.getByTestId('export-start').click();
  await expect(page.getByTestId('export-done').or(page.getByTestId('export-error'))).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('export-error')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('export.png') });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const out = info.outputPath('out.mp4');
  await dl.saveAs(out);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out]).toString());
  const v = probe.streams.find((s: any) => s.codec_type === 'video');
  const a = probe.streams.find((s: any) => s.codec_type === 'audio');
  console.log('EXPORT', v.codec_name, v.width, v.height, a?.codec_name, probe.format.duration);
  expect(v.width * v.height).toBe(1920 * 1080);
  expect(a).toBeTruthy();
  // 2.0 (A trimmed) + 2.5 (B, split in two) + 3.0 (photo) = 7.5 s
  expect(Math.abs(parseFloat(probe.format.duration) - 7.5)).toBeLessThan(0.25);
  expect(errors).toEqual([]);
});
