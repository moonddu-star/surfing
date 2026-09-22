import { SurfGame, CONFIG, displayedMultiplier } from './game-engine.js';
import { OceanScene } from './ocean-scene.js';

const $ = id => document.getElementById(id);
const format = value => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mult = value => `${displayedMultiplier(value).toFixed(2)}×`;
const STORE = 'tideline-poc-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* Storage is optional in the POC. */ }
const random = () => { const data = new Uint32Array(1); crypto.getRandomValues(data); return data[0] / 4294967296; };
const game = new SurfGame({ now: performance.now(), random, saved });
const scene = new OceanScene($('ocean'));
let activeView = 'play'; let lastUi = 0; let soundEnabled = false; let soundContext; let toastTimeout; let crewMarkup = ''; let feedback = ''; let helpOpen = false;

function save() { try { localStorage.setItem(STORE, JSON.stringify({ ...game.serialize(), theme: scene.theme, board: scene.board, finish: scene.finish })); } catch { /* Private mode still permits play. */ } }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').hidden = true, 3500); }
function tone(kind) {
  if (!soundEnabled || !soundContext) return;
  const frequencies = kind === 'cashout' ? [440, 554, 659] : kind === 'crash' ? [130, 100] : [330];
  frequencies.forEach((frequency, i) => {
    const oscillator = soundContext.createOscillator(); const gain = soundContext.createGain();
    const time = soundContext.currentTime + i * .10;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.045, time + .02); gain.gain.exponentialRampToValueAtTime(.001, time + .25);
    oscillator.connect(gain); gain.connect(soundContext.destination); oscillator.start(time); oscillator.stop(time + .3);
  });
}
function processEvents(now) {
  for (const event of game.drainEvents()) {
    if (event.type === 'cashout') { scene.onCashout(now); tone('cashout'); feedback = `${mult(event.result.multiplier)} 캐시아웃 · ${format(event.result.payout)} CR 정산 완료`; }
    if (event.type === 'crew-cashout') scene.onCrewCashout(event.name, now);
    if (event.type === 'crash') { scene.onCrash(now); tone('crash'); }
    if (event.type === 'launch') { feedback = ''; tone('launch'); }
    if (event.type === 'waiting') { feedback = ''; $('scenario-select').value = 'random'; $('scenario-status').textContent = ''; }
    if (['cashout', 'crash', 'joined', 'cancelled', 'reset'].includes(event.type)) { save(); renderRecords(); }
  }
}
function renderCrew(all = false) {
  const own = game.bet ? { name: 'YOU', color: scene.board, ...game.bet } : null;
  const members = [...(own ? [own] : []), ...game.crew];
  return (all ? members : members.slice(0, 4)).map(surfer => {
    const state = { waiting: '출발 대기', riding: '라이딩 중', cashed: mult(surfer.multiplier), wiped: '와이프아웃' }[surfer.status];
    return `<div class="crew-row ${surfer.name === 'YOU' ? 'mine' : ''}"><span class="crew-user"><span class="crew-avatar" style="--avatar-color:${surfer.color}">${surfer.name[0]}</span>${surfer.name}${surfer.name === 'YOU' ? ' <small>나</small>' : ''}</span><span class="crew-status ${surfer.status}">${state}${surfer.status === 'cashed' ? `<small>${format(surfer.payout)} CR 지급</small>` : ''}</span></div>`;
  }).join('');
}
function render(now) {
  const waiting = game.phase === 'waiting'; const riding = game.phase === 'riding';
  const own = game.bet; document.body.classList.toggle('live-own', riding && own?.status === 'riding'); const count = Math.max(0, Math.ceil((CONFIG.waitingMs - (now - game.phaseStarted)) / 1000));
  $('round-tag').textContent = `WAVE ${String(game.round).padStart(3, '0')}`;
  $('phase-label').textContent = waiting ? '다음 파도를 준비하세요' : riding ? '지금, 당신의 파도' : '이번 파도 종료';
  $('multiplier').textContent = waiting ? `00:${String(count).padStart(2, '0')}` : mult(game.multiplier);
  $('phase-description').textContent = waiting ? '함께 출발하고, 원하는 순간에 탈출하세요.' : riding ? own?.status === 'cashed' ? '라이딩 완료. 이제 크루의 순간을 함께해요.' : '원하는 순간, 파도 밖으로 빠져나오세요.' : '파도가 지나갔어요. 다음 라이딩을 준비합니다.';
  $('stage-status').textContent = waiting ? 'LINEUP OPEN' : riding ? 'WAVE IS LIVE' : 'WAVE COMPLETE';
  $('countdown-fill').style.width = waiting ? `${Math.max(0, 1 - (now - game.phaseStarted) / CONFIG.waitingMs) * 100}%` : '0%';
  $('surfer-tag').hidden = game.phase === 'crashed' || own?.status === 'cashed';
  $('balance').textContent = format(game.balance); $('best-inline').textContent = game.best ? mult(game.best) : '—';
  const inputLocked = !waiting || !!own;
  $('bet-amount').disabled = inputLocked;
  document.querySelectorAll('[data-amount]').forEach(button => button.disabled = inputLocked);
  const action = $('ride-button'); action.className = 'primary-button'; action.disabled = false;
  if (waiting && !own) { $('ride-action').textContent = '파도에 합류하기'; $('ride-action-detail').textContent = 'JOIN THE WAVE ↗'; }
  else if (waiting && own) { action.classList.add('cancel'); $('ride-action').textContent = '참가 취소'; $('ride-action-detail').textContent = `${format(own.amount)} CR · ${count}초 뒤 출발`; }
  else if (riding && own?.status === 'riding') { action.classList.add('cashout'); $('ride-action').textContent = `${format(Math.floor(own.amount * displayedMultiplier(game.multiplier) * 100) / 100)} CR 캐시아웃`; $('ride-action-detail').textContent = 'FINISH YOUR RIDE ↗'; }
  else { action.disabled = true; $('ride-action').textContent = own?.status === 'cashed' ? '라이딩 완료' : own?.status === 'wiped' ? '와이프아웃' : '다음 파도 대기'; $('ride-action-detail').textContent = own?.status === 'cashed' ? `${mult(own.multiplier)} · 정산 완료` : '잠시 후 새로운 파도가 시작됩니다'; }
  $('bet-feedback').textContent = feedback || (waiting ? own ? '참가 완료! 출발 전에는 전액 취소할 수 있어요.' : '참가 후 출발 전까지 취소할 수 있어요.' : own?.status === 'riding' ? '피니시 연출과 관계없이 클릭 판정 시 정산됩니다.' : '공통 파도를 관전하고 있어요.');
  const result = game.lastResult;
  $('ride-result').hidden = !result;
  if (result) {
    $('ride-result').classList.toggle('loss', result.status === 'wiped');
    $('result-kicker').textContent = result.status === 'wiped' ? 'WIPEOUT' : result.isBest ? 'PERSONAL BEST ↗' : 'RIDE COMPLETE';
    $('result-multiplier').textContent = result.status === 'wiped' ? '라이딩 종료' : mult(result.multiplier);
    $('result-description').textContent = result.status === 'wiped' ? `${format(result.amount)} CR 참가 · 지급액 0.00 CR` : `${format(result.payout)} CR 정산 완료${result.isBest && result.previousBest ? ` · 이전 ${mult(result.previousBest)}` : ''}`;
  }
  $('crew-count').textContent = `${game.crew.length + (own ? 1 : 0)}명`;
  const markup = renderCrew(); if (markup !== crewMarkup) { $('crew-list').innerHTML = markup; crewMarkup = markup; }
  $('history-chips').innerHTML = game.history.length ? game.history.map(item => `<span class="history-chip ${item.multiplier >= 3 ? 'high' : ''}" title="파도 ${item.round} 종료">${mult(item.multiplier)}</span>`).join('') : '<span class="empty-inline">첫 파도를 기다리고 있어요</span>';
  if (helpOpen === 'crew') $('dialog-content').innerHTML = `<p class="dialog-eyebrow">ON THE SAME WAVE</p><h2>파도 ${game.round} · 전체 크루</h2><p>YOU 외 참가자는 로컬 시뮬레이션입니다.</p>${renderCrew(true)}`;
}
function renderRecords() {
  $('record-best').textContent = game.best ? mult(game.best) : '—'; $('record-count').textContent = String(game.records.length); $('record-balance').textContent = `${format(game.balance)} CR`;
  $('records-empty').hidden = game.records.length > 0;
  $('record-table').innerHTML = game.records.map(record => `<tr><td>WAVE ${String(record.round).padStart(3, '0')}</td><td class="${record.status}">${record.status === 'cashed' ? mult(record.multiplier) : '와이프아웃'}</td><td>${record.crash === null ? '종료 미확인' : mult(record.crash)}</td><td>${format(record.amount)} CR</td><td>${format(record.payout)} CR</td><td>${record.isBest ? '<span class="best-pill">PERSONAL BEST</span>' : '—'}</td></tr>`).join('');
}
function setView(view) {
  activeView = view; $('play-view').hidden = view !== 'play'; $('records-view').hidden = view !== 'records';
  document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === view); if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  renderRecords(); if (view === 'play') scene.resize();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('open-records').addEventListener('click', () => setView('records')); $('back-to-play').addEventListener('click', () => setView('play'));
