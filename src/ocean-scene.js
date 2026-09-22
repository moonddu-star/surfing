const palettes = {
  daybreak: { sky: ['#9ebabc', '#d5ded0'], sun: '#f2edc4', water: ['#438f92', '#0c525f'], crest: '#9ed8c8', deep: '#164d59', foam: '#e6f0d6', far: '#7a9b98' },
  sunset: { sky: ['#a88283', '#ecc3a0'], sun: '#ffe1a7', water: ['#6b9c98', '#224f66'], crest: '#c8d9b0', deep: '#334e63', foam: '#f3ddba', far: '#977e78' },
  moonlight: { sky: ['#233547', '#69848d'], sun: '#e1e9d9', water: ['#386d7c', '#122c49'], crest: '#8abbbb', deep: '#15334a', foam: '#bcd9d7', far: '#3c5e6b' }
};

export class OceanScene {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.theme = 'daybreak'; this.board = '#d8f76d'; this.finish = 'air';
    this.cashoutAt = -Infinity; this.crashAt = -Infinity; this.isBest = false; this.crewFinishTimes = new Map();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = rect.width; this.height = rect.height;
    if (this.canvas.width === Math.round(rect.width * ratio) && this.canvas.height === Math.round(rect.height * ratio)) return;
    this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.lastState) this.draw(this.lastTime, this.lastState);
  }
  onCashout(now) { this.cashoutAt = now; }
  onCrash(now) { this.crashAt = now; }
  onCrewCashout(name, now) { this.crewFinishTimes.set(name, now); }
  gradient(x0, y0, x1, y1, stops) {
    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color)); return gradient;
  }
  path(points, fill, stroke, lineWidth = 1) {
    const ctx = this.ctx; ctx.beginPath();
    for (const [type, ...values] of points) ctx[type](...values);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  draw(now, state) {
    this.lastTime = now; this.lastState = state;
    const ctx = this.ctx; const width = this.width; const height = this.height;
    if (!width || !height) return;
    const p = palettes[this.theme]; const time = (this.reducedMotion ? 0 : now) / 1000;
    const growth = state.phase === 'riding' ? Math.min(1, Math.log(state.multiplier) / 3) : 0;
    const drift = Math.sin(time * .45) * 4;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.gradient(0, 0, 0, height * .6, [[0, p.sky[0]], [1, p.sky[1]]]); ctx.fillRect(0, 0, width, height);
    // Sun, salt haze, and distant coastal headlands.
    ctx.globalAlpha = .82; ctx.fillStyle = p.sun; ctx.beginPath(); ctx.arc(width * .70, height * .22, height * .065, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .17;
    for (let i = 0; i < 6; i++) { ctx.fillStyle = p.sun; ctx.fillRect(width * .05 + i * 11, height * (.27 + i * .022), width * .87 - i * 20, 1); }
    ctx.globalAlpha = .36;
    this.path([['moveTo', width * .72, height * .50], ['bezierCurveTo', width * .83, height * .43, width * .91, height * .42, width, height * .44], ['lineTo', width, height * .54], ['closePath']], p.far);
    ctx.globalAlpha = .65;
    this.path([['moveTo', width * .87, height * .52], ['lineTo', width * .94, height * .45], ['lineTo', width, height * .44], ['lineTo', width, height * .57], ['closePath']], p.far);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.gradient(0, height * .47, 0, height, [[0, p.water[0]], [1, p.water[1]]]); ctx.fillRect(0, height * .48, width, height);
    // Parallel long-period swells establish the horizon.
    for (let i = 0; i < 17; i++) {
      const y = height * .49 + i * i * .28;
      ctx.globalAlpha = .08 + (i % 3) * .02;
      this.path([['moveTo', 0, y], ['bezierCurveTo', width * .25, y - 8, width * .65, y + 5, width, y - 2]], null, p.foam, 1);
    }
    ctx.globalAlpha = 1;
    // The wave is driven by public elapsed time only; it never reads the crash point.
    ctx.save(); ctx.translate(0, drift - growth * 13);
    const rim = height * (.34 - growth * .025);
    this.path([
      ['moveTo', -30, height * .97], ['bezierCurveTo', width * .22, height * .89, width * .31, height * .63, width * .45, height * .47],
      ['bezierCurveTo', width * .60, rim, width * .79, rim - height * .10, width * .91, rim + height * .055],
      ['bezierCurveTo', width * .99, height * .52, width * .87, height * .68, width * .72, height * .69],
      ['bezierCurveTo', width * .88, height * .60, width * .85, height * .41, width * .73, height * .45],
      ['bezierCurveTo', width * .54, height * .49, width * .55, height * .77, width * .46, height * .89],
      ['lineTo', width, height * 1.15], ['lineTo', -30, height * 1.1], ['closePath']
    ], this.gradient(width * .36, height * .36, width * .55, height, [[0, p.crest], [.23, p.water[0]], [.65, p.deep], [1, '#133e48']]));
    // Curled translucent face, open barrel, foam lip.
    this.path([
      ['moveTo', width * .48, height * .91], ['bezierCurveTo', width * .57, height * .72, width * .54, height * .47, width * .72, height * .435],
      ['bezierCurveTo', width * .88, height * .405, width * .88, height * .62, width * .735, height * .695],
      ['bezierCurveTo', width * .80, height * .635, width * .825, height * .515, width * .73, height * .515],
      ['bezierCurveTo', width * .64, height * .51, width * .65, height * .745, width * .60, height * .82],
      ['closePath']
    ], this.gradient(width * .54, height * .58, width * .86, height * .57, [[0, p.deep], [.40, p.water[0]], [.8, p.crest], [1, p.foam]]));
    for (let i = 0; i < 23; i++) {
      const offset = i * .0045;
      ctx.globalAlpha = .10 + (i % 4) * .025;
      this.path([['moveTo', width * (.035 + offset), height * (1.0 - offset)], ['bezierCurveTo', width * (.30 + offset), height * (.87 - offset), width * (.45 + offset), height * (.22 + offset), width * (.78 + offset * .5), height * (.36 + offset * .20)]], null, p.foam, i % 5 === 0 ? 2 : .8);
    }
    ctx.globalAlpha = .88;
    this.path([['moveTo', width * .07, height * .925], ['bezierCurveTo', width * .41, height * .82, width * .45, height * .26, width * .79, height * .345], ['bezierCurveTo', width * .94, height * .37, width * .965, height * .57, width * .80, height * .65]], null, p.foam, 4);
    ctx.globalAlpha = .5;
    this.path([['moveTo', width * .2, height * .89], ['bezierCurveTo', width * .40, height * .72, width * .51, height * .29, width * .78, height * .326]], null, p.foam, 7);
    ctx.globalAlpha = 1;
    // Fine mist follows the shoulder of the wave.
    for (let i = 0; i < 95; i++) {
      const u = ((i * .618033 + time * .03) % 1);
      const x = width * (.24 + u * .59);
      const y = height * (.35 + Math.pow((u - .86), 2) * .76) - (Math.sin(i * 17.7 + time * 1.2) + 1) * 10;
      ctx.globalAlpha = .10 + (Math.sin(i * 9.1) + 1) * .16;
      ctx.fillStyle = p.foam; ctx.beginPath(); ctx.ellipse(x, y, 1 + i % 3, .7 + i % 2, -.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Local demo crew: cashout motion is specific to each participant.
    state.crew.slice(0, 4).forEach((surfer, i) => {
      if (surfer.status === 'wiped') return;
      const finishProgress = surfer.status === 'cashed' ? (now - (this.crewFinishTimes.get(surfer.name) ?? -Infinity)) / 1100 : 0;
      if (finishProgress > 1) return;
      this.drawSurfer(width * (.32 + i * .085 + finishProgress * .5), height * (.80 - i * .035 - Math.sin(finishProgress * Math.PI) * .12) + Math.sin(time + i) * 3, .42 + i * .045, surfer.color, time + i, finishProgress > 0, finishProgress);
    });
    const finishTime = (now - this.cashoutAt) / 1000;
    const crashTime = (now - this.crashAt) / 1000;
    const ownLive = !state.bet || ['waiting', 'riding'].includes(state.bet.status);
    let surferX = width * .64, surferY = height * .745 + Math.sin(time * 1.8) * 3;
    if (state.phase !== 'crashed' && ownLive) this.drawSurfer(surferX, surferY, Math.min(1.12, width / 620), this.board, time, false);
    else if (state.bet?.status === 'cashed' && finishTime < 1.6) {
      const progress = Math.min(1, finishTime / 1.6);
      surferX += width * .41 * progress;
      surferY -= (this.finish === 'air' ? Math.sin(progress * Math.PI) * height * .26 : this.finish === 'barrel' ? progress * height * .15 : Math.sin(progress * Math.PI) * height * .055);
      this.drawSurfer(surferX, surferY, Math.min(1.12, width / 620), this.board, time, this.finish === 'air', progress);
    }
    if (state.phase === 'crashed') {
      // Only a confirmed crash triggers closing water, never a pre-crash hint.
      const progress = Math.min(1, crashTime / .7);
      ctx.globalAlpha = Math.min(.88, progress);
      this.path([['moveTo', width * .35, height * .50], ['bezierCurveTo', width * .55, height * .36, width * .94, height * .42, width, height * .7], ['lineTo', width, height], ['lineTo', width * .22, height], ['closePath']], this.gradient(0, height * .4, 0, height, [[0, p.foam], [1, p.water[0]]]));
      ctx.globalAlpha = 1;
      for (let i = 0; i < 50; i++) {
        const angle = i * 2.399; const radius = (15 + i * 2.7) * progress;
        ctx.globalAlpha = .65 * Math.max(0, 1 - crashTime / 3);
        ctx.fillStyle = p.foam; ctx.beginPath(); ctx.arc(width * .68 + Math.cos(angle) * radius, height * .70 + Math.sin(angle) * radius * .5, 3 + i % 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (crashTime > 1.3 && state.bet?.status === 'wiped') this.drawSurfer(width * .65, height * .82, .8, this.board, time, false, 0, true);
    }
    ctx.restore();
    // Foreground flow and an unobtrusive vignette.
    for (let i = 0; i < 11; i++) {
      const y = height * (.86 + i * .018); const slide = Math.sin(time * .6 + i) * 30;
      ctx.globalAlpha = .06 + i % 3 * .035;
      this.path([['moveTo', -40 + slide, y], ['bezierCurveTo', width * .3, y + 15, width * .56, y - 9, width + 40, y + 3]], null, p.foam, i % 3 ? 1 : 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.gradient(0, 0, 0, height, [[0, '#0c292b16'], [.7, '#0c292b00'], [1, '#0c292b55']]); ctx.fillRect(0, 0, width, height);
  }
  drawSurfer(x, y, scale, board, time, airborne, progress = 0, wiped = false) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(airborne ? -.35 + progress * .7 : -.10 + Math.sin(time) * .025);
    ctx.globalAlpha = .65; ctx.strokeStyle = '#e8f2d7'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(-5 - i * 3, 5); ctx.quadraticCurveTo(-35 - i * 3, 5 - i * 1.1, -65 - i * 4, 9 - i * 2); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = board; ctx.beginPath(); ctx.ellipse(0, 2, 30, 4, -.03, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#16353b'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-20, 2); ctx.lineTo(19, 2); ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (wiped) {
      this.path([['moveTo', -12, -3], ['lineTo', 9, -4]], null, '#173039', 7);
      ctx.fillStyle = '#d99e79'; ctx.beginPath(); ctx.arc(16, -5, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      this.path([['moveTo', -16, -2], ['lineTo', -9, -15], ['lineTo', 0, -21], ['lineTo', 10, -12], ['lineTo', 17, -3]], null, '#132e37', 5);
      this.path([['moveTo', 0, -20], ['lineTo', -4, -37]], null, '#de9372', 9);
      this.path([['moveTo', -3, -33], ['lineTo', -17, -25], ['lineTo', -27, -29]], null, '#ddb18c', 3.5);
      this.path([['moveTo', -1, -34], ['lineTo', 12, -26], ['lineTo', 23, -32]], null, '#ddb18c', 3.5);
      ctx.fillStyle = '#d8af8b'; ctx.beginPath(); ctx.arc(-4, -46, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#233737'; ctx.beginPath(); ctx.ellipse(-5, -49, 5.5, 3, -.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
