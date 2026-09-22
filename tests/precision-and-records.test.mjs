import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfGame, CONFIG, displayedMultiplier, calculatePayout } from '../src/game-engine.js';

test('every exact hundredth from 1.00 to 50.00 displays without losing a hundredth', () => {
  for (let value = 100; value <= 5000; value++) assert.equal(displayedMultiplier(value / 100), value / 100);
  assert.equal(displayedMultiplier(2.01999), 2.01);
});
test('all supported cent amounts settle against integer arithmetic across representative multipliers', () => {
  for (let amount = 100; amount <= 10000; amount++) {
    for (const multiplier of [100, 101, 201, 205, 230, 255, 580, 642, 4999, 5000]) {
      assert.equal(calculatePayout(amount / 100, multiplier / 100), Math.floor(amount * multiplier / 100) / 100);
    }
  }
});
test('every permitted two-decimal stake cancels without balance drift', () => {
  const game = new SurfGame({ now: 0 });
  for (let minor = 100; minor <= 10000; minor++) {
    assert.equal(game.join(minor / 100, 0).ok, true);
    assert.equal(game.balance, (100000 - minor) / 100);
    assert.equal(game.cancel(0).ok, true); assert.equal(game.balance, 1000);
  }
});
test('decimal cashout credits exactly once and balance survives serialization', () => {
  const game = new SurfGame({ now: 0 }); game.setScenario(12); game.join(1.01, 0);
  game.cashout(CONFIG.waitingMs + Math.log(2.301) / CONFIG.growth * 1000);
  assert.equal(game.bet.multiplier, 2.3); assert.equal(game.bet.payout, 2.32); assert.equal(game.balance, 1001.31);
  assert.equal(new SurfGame({ saved: game.serialize() }).balance, 1001.31);
});
test('record history caps at 100 and wave history at 12 without duplicate finalization', () => {
  const game = new SurfGame({ now: 0 }); let now = 0;
  for (let round = 0; round < 105; round++) {
    game.setScenario(1); game.join(1, now); now += CONFIG.waitingMs; game.step(now); game.step(now + 1);
    now += CONFIG.resultMs; game.step(now);
  }
  assert.equal(game.records.length, 100); assert.equal(game.history.length, 12); assert.equal(game.balance, 895);
  assert.equal(new Set(game.records.map(record => record.round)).size, 100);
});
test('approved result is immediately available for logs with future crash omitted', () => {
  const game = new SurfGame({ now: 0 }); game.setScenario(12); game.join(10, 0); game.cashout(CONFIG.waitingMs + 1000);
  assert.equal(game.records.length, 0); assert.equal(game.serialize().records.length, 1); assert.equal(game.serialize().records[0].crash, null);
  game.step(100000); assert.equal(game.serialize().records.length, 1); assert.equal(game.serialize().records[0].crash, 12);
});
test('corrupt stored records and balances fall back without crashing', () => {
  const game = new SurfGame({ saved: { balance: -10, best: Infinity, records: [null, {}, { round: 1, status: 'unknown' }] } });
  assert.equal(game.balance, 1000); assert.equal(game.best, 0); assert.equal(game.records.length, 0);
});
