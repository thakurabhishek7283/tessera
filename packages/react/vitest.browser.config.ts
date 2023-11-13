import { existsSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'lit', '@lit/context'] },
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'lit', 'zod'],
  },
  test: {
    include: ['test/**/*.browser.test.{ts,tsx}'],
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
