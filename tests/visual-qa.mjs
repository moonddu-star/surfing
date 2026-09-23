import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('./artifacts/visual/', import.meta.url));
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--dist'], { cwd: root, env: { ...process.env, PORT: '4192' }, stdio: ['ignore', 'pipe', 'pipe'] });
const timeout = setTimeout(() => { server.kill(); console.error('Visual QA timeout'); process.exit(1); }, 180000);
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { if (String(data).includes('TIDELINE available')) resolve(); });
    server.on('error', reject);
    server.on('exit', code => reject(Error(`Visual QA server exited ${code}`)));
  });
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const [width, theme, finish] of [[1440, 'daybreak', 'air'], [390, 'sunset', 'spray'], [1440, 'moonlight', 'barrel']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.clock.install({ time: new Date('2026-09-23T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-23T00:00:01Z'));
    await page.goto('http://127.0.0.1:4192', { waitUntil: 'networkidle' });
    await page.locator(`[data-theme="${theme}"]`).click();
    await page.locator('#finish-select').selectOption(finish);
    await page.locator('#demo-tools-toggle').click();
    await page.locator('#scenario-select').selectOption('12');
    await page.locator('#demo-tools-toggle').click();
    await page.clock.runFor(100);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${theme}-${width}-waiting.png`, fullPage: true });
    await page.locator('#ride-button').click();
    await page.clock.fastForward(22000); await page.clock.runFor(100);
    assert.equal(await page.locator('#ocean-stage').getAttribute('data-phase'), 'riding');
    assert.equal(await page.locator('#ocean').getAttribute('data-renderer'), 'webgl', 'Visual QA must exercise the 3D renderer');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${theme}-${width}-riding.png`, fullPage: true });
    const stage = await page.locator('#ocean-stage').boundingBox();
    const label = await page.locator('#surfer-tag').boundingBox();
    assert.ok(label.x >= stage.x && label.x + label.width <= stage.x + stage.width && label.y > stage.y, 'Surfer marker stays in the stage');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#ride-button').click();
    const balance = await page.locator('#balance').textContent();
    await page.clock.runFor(650);
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#ocean-stage').screenshot({ path: `${output}/${theme}-${finish}-finish.png` });
    assert.equal(await page.locator('#balance').textContent(), balance, 'Finish animation cannot change settlement');
    await page.clock.fastForward(11000); await page.clock.runFor(100);
    assert.equal(await page.locator('#ocean-stage').getAttribute('data-phase'), 'crashed');
    await page.locator('#ocean-stage').screenshot({ path: `${output}/${theme}-crash.png` });
    await page.clock.fastForward(4300); await page.clock.runFor(100);
    assert.equal(await page.locator('#ocean-stage').getAttribute('data-phase'), 'waiting');
    assert.equal(await page.locator('#surfer-tag').isVisible(), true, 'Surfer returns next round');
    assert.deepEqual(errors, []);
    console.log(`${theme} / ${finish} / ${width}px: ride, finish, settlement, crash, next-round reset passed`);
    await context.close();
  }

  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4192');
  const reduced = await page.evaluate(async () => {
    const { OceanScene } = await import('/src/ocean-scene.js');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:600px;height:460px'; document.body.append(canvas);
    const scene = new OceanScene(canvas);
    const state = { phase: 'riding', multiplier: 2, bet: { status: 'riding' }, crew: [] };
    scene.draw(1000, state); const first = scene.canvas.toDataURL();
    scene.draw(3000, { ...state, multiplier: 4 }); const second = scene.canvas.toDataURL();
    scene.onCashout(3000); state.bet.status = 'cashed';
    scene.draw(3100, state); const exitStart = scene.canvas.toDataURL();
    scene.draw(3700, state); const exitEnd = scene.canvas.toDataURL();
    scene.onCrash(4000); state.phase = 'crashed';
    scene.draw(4100, state); const crashStart = scene.canvas.toDataURL();
    scene.draw(4800, state); const crashEnd = scene.canvas.toDataURL();
    return { ride: first === second, exit: exitStart === exitEnd, crash: crashStart === crashEnd };
  });
  assert.deepEqual(reduced, { ride: true, exit: true, crash: true });
  console.log('Reduced motion: camera, water, rider, exit and crash stay static; passed');
  await page.close();
  console.log('Visual QA passed.');
} finally { await browser?.close(); server.kill(); clearTimeout(timeout); }
