// Captures the README screenshots from the built playground. Usage: `pnpm screenshots`.
// Starts `vite preview` itself, so the playground must already be built (`pnpm build`).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = spawn('pnpm', ['--filter', 'playground', 'preview'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 760 },
      colorScheme: scheme,
    });
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto(url);
    await second.goto(url);
    const add = first.getByRole('button', { name: /^Add 1$/ });
    await add.waitFor();
    for (let i = 0; i < 3; i++) await add.click();
    await first.getByText('2 tabs open').waitFor();
    await first.screenshot({
      path: new URL(`../docs/media/playground-${scheme}.png`, import.meta.url).pathname,
    });
    await context.close();
  }
  await browser.close();
} finally {
  stop();
}
