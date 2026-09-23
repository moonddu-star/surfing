import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('./artifacts/qa/', import.meta.url));
await mkdir(output, { recursive: true });
const port = 4191;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--dist'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('QA server start timeout')), 10000);
  server.stdout.on('data', data => { if (String(data).includes('TIDELINE available')) { clearTimeout(timer); resolve(); } });
  server.on('error', reject); server.on('exit', code => { if (code) reject(Error(`QA server exited ${code}`)); });
});
const timeout = setTimeout(() => { server.kill(); console.error('QA matrix timeout'); process.exit(1); }, 240000);
const summaries = [];
try {
  for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-09-22T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-09-22T00:00:01Z'));
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
      for (const width of [320, 360, 390, 520, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 }); await page.clock.runFor(100);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
        const pixels = await page.locator('#ocean').evaluate(canvas => (() => { if (canvas.dataset.renderer === 'webgl') { const gl = canvas.getContext('webgl2'); const p = new Uint8Array(4); gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; } return [...canvas.getContext('2d').getImageData(10, 10, 1, 1).data]; })());
        assert.equal(pixels[3], 255, `${name} ${width}px canvas must paint`);
        if ([320, 768, 1440].includes(width)) await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      }
      await page.locator('#bet-amount').fill('0'); await page.locator('#ride-button').click();
      assert.equal(await page.locator('#balance').textContent(), '1,000.00');
      await page.locator('#demo-tools-toggle').click(); await page.locator('#scenario-select').selectOption('12'); await page.locator('#demo-tools-toggle').click();
      await page.locator('#bet-amount').fill('1.01'); await page.locator('#ride-button').click();
      assert.equal(await page.locator('#balance').textContent(), '998.99');
      await page.clock.fastForward(8200);
      await page.locator('[data-view="records"]').click();
      assert.equal(await page.locator('#play-view').isVisible(), true, 'Active ride must keep cashout available');
      await page.setViewportSize({ width: 768, height: 900 }); await page.clock.runFor(100);
      await page.evaluate(() => scrollTo(0, 0));
      const box = await page.locator('#ride-button').boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 900, `${name} tablet live CTA`);
      await page.locator('#ride-button').click();
      const beforeReload = await page.locator('#balance').textContent();
      await page.locator('[data-view="records"]').click();
      assert.equal(await page.locator('#record-table tr').count(), 1, 'Approved cashout appears immediately');
      assert.match(await page.locator('#record-table').textContent(), /진행 중/);
      await page.reload({ waitUntil: 'networkidle' }); await page.clock.runFor(100);
      assert.equal(await page.locator('#balance').textContent(), beforeReload);
      await page.locator('[data-view="records"]').click(); assert.match(await page.locator('#record-table').textContent(), /종료 미확인/);
      await page.locator('#back-to-play').click();
      await page.locator('#help-button').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#info-dialog').isVisible(), false);
      await page.locator('#sound-button').click(); await page.clock.fastForward(2200);
      if (await page.locator('#sound-button').getAttribute('aria-pressed') === 'true') {
        await page.locator('#sound-button').click(); await page.clock.fastForward(2200);
        assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false');
      } else assert.match(await page.locator('#toast').textContent(), /사운드를 사용할 수 없어요/);
      assert.deepEqual(errors, []); summaries.push(`${name}: seven widths, painted canvas, validation, decimal stake, tablet CTA, immediate log, reload, keyboard dialog, sound; passed`);
      console.log(summaries.at(-1));
      await context.close();
      const privateContext = await browser.newContext();
      await privateContext.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage unavailable'); } }); });
      const privatePage = await privateContext.newPage(); const privateErrors = [];
      privatePage.on('pageerror', error => privateErrors.push(error.message));
      await privatePage.goto(`http://127.0.0.1:${port}`); await privatePage.locator('#ride-button').click();
      assert.equal(await privatePage.locator('#balance').textContent(), '990.00'); assert.deepEqual(privateErrors, []);
      console.log(`${name}: unavailable localStorage fallback passed`);
    } finally { await browser.close(); }
  }
  console.log('Full QA matrix passed.');
} finally { clearTimeout(timeout); server.kill(); }
