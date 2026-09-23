import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('./artifacts/3d/', import.meta.url), { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs','--dist'], { cwd: root, env: { ...process.env, PORT: '4193' }, stdio: ['ignore','pipe','pipe'] });
const timeout = setTimeout(() => { server.kill(); console.error('Graphics QA timeout'); process.exit(1); }, 180000);
let browser;
try {
  await new Promise((resolve,reject) => { server.stdout.on('data',data=>{if(String(data).includes('TIDELINE available'))resolve();});server.on('error',reject);server.on('exit',code=>reject(Error(`Graphics server exit ${code}`))); });
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-09-23T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-23T00:00:01Z'));
  await page.goto('http://127.0.0.1:4193', { waitUntil: 'networkidle' });
  await page.clock.runFor(100);
  assert.equal(await page.locator('#ocean').getAttribute('data-renderer'),'webgl','WebGL shader pipeline must render without silently falling back');
  await page.locator('#scene-focus').click();
  assert.equal(await page.locator('#scene-focus').getAttribute('aria-pressed'),'true');
  await page.locator('#demo-tools-toggle').click(); await page.locator('#scenario-select').selectOption('12'); await page.locator('#demo-tools-toggle').click();
  await page.locator('#ride-button').click(); await page.clock.fastForward(19000); await page.clock.runFor(100);
  assert.match(await page.locator('#ride-action').textContent(),/캐시아웃/);
  await page.evaluate(()=>scrollTo(0,0));
  await page.locator('#ocean-stage').screenshot({ path: 'tests/artifacts/3d/cinematic-desktop.jpg', type: 'jpeg', quality: 90 });
  await page.locator('#scene-focus').click();
  await page.setViewportSize({ width: 390, height: 900 }); await page.clock.runFor(100);
  await page.evaluate(()=>scrollTo(0,0));
  await page.locator('#ocean-stage').screenshot({ path: 'tests/artifacts/3d/cinematic-mobile.jpg', type: 'jpeg', quality: 90 });
  const canvas = await page.locator('#ocean').boundingBox();
  const label = await page.locator('#surfer-tag').boundingBox();
  assert.ok(label.x>canvas.x && label.x+label.width<canvas.x+canvas.width,'3D rider stays in mobile frame');
  // Losing graphics must not cancel, refund or double-settle an active ride.
  const balance = await page.locator('#balance').textContent();
  await page.locator('#ocean').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>document.querySelector('#ocean').dataset.renderer==='canvas');
  await page.clock.runFor(100);
  assert.equal(await page.locator('#balance').textContent(),balance);
  await page.locator('#ride-button').click();
  assert.match(await page.locator('#result-description').textContent(),/정산 완료/);
  assert.equal(await page.locator('#ride-button').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('WebGL: shaders, reflection, focus view, desktop/mobile framing, live context-loss fallback and settlement passed.');
  await page.close();

  const fallback = await browser.newPage();
  await fallback.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
  });
  await fallback.goto('http://127.0.0.1:4193',{waitUntil:'networkidle'});
  assert.equal(await fallback.locator('#ocean').getAttribute('data-renderer'),'canvas');
  await fallback.locator('#ride-button').click();
  assert.equal(await fallback.locator('#balance').textContent(),'990.00');
  console.log('WebGL unavailable: automatic Canvas fallback and join passed.');
  await fallback.close();
} finally { await browser?.close();server.kill();clearTimeout(timeout); }
