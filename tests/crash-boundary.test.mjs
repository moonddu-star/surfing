import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfGame, CONFIG } from '../src/game-engine.js';

test('every exact crash boundary from 1.00 to 50.00 rejects cashout', () => {
  for (let minor = 100; minor <= 5000; minor++) {
    const game = new SurfGame({ now: 0 }); const crash = minor / 100;
    game.setScenario(crash); game.join(1, 0);
    assert.equal(game.cashout(CONFIG.waitingMs + Math.log(crash) / CONFIG.growth * 1000).ok, false, `Crash tie at ${crash}`);
    assert.equal(game.balance, 999);
  }
});
test('cashout immediately before crash remains approved and immutable', () => {
  for (const crash of [1.28, 1.3, 2.01, 2.3, 6.42, 12, 50]) {
    const game = new SurfGame({ now: 0 }); game.setScenario(crash); game.join(1.01, 0);
    const boundary = CONFIG.waitingMs + Math.log(crash) / CONFIG.growth * 1000;
    assert.equal(game.cashout(boundary - .01).ok, true);
    const balance = game.balance; game.step(boundary);
    assert.equal(game.balance, balance); assert.equal(game.records[0].status, 'cashed');
  }
});
