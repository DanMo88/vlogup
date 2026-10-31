import { test, expect, devices, Route } from '@playwright/test';
import path from 'node:path';

test.use({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const fx = (f: string) => path.join(import.meta.dirname, '..', 'fixtures', f);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

async function setup(page: import('@playwright/test').Page, provider = 'grok', key = 'xai-mock-key') {
  await page.goto('./');
  await page.evaluate(([p, k]) => localStorage.setItem('vlogup.ai.v1', JSON.stringify({ provider: p, keys: { [p]: k }, models: {} })), [provider, key]);
  await page.getByTestId('new-vlog').tap();
  await page.getByTestId('file-input').setInputFiles([fx('clipA.mp4'), fx('clipB.mp4'), fx('photo.png')]);
  await expect(page.getByTestId('clip')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByTestId('importing')).toHaveCount(0);
}

test('Grok (mocked) edits the timeline via tool calls, Persian prompt, Done + undo', async ({ page }) => {
  const bodies: any[] = [];
  await page.route('https://api.x.ai/v1/chat/completions', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON();
    bodies.push(body);
    expect(route.request().headers()['authorization']).toBe('Bearer xai-mock-key');
    const round = bodies.length;
    const msg = round === 1
      ? { role: 'assistant', content: null, tool_calls: [
          { id: 't1', type: 'function', function: { name: 'move_clip', arguments: JSON.stringify({ clip: '3', to_position: 1 }) } },
          { id: 't2', type: 'function', function: { name: 'add_text', arguments: JSON.stringify({ text: 'سفر پاریس', start: 0, end: 2.5, position: 'top', style: 'box', size: 'large' }) } },
          { id: 't3', type: 'function', function: { name: 'set_canvas', arguments: JSON.stringify({ aspect: '9:16' }) } },
          { id: 't4', type: 'function', function: { name: 'trim_clip', arguments: JSON.stringify({ clip: '99', start: 0, end: 1 }) } },
        ] }
      : { role: 'assistant', content: 'انجام شد: عکس اول شد، عنوان اضافه شد و فرمت ۹:۱۶ شد.' };
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 1200, completion_tokens: 80 } }) });
  });
  await setup(page);
  await page.getByTestId('chat-input').tap();
  await page.getByTestId('chat-input').fill('عکس رو اول بذار، عنوان «سفر پاریس» بالا اضافه کن و عمودی کن');
  await page.getByTestId('chat-send').tap();
  await expect(page.getByTestId('msg-user').last()).toContainText('سفر پاریس');
  await expect(page.getByTestId('done-chip')).toContainText('3 changes', { timeout: 20_000 });
  await expect(page.getByTestId('msg-bot').last()).toContainText('انجام شد');
  // The model got the timeline context, tools and the tool results (incl. a validation error for clip 99).
  expect(bodies[0].model).toBe('grok-4.7');
  expect(bodies[0].tools.map((t: any) => t.function.name)).toContain('trim_clip');
  expect(bodies[0].messages.at(-1).content).toContain('"clips"');
  const toolMsgs = bodies[1].messages.filter((m: any) => m.role === 'tool');
  expect(toolMsgs).toHaveLength(4);
  expect(toolMsgs[3].content).toContain('not found');
  // The edits are real: photo first, a text item, 9:16 canvas.
  await expect(page.getByTestId('clip').first()).toContainText('🖼');
  await expect(page.locator('.tl-text')).toContainText('سفر پاریس');
  await expect(page.getByTestId('preview')).toHaveClass(/a9x16/);
  await expect(page.getByTestId('cost')).not.toHaveText('$0.00');
  // Play from Done, then undo the whole AI run.
  await page.getByTestId('done-play').tap();
  await page.waitForTimeout(500);
  await page.getByTestId('play').tap();
  await page.getByLabel('Resize AI chat').tap();
  await page.getByRole('button', { name: '↶ Undo' }).tap();
  await expect(page.getByTestId('toast')).toContainText('Undid 3 AI changes');
  await expect(page.locator('.tl-text')).toHaveCount(0);
  await expect(page.getByTestId('preview')).toHaveClass(/a16x9/);
});

test('AI errors are shown clearly in chat (bad key, rate limit, network, no key)', async ({ page }) => {
  let mode: 'key' | 'rate' | 'net' = 'key';
  await page.route('https://api.x.ai/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (mode === 'net') return route.abort('failed');
    await route.fulfill({ status: mode === 'key' ? 401 : 429, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: mode === 'key' ? 'Incorrect API key' : 'Too many requests' } }) });
  });
  await setup(page);
  const ask = async (t: string) => { await page.getByTestId('chat-input').tap(); await page.getByTestId('chat-input').fill(t); await page.getByTestId('chat-send').tap(); };
  await ask('hello');
  await expect(page.getByTestId('msg-error').last()).toContainText('rejected the API key');
  mode = 'rate'; await ask('again');
  await expect(page.getByTestId('msg-error').last()).toContainText('rate limit');
  mode = 'net'; await ask('again');
  await expect(page.getByTestId('msg-error').last()).toContainText("Couldn't reach api.x.ai");
  await page.evaluate(() => localStorage.setItem('vlogup.ai.v1', JSON.stringify({ provider: 'grok', keys: {}, models: {} })));
  await ask('no key now');
  await expect(page.getByTestId('msg-error').last()).toContainText('add your API key');
});

test('Claude (mocked) works with the direct-browser-access header', async ({ page }) => {
  let n = 0;
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const hd = route.request().headers();
    expect(hd['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(hd['x-api-key']).toBe('sk-ant-mock');
    n++;
    const content = n === 1
      ? [{ type: 'tool_use', id: 'u1', name: 'set_volume', input: { clip: '1', muted: true } }]
      : [{ type: 'text', text: 'Muted clip 1.' }];
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ content, usage: { input_tokens: 900, output_tokens: 30 } }) });
  });
  await setup(page, 'claude', 'sk-ant-mock');
  await page.getByTestId('chat-input').tap();
  await page.getByTestId('chat-input').fill('mute the first clip');
  await page.getByTestId('chat-send').tap();
  await expect(page.getByTestId('done-chip')).toContainText('1 change', { timeout: 20_000 });
  await expect(page.getByTestId('clip').first()).toContainText('🔇');
});

test('real Grok call (only when XAI_API_KEY is set)', async ({ page }) => {
  test.skip(!process.env.XAI_API_KEY, 'no XAI_API_KEY');
  await setup(page, 'grok', process.env.XAI_API_KEY!);
  await page.getByTestId('chat-input').tap();
  await page.getByTestId('chat-input').fill('Move the photo to the start and add the title "Day 1" at the top for 2 seconds.');
  await page.getByTestId('chat-send').tap();
  await expect(page.getByTestId('done-chip').or(page.getByTestId('msg-error'))).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('done-chip')).toBeVisible();
});
