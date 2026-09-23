import * as THREE from '../public/vendor/three/three.module.min.js';
import { SurferRig } from './surfer-rig.js';
import { makeWaterMaterial, makeSkyMaterial, applyWaterTheme, oceanThemes } from './water-material.js';

const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

function wavePoint(u, v, out = new THREE.Vector3()) {
  const z = 10 - v * 21;
  const angle = -Math.PI * .5 - u * Math.PI * (1.65 - v * .12);
  const radius = 6.5 + v * 1.6 + Math.sin(v * 4.4) * .5;
  return out.set(-3.3 + v * 2.5 + Math.cos(angle) * radius + Math.sin(z * .075) * .32, 4.7 + Math.sin(angle) * 4.65, z);
}

function makeWave() {
  const positions = [], uv = [], indices = [];
  const around = 112, length = 100;
  for (let j = 0; j <= length; j++) {
    for (let i = 0; i <= around; i++) {
      const p = wavePoint(i / around, j / length);
      positions.push(p.x, p.y, p.z); uv.push(i / around, j / length);
      if (j < length && i < around) {
        const a = j * (around + 1) + i, b = a + around + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function makeParticles(count, size, opacity) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = .5 + (i * .618033) % 1;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSize: { value: size }, uOpacity: { value: opacity }, uColor: { value: new THREE.Color('#defbf1') } },
    vertexShader: 'attribute float aSize; uniform float uSize; varying float vFade; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(uSize*aSize*200.0/max(1.0,-mv.z),1.0,34.0); vFade=1.0-smoothstep(22.0,60.0,-mv.z); }',
    fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vFade; void main(){ float radius=length(gl_PointCoord-.5)*2.0; if(radius>1.0) discard; float alpha=pow(1.0-radius,1.4)*uOpacity*vFade; gl_FragColor=vec4(uColor,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  return new THREE.Points(geometry, material);
}

export class Ocean3D {
  constructor(canvas, label, context) {
    this.canvas = canvas; this.label = label;
    this.theme = 'daybreak'; this.board = '#d8f76d'; this.finish = 'air';
    this.cashoutAt = -Infinity; this.crashAt = -Infinity; this.crewFinishTimes = new Map();
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    this.onMotion = event => { this.reducedMotion = event.matches; this.reducedFrameKey = null; };
    this.motionQuery.addEventListener('change', this.onMotion);
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.debug.onShaderError = () => { throw new Error('Ocean shader compilation failed'); };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(47, 1, .1, 330);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 20), makeSkyMaterial()); this.scene.add(this.sky);
    this.waveMaterial = makeWaterMaterial(1); this.wave = new THREE.Mesh(makeWave(), this.waveMaterial); this.scene.add(this.wave);
    this.seaMaterial = makeWaterMaterial(0);
    const seaGeometry = new THREE.PlaneGeometry(300, 300, 96, 96); seaGeometry.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeometry, this.seaMaterial); this.sea.position.y = -.10; this.scene.add(this.sea);
    this.ambient = new THREE.HemisphereLight('#bdece7', '#153d55', 1.1); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#ffead0', 2.8); this.sun.position.set(12, 20, -24); this.scene.add(this.sun);
    this.rim = new THREE.DirectionalLight('#64e8dd', 2.0); this.rim.position.set(-8, 6, 12); this.scene.add(this.rim);
    this.surfer = new SurferRig(); this.surfer.root.scale.setScalar(1.45); this.scene.add(this.surfer.root);
    this.crew = Array.from({ length: 2 }, () => { const rider = new SurferRig({ crew: true }); rider.root.scale.setScalar(.64); this.scene.add(rider.root); return rider; });
    this.lipSpray = makeParticles(900, .95, .66); this.scene.add(this.lipSpray);
    this.trail = makeParticles(260, .73, .8); this.scene.add(this.trail);
    this.whitewater = makeParticles(240, 2.7, .45); this.scene.add(this.whitewater);
    // A soft contact shadow grounds the board without an expensive reflection pass.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext('2d');
    const gradient = shadowContext.createRadialGradient(32,32,2,32,32,32); gradient.addColorStop(0,'#00182488'); gradient.addColorStop(1,'#00182400');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0,0,64,64);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    this.contact.rotation.x = -Math.PI / 2; this.scene.add(this.contact);
    this.reflectionTarget = new THREE.WebGLRenderTarget(512, 320, { depthBuffer: true });
    this.reflectionTarget.samples = 2;
    this.reflectionCamera = new THREE.PerspectiveCamera(); this.reflectionLook = new THREE.Vector3(); this.sprayPoint = new THREE.Vector3();
    this.reflectionBias = new THREE.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
    this.seaMaterial.uniforms.uReflection.value = this.reflectionTarget.texture;
    this.projected = new THREE.Vector3(); this.look = new THREE.Vector3(); this.pointer = 0;
    this.onPointer = event => { if (event.pointerType !== 'touch') { const rect = canvas.getBoundingClientRect(); this.pointer = (event.clientX - rect.left) / rect.width - .5; } };
    this.onLeave = () => { this.pointer = 0; };
    canvas.addEventListener('pointermove', this.onPointer); canvas.addEventListener('pointerleave', this.onLeave);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    canvas.dataset.renderer = 'webgl';
    this.resize(); this.setTheme();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    this.width = rect.width; this.height = rect.height; this.reducedFrameKey = null;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height; this.camera.fov = this.camera.aspect < .9 ? 56 : 47;
    this.camera.updateProjectionMatrix();
    if (this.reflectionTarget) this.reflectionTarget.setSize(Math.min(640, Math.round(rect.width * .65)), Math.min(400, Math.round(rect.height * .65)));
    if (this.lastState) this.draw(this.lastTime, this.lastState);
  }
  setTheme() {
    const p = oceanThemes[this.theme];
    applyWaterTheme(this.waveMaterial, this.theme); applyWaterTheme(this.seaMaterial, this.theme);
    const uniforms = this.sky.material.uniforms;
    uniforms.uSky.value.set(p.sky); uniforms.uHorizon.value.set(p.horizon); uniforms.uSun.value.set(p.sun); uniforms.uNight.value = p.night;
    this.sun.color.set(p.light); this.sun.intensity = p.night ? 1.7 : 2.8;
    this.ambient.intensity = p.night ? .9 : 1.1;
    this.renderer.toneMappingExposure = p.exposure;
    this.appliedTheme = this.theme;
  }
  onCashout(now) { this.cashoutAt = now; }
  onCrash(now) { this.crashAt = now; }
  onCrewCashout(name, now) { this.crewFinishTimes.set(name, now); }
  onWaiting() { this.cashoutAt = this.crashAt = -Infinity; this.crewFinishTimes.clear(); }

  draw(now, state) {
    this.lastTime = now; this.lastState = state;
    if (!this.width || !this.height) return;
    if (this.reducedMotion) {
      const key = [this.theme,this.board,this.finish,state.phase,state.bet?.status,...state.crew.map(member=>member.status)].join('|');
      if (key === this.reducedFrameKey) return;
      this.reducedFrameKey = key;
    }
    const frameDelta = now - (this.previousFrameTime ?? now); this.previousFrameTime = now;
    if (!this.reducedMotion && frameDelta > 30 && frameDelta < 150) this.slowFrames = (this.slowFrames || 0) + 1;
    else this.slowFrames = Math.max(0, (this.slowFrames || 0) - 1);
    if (this.slowFrames >= 40 && this.renderer.getPixelRatio() > .8) {
      this.renderer.setPixelRatio(Math.max(.8, this.renderer.getPixelRatio() * .75)); this.slowFrames = 0;
      this.lowQuality = this.renderer.getPixelRatio() <= 1;
      this.seaMaterial.uniforms.uReflectionStrength.value = this.lowQuality ? 0 : 1;
      this.canvas.dataset.quality = this.lowQuality ? 'balanced' : 'full';
    }
    if (this.appliedTheme !== this.theme) this.setTheme();
    if (this.appliedBoard !== this.board) { this.surfer.boardMaterial.color.set(this.board); this.appliedBoard = this.board; }
    const t = this.reducedMotion ? 0 : now / 1000;
    const elapsed = state.phase === 'waiting' ? 0 : Math.log(Math.max(1, state.multiplier)) / .105;
    const travel = this.reducedMotion ? .5 : smooth(elapsed / 10);
    const cashAge = (now - this.cashoutAt) / 1000;
    const cashed = state.bet?.status === 'cashed';
    const exit = cashed && !this.reducedMotion ? smooth(cashAge / 2.2) : 0;
    const exitCamera = !this.reducedMotion && cashed ? (cashAge < 2.2 ? exit : 1 - smooth((cashAge - 2.2) / 1.8)) : 0;
    const crashAge = (now - this.crashAt) / 1000;
    const crash = state.phase === 'crashed' ? this.reducedMotion ? 1 : smooth(crashAge / 1.0) : 0;
    this.waveMaterial.uniforms.uTime.value = t;
    this.waveMaterial.uniforms.uEnergy.value = travel;
    this.seaMaterial.uniforms.uTime.value = t;
    // Only the confirmed crash closes the water. No future outcome enters this module.
    this.wave.scale.y = 1 - crash * .58; this.wave.position.y = -crash * .2; this.sea.position.y = -.10 + crash * 3.6;

    const sx = -.6 + Math.sin(t * .66) * .12 + exit * 10;
    const sz = 3.3 - Math.sin(t * .43) * .20 - exit * 7;
    const carve = Math.sin(t * .85) * .12;
    const air = this.finish === 'air' ? Math.sin(exit * Math.PI) : 0;
    const sprayTurn = this.finish === 'spray' ? Math.sin(exit * Math.PI) : 0;
    const sy = .10 + Math.sin(t * 1.7) * .025 + air * 3.0 + (this.finish === 'barrel' ? exit * .22 : 0);
    this.surfer.root.position.set(sx, sy, sz);
    this.surfer.root.rotation.set(air * -.55, .48 - exit * .7 - sprayTurn * .65, carve + sprayTurn * -.32 + air * .12);
    this.surfer.pose(t, air, carve);
    this.surfer.root.visible = state.phase !== 'crashed' && !cashed || (cashed && cashAge < 2.2 && !this.reducedMotion);
    this.contact.position.set(sx, .065, sz); this.contact.material.opacity = this.surfer.root.visible ? 1 - air * .85 : 0;
    this.contact.rotation.z = .48 - sprayTurn * .65;
    this.crew.forEach((rig, i) => {
      const member = state.crew[i];
      const age = (now - (this.crewFinishTimes.get(member?.name) ?? -Infinity)) / 1000;
      const done = member?.status === 'cashed';
      rig.root.visible = !!member && member.status !== 'wiped' && (!done || age < 1 && !this.reducedMotion);
      rig.root.position.set(2.0 + i * 1.5 + (done ? clamp(age) * 5 : 0), .14, -13 - i * 7);
      rig.root.rotation.y = -.2; rig.pose(t + i, done ? Math.sin(clamp(age)*Math.PI) : 0);
      if (member) rig.boardMaterial.color.set(member.color);
    });

    const mobile = this.width / this.height < .9;
    const sway = this.reducedMotion ? 0 : Math.sin(t * .38) * .13 + this.pointer * .35;
    this.camera.position.set(-.4 - travel * 1.1 + exitCamera * 3.5 + sway, (mobile ? 4.5 : 4.1) - travel * .75 + air * .6, 13.8 - travel * 2.2 - exitCamera * 1.2);
    this.look.set(mobile ? -1.6 : -3.4, 1.55 + air * .85, mobile ? -2.0 : -7.5);
    this.camera.lookAt(this.look); this.camera.updateMatrixWorld();
    this.updateSpray(t, sx, sy, sz, travel, sprayTurn, crash);
    this.projected.set(sx, sy + 2.75, sz).project(this.camera);
    if (this.label) {
      this.label.style.left = `${clamp(this.projected.x * .5 + .5) * 100}%`;
      this.label.style.top = `${clamp(-this.projected.y * .5 + .5) * 100}%`;
    }
    if (!this.lowQuality) this.renderReflection();
    this.renderer.render(this.scene, this.camera);
  }

  renderReflection() {
    const mirror = this.reflectionCamera;
    mirror.copy(this.camera); mirror.position.y = 2 * this.sea.position.y - this.camera.position.y; mirror.up.set(0,-1,0);
    this.reflectionLook.copy(this.look); this.reflectionLook.y = 2 * this.sea.position.y - this.look.y;
    mirror.lookAt(this.reflectionLook); mirror.updateMatrixWorld();
    this.seaMaterial.uniforms.uReflectionMatrix.value.copy(this.reflectionBias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    const oldToneMapping = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.sea.visible = false; this.contact.visible = false;
    this.renderer.setRenderTarget(this.reflectionTarget); this.renderer.render(this.scene,mirror);
    this.renderer.setRenderTarget(null); this.sea.visible = true; this.contact.visible = true;
    this.renderer.toneMapping = oldToneMapping;
  }

  updateSpray(t, x, y, z, energy, turn, crash) {
    const lip = this.lipSpray.geometry.attributes.position;
    for (let i = 0; i < lip.count; i++) {
      const v = (i * .618033 + t * .036) % 1;
      const point = wavePoint(.90 + (i % 13) / 130, v, this.sprayPoint);
      const age = (i * .381966 + t * .52) % 1;
      lip.setXYZ(i, point.x + age * (1.2 + i % 3 * .2), point.y * (1 - crash * .58) + .2 - age * age * 3.8, point.z + age * 1.4);
    }
    lip.needsUpdate = true;
    const trail = this.trail.geometry.attributes.position;
    this.trail.visible = this.surfer.root.visible;
    for (let i = 0; i < trail.count; i++) {
      const age = (i / trail.count + t * .72) % 1;
      const side = Math.sin(i * 7.13);
      trail.setXYZ(i, x + side * (.18 + age * (1.6 + turn * 3)), .14 + Math.sin(age * Math.PI) * (.32 + i % 7 * .045 + turn * .85), z + .9 + age * (5.5 + energy * 2));
    }
    trail.needsUpdate = true;
    const foam = this.whitewater.geometry.attributes.position;
    this.whitewater.visible = crash > 0;
    for (let i = 0; i < foam.count; i++) {
      const age = (i * .618033 + t * .18) % 1;
      foam.setXYZ(i, -5 + (i % 31) * .39 + age * 3, .2 + crash * 2.8 + Math.sin(i * 2.39) * crash * .3, 10 - age * 32);
    }
    foam.needsUpdate = true;
  }

  dispose() {
    this.observer.disconnect(); this.motionQuery.removeEventListener('change', this.onMotion);
    this.canvas.removeEventListener('pointermove', this.onPointer); this.canvas.removeEventListener('pointerleave', this.onLeave);
    const resources = new Set();
    this.scene.traverse(object => { if (object.geometry) resources.add(object.geometry); for (const mat of object.material ? [object.material].flat() : []) { if (mat.map) resources.add(mat.map); resources.add(mat); } });
    for (const resource of resources) resource.dispose();
    this.reflectionTarget.dispose(); this.renderer.dispose();
  }
}
