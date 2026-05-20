const { chromium } = require('playwright');
const fs = require('fs');

const HTML_FILE = '/Users/marinabensusan/Downloads/grounding.html';
const OUT_DIR   = '/Users/marinabensusan/Desktop/Light it Challenge/senses';

const STEPS = ['01_see', '02_touch', '03_hear', '04_smell', '05_taste'];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 400, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`file://${HTML_FILE}`);

  // Step 1 auto-starts — wait for icon to fade in
  await page.waitForTimeout(600);

  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: `${OUT_DIR}/${STEPS[i]}.png` });
    console.log(`Saved ${STEPS[i]}.png`);

    if (i < 4) {
      // Click "Got it" to advance to next step
      await page.click('#primaryBtn');
      await page.waitForTimeout(700); // wait for fade-in
    }
  }

  await browser.close();
  console.log('\nDone! →', OUT_DIR);
}

main().catch(err => { console.error(err); process.exit(1); });
