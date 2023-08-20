import { existsSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// The dev container ships Chromium at a fixed path; CI downloads its own with `playwright install`.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  resolve: { dedupe: ['lit', '@lit/context'] },
  // Pre-bundle up front so Vite does not reload the page mid-run when it discovers them.
  optimizeDeps: {
    include: [
      'axe-core',
      'lit',
      'lit/directives/unsafe-svg.js',
      'lit/directives/if-defined.js',
      '@lit/context',
      'vitest/browser',
      'zod',
    ],
  },
  test: {
    include: ['test/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
