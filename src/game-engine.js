export const CONFIG = Object.freeze({ waitingMs: 8000, resultMs: 4200, growth: 0.105, maxMultiplier: 50, startingBalance: 1000, minBet: 1, maxBet: 100 });
const cents = value => Math.floor((value + Number.EPSILON) * 100) / 100;
export const displayedMultiplier = value => Math.floor((value + Number.EPSILON) * 100) / 100;

// A local demo distribution only. No server authority or production RTP claim.
export function sampleCrash(random = Math.random) {
  const sample = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  return Math.min(CONFIG.maxMultiplier, Math.max(1, Math.floor(0.99 / (1 - sample) * 100) / 100));
}

export class SurfGame {
  constructor({ now = 0, random = Math.random, saved = {} } = {}) {
    this.random = random;
    this.balance = Number.isFinite(saved.balance) && saved.balance >= 0 ? cents(saved.balance) : CONFIG.startingBalance;
    this.best = Number.isFinite(saved.best) && saved.best >= 1 && saved.best <= CONFIG.maxMultiplier ? saved.best : 0;
    this.records = Array.isArray(saved.records) ? saved.records.filter(record => record && Number.isFinite(record.round) && ['cashed', 'wiped'].includes(record.status) && ['multiplier', 'amount', 'payout'].every(key => Number.isFinite(record[key])) && (record.crash === null || Number.isFinite(record.crash))).slice(0, 100) : [];
    this.round = this.records.reduce((max, record) => Math.max(max, record.round), 0);
    this.history = []; this.events = []; this.nextScenario = null; this.lastResult = null;
    this.startWaiting(now);
  }
  emit(type, detail = {}) { this.events.push({ type, ...detail }); }
  drainEvents() { return this.events.splice(0); }
  startWaiting(now) {
    this.round += 1; this.phase = 'waiting'; this.phaseStarted = now; this.multiplier = 1; this.bet = null;
    this.crash = this.nextScenario ?? sampleCrash(this.random); this.nextScenario = null;
    const names = ['Kai', 'Luna', 'Rio', 'Noah', 'Mika', 'Sol'];
    const colors = ['#e6b285', '#b6afd8', '#84c9b5', '#cfcb99', '#e7958d', '#8db6d6'];
    this.crew = names.map((name, index) => ({ name, color: colors[index], target: cents(1.15 + this.random() * (index % 2 ? 5 : 2.2)), status: 'waiting', multiplier: 0, amount: 5 * (index + 1), payout: 0 }));
    this.emit('waiting');
  }
  step(now) {
    if (this.phase === 'waiting' && now >= this.phaseStarted + CONFIG.waitingMs) {
      this.phase = 'riding'; this.phaseStarted += CONFIG.waitingMs;
      for (const surfer of this.crew) surfer.status = 'riding';
      if (this.bet) this.bet.status = 'riding';
      this.emit('launch');
    }
    if (this.phase === 'riding') {
      const elapsed = Math.max(0, now - this.phaseStarted) / 1000;
      const computed = Math.exp(elapsed * CONFIG.growth);
      this.multiplier = Math.min(this.crash, computed);
      for (const surfer of this.crew) {
        if (surfer.status === 'riding' && surfer.target < this.crash && surfer.target <= computed) {
          surfer.status = 'cashed'; surfer.multiplier = surfer.target; surfer.payout = cents(surfer.amount * surfer.target);
          this.emit('crew-cashout', { name: surfer.name });
        }
      }
      // Ties belong to the crash. Requests first advance authoritative demo time.
      if (computed >= this.crash) this.endRound(now);
    } else if (this.phase === 'crashed' && now >= this.phaseStarted + CONFIG.resultMs) {
      // Start a fresh lobby after a suspended tab, never backfill unplayed rounds.
      this.startWaiting(now);
    }
  }
  join(amount, now) {
    this.step(now);
    if (this.phase !== 'waiting' || this.bet) return { ok: false, error: '다음 파도 대기 시간에 참가할 수 있어요.' };
    if (!Number.isFinite(amount) || amount < CONFIG.minBet || amount > CONFIG.maxBet || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return { ok: false, error: '참가 금액은 1–100 CR, 소수점 두 자리까지 입력하세요.' };
    if (amount > this.balance) return { ok: false, error: '데모 잔액이 부족해요. POC 도구에서 초기화할 수 있어요.' };
    this.balance = cents(this.balance - amount); this.bet = { amount, status: 'waiting', payout: 0, multiplier: 0 }; this.lastResult = null;
    this.emit('joined'); return { ok: true };
  }
  cancel(now) {
    this.step(now);
    if (this.phase !== 'waiting' || this.bet?.status !== 'waiting') return { ok: false, error: '이미 출발한 라이딩은 취소할 수 없어요.' };
    this.balance = cents(this.balance + this.bet.amount); this.bet = null; this.emit('cancelled'); return { ok: true };
  }
  cashout(now) {
    this.step(now);
    if (this.phase !== 'riding' || this.bet?.status !== 'riding') return { ok: false, error: '캐시아웃 가능한 라이딩이 없어요.' };
    const multiplier = displayedMultiplier(this.multiplier);
    const payout = cents(this.bet.amount * multiplier);
    const previousBest = this.best;
    Object.assign(this.bet, { status: 'cashed', multiplier, payout, isBest: multiplier > previousBest, previousBest });
    this.balance = cents(this.balance + payout); this.best = Math.max(this.best, multiplier);
    this.lastResult = { ...this.bet, round: this.round };
    this.emit('cashout', { result: this.lastResult }); return { ok: true, payout };
  }
  endRound(now) {
    this.phase = 'crashed'; this.phaseStarted = now; this.multiplier = this.crash;
    for (const surfer of this.crew) if (surfer.status === 'riding') surfer.status = 'wiped';
    this.history.unshift({ round: this.round, multiplier: this.crash }); this.history = this.history.slice(0, 12);
    if (this.bet) {
      if (this.bet.status === 'riding') { this.bet.status = 'wiped'; this.lastResult = { ...this.bet, round: this.round }; }
      this.records.unshift({ ...this.bet, round: this.round, crash: this.crash }); this.records = this.records.slice(0, 100);
    }
    this.emit('crash');
  }
  setScenario(value) {
    if (value !== null && (!Number.isFinite(value) || value < 1 || value > CONFIG.maxMultiplier)) throw new Error('Invalid scenario');
    if (this.phase === 'waiting' && !this.bet) this.crash = value ?? sampleCrash(this.random);
    else this.nextScenario = value;
  }
  resetBalance(now) {
    this.step(now);
    if (this.bet && ['waiting', 'riding'].includes(this.bet.status)) return false;
    this.balance = CONFIG.startingBalance; this.emit('reset'); return true;
  }
  serialize() {
    // Reloading an unsettled local demo refunds its stake; an approved cashout remains paid.
    const refund = this.bet && ['waiting', 'riding'].includes(this.bet.status) ? this.bet.amount : 0;
    const pendingRecord = this.bet?.status === 'cashed' && !this.records.some(record => record.round === this.round)
      ? [{ ...this.bet, round: this.round, crash: null }] : [];
    return { balance: cents(this.balance + refund), best: this.best, records: [...pendingRecord, ...this.records].slice(0, 100) };
  }
}
