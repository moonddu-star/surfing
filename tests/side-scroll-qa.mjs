import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('./artifacts/side-scroll/', import.meta.url), { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--dist'], { cwd: root, env: { ...process.env, PORT: '4193' }, stdio: ['ignore', 'pipe', 'pipe'] });
const timeout = setTimeout(() => { server.kill(); console.error('Graphics QA timeout'); process.exit(1); }, 180000);
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { if (String(data).includes('TIDELINE available')) resolve(); });
    server.on('error', reject); server.on('exit', code => reject(Error(`Graphics server exit ${code}`)));
  });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type.includes('webgl')) throw Error('2D scene requested WebGL');
      return original.call(this, type, ...args);
    };
  });
  await page.clock.install({ time: new Date('2026-10-15T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-15T00:00:01Z'));
  await page.goto('http://127.0.0.1:4193', { waitUntil: 'networkidle' });
  await page.clock.runFor(100);
  assert.equal(await page.locator('#ocean').getAttribute('data-renderer'), 'canvas');
  assert.equal(requests.some(url => /three|ocean-3d|water-material|surfer-rig/.test(url)), false);
  await page.locator('#scene-focus').click();
  assert.equal(await page.locator('#scene-focus').getAttribute('aria-pressed'), 'true');
  await page.locator('#demo-tools-toggle').click(); await page.locator('#scenario-select').selectOption('12'); await page.locator('#demo-tools-toggle').click();
  await page.locator('#ride-button').click(); await page.clock.fastForward(19000); await page.clock.runFor(100);
  assert.match(await page.locator('#ride-action').textContent(), /캐시아웃/);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#ocean-stage').screenshot({ path: 'tests/artifacts/side-scroll/desktop.jpg', type: 'jpeg', quality: 85 });
  const balance = await page.locator('#balance').textContent();
  await page.locator('#scene-focus').click();
  await page.setViewportSize({ width: 390, height: 900 }); await page.clock.runFor(100);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#ocean-stage').screenshot({ path: 'tests/artifacts/side-scroll/mobile.jpg', type: 'jpeg', quality: 85 });
  const canvas = await page.locator('#ocean').boundingBox(), label = await page.locator('#surfer-tag').boundingBox();
  assert.ok(label.x > canvas.x && label.x + label.width < canvas.x + canvas.width && label.y > canvas.y, 'Rider stays in mobile frame');
  assert.equal(await page.locator('#balance').textContent(), balance, 'Resizing cannot change an active stake');
  await page.locator('#ride-button').click();
  assert.match(await page.locator('#result-description').textContent(), /정산 완료/);
  assert.equal(await page.locator('#ride-button').isDisabled(), true);
  // Time changes the illustration; changing hidden outcomes must never be necessary.
  const animation = await page.evaluate(async () => {
    const { OceanScene } = await import('/src/ocean-scene.js');
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:800px;height:500px'; document.body.append(canvas);
    const scene = new OceanScene(canvas);
    const secret = () => { throw Error('Renderer accessed a hidden outcome'); };
    const crew = { name: 'Test', status: 'riding', color: '#d8f76d', get target() { return secret(); } };
    const state = { phase: 'riding', multiplier: 2, bet: { status: 'riding' }, crew: [crew], get crashAt() { return secret(); }, get crashPoint() { return secret(); } };
    scene.draw(1000, state); const first = canvas.toDataURL();
    scene.draw(2000, state); const second = canvas.toDataURL();
    scene.draw(2000, state); const repeated = canvas.toDataURL();
    scene.dispose(); canvas.remove();
    return { moving: first !== second, deterministic: second === repeated };
  });
  assert.deepEqual(animation, { moving: true, deterministic: true });
  assert.deepEqual(errors, []);
  console.log('2D graphics: no WebGL or Three.js, animation, public-state isolation, focus view, mobile resize and cashout passed.');
} finally { await browser?.close(); server.kill(); clearTimeout(timeout); }
