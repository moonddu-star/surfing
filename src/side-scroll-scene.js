const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mod = (x, n) => ((x % n) + n) % n;
const themes = {
  daybreak: { sky: '#486e83', haze: '#edc99c', sun: '#fff0bb', sea: '#57b5b4', crest: '#a4efd8', face: '#2cbdac', mid: '#137e8c', deep: '#073c57', foam: '#edffe9', island: '#486f79' },
  sunset: { sky: '#bc4c42', haze: '#ffa13c', sun: '#fff18c', sea: '#cb794e', crest: '#82d9d1', face: '#168ca5', mid: '#105674', deep: '#071d36', foam: '#fff1bf', island: '#b6624d' },
  moonlight: { sky: '#172a4b', haze: '#577c9b', sun: '#d9f7ec', sea: '#396d91', crest: '#95dfe3', face: '#3b9fbc', mid: '#235d86', deep: '#0d2849', foam: '#d7f8fa', island: '#2b4767' }
};

// Side-on presentation only. No crash target or crew cashout target is consumed.
export class OceanScene {
  constructor(canvas, label) {
    this.canvas = canvas; this.label = label; this.ctx = canvas.getContext('2d', { alpha: false });
    canvas.dataset.renderer = 'canvas';
    this.theme = 'sunset'; this.board = '#d8f76d'; this.finish = 'air';
    this.cashoutAt = -Infinity; this.crashAt = -Infinity; this.crewFinishTimes = new Map();
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    this.onMotion = event => { this.reducedMotion = event.matches; };
    this.motionQuery.addEventListener('change', this.onMotion);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.width = width; this.height = height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width === Math.round(width * ratio) && this.canvas.height === Math.round(height * ratio)) return;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.lastState) this.draw(this.lastTime, this.lastState);
  }
  dispose() { this.observer.disconnect(); this.motionQuery.removeEventListener('change', this.onMotion); }
  onCashout(now) { this.cashoutAt = now; }
  onCrash(now) { this.crashAt = now; }
  onCrewCashout(name, now) { this.crewFinishTimes.set(name, now); }
  onWaiting() { this.cashoutAt = -Infinity; this.crashAt = -Infinity; this.crewFinishTimes.clear(); }
  gradient(x, y, xx, yy, stops) {
    const g = this.ctx.createLinearGradient(x, y, xx, yy);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    return g;
  }
  path(points, fill, stroke, width = 1) {
    const c = this.ctx; c.beginPath();
    for (const [method, ...args] of points) c[method](...args);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  ellipse(x, y, rx, ry, color, rotation = 0) {
    const c = this.ctx; c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fillStyle = color; c.fill();
  }
  draw(now, state) {
    this.lastState = state; this.lastTime = now;
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    const p = themes[this.theme] || themes.daybreak;
    const t = this.reducedMotion ? 0 : now / 1000;
    const cashAge = (now - this.cashoutAt) / 1000;
    const cash = state.bet?.status === 'cashed';
    const finishing = cash && cashAge >= 0 && cashAge < 1.65 && !this.reducedMotion;
    const exit = finishing ? clamp(cashAge / 1.65) : 0;
    this.drawSky(p, t);
    this.drawSea(p, t);
    // The wave follows an aesthetic cycle, independent of the hidden round outcome.
    this.drawWave(p, t);
    for (const [i, surfer] of state.crew.slice(0, 3).entries()) {
      if (surfer.status === 'wiped') continue;
      const age = (now - (this.crewFinishTimes.get(surfer.name) ?? -Infinity)) / 1000;
      if (surfer.status === 'cashed' && (this.reducedMotion || age >= 1)) continue;
      const f = surfer.status === 'cashed' ? clamp(age) : 0;
      c.globalAlpha = .48 * (1 - f);
      this.drawSurfer(w * (.78 + i * .075 + f * .25), h * (.565 + i * .023 - Math.sin(f * Math.PI) * .08), Math.min(.55, w / 1450), surfer.color, t + i, f ? 'air' : 'ride', f);
      c.globalAlpha = 1;
    }
    const size = Math.min(2.05, Math.max(1.08, w / 470), h / 240);
    const x = w * (.60 + .53 * ease(exit));
    const baseY = h * .735 + Math.sin(t * 1.6) * (this.reducedMotion ? 0 : 3);
    const arc = finishing ? Math.sin(exit * Math.PI) * h * (this.finish === 'air' ? .34 : this.finish === 'barrel' ? .15 : .055) : 0;
    if (state.phase !== 'crashed' && (!cash || finishing)) {
      this.drawWake(x, baseY, size, p, t, finishing && this.finish === 'spray' ? 2.4 : 1);
      this.drawSurfer(x, baseY - arc, size, this.board, t, finishing ? this.finish : 'ride', exit);
    }
    if (this.label) {
      this.label.style.left = `${x / w * 100}%`;
      this.label.style.top = `${(baseY - arc - size * 84) / h * 100}%`;
    }
    this.drawForeground(p, t);
    if (state.phase === 'crashed') this.drawCrash(p, this.reducedMotion ? 1 : ease((now - this.crashAt) / 850));
    c.fillStyle = this.gradient(0, 0, 0, h, [[0, '#08283d44'], [.3, '#08283d00'], [.8, '#08283d00'], [1, '#061d35a0']]); c.fillRect(0, 0, w, h);
  }
  drawSky(p, t) {
    const c = this.ctx, w = this.width, h = this.height;
    c.fillStyle = this.gradient(0, 0, 0, h * .61, [[0, p.sky], [.75, p.haze], [1, p.sun]]); c.fillRect(0, 0, w, h);
    const sunX = w * .81, sunY = h * .34, radius = h * (this.theme === 'sunset' ? .115 : .066);
    const glow = c.createRadialGradient(sunX, sunY, radius, sunX, sunY, radius * 4);
    glow.addColorStop(0, p.sun + '38'); glow.addColorStop(1, p.sun + '00'); c.fillStyle = glow; c.fillRect(0, 0, w, h * .6);
    this.ellipse(sunX, sunY, radius, radius, p.sun);
    // Broad graphic cloud bands, with much slower drift than the water.
    for (let i = 0; i < 6; i++) {
      const x = mod(i * w * .27 - t * 3, w * 1.4) - w * .2;
      const y = h * (.13 + (i % 3) * .09);
      c.globalAlpha = .09 + i % 2 * .05;
      this.path([['moveTo', x, y], ['bezierCurveTo', x + w * .03, y - 9, x + w * .10, y - 10, x + w * .13, y - 3], ['lineTo', x + w * .23, y + 3], ['lineTo', x, y + 3]], p.sun);
    }
    c.globalAlpha = .5;
    const drift = Math.sin(t * .018) * w * .03;
    this.path([['moveTo', w * .64 + drift, h * .505], ['lineTo', w * .76 + drift, h * .47], ['lineTo', w * .82 + drift, h * .405], ['quadraticCurveTo', w * .86, h * .445, w * .89, h * .43], ['lineTo', w * 1.1, h * .51], ['closePath']], p.island);
    c.globalAlpha = .28;
    this.path([['moveTo', w * .6, h * .515], ['quadraticCurveTo', w * .86, h * .46, w * 1.1, h * .52]], null, p.sun, 3);
    c.globalAlpha = .65;
    for (let i = 0; i < 3; i++) {
      const x = mod(w * (.56 + i * .045) - t * 7, w + 50), y = h * (.31 + i % 2 * .025);
      this.path([['moveTo', x - 5, y], ['quadraticCurveTo', x - 2, y - 3, x, y], ['quadraticCurveTo', x + 3, y - 3, x + 6, y]], null, p.island, 1.3);
    }
    c.globalAlpha = 1;
  }
  drawSea(p, t) {
    const c = this.ctx, w = this.width, h = this.height;
    c.fillStyle = this.gradient(0, h * .51, 0, h, [[0, p.sea], [.5, p.mid], [1, p.deep]]); c.fillRect(0, h * .51, w, h * .49);
    for (let i = 0; i < 45; i++) {
      const row = i % 9, depth = row / 9;
      const x = mod(i * 157.7 - t * (13 + depth * 90), w + 180) - 90;
      const y = h * (.52 + depth * .39);
      c.globalAlpha = .08 + (i % 4) * .028;
      this.path([['moveTo', x, y], ['quadraticCurveTo', x + 24, y - 2, x + 44 + depth * 45, y]], null, p.foam, 1 + depth);
    }
    for (let i = 0; i < 13; i++) {
      const y = h * (.52 + i * .008), x = w * .79 + Math.sin(t + i * 1.7) * 9;
      c.globalAlpha = .25 * (1 - i / 15);
      this.path([['moveTo', x - 12 - i * 3, y], ['lineTo', x + 12 + i * 3, y]], null, p.sun, 2);
    }
    c.globalAlpha = 1;
  }
  drawWave(p, t) {
    const c = this.ctx, w = this.width, h = this.height;
    c.save(); c.translate(0, Math.sin(t * .9) * 2);
    // One side-on breaking crest. The open face slopes down toward the right.
    const outline = [ ['moveTo', -w * .12, h * .71], ['bezierCurveTo', w * .04, h * .48, w * .15, h * .34, w * .32, h * .35], ['bezierCurveTo', w * .45, h * .35, w * .53, h * .43, w * .50, h * .535], ['bezierCurveTo', w * .48, h * .475, w * .405, h * .455, w * .39, h * .515], ['bezierCurveTo', w * .34, h * .675, w * .61, h * .78, w * 1.08, h * .76], ['lineTo', w * 1.1, h * 1.1], ['lineTo', -w * .12, h * 1.1], ['closePath'] ];
    this.path(outline, this.gradient(0, h * .35, w * .2, h, [[0, p.crest], [.19, p.face], [.5, p.mid], [1, p.deep]]));
    c.save(); c.beginPath(); for (const [m, ...a] of outline) c[m](...a); c.clip();
    // Soft inset bands give the wave volume without a 3D tunnel or mesh.
    for (let i = 0; i < 9; i++) {
      const shift = i * .026;
      c.globalAlpha = i % 3 === 0 ? .16 : .08;
      this.path([['moveTo', -w * .12, h * (.79 + shift)], ['bezierCurveTo', w * .17, h * (.37 + shift), w * .26, h * (.31 + shift), w * .33, h * (.44 + shift)], ['bezierCurveTo', w * .26, h * (.73 + shift), w * .6, h * (.88 + shift), w * 1.12, h * (.8 + shift)]], null, i % 3 ? p.crest : p.deep, 3 + i * 2);
    }
    for (let i = 0; i < 27; i++) {
      const z = mod(i * .618 - t * .11, 1);
      const x = w * (-.1 + z * 1.2), y = h * (.80 + i % 5 * .031);
      c.globalAlpha = .09;
      this.path([['moveTo', x, y], ['quadraticCurveTo', x + w * .055, y + 7, x + w * .14, y - 1]], null, p.foam, i % 3 ? 1 : 2);
    }
    c.restore(); c.globalAlpha = 1;
    const crest = [['moveTo', -w * .10, h * .69], ['bezierCurveTo', w * .06, h * .455, w * .17, h * .34, w * .32, h * .35], ['bezierCurveTo', w * .45, h * .35, w * .53, h * .43, w * .50, h * .535]];
    c.lineCap = 'round'; this.path(crest, null, p.crest, h * .029); this.path(crest, null, p.foam, h * .011);
    // Broken foam follows the crest; the brighter flying droplets catch the sunset.
    const point = (a, b, d, e, u) => (1-u)**3*a + 3*(1-u)**2*u*b + 3*(1-u)*u*u*d + u**3*e;
    for (let i = 0; i < 110; i++) {
      const u = i < 75 ? i / 74 : (i - 75) / 34;
      const xx = i < 75 ? point(-.10, .06, .17, .32, u) : point(.32, .45, .53, .50, u);
      const yy = i < 75 ? point(.69, .455, .34, .35, u) : point(.35, .35, .43, .535, u);
      const age = mod(i * .371 + t * .48, 1);
      const size = 1.8 + i % 5 * .65;
      c.globalAlpha = .72;
      this.ellipse(w * xx, h * yy + Math.sin(i * 4.1) * 2, size * 1.4, size, p.foam, -.3);
      for (let j = 0; j < 2; j++) {
        c.globalAlpha = (1 - age) * (.60 - j * .15);
        this.ellipse(w * xx - age * (14 + j * 16), h * yy - Math.sin(age * Math.PI) * (12 + i % 7 * 4 + j * 13), .6 + i % 3 * .45, .6 + i % 2 * .3, p.foam);
      }
    }
    c.globalAlpha = .8;
    this.path([['moveTo', w * .39, h * .55], ['bezierCurveTo', w * .40, h * .72, w * .64, h * .775, w * 1.05, h * .765]], null, p.crest, 2);
    c.restore();
  }
  drawWake(x, y, s, p, t, intensity) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(s, s);
    for (let i = 0; i < 5; i++) {
      c.globalAlpha = .35 - i * .05;
      this.path([['moveTo', 36, 5], ['quadraticCurveTo', -45, 9 + i * 3, -150 - i * 17, 20 + i * 6]], null, p.foam, 2.4 - i * .3);
    }
    for (let i = 0; i < 45; i++) {
      const age = mod(i * .618 + t * 1.1, 1);
      c.globalAlpha = (1 - age) * .8;
      this.ellipse(-30 - age * (80 + i % 5 * 12), 6 - Math.sin(age * Math.PI) * (12 + i % 10 * 4) * intensity + age * 16, 1 + i % 3 * .5, .7, p.foam, -.3);
    }
    c.restore();
  }
  drawForeground(p, t) {
    const c = this.ctx, w = this.width, h = this.height;
    c.globalAlpha = .45;
    this.path([['moveTo', -10, h * .96], ['bezierCurveTo', w * .25, h * .89, w * .61, h * 1.02, w * 1.1, h * .91], ['lineTo', w * 1.1, h * 1.1], ['lineTo', -10, h * 1.1]], p.deep);
    for (let i = 0; i < 16; i++) {
      const x = mod(i * 113.7 - t * 190, w + 180) - 90, y = h * (.9 + i % 4 * .026);
      c.globalAlpha = .08 + i % 3 * .045;
      this.path([['moveTo', x, y], ['lineTo', x + 35 + i % 4 * 18, y - 2]], null, p.crest, 2);
    }
    c.globalAlpha = 1;
  }
  drawCrash(p, progress) {
    const c = this.ctx, w = this.width, h = this.height;
    const front = w * (-.2 + progress * 1.5);
    c.save(); c.globalAlpha = .94;
    this.path([['moveTo', -10, h * .34], ['bezierCurveTo', front * .5, h * .23, front + 30, h * .45, front, h * .7], ['quadraticCurveTo', front + 60, h * .82, front + 100, h], ['lineTo', -10, h], ['closePath']], this.gradient(0, h * .3, 0, h, [[0, p.foam], [.3, p.crest], [1, p.mid]]));
    for (let i = 0; i < 40; i++) {
      const x = front - mod(i * 73.8, Math.max(w, 1)), y = h * (.43 + i % 7 * .07);
      c.globalAlpha = .25;
      this.ellipse(x, y, 12 + i % 4 * 9, 3 + i % 3 * 2, p.foam, -.15);
    }
    c.restore();
  }
  drawSurfer(x, y, scale, board, t, style, progress) {
    const c = this.ctx, air = style === 'air', ink = '#080f20';
    const angle = air ? -Math.sin(progress * Math.PI) * .65 : style === 'spray' ? Math.sin(progress * Math.PI) * .35 : -.045 + Math.sin(t * 1.6) * .018;
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale); c.lineCap = 'round'; c.lineJoin = 'round';
    if (!air) this.ellipse(0, 9, 53, 5, '#051c3655');
    // Board remains a dark shape. A thin coloured rail preserves customisation.
    this.path([['moveTo', -53, 2], ['quadraticCurveTo', 9, 7, 57, -7], ['quadraticCurveTo', 44, 13, -49, 8], ['closePath']], '#0a263c');
    c.globalAlpha *= .8;
    this.path([['moveTo', -50, 3], ['quadraticCurveTo', 10, 9, 56, -6]], null, board, 1.15);
    c.globalAlpha /= .8;
    this.path([['moveTo', -35, 8], ['lineTo', -39, 18], ['lineTo', -25, 10]], ink);
    this.path([['moveTo', -48, 4], ['quadraticCurveTo', -62, -7, -31, -4]], null, ink, .8);
    // One silhouette: low hips, forward lean and asymmetric bent knees.
    this.path([['moveTo', -13, -31], ['quadraticCurveTo', -23, -24, -22, -15], ['lineTo', -34, -1]], null, ink, 8);
    this.path([['moveTo', -9, -28], ['quadraticCurveTo', 2, -30, 15, -26], ['quadraticCurveTo', 19, -25, 16, -17], ['lineTo', 10, -1]], null, ink, 9);
    this.path([['moveTo', -34, -1], ['quadraticCurveTo', -28, 1, -23, 0]], null, ink, 4);
    this.path([['moveTo', 10, -1], ['quadraticCurveTo', 17, 2, 24, 0]], null, ink, 4);
    this.path([['moveTo', -19, -31], ['bezierCurveTo', -23, -40, -6, -53, 4, -57], ['quadraticCurveTo', 13, -61, 20, -52], ['quadraticCurveTo', 13, -46, 5, -42], ['lineTo', -3, -30], ['quadraticCurveTo', -7, -24, -19, -31], ['closePath']], ink);
    // Trailing hand and forward reaching hand clearly show the direction of travel.
    this.path([['moveTo', 4, -54], ['quadraticCurveTo', -12, air ? -62 : -51, -23, air ? -64 : -44], ['lineTo', -39, air ? -70 : -32]], null, ink, 5.8);
    this.path([['moveTo', -39, air ? -70 : -32], ['lineTo', -45, air ? -75 : -28]], null, ink, 2.8);
    this.path([['moveTo', 16, -52], ['quadraticCurveTo', 26, air ? -61 : -45, 32, air ? -66 : -41], ['lineTo', 46, air ? -72 : -33]], null, ink, 5.5);
    this.path([['moveTo', 46, air ? -72 : -33], ['lineTo', 51, air ? -77 : -31], ['lineTo', 52, air ? -79 : -28]], null, ink, 2.6);
    this.path([['moveTo', 13, -56], ['lineTo', 20, -64]], null, ink, 7);
    // Nose, chin and hair are described by the outline, with no facial detailing.
    this.path([['moveTo', 16, -62], ['bezierCurveTo', 12, -68, 15, -77, 21, -79], ['quadraticCurveTo', 29, -81, 32, -73], ['lineTo', 31, -69], ['lineTo', 35, -66], ['lineTo', 31, -65], ['quadraticCurveTo', 32, -59, 26, -60], ['lineTo', 23, -57], ['closePath']], ink);
    c.restore();
  }
}
