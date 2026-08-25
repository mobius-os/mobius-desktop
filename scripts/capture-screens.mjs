import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

const output = path.resolve('test-results/visual');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();

const captures = [
  ['first-run', 'http://127.0.0.1:4173/', 1180, 780],
  ['hosted', 'http://127.0.0.1:4173/?scenario=hosted', 1180, 780],
  ['local', 'http://127.0.0.1:4173/?scenario=local', 1180, 780],
  ['saved', 'http://127.0.0.1:4173/?scenario=home', 1180, 780],
  ['first-run-compact', 'http://127.0.0.1:4173/', 720, 900],
  ['local-compact', 'http://127.0.0.1:4173/?scenario=local', 720, 900],
];

for (const [name, url, width, height] of captures) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false });
  await page.close();
}

await browser.close();
console.log(`Captured ${captures.length} screenshots in ${output}`);
