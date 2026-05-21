const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const HTML_FILE  = '/Users/marinabensusan/Desktop/Light it Challenge/breathing_sphere.html';
const FRAMES_DIR = '/tmp/breathing_frames';
const OUTPUT     = '/Users/marinabensusan/Desktop/Light it Challenge/breathing_sphere.mp4';
const FPS        = 30;
const INTRO            = 2;   // "Tap to begin" screen
const BREATHING_DURATION = 46; // 4 cycles × 4 phases × 2875ms = 46s
const FINAL_SCREEN       = 5;  // static completion screen
const DURATION   = INTRO + BREATHING_DURATION + FINAL_SCREEN; // 53s total
const TOTAL_FRAMES = FPS * DURATION; // 1590
const INTRO_FRAMES = FPS * INTRO;    // 60
const VIEWPORT_W = 400;
const VIEWPORT_H = 800;
const DPR        = 2;            // HD 2x → 780 × 1688 px
const PHASE_MS   = 2875;         // 2875ms × 16 phases = 46s

async function main() {
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();

  // Inject virtual clock BEFORE page scripts run so RAF and performance.now are
  // fully controlled from the start (including the initial drawSphere RAF call).
  await page.addInitScript(() => {
    let _time = 0;
    const _rafQueue = [];

    window.__setTime = (t) => { _time = t; };
    window.__tickRAF = () => {
      const cbs = _rafQueue.splice(0);
      cbs.forEach(cb => cb(_time));
    };

    performance.now = () => _time;

    window.requestAnimationFrame = (cb) => {
      _rafQueue.push(cb);
      return _rafQueue.length;
    };
    window.cancelAnimationFrame = () => {};
  });

  // Patch PHASE_DURATION in the HTML source and write to a temp file
  // (setContent doesn't trigger addInitScript, so we use goto with a temp file)
  const rawHtml = fs.readFileSync(HTML_FILE, 'utf8');
  const patchedHtml = rawHtml.replace(
    /const PHASE_DURATION = \d+/,
    `const PHASE_DURATION = ${PHASE_MS}`
  );
  const TMP_HTML = '/tmp/breathing_patched.html';
  fs.writeFileSync(TMP_HTML, patchedHtml);
  await page.goto(`file://${TMP_HTML}`);

  const frameMs = 1000 / FPS;
  const start = Date.now();

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i * frameMs;

    await page.evaluate((time) => {
      window.__setTime(time);
      window.__tickRAF();
    }, t);

    const frameNum = String(i).padStart(5, '0');
    await page.screenshot({ path: `${FRAMES_DIR}/frame_${frameNum}.png` });

    // After the last intro frame, trigger breathing start
    if (i === INTRO_FRAMES - 1) {
      await page.evaluate(() => startBreathing());
    }

    if (i % 30 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const pct = ((i / TOTAL_FRAMES) * 100).toFixed(1);
      const eta = i > 0
        ? Math.round(((Date.now() - start) / i) * (TOTAL_FRAMES - i) / 1000)
        : '?';
      process.stdout.write(`\r  ${pct}%  frame ${i}/${TOTAL_FRAMES}  elapsed ${elapsed}s  ETA ~${eta}s   `);
    }
  }

  await browser.close();
  console.log('\n\nAll frames captured. Encoding...');

  execSync(
    `ffmpeg -y -framerate ${FPS} \
      -i "${FRAMES_DIR}/frame_%05d.png" \
      -c:v libx264 -preset slow -crf 16 \
      -pix_fmt yuv420p -movflags +faststart \
      "${OUTPUT}"`,
    { stdio: 'inherit' }
  );

  fs.rmSync(FRAMES_DIR, { recursive: true });
  console.log(`\nDone!  →  ${OUTPUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