$('ride-button').addEventListener('click', () => {
  const now = performance.now(); let result;
  // Intent uses rendered state; engine methods independently validate current time.
  if (game.phase === 'waiting') result = game.bet ? game.cancel(now) : game.join(Number($('bet-amount').value), now);
  else result = game.cashout(now);
  if (!result.ok) { feedback = result.error; toast(result.error); } else feedback = '';
  processEvents(now); render(now);
});
document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => { $('bet-amount').value = button.dataset.amount; document.querySelectorAll('[data-amount]').forEach(item => item.classList.toggle('selected', item === button)); }));
$('bet-amount').addEventListener('input', () => document.querySelectorAll('[data-amount]').forEach(item => item.classList.toggle('selected', item.dataset.amount === $('bet-amount').value)));
function setTheme(theme) {
  scene.theme = theme; $('theme-title').textContent = `PACIFIC / ${theme.toUpperCase()}`;
  document.querySelectorAll('[data-theme]').forEach(button => { const selected = button.dataset.theme === theme; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); }); save();
}
function setBoard(color) { scene.board = color; document.querySelectorAll('[data-board]').forEach(button => { const selected = button.dataset.board === color; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); }); save(); }
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.theme)));
document.querySelectorAll('[data-board]').forEach(button => button.addEventListener('click', () => setBoard(button.dataset.board)));
$('finish-select').addEventListener('change', event => { scene.finish = event.target.value; save(); });
if (['daybreak', 'sunset', 'moonlight'].includes(saved.theme)) setTheme(saved.theme);
if (['#d8f76d', '#f2977d', '#c3c3ee', '#f1efe5'].includes(saved.board)) setBoard(saved.board);
if (['air', 'spray', 'barrel'].includes(saved.finish)) { scene.finish = saved.finish; $('finish-select').value = saved.finish; }
$('sound-button').addEventListener('click', async () => {
  try { soundContext ??= new AudioContext(); await soundContext.resume(); soundEnabled = !soundEnabled; $('sound-button').setAttribute('aria-pressed', soundEnabled); $('sound-button').setAttribute('aria-label', soundEnabled ? '사운드 끄기' : '사운드 켜기'); $('sound-button').style.color = soundEnabled ? 'var(--accent)' : ''; toast(soundEnabled ? '라이딩 사운드 켜짐' : '라이딩 사운드 꺼짐'); tone('launch'); } catch { toast('이 브라우저에서는 사운드를 사용할 수 없어요.'); }
});
const dialog = $('info-dialog');
$('help-button').addEventListener('click', () => {
  helpOpen = 'help'; $('dialog-content').innerHTML = '<p class="dialog-eyebrow">WELCOME TO THE LINEUP</p><h2>한 번의 파도, 나만의 순간.</h2><ol><li>대기 시간에 데모 금액을 정하고 <strong>파도에 합류하기</strong>를 누르세요. 출발 전에는 취소할 수 있어요.</li><li>라이딩 중 배수가 올라갑니다. 파도가 끝나기 전에 <strong>캐시아웃</strong>하면 표시 배수로 지급액이 확정됩니다.</li><li>캐시아웃 이후에는 크루를 관전할 수 있어요. 파도의 종료 배수와 내 캐시아웃 기록은 별개입니다.</li></ol><p class="help-note">로컬 데모이며 YOU 외 크루는 시뮬레이션입니다. 파도는 결과를 예고하지 않습니다. CR에는 금전 가치가 없으며 결제·출금·실제 멀티플레이가 없습니다. 새로고침 시 미정산 참가금은 복원됩니다. 기록은 이 브라우저에 최근 100건까지 저장됩니다. 상용 RTP·공정성 인증은 포함하지 않습니다.</p>'; dialog.showModal();
});
$('view-all-crew').addEventListener('click', () => { helpOpen = 'crew'; render(performance.now()); dialog.showModal(); });
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => helpOpen = false);
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
$('demo-tools-toggle').addEventListener('click', () => { const expanded = $('demo-tools').hidden; $('demo-tools').hidden = !expanded; $('demo-tools-toggle').setAttribute('aria-expanded', expanded); if (expanded) $('demo-tools').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
$('scenario-select').addEventListener('change', event => { const value = event.target.value === 'random' ? null : Number(event.target.value); const current = game.phase === 'waiting' && !game.bet; game.setScenario(value); $('scenario-status').textContent = `${current ? '현재 대기 중인' : '다음'} 파도에 적용됩니다.`; });
$('reset-demo').addEventListener('click', () => { if (game.resetBalance(performance.now())) { processEvents(performance.now()); toast('데모 잔액을 1,000.00 CR로 초기화했어요. 기록은 유지됩니다.'); } else toast('참가를 취소하거나 라이딩을 마친 뒤 초기화하세요.'); });
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
function frame(now) {
  game.step(now); processEvents(now);
  if (activeView === 'play' && !document.hidden) scene.draw(now, { phase: game.phase, multiplier: game.multiplier, bet: game.bet, crew: game.crew });
  if (now - lastUi > 80) { render(now); lastUi = now; }
  requestAnimationFrame(frame);
}
renderRecords(); render(performance.now()); requestAnimationFrame(frame);
