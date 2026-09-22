import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfGame, CONFIG, sampleCrash } from '../src/game-engine.js';
const make = () => new SurfGame({ now: 0, random: () => .6 });
const atMultiplier = multiplier => CONFIG.waitingMs + Math.log(multiplier) / CONFIG.growth * 1000;

test('join and cancel refund once; duplicated actions cannot change balance', () => {
  const game = make(); assert.equal(game.join(10, 0).ok, true); assert.equal(game.balance, 990);
  assert.equal(game.join(10, 1).ok, false); assert.equal(game.balance, 990);
  assert.equal(game.cancel(2).ok, true); assert.equal(game.balance, 1000);
  assert.equal(game.cancel(3).ok, false); assert.equal(game.balance, 1000);
});
test('invalid, over-precision and unaffordable amounts never debit credits', () => {
  const game = make();
  for (const amount of [NaN, Infinity, -5, 0, 101, 1.001]) assert.equal(game.join(amount, 0).ok, false);
  assert.equal(game.balance, 1000); game.balance = 3; assert.equal(game.join(5, 0).ok, false); assert.equal(game.balance, 3);
});
test('cashout is paid only once and uses the displayed truncated multiplier', () => {
  const game = make(); game.setScenario(12); game.join(10, 0);
  const result = game.cashout(atMultiplier(2.357));
  assert.equal(result.ok, true); assert.equal(result.payout, 23.5); assert.equal(game.balance, 1013.5); assert.equal(game.best, 2.35);
  assert.equal(game.cashout(atMultiplier(2.4)).ok, false); assert.equal(game.balance, 1013.5);
  game.step(atMultiplier(12) + 1); assert.equal(game.records.length, 1); assert.equal(game.records[0].multiplier, 2.35);
  assert.equal(game.records[0].crash, 12); assert.equal(game.records[0].payout, 23.5);
});
test('cashout advances the clock, so an old frame cannot pay after crash', () => {
  const game = make(); game.setScenario(2.5); game.join(10, 0); game.step(atMultiplier(2));
  assert.equal(game.phase, 'riding'); assert.equal(game.cashout(atMultiplier(2.5) + .01).ok, false);
  assert.equal(game.balance, 990); assert.equal(game.bet.status, 'wiped'); assert.equal(game.records[0].payout, 0);
});
test('instant crash and cancel at launch do not refund a lost stake', () => {
  const game = make(); game.setScenario(1); game.join(10, 0);
  assert.equal(game.cancel(CONFIG.waitingMs).ok, false); assert.equal(game.phase, 'crashed');
  assert.equal(game.balance, 990); assert.equal(game.best, 0); assert.equal(game.history[0].multiplier, 1);
});
test('joining a stale waiting UI is rejected after launch', () => {
  const game = make(); assert.equal(game.join(10, CONFIG.waitingMs).ok, false); assert.equal(game.balance, 1000);
});
test('a wiped round cannot become a personal best and crew never cash out at the crash', () => {
  const game = make(); game.setScenario(1.5); game.crew[0].target = 1.5; game.crew[1].target = 1.25; game.join(5, 0);
  game.step(atMultiplier(1.5) + 1);
  assert.equal(game.best, 0); assert.equal(game.crew[0].status, 'wiped'); assert.equal(game.crew[1].status, 'cashed');
});
test('refresh refunds unsettled stake and preserves cashout without revealing future crash', () => {
  const game = make(); game.setScenario(12); game.join(10, 0);
  assert.equal(game.serialize().balance, 1000); game.cashout(atMultiplier(2.01));
  const saved = game.serialize(); assert.equal(saved.balance, game.balance); assert.equal(saved.records.length, 1); assert.equal(saved.records[0].crash, null);
  const restored = new SurfGame({ saved }); assert.equal(restored.balance, game.balance); assert.equal(restored.best, game.best); assert.equal(restored.records.length, 1);
});
test('scenario changes cannot alter a joined round; next round consumes it once', () => {
  const game = make(); game.setScenario(2.5); game.join(10, 0); game.setScenario(12); assert.equal(game.crash, 2.5);
  const end = atMultiplier(2.5) + 1; game.step(end); game.step(end + CONFIG.resultMs);
  assert.equal(game.phase, 'waiting'); assert.equal(game.crash, 12); assert.equal(game.nextScenario, null);
});
test('reset cannot cancel an active stake and cannot erase record history', () => {
  const game = make(); game.setScenario(1); game.join(10, 0); assert.equal(game.resetBalance(10), false);
  game.step(CONFIG.waitingMs); assert.equal(game.resetBalance(CONFIG.waitingMs + 1), true); assert.equal(game.balance, 1000); assert.equal(game.records.length, 1);
});
test('suspended frame resolves current wave once and starts a fresh lobby', () => {
  const game = make(); game.join(10, 0); game.step(1000000); assert.equal(game.phase, 'crashed'); assert.equal(game.records.length, 1);
  game.step(2000000); assert.equal(game.phase, 'waiting'); assert.equal(game.records.length, 1); assert.equal(game.round, 2);
});
test('demo distribution is bounded at exact RNG endpoints', () => {
  assert.equal(sampleCrash(() => 0), 1); assert.equal(sampleCrash(() => 1), 50); assert.equal(sampleCrash(() => .5), 1.98);
});
