const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const palettes = {
  daybreak: { sky: '#abcfc8', light: '#fff2c3', horizon: '#59bac0', water: '#08758a', deep: '#042b42', mid: '#08647a', crest: '#28c4bb', foam: '#d8fff1', glow: '#83ebd7' },
  sunset: { sky: '#df997e', light: '#ffe3ac', horizon: '#a3b6aa', water: '#176e83', deep: '#222d4c', mid: '#3b617d', crest: '#5dc3b3', foam: '#fff1d5', glow: '#e5d1a0' },
  moonlight: { sky: '#283c66', light: '#d9eeff', horizon: '#497c9a', water: '#14536e', deep: '#09172f', mid: '#193958', crest: '#3c91ae', foam: '#c7f5ff', glow: '#64d8ea' }
};

// Presentation only: the scene receives public round state, never a crash target.
export class OceanScene {
  constructor(canvas, label) {
    this.canvas = canvas;
    this.label = label;
    this.ctx = canvas.getContext('2d');
    this.theme = 'daybreak'; this.board = '#d8f76d'; this.finish = 'air';
    this.cashoutAt = -Infinity; this.crashAt = -Infinity;
    this.crewFinishTimes = new Map();
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    this.motionQuery.addEventListener('change', event => { this.reducedMotion = event.matches; });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = width; this.height = height;
    if (this.canvas.width === Math.round(width * ratio) && this.canvas.height === Math.round(height * ratio)) return;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.lastState) this.draw(this.lastTime, this.lastState);
  }

  onCashout(now) { this.cashoutAt = now; }
  onCrash(now) { this.crashAt = now; }
  onWaiting() { this.crewFinishTimes.clear(); this.cashoutAt = -Infinity; this.crashAt = -Infinity; }
  onCrewCashout(name, now) { this.crewFinishTimes.set(name, now); }

  gradient(x0, y0, x1, y1, stops) {
    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [stop, color] of stops) gradient.addColorStop(stop, color);
    return gradient;
  }
  path(points, fill, stroke, width = 1) {
    const ctx = this.ctx; ctx.beginPath();
    for (const [method, ...values] of points) ctx[method](...values);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  ellipse(x, y, rx, ry, fill, angle = 0) {
    const ctx = this.ctx; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  }

  draw(now, state) {
    this.lastTime = now; this.lastState = state;
    const ctx = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    const p = palettes[this.theme];
    const t = this.reducedMotion ? 0 : now / 1000;
    const elapsed = state.phase === 'waiting' ? 0 : Math.log(Math.max(1, state.multiplier)) / .105;
    const travel = this.reducedMotion ? .45 : smooth(elapsed / 12);
    const cashAge = (now - this.cashoutAt) / 1000;
    const finishing = state.bet?.status === 'cashed' && cashAge >= 0 && cashAge < 1.8;
    const exit = finishing && !this.reducedMotion ? smooth(cashAge / 1.8) : 0;
    const cameraExit = !this.reducedMotion && state.bet?.status === 'cashed'
      ? cashAge < 1.8 ? exit : 1 - smooth((cashAge - 1.8) / 1.4) : 0;
    // Low camera, a sunlit opening and a darker near wall. Motion follows elapsed time.
    const camera = {
      x: w * (.77 + travel * .015) + Math.sin(t * .38) * w * .004,
      y: h * (.405 - travel * .028) + Math.sin(t * .65) * 2,
      rx: w * (.257 - travel * .037 + cameraExit * .17),
      ry: h * (.38 - travel * .032 + cameraExit * .16)
    };
    ctx.clearRect(0, 0, w, h);
    this.drawHorizon(p, camera, t);
    this.drawBarrel(p, camera, t, travel, exit);
    this.drawFloor(p, camera, t, travel);
    // Crew stays in the middle distance so the local surfer is always legible.
    state.crew.slice(0, 3).forEach((surfer, i) => {
      if (surfer.status === 'wiped') return;
      const age = (now - (this.crewFinishTimes.get(surfer.name) ?? -Infinity)) / 1100;
      if (surfer.status === 'cashed' && (this.reducedMotion || age >= 1)) return;
      const f = surfer.status === 'cashed' ? clamp(age) : 0;
      const x = w * (.73 + i * .066 + f * .20), y = h * (.60 + i * .037 - Math.sin(f * Math.PI) * .09);
      ctx.globalAlpha = .65 * (1 - f);
      this.drawSurfer(x, y, Math.max(.30, Math.min(.63, w / 1300)) + i * .035, surfer.color, t + i, 'crew', f);
      ctx.globalAlpha = 1;
    });

    const x = w * (.50 + exit * .52), y = h * .84 + Math.sin(t * 1.65) * 2;
    const size = Math.min(2.5, Math.max(1.38, w / 350), h / 210);
    const ownLive = !state.bet || ['waiting', 'riding'].includes(state.bet.status);
    if (state.phase !== 'crashed' && ownLive) {
      this.drawWake(x, y, size, p, t, travel);
      this.drawSurfer(x, y, size, this.board, t, 'ride', 0);
    } else if (finishing && !this.reducedMotion) {
      const arc = this.finish === 'air' ? Math.sin(exit * Math.PI) * h * .32 : this.finish === 'barrel' ? exit * h * .20 : Math.sin(exit * Math.PI) * h * .08;
      this.drawWake(x, y, size, p, t, this.finish === 'spray' ? 2 : 1);
      this.drawSurfer(x, y - arc, size * (1 - exit * .26), this.board, t, this.finish, exit);
    }
    if (this.label) {
      this.label.style.left = `${x / w * 100}%`;
      this.label.style.top = `${(y - size * 78) / h * 100}%`;
    }
    this.drawMist(p, camera, t, travel);
    if (state.phase === 'crashed') this.drawCrash(p, (now - this.crashAt) / 1000, state.bet?.status === 'cashed');
    // A single warm exposure bloom on exit; no repeated flashes or camera shake.
    if (finishing && !this.reducedMotion) {
      ctx.globalAlpha = Math.sin(exit * Math.PI) * .18;
      ctx.fillStyle = p.light; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = this.gradient(0, 0, 0, h, [[0, '#02152077'], [.25, '#02152000'], [.73, '#02152000'], [1, '#021520bb']]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.gradient(0, 0, w * .49, 0, [[0, '#02152088'], [1, '#02152000']]);
    ctx.fillRect(0, 0, w * .49, h * .65);
  }

  drawHorizon(p, c, t) {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.fillStyle = this.gradient(0, 0, 0, h, [[0, p.sky], [.40, p.light], [.46, p.horizon], [1, p.water]]);
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(c.x, h * .27, 1, c.x, h * .27, h * .37);
    glow.addColorStop(0, p.light); glow.addColorStop(.22, p.light + 'b0'); glow.addColorStop(1, p.light + '00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    this.ellipse(c.x, h * .27, h * .048, h * .048, p.light);
    ctx.globalAlpha = .23;
    this.path([['moveTo', w * .69, h * .44], ['bezierCurveTo', w * .78, h * .43, w * .85, h * .39, w, h * .42], ['lineTo', w, h * .46], ['closePath']], p.deep);
    for (let i = 0; i < 24; i++) {
      const yy = h * .46 + i * i * h * .00055;
      const shift = Math.sin(t * .7 + i) * 8;
      this.path([['moveTo', c.x - 18 - i * 6 + shift, yy], ['lineTo', c.x + 25 + i * 7 + shift, yy]], null, p.light, 1 + i % 2);
    }
    ctx.globalAlpha = 1;
  }

  drawBarrel(p, c, t, travel, exit) {
    const ctx = this.ctx, w = this.width, h = this.height;
    // An irregular, slanted opening breaks the symmetry of a perfect tube.
    const opening = () => {
      ctx.moveTo(c.x + c.rx * .82, c.y + c.ry * .56);
      ctx.bezierCurveTo(c.x + c.rx * 1.16, c.y - c.ry * .36, c.x + c.rx * .66, c.y - c.ry * 1.11, c.x - c.rx * .08, c.y - c.ry);
      ctx.bezierCurveTo(c.x - c.rx * .86, c.y - c.ry * .92, c.x - c.rx * 1.12, c.y + c.ry * .23, c.x - c.rx * .88, c.y + c.ry * .88);
      ctx.bezierCurveTo(c.x - c.rx * .50, c.y + c.ry * 1.15, c.x + c.rx * .53, c.y + c.ry * 1.10, c.x + c.rx * .82, c.y + c.ry * .56);
      ctx.closePath();
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(-2, -2, w + 4, h + 4); opening(); ctx.clip('evenodd');
    ctx.fillStyle = this.gradient(0, 0, w, h * .78, [[0, p.deep], [.33, p.mid], [.67, p.crest], [.9, p.water], [1, p.deep]]);
    ctx.fillRect(0, 0, w, h);
    const light = ctx.createRadialGradient(c.x - c.rx * .3, c.y - c.ry * .45, 1, c.x, c.y, w * .78);
    light.addColorStop(0, p.glow + '99'); light.addColorStop(.5, p.crest + '20'); light.addColorStop(1, p.deep + 'bb');
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    // Uneven translucent ribbons describe the roof curving overhead.
    for (let i = 27; i >= 0; i--) {
      const z = Math.pow(i / 27, 1.18), ripple = Math.sin(i * 1.7 + t * .28) * .006;
      const ex = c.x - w * .32 * z, ey = c.y + h * .33 * z;
      ctx.globalAlpha = i % 6 === 0 ? .16 : .045 + (i % 3) * .026;
      ctx.beginPath();
      const rotation = -.18 - z * .06;
      for (let j = 0; j <= 60; j++) {
        const a = Math.PI * (.91 + j / 60 * 1.96);
        const waviness = Math.sin(a * 7 + i * 1.4 + t * .4) * .006 + Math.cos(a * 11 - i * .9) * .003;
        const xx = Math.cos(a) * (c.rx + w * (.66 * z + ripple + waviness));
        const yy = Math.sin(a) * (c.ry + h * (.79 * z + waviness));
        const px = ex + xx * Math.cos(rotation) - yy * Math.sin(rotation);
        const py = ey + xx * Math.sin(rotation) + yy * Math.cos(rotation);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = i % 7 === 0 ? p.deep : p.foam;
      ctx.lineWidth = i % 7 === 0 ? 17 : i % 6 === 0 ? 4 : 1.1;
      ctx.stroke();
    }
    // Broken specular strokes follow the water instead of forming a wire grid.
    for (let i = 0; i < 40; i++) {
      const z = (i * .618033) % 1, a = 2.6 + (i % 9) * .37;
      const xx = c.x - w * .25 * z, yy = c.y + h * .29 * z;
      ctx.globalAlpha = .035 + (i % 4) * .018;
      ctx.beginPath();
      ctx.ellipse(xx, yy, c.rx + w * .62 * z, c.ry + h * .76 * z, -.18, a, a + .20 + i % 4 * .12);
      ctx.strokeStyle = p.foam; ctx.lineWidth = 1 + i % 3; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
    // The lip is brightest on the right where backlit spray falls.
    ctx.save(); ctx.beginPath(); opening(); ctx.strokeStyle = p.foam + 'aa'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * .98, c.ry * 1.025, -.13, -1.39, 1.06);
    ctx.strokeStyle = p.glow + '70'; ctx.lineWidth = Math.max(9, w * .02); ctx.stroke();
    for (let i = 0; i < 90; i++) {
      const a = -1.52 + i / 90 * 2.64;
      const jitter = Math.sin(i * 13.7 + t * .6);
      const xx = c.x + Math.cos(a) * (c.rx + jitter * 3);
      const yy = c.y + Math.sin(a) * c.ry + jitter * 2;
      ctx.globalAlpha = .10 + i % 4 * .08;
      this.ellipse(xx, yy, 2 + i % 4, 1 + i % 3, p.foam, a);
    }
    ctx.restore();
    if (!this.reducedMotion && !exit) {
      for (let i = 0; i < 20; i++) {
        const z = (i / 20 + t * (.12 + travel * .10)) % 1;
        ctx.globalAlpha = Math.sin(z * Math.PI) * .16;
        const a = i * 2.399;
        const xx = c.x + Math.cos(a) * (c.rx + z * w * .6) - z * w * .25;
        const yy = c.y + Math.sin(a) * (c.ry + z * h * .7) + z * h * .28;
        this.path([['moveTo', xx, yy], ['lineTo', xx + (xx - c.x) * .08, yy + (yy - c.y) * .08]], null, p.foam, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawFloor(p, c, t, travel) {
    const ctx = this.ctx, w = this.width, h = this.height;
    this.path([['moveTo', 0, h * .64], ['bezierCurveTo', w * .3, h * .82, w * .71, h * .74, w, h * .60], ['lineTo', w, h], ['lineTo', 0, h], ['closePath']], this.gradient(0, h * .64, w * .5, h, [[0, p.water + '00'], [.25, p.water + 'bb'], [1, p.deep]]));
    for (let i = 0; i < 16; i++) {
      const z = (i / 16 + t * (.055 + travel * .018)) % 1;
      const y = h * (.63 + z * z * .43);
      ctx.globalAlpha = .055 + z * .13;
      this.path([['moveTo', -w * .1, y + h * .10], ['bezierCurveTo', w * .22, y + h * .15, w * .68, y + h * .03, w * 1.1, y - h * .035]], null, p.glow, i % 5 === 0 ? 2 : .7);
    }
    for (let i = 0; i < 7; i++) {
      const end = w * (i / 6 * 1.7 - .4);
      ctx.globalAlpha = .025 + (i % 3) * .018;
      this.path([['moveTo', c.x + (end - c.x) * .12, h * .61], ['quadraticCurveTo', c.x + (end - c.x) * .55, h * .89, end, h * 1.1]], null, p.foam, i % 3 ? 1 : 2);
    }
    ctx.globalAlpha = 1;
  }

  drawWake(x, y, scale, p, t, intensity) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    for (let i = 0; i < 12; i++) {
      ctx.globalAlpha = .1 + (1 - i / 12) * .18;
      this.path([['moveTo', 24, 5 + i], ['quadraticCurveTo', -40, 10 + i * 4, -120 - i * 8, 45 + i * 5]], null, p.foam, i % 3 ? 1 : 2);
    }
    for (let i = 0; i < 38; i++) {
      const z = (i * .618 + t * .7) % 1;
      const spread = 1 + intensity * .7;
      ctx.globalAlpha = (1 - z) * .65;
      this.ellipse(-26 - z * 95, 6 - Math.sin(z * Math.PI) * (10 + i % 11 * 3) * spread + z * 35, .5 + i % 3 * .6, .5 + i % 2 * .4, p.foam);
    }
    ctx.restore();
  }

  drawMist(p, c, t, travel) {
    const ctx = this.ctx, w = this.width, h = this.height;
    for (let i = 0; i < 85; i++) {
      const z = (i * .618033 + t * (.16 + travel * .07)) % 1;
      const a = -.8 + (i % 19) / 19 * 1.98;
      const x = c.x + Math.cos(a) * c.rx + z * w * .045;
      const y = c.y + Math.sin(a) * c.ry + z * z * h * .17;
      ctx.globalAlpha = (1 - z) * (.20 + i % 4 * .12);
      this.ellipse(x, y, .7 + i % 3 * .65, 1.4 + z * 2.8, p.foam, -.25);
    }
    ctx.globalAlpha = 1;
  }

  drawCrash(p, age, alreadyCashed) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const progress = this.reducedMotion ? 1 : smooth(age / .85);
    ctx.save(); ctx.globalAlpha = progress * (alreadyCashed ? .45 : .86);
    this.path([['moveTo', 0, -h], ['lineTo', w, -h], ['lineTo', w, h * progress], ['bezierCurveTo', w * .70, h * (progress + .17), w * .30, h * (progress - .3), 0, h * (progress + .08)], ['closePath']], this.gradient(0, 0, 0, h, [[0, p.deep], [.35, p.water], [.83, p.crest], [1, p.foam]]));
    if (!this.reducedMotion) {
      for (let i = 0; i < 65; i++) {
        const a = i * 2.399, radius = (20 + i * 4) * progress;
        ctx.globalAlpha = .5 * Math.max(0, 1 - age / 2.5);
        this.ellipse(w * .56 + Math.cos(a) * radius, h * .67 + Math.sin(a) * radius * .65, 2 + i % 4, 1 + i % 5, p.foam);
      }
    }
    ctx.restore();
  }

  drawSurfer(x, y, scale, board, t, style, progress) {
    const ctx = this.ctx;
    const air = style === 'air';
    const angle = air ? -.13 - Math.sin(progress * Math.PI) * .65 : style === 'spray' ? -.12 + Math.sin(progress * Math.PI) * .55 : -.12 + Math.sin(t * 1.2) * .016;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
    // Board rail, deck, stringer, traction pad and leash stay visible at close range.
    if (!air) this.ellipse(-3, 10, 48, 7, '#001e3655');
    this.path([['moveTo', -47, 5], ['bezierCurveTo', -20, -8, 38, -7, 51, -3], ['bezierCurveTo', 46, 9, -23, 15, -47, 5], ['closePath']], board, '#e6fff3aa', .8);
    this.path([['moveTo', -42, 9], ['quadraticCurveTo', 2, 18, 49, 0]], null, '#052d4266', 2);
    this.path([['moveTo', -34, 5], ['lineTo', 36, 1]], null, '#123d4366', .9);
    this.path([['moveTo', -34, 2], ['lineTo', -17, 0], ['lineTo', -15, 8], ['lineTo', -33, 9], ['closePath']], '#102b39bb');
    this.path([['moveTo', -39, 7], ['quadraticCurveTo', -57, 26, -24, 3]], null, '#bcefe880', .7);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Bent legs, asymmetric shoulders and a trailing hand make a readable carve.
    this.path([['moveTo', -7, -29], ['lineTo', -24, -14], ['lineTo', -22, 1]], null, '#092d40', 9);
    this.path([['moveTo', -5, -28], ['lineTo', 14, -19], ['lineTo', 23, 0]], null, '#113d50', 10);
    this.path([['moveTo', 12, -20], ['lineTo', 21, -4]], null, '#32727a', 2);
    this.path([['moveTo', -23, 0], ['lineTo', -15, 1]], null, '#e3b293', 4);
    this.path([['moveTo', 22, -1], ['lineTo', 31, 0]], null, '#edc2a1', 4);
    this.path([['moveTo', -17, -51], ['quadraticCurveTo', -6, -58, 3, -48], ['lineTo', 6, -30], ['quadraticCurveTo', -8, -24, -17, -31], ['closePath']], this.gradient(-17, -49, 7, -30, [[0, '#ffbf91'], [.34, '#e88161'], [1, '#b8463d']]));
    this.path([['moveTo', -16, -44], ['quadraticCurveTo', -7, -40, 4, -42]], null, '#ffdcc0', 2.6);
    this.path([['moveTo', -17, -49], ['lineTo', -29, air ? -55 : -34], ['lineTo', -43, air ? -65 : -29]], null, '#cd9479', 5.5);
    this.path([['moveTo', 0, -49], ['lineTo', 17, air ? -49 : -37], ['lineTo', 31, air ? -60 : -44]], null, '#f0c4a1', 5);
    this.path([['moveTo', -9, -54], ['lineTo', -10, -60]], null, '#e8b18a', 6);
    this.ellipse(-9, -66, 7, 8.5, '#edbc94', .12);
    this.path([['moveTo', -16, -63], ['bezierCurveTo', -21, -77, -1, -79, -1, -65], ['lineTo', -5, -67], ['lineTo', -12, -69], ['closePath']], '#152738');
    this.path([['moveTo', -16, -71], ['quadraticCurveTo', -10, -76, -5, -72]], null, '#607877', 1.3);
    ctx.restore();
  }
}
