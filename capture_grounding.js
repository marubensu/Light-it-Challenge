const { chromium } = require('playwright');
const fs            = require('fs');
const { execSync }  = require('child_process');

const HTML_FILE  = '/Users/marinabensusan/Desktop/Light it Challenge/grounding.html';
const FRAMES_DIR = '/tmp/grounding_frames';
const OUTPUT     = '/Users/marinabensusan/Desktop/Light it Challenge/grounding.mp4';
const FPS        = 30;
const STEPS      = 5;
const STEP_S     = 4;                         // seconds per step
const STEP_MS    = STEP_S * 1000;             // 4000ms — patched into HTML
const FINAL_S    = 10;                        // completion screen (8s fill + 2s hold)
const DURATION   = STEPS * STEP_S + FINAL_S; // 30s total
const TOTAL_FRAMES = FPS * DURATION;          // 900
const VIEWPORT_W = 400;
const VIEWPORT_H = 800;
const DPR        = 2;                         // HD 2x → 800 × 1600 px

async function main() {
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();

  // Virtual clock — must run before ANY page script
  await page.addInitScript(() => {
    let _t = 0;
    const _q = [];
    window.__setTime  = (t) => { _t = t; };
    window.__tickRAF  = () => { const cbs = _q.splice(0); cbs.forEach(cb => cb(_t)); };
    performance.now   = () => _t;
    window.requestAnimationFrame  = (cb) => { _q.push(cb); return _q.length; };
    window.cancelAnimationFrame   = () => {};
  });

  // Patch STEP_MS so virtual clock advances each step in 4s
  const rawHtml = fs.readFileSync(HTML_FILE, 'utf8');
  const patchedHtml = rawHtml.replace(
    /const STEP_MS\s*=\s*\d+/,
    `const STEP_MS = ${STEP_MS}`
  );
  const TMP_HTML = '/tmp/grounding_patched.html';
  fs.writeFileSync(TMP_HTML, patchedHtml);
  await page.goto(`file://${TMP_HTML}`);

  const frameMs = 1000 / FPS;
  const wallStart = Date.now();

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i * frameMs;

    await page.evaluate((time) => {
      window.__setTime(time);
      window.__tickRAF();
    }, t);

    const pad = String(i).padStart(5, '0');
    await page.screenshot({ path: `${FRAMES_DIR}/frame_${pad}.png` });

    if (i % 30 === 0) {
      const elapsed = ((Date.now() - wallStart) / 1000).toFixed(0);
      const pct     = ((i / TOTAL_FRAMES) * 100).toFixed(1);
      const eta     = i > 0
        ? Math.round(((Date.now() - wallStart) / i) * (TOTAL_FRAMES - i) / 1000)
        : '?';
      process.stdout.write(`\r  ${pct}%  frame ${i}/${TOTAL_FRAMES}  elapsed ${elapsed}s  ETA ~${eta}s   `);
    }
  }

  await browser.close();
  console.log('\n\nFrames done. Encoding...');

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
