import { Ocean3D } from './ocean-3d.js';
import { OceanScene as CanvasScene } from './canvas-scene.js';

// Preserve the gameplay-facing interface while keeping graphics failure recoverable.
export class OceanScene {
  constructor(canvas, label) {
    this.canvas = canvas; this.label = label;
    this.onContextLost = event => { event.preventDefault(); this.useFallback(); };
    let context;
    try { context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' }); } catch { /* Canvas fallback below. */ }
    if (context) {
      try {
        this.impl = new Ocean3D(canvas, label, context);
        canvas.addEventListener('webglcontextlost', this.onContextLost);
      } catch { this.useFallback(); }
    } else this.useFallback();
  }
  useFallback() {
    const previous = this.impl;
    const settings = { theme: previous?.theme || 'daybreak', board: previous?.board || '#d8f76d', finish: previous?.finish || 'air' };
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    previous?.dispose?.();
    // A canvas with a WebGL context cannot subsequently acquire a 2D context.
    const replacement = this.canvas.cloneNode(false);
    this.canvas.replaceWith(replacement); this.canvas = replacement;
    this.impl = new CanvasScene(replacement, this.label); Object.assign(this.impl, settings);
    replacement.dataset.renderer = 'canvas';
    if (this.lastState) this.impl.draw(this.lastTime, this.lastState);
  }
  get theme() { return this.impl.theme; }
  set theme(value) { this.impl.theme = value; }
  get board() { return this.impl.board; }
  set board(value) { this.impl.board = value; }
  get finish() { return this.impl.finish; }
  set finish(value) { this.impl.finish = value; }
  resize() { this.impl.resize(); }
  onCashout(now) { this.impl.onCashout(now); }
  onCrash(now) { this.impl.onCrash(now); }
  onWaiting() { this.impl.onWaiting(); }
  onCrewCashout(name, now) { this.impl.onCrewCashout(name, now); }
  draw(now, state) {
    this.lastTime = now; this.lastState = state;
    try { this.impl.draw(now, state); } catch (error) {
      if (this.canvas.dataset.renderer !== 'webgl') throw error;
      this.useFallback();
    }
  }
}
