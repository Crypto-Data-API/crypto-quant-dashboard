(function () {
if (window.__cqScenes) return; window.__cqScenes = 1;
const URL3 = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const getThree = () => window.__cqThree || (window.__cqThree = import(URL3));
const waitCQ = () => new Promise(r => { const f = () => (window.CQ ? r(window.CQ) : setTimeout(f, 30)); f(); });
const MONO = "'Geist Mono', ui-monospace, monospace";
const BG = 0x080b10;
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
function fsButton(el, bg) {
  const ex = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>';
  const co = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"></path></svg>';
  const b = document.createElement('button'); b.type = 'button'; b.innerHTML = ex; b.title = 'Fullscreen'; b.setAttribute('aria-label', 'Fullscreen');
  b.style.cssText = 'position:absolute;top:10px;right:10px;z-index:6;width:30px;height:30px;display:flex;align-items:center;justify-content:center;padding:0;background:rgba(8,11,16,.78);border:1px solid #232d3a;border-radius:8px;color:#9aa8b8;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:color .2s,border-color .2s';
  b.onmouseenter = () => { b.style.color = '#fff'; b.style.borderColor = '#3a4859'; }; b.onmouseleave = () => { b.style.color = '#9aa8b8'; b.style.borderColor = '#232d3a'; };
  let pseudo = false, saved = ''; const bg0 = el.style.background;
  const isOn = () => document.fullscreenElement === el || pseudo;
  const sync = () => { const on = isOn(); b.innerHTML = on ? co : ex; b.title = on ? 'Exit fullscreen (Esc)' : 'Fullscreen'; if (!pseudo) el.style.background = on ? bg : bg0; };
  const exitPseudo = () => { pseudo = false; el.style.cssText = saved; sync(); };
  const enterPseudo = () => { saved = el.style.cssText; pseudo = true; Object.assign(el.style, { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', width: '100vw', height: '100vh', zIndex: '2147483000', background: bg, borderRadius: '0' }); sync(); };
  b.addEventListener('pointerdown', e => e.stopPropagation());
  b.addEventListener('click', e => { e.stopPropagation(); if (pseudo) return exitPseudo(); if (document.fullscreenElement === el) { document.exitFullscreen(); return; } if (el.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(enterPseudo); else enterPseudo(); });
  const onFs = () => sync(), onKey = e => { if (e.key === 'Escape' && pseudo) exitPseudo(); };
  document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', onKey);
  el.appendChild(b);
  return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); if (pseudo) exitPseudo(); b.remove(); };
}


function label(T, text, o = {}) {
  const size = o.size || 0.6, fs = 56, c = document.createElement('canvas'), x = c.getContext('2d');
  const font = (o.weight || 500) + ' ' + fs + 'px ' + MONO; x.font = font;
  c.width = Math.ceil(x.measureText(text).width) + 28; c.height = fs + 28;
  x.font = font; x.textBaseline = 'middle';
  if (o.bg) { x.fillStyle = o.bg; x.beginPath(); x.roundRect ? x.roundRect(2, 2, c.width - 4, c.height - 4, 14) : x.rect(2, 2, c.width - 4, c.height - 4); x.fill(); }
  x.fillStyle = o.color || '#9aa8b8'; x.fillText(text, 14, c.height / 2 + 2);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, fog: false, opacity: o.opacity == null ? 1 : o.opacity }));
  s.scale.set(size * c.width / c.height, size, 1); if (o.anchor === 'left') s.center.set(0, 0.5); if (o.anchor === 'right') s.center.set(1, 0.5); if (o.anchor === 'bottom') s.center.set(0.5, 0);
  s.renderOrder = o.order || 5; return s;
}
function glowMat(T) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute float aSize; attribute vec3 aColor; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a=a*a; float core=smoothstep(0.14,0.0,d); gl_FragColor=vec4(vC*(a+core*0.9)*vA, 1.0); }'
  });
}
function ptsGeo(T, n) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aColor', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSize', new T.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('aAlpha', new T.BufferAttribute(new Float32Array(n), 1)); return g; }
function lines(T, arr, color, opacity) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false })); }

class Scene3D extends HTMLElement {
  static get observedAttributes() { return this.attrs || []; }
  connectedCallback() {
    if (this._on) return; this._on = true;
    Object.assign(this.style, { display: 'block', position: 'relative', overflow: 'hidden', width: this.style.width || '100%', height: this.style.height || '100%', background: '#080b10', touchAction: 'pan-y' });
    const tp = this.tipEl = document.createElement('div');
    tp.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:none;background:rgba(7,10,14,.95);border:1px solid #2a3442;border-radius:7px;padding:7px 10px;font:500 11px/1.55 ' + MONO + ';color:#9aa8b8;white-space:nowrap;z-index:3;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    this.appendChild(tp);
    this._fsOff = fsButton(this, '#080b10');
    const ld = this.loadEl = document.createElement('div'); ld.textContent = 'initialising WebGL…'; ld.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 11px ' + MONO + ';color:#5b6878;letter-spacing:.06em'; this.appendChild(ld);
    Promise.all([getThree(), waitCQ(), document.fonts.ready]).then(([T, CQ]) => { if (!this._on || this._ready) return; this.T = T; this.CQ = CQ; this.S = CQ.state; this._setup(); }).catch(e => { ld.textContent = '3D unavailable'; ld.style.display = 'flex'; console.error('[cq-scenes]', e && e.message, e && e.stack); });
  }
  _setup() {
    const T = this.T; this.cfg && this.cfg();
    const r = (this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setClearColor(BG, 1);
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab';
    this.prepend(r.domElement); this.loadEl.style.display = 'none';
    this.scene = new T.Scene(); this.scene.fog = new T.Fog(BG, (this.dist0 || 30) * 0.8, (this.dist0 || 30) * 2.4);
    this.camera = new T.PerspectiveCamera(this.fov || 36, 1, 0.1, 400);
    this.yaw = this.yaw0 || 0; this.pitch = this.pitch0 || 0.4; this.dist = this.dist0 || 30; this.vyaw = 0; this.target = new T.Vector3(); this.glows = []; this.mx = -1; this.my = -1;
    const el = r.domElement; let drag = null;
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', e => { const b = el.getBoundingClientRect(); this.mx = e.clientX - b.left; this.my = e.clientY - b.top; this._hoverDirty = true; if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; this.vyaw = -dx * 0.006; this.yaw += this.vyaw; this.pitch = Math.max(0.05, Math.min(1.35, this.pitch + dy * 0.004)); } });
    el.addEventListener('pointerup', e => { if (drag && drag.moved < 5 && this.onClick) this.onClick(); drag = null; el.style.cursor = 'grab'; });
    el.addEventListener('pointerleave', () => { this.mx = this.my = -1; this.hideTip(); });
    this._drag = () => !!drag;
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._io = new IntersectionObserver(es => { this._vis = es[es.length - 1].isIntersecting; }); this._io.observe(this);
    this.build(); this._ready = true; this._resize();
    this._unsub = this.CQ.on((t, p) => this.onData && this.onData(t, p));
    this.onAttr && this.onAttr();
    this.t0 = performance.now(); let last = this.t0;
    const step = (now, force) => {
      if (!this._on) return;
      if (!force && (this._vis === false || document.hidden || !this.w)) { last = now; return; }
      if (!this.w) return;
      const dt = Math.min(0.05, (now - last) / 1000), t = (now - this.t0) / 1000; last = now;
      const mo = window.CQ && window.CQ.ui && window.CQ.ui.motion === false ? 0 : 1; this._sw = (this._sw == null ? mo : this._sw + (mo - this._sw) * 0.05);
      if (!this._drag()) { this.yaw += this.vyaw + (this.autoRot || 0) * dt * mo; this.vyaw *= 0.94; }
      const yw = this.yaw + (this.sway || 0) * this._sw * Math.sin(t * 0.13), c = this.camera, tg = this.target;
      c.position.set(tg.x + Math.sin(yw) * Math.cos(this.pitch) * this.dist, tg.y + Math.sin(this.pitch) * this.dist, tg.z + Math.cos(yw) * Math.cos(this.pitch) * this.dist); c.lookAt(tg);
      this.frame(t, dt, now); r.render(this.scene, c);
    };
    const fr = now => { if (!this._on) return; this._raf = requestAnimationFrame(fr); this._lastRaf = performance.now(); step(performance.now(), false); };
    this._raf = requestAnimationFrame(fr);
    this._iv = setInterval(() => { const n = performance.now(); if (this._on && n - (this._lastRaf || 0) > 400) step(n, true); }, 200);
  }
  _resize() { if (!this.renderer) return; const w = this.clientWidth, h = this.clientHeight; if (!w || !h) return; this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.fitAspect) this.dist = (this.dist0 || 30) * Math.max(1, Math.pow(this.fitAspect / (w / h), 0.85)); const s = h * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360)); this.glows.forEach(m => m.uniforms.uScale.value = s); }
  glow() { const m = glowMat(this.T); this.glows.push(m); return m; }
  attributeChangedCallback() { if (this._ready && this.onAttr) this.onAttr(); }
  project(x, y, z) { const v = (this._pv || (this._pv = new this.T.Vector3())).set(x, y, z).project(this.camera); return [(v.x + 1) / 2 * this.w, (1 - v.y) / 2 * this.h, v.z]; }
  showTip(x, y, html, accent) { const tp = this.tipEl; tp.innerHTML = html; tp.style.display = 'block'; tp.style.borderColor = accent || '#2a3442'; const tw = tp.offsetWidth, th = tp.offsetHeight; let tx = x + 14, ty = y - th - 10; if (tx + tw > this.w - 4) tx = x - tw - 14; if (ty < 4) ty = y + 16; tp.style.transform = 'translate(' + Math.max(4, tx) + 'px,' + ty + 'px)'; }
  hideTip() { if (this.tipEl) this.tipEl.style.display = 'none'; }
  ray() { const T = this.T; this._rc = this._rc || new T.Raycaster(); this._rc.setFromCamera(new T.Vector2(this.mx / this.w * 2 - 1, -(this.my / this.h) * 2 + 1), this.camera); return this._rc; }
  disconnectedCallback() {
    this._on = false; this._ready = false; cancelAnimationFrame(this._raf); clearInterval(this._iv); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); this._unsub && this._unsub();
    if (this.scene) this.scene.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map && m.map.dispose(); m.dispose(); }); } });
    if (this.envTex) this.envTex.dispose(); if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss && this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.renderer = null; }
    this.tipEl && this.tipEl.remove(); this.loadEl && this.loadEl.remove(); this._fsOff && this._fsOff(); this._fsOff = null;
  }
}

// ================= live liquidation stream =================
class LiqStream extends Scene3D {
  static attrs = ['coin', 'min'];
  cfg() { this.dist0 = 22; this.yaw0 = 0.42; this.pitch0 = 0.34; this.fov = 34; this.sway = 0.1; this.fitAspect = 2.4; }
  build() {
    const T = this.T, S = this.scene, XL = (this.XL = -14), XR = (this.XR = 14); this.WIN = 360; this.MAX = 260;
    this.target.set(0.5, 1.5, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.3)); const dl = new T.DirectionalLight(0xffffff, 1.4); dl.position.set(6, 12, 9); S.add(dl);
    const g = []; for (let m = 0; m <= 6; m++) { const x = XR - m / 6 * 28; g.push(x, 0, -3.6, x, 0, 3.6); } [-3.6, 0, 3.6].forEach(z => g.push(XL, 0, z, XR, 0, z)); S.add(lines(T, g, 0x1b2532));
    const w = []; [1, 2, 3].forEach(e => { const y = this.yOf(Math.pow(10, e + 2)); w.push(XL, y, -3.6, XR, y, -3.6); const sl = label(T, '$' + ['1K', '10K', '100K'][e - 1], { size: 0.62, color: '#6b7889', anchor: 'right' }); sl.position.set(XL - 0.3, y, -3.6); S.add(sl); }); S.add(lines(T, w, 0x1b2532, 0.8));
    for (let m = 1; m <= 6; m++) { const s = label(T, '−' + m + 'm', { size: 0.6, color: '#6b7889' }); s.position.set(XR - m / 6 * 28, 0, 4.4); S.add(s); }
    const nl = label(T, 'NOW', { size: 0.66, color: '#eef3f8', weight: 600 }); nl.position.set(XR, 0, 4.4); S.add(nl);
    [[-1.8, 0x2ee6a6, 'LONG LIQ', '#2ee6a6'], [1.8, 0xff5c6c, 'SHORT LIQ', '#ff5c6c']].forEach(([z, c, t, cs]) => {
      const m = new T.Mesh(new T.PlaneGeometry(28, 1.5), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.003, z); S.add(m);
      S.add(lines(T, [XL, 0.01, z, XR, 0.01, z], c, 0.5));
      const s = label(T, t, { size: 0.6, color: cs, weight: 600, anchor: 'right' }); s.position.set(XL - 0.4, 0.05, z); S.add(s);
    });
    this.nowPlane = new T.Mesh(new T.PlaneGeometry(7.5, 7), new T.MeshBasicMaterial({ color: 0x4c9bff, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false })); this.nowPlane.rotation.y = Math.PI / 2; this.nowPlane.position.set(XR, 3.5, 0); S.add(this.nowPlane);
    S.add(lines(T, [XR, 0, -3.6, XR, 7, -3.6, XR, 0, 3.6, XR, 7, 3.6, XR, 7, -3.6, XR, 7, 3.6], 0x4c9bff, 0.35));
    this.sph = new T.InstancedMesh(new T.SphereGeometry(1, 18, 12), new T.MeshStandardMaterial({ roughness: 0.25, metalness: 0.3 }), this.MAX); this.sph.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const c0 = new T.Color(1, 1, 1); for (let i = 0; i < this.MAX; i++) this.sph.setColorAt(i, c0); this.sph.count = 0; this.sph.frustumCulled = false; S.add(this.sph);
    this.gGeo = ptsGeo(T, this.MAX); const gp = new T.Points(this.gGeo, this.glow()); gp.frustumCulled = false; S.add(gp);
    this.stemGeo = new T.BufferGeometry(); this.stemGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(this.MAX * 6), 3)); this.stemGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(this.MAX * 6), 3));
    const st = new T.LineSegments(this.stemGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false })); st.frustumCulled = false; S.add(st);
    this.rings = []; for (let i = 0; i < 12; i++) { const m = new T.Mesh(new T.RingGeometry(0.86, 1, 48), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; S.add(m); this.rings.push(m); }
    this.beams = []; for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.08, 9), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); m.visible = false; S.add(m); this.beams.push(m); }
    this.labels = new Map(); this.spawn = new Map(); this.cL = new T.Color(0x2ee6a6); this.cS = new T.Color(0xff5c6c); this.tmpC = new T.Color(); this.m4 = new T.Matrix4(); this.q = new T.Quaternion(); this.v = new T.Vector3(); this.sc = new T.Vector3();
  }
  yOf(size) { return Math.max(0.2, (Math.log10(size) - 2) * 1.5); }
  onData(t, ev) {
    if (t !== 'liq') return; const now = performance.now(); this.spawn.set(ev.id, now);
    const z = ev.side === 'L' ? -1.8 : 1.8, col = ev.side === 'L' ? 0x2ee6a6 : 0xff5c6c;
    const r = this.rings.find(m => !m.visible); if (r) { r.visible = true; r.userData.t0 = now; r.userData.big = ev.size > 5000; r.position.set(this.XR, 0.02, z); r.material.color.setHex(col); }
    const b = this.beams.find(m => !m.visible); if (b) { b.visible = true; b.userData.t0 = now; b.position.set(this.XR, 4.5, z); b.material.color.setHex(col); }
  }
  frame(t, dt, pnow) {
    const T = this.T, now = Date.now(), tape = this.S.tape, coin = (this.getAttribute('coin') || '').toUpperCase().trim(), min = parseFloat(this.getAttribute('min')) || 0, fmt = this.CQ.fmt;
    const P = this.gGeo.attributes.position.array, CA = this.gGeo.attributes.aColor.array, SZ = this.gGeo.attributes.aSize.array, AL = this.gGeo.attributes.aAlpha.array, SP = this.stemGeo.attributes.position.array, SC = this.stemGeo.attributes.color.array;
    const live = new Set(), pts = []; let n = 0;
    for (const ev of tape) {
      if (n >= this.MAX) break; const age = (now - ev.ts) / 1000; if (age > this.WIN || age < 0) continue;
      const match = (!coin || coin === 'ALL' || ev.coin.includes(coin)) && ev.size >= min, x = this.XR - age / this.WIN * 28, z = ev.side === 'L' ? -1.8 : 1.8;
      const st = this.spawn.get(ev.id), k = st ? Math.min(1, (pnow - st) / 800) : 1, el = k < 1 ? ease(k) * (1 + 0.45 * Math.sin(k * Math.PI)) : 1;
      const fade = Math.min(1, (x - this.XL) / 3), y = this.yOf(ev.size) + (1 - ease(k)) * 2.5, r = (0.1 + Math.pow(ev.size, 0.25) * 0.028) * (match ? 1 : 0.6);
      const base = ev.side === 'L' ? this.cL : this.cS, dim = (match ? 1 : 0.18) * fade;
      this.m4.compose(this.v.set(x, y, z), this.q, this.sc.setScalar(Math.max(0.001, r * el))); this.sph.setMatrixAt(n, this.m4);
      this.tmpC.copy(base).multiplyScalar(0.25 + 0.75 * dim); if (k < 1) this.tmpC.lerp(new T.Color(1, 1, 1), (1 - k) * 0.7); this.sph.setColorAt(n, this.tmpC);
      P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z; CA[n * 3] = base.r; CA[n * 3 + 1] = base.g; CA[n * 3 + 2] = base.b;
      SZ[n] = r * 7 * (1 + (1 - k) * 2.5); AL[n] = (0.4 + (1 - k) * 1.2) * dim;
      SP.set([x, 0, z, x, y, z], n * 6); SC.set([base.r * 0.1 * dim, base.g * 0.1 * dim, base.b * 0.1 * dim, base.r * 0.7 * dim, base.g * 0.7 * dim, base.b * 0.7 * dim], n * 6);
      if (ev.size >= 4000 && match) { let s = this.labels.get(ev.id); if (!s) { s = label(T, ev.coin + ' ' + fmt.usd(ev.size), { size: 0.56, color: '#eef3f8', weight: 600, bg: 'rgba(7,10,14,0.75)', anchor: 'bottom' }); this.scene.add(s); this.labels.set(ev.id, s); } s.position.set(x, y + r + 0.2, z); s.material.opacity = fade; live.add(ev.id); }
      pts.push({ ev, x, y, z }); n++;
    }
    this.labels.forEach((s, id) => { if (!live.has(id)) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); this.labels.delete(id); } });
    this.sph.count = n; this.sph.instanceMatrix.needsUpdate = true; if (this.sph.instanceColor) this.sph.instanceColor.needsUpdate = true;
    this.gGeo.setDrawRange(0, n); ['position', 'aColor', 'aSize', 'aAlpha'].forEach(a => this.gGeo.attributes[a].needsUpdate = true);
    this.stemGeo.setDrawRange(0, n * 2); this.stemGeo.attributes.position.needsUpdate = true; this.stemGeo.attributes.color.needsUpdate = true;
    this.rings.forEach(m => { if (!m.visible) return; const a = (pnow - m.userData.t0) / 1400; if (a >= 1) { m.visible = false; return; } const s = 0.3 + ease(a) * (m.userData.big ? 4.5 : 2.6); m.scale.set(s, s, s); m.material.opacity = 0.9 * (1 - a); });
    this.beams.forEach(m => { if (!m.visible) return; const a = (pnow - m.userData.t0) / 700; if (a >= 1) { m.visible = false; return; } m.material.opacity = 0.8 * (1 - a); m.scale.x = 1 + a * 3; m.lookAt(this.camera.position.x, m.position.y, this.camera.position.z); });
    this.nowPlane.material.opacity = 0.05 + 0.03 * Math.sin(t * 2.4);
    if (this.mx >= 0) { let best = null, bd = 18; pts.forEach(p => { const [sx, sy] = this.project(p.x, p.y, p.z), d = Math.hypot(sx - this.mx, sy - this.my); if (d < bd) { bd = d; best = { p, sx, sy }; } }); if (best) { const e = best.p.ev, c = e.side === 'L' ? '#2ee6a6' : '#ff5c6c'; this.showTip(best.sx, best.sy, '<b style="color:#eef3f8">' + e.coin + '</b> <span style="color:' + c + '">' + (e.side === 'L' ? 'long liq · forced sell' : 'short liq · forced buy') + '</span><br>' + fmt.usd(e.size) + ' · ' + e.venue + ' · ' + fmt.time(e.ts), c); } else this.hideTip(); }
  }
}

// ================= regime galaxy =================
class Galaxy extends Scene3D {
  static attrs = ['regime'];
  cfg() { this.dist0 = 34; this.pitch0 = 0.58; this.yaw0 = 0.35; this.autoRot = 0.035; this.fov = 36; this.fitAspect = 1.6; }
  build() {
    const T = this.T, S = this.scene, st = this.S, REG = this.CQ.REG, seeded = this.CQ.seeded;
    this.target.set(0, -0.5, 0);
    const ring = ['BULL', 'SQZ', 'SPIKE', 'BEAR', 'CHOP'], cl = (this.cl = {});
    st.regimeOrder.forEach(code => { const list = st.regimeCoins.filter(c => c.code === code); let center; if (code === 'RANGE') center = new T.Vector3(0, 0, 0); else { const i = ring.indexOf(code), a = i / 5 * Math.PI * 2 - Math.PI / 2; center = new T.Vector3(Math.cos(a) * 16, Math.sin(i * 1.7) * 1.4, Math.sin(a) * 16); } cl[code] = { code, n: list.length, center, col: new T.Color(REG[code].color), hex: REG[code].color, R: code === 'RANGE' ? 7 : 1.8 + Math.sqrt(list.length) * 0.8 }; });
    const stars = []; const sr = seeded('stars'); for (let i = 0; i < 900; i++) { const u = sr() * 2 - 1, th = sr() * Math.PI * 2, rr = 70 + sr() * 60, s = Math.sqrt(1 - u * u); stars.push(Math.cos(th) * s * rr, u * rr * 0.6, Math.sin(th) * s * rr); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(stars, 3)); S.add(new T.Points(sg, new T.PointsMaterial({ color: 0x3a4a62, size: 0.35, sizeAttenuation: true, fog: false })));
    Object.values(cl).forEach(c => {
      const rings = c.code === 'RANGE' ? [0.45, 0.75, 1.05] : [1.05];
      rings.forEach((k, j) => { const m = new T.Mesh(new T.RingGeometry(c.R * k - 0.03, c.R * k + 0.03, 128), new T.MeshBasicMaterial({ color: c.col, transparent: true, opacity: j === rings.length - 1 ? 0.28 : 0.1, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.copy(c.center); S.add(m); });
      const lb = label(T, c.code + ' · ' + c.n, { size: 0.9, color: c.hex, weight: 600, anchor: 'bottom' }); lb.position.copy(c.center).add(new T.Vector3(0, c.R * 0.35 + 1.4, 0)); S.add(lb); c.lb = lb;
      const lb2 = label(T, REG[c.code].label, { size: 0.5, color: '#8b98a9', anchor: 'bottom' }); lb2.position.copy(c.center).add(new T.Vector3(0, c.R * 0.35 + 0.75, 0)); S.add(lb2); c.lb2 = lb2;
    });
    const majors = new Set(['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE', 'ZEC', 'SUI', 'S', 'STRK', 'CRV', 'TIA', 'OP', 'KAITO']);
    this.coins = st.regimeCoins.map(c => { const r = seeded('g' + c.coin), k = cl[c.code], rad = k.R * Math.min(1.02, 0.12 + (1 - c.conf / 100) * 0.95 + r() * 0.3); return { ...c, k, rad, th: r() * Math.PI * 2, yo: (r() - 0.5) * k.R * 0.22, w: 0.22 / (0.5 + rad * 0.3), major: majors.has(c.coin) }; });
    this.cGeo = ptsGeo(T, this.coins.length); const cp = new T.Points(this.cGeo, this.glow()); cp.frustumCulled = false; S.add(cp);
    const CA = this.cGeo.attributes.aColor.array, SZ = this.cGeo.attributes.aSize.array;
    this.coins.forEach((c, i) => { CA.set([c.k.col.r, c.k.col.g, c.k.col.b], i * 3); SZ[i] = (0.55 + c.conf / 100 * 0.75) * (c.major ? 1.9 : 1); if (c.major) { c.lb = label(T, c.coin, { size: 0.5, color: '#eef3f8', weight: 600, anchor: 'left' }); S.add(c.lb); } });
    this.coreGeo = ptsGeo(T, 6); const cores = new T.Points(this.coreGeo, this.glow()); cores.frustumCulled = false; S.add(cores);
    Object.values(cl).forEach((c, i) => { this.coreGeo.attributes.position.array.set([c.center.x, c.center.y, c.center.z], i * 3); this.coreGeo.attributes.aColor.array.set([c.col.r, c.col.g, c.col.b], i * 3); this.coreGeo.attributes.aSize.array[i] = c.n ? 3 + Math.sqrt(c.n) * 0.9 : 2; this.coreGeo.attributes.aAlpha.array[i] = c.n ? 0.5 : 0.15; c.ci = i; });
    const flows = st.regime.next24, tot = flows.reduce((a, f) => a + f.v, 0), M = 520, fr = seeded('flow');
    this.flow = []; for (let i = 0; i < M; i++) { let x = fr() * tot, d = flows[0]; for (const f of flows) { if ((x -= f.v) <= 0) { d = f; break; } } this.flow.push({ code: d.code, t: fr(), sp: 0.12 + fr() * 0.1, j: new T.Vector3((fr() - 0.5) * 2, 4 + fr() * 3, (fr() - 0.5) * 2), a: fr() * Math.PI * 2, rr: 7.6 + fr() * 1.6 }); }
    this.fGeo = ptsGeo(T, M); const fp = new T.Points(this.fGeo, this.glow()); fp.frustumCulled = false; S.add(fp);
    flows.forEach(f => { if (f.code === 'RANGE') return; const c = cl[f.code], mid = c.center.clone().multiplyScalar(0.5).add(new T.Vector3(0, 3.8, 0)); const s = label(T, f.v + '%', { size: 0.6, color: c.hex, weight: 600, bg: 'rgba(8,11,16,0.85)' }); s.position.copy(mid); S.add(s); });
    const sl = label(T, 'stays ' + flows[0].v + '%', { size: 0.55, color: '#4c9bff', weight: 600, bg: 'rgba(8,11,16,0.85)' }); sl.position.set(0, 0.2, cl.RANGE.R + 1.4); S.add(sl);
    this.rangeC = cl.RANGE.center; this.tmp = new T.Vector3(); this.blue = new T.Color(0x4c9bff); this.tc = new T.Color();
  }
  onClick() { if (this.hov) window.dispatchEvent(new CustomEvent('cq:coin', { detail: this.hov.coin })); }
  frame(t, dt) {
    const focus = this.getAttribute('regime') || '', P = this.cGeo.attributes.position.array, AL = this.cGeo.attributes.aAlpha.array;
    this.coins.forEach((c, i) => { const a = c.th + c.w * t, x = c.k.center.x + Math.cos(a) * c.rad, z = c.k.center.z + Math.sin(a) * c.rad, y = c.k.center.y + c.yo + Math.sin(t * 0.6 + c.th) * 0.12; P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; const on = !focus || focus === c.code; AL[i] = on ? 0.95 : 0.08; c.p = [x, y, z]; if (c.lb) { c.lb.position.set(x + 0.35, y + 0.25, z); c.lb.material.opacity = on ? 1 : 0.15; } });
    this.cGeo.attributes.position.needsUpdate = true; this.cGeo.attributes.aAlpha.needsUpdate = true;
    Object.values(this.cl).forEach(c => { const on = !focus || focus === c.code; c.lb.material.opacity = on ? 1 : 0.2; c.lb2.material.opacity = on ? 1 : 0.2; this.coreGeo.attributes.aAlpha.array[c.ci] = (c.n ? 0.45 + 0.12 * Math.sin(t * 2 + c.ci) : 0.15) * (on ? 1 : 0.2); });
    this.coreGeo.attributes.aAlpha.needsUpdate = true;
    const FP = this.fGeo.attributes.position.array, FC = this.fGeo.attributes.aColor.array, FS = this.fGeo.attributes.aSize.array, FA = this.fGeo.attributes.aAlpha.array, A = this.rangeC;
    this.flow.forEach((f, i) => {
      f.t += dt * f.sp; if (f.t > 1) f.t -= 1; const on = !focus || focus === f.code || (focus === 'RANGE' && f.code === 'RANGE');
      if (f.code === 'RANGE') { const a = f.a + f.t * Math.PI * 2; FP.set([Math.cos(a) * f.rr, Math.sin(a * 3) * 0.3, Math.sin(a) * f.rr], i * 3); FC.set([0.3, 0.6, 1], i * 3); FS[i] = 0.2; FA[i] = 0.5 * (on ? 1 : 0.1); return; }
      const B = this.cl[f.code].center, u = f.t, cx = (A.x + B.x) / 2 + f.j.x, cy = (A.y + B.y) / 2 + f.j.y, cz = (A.z + B.z) / 2 + f.j.z, iu = 1 - u;
      FP.set([iu * iu * A.x + 2 * iu * u * cx + u * u * B.x, iu * iu * A.y + 2 * iu * u * cy + u * u * B.y, iu * iu * A.z + 2 * iu * u * cz + u * u * B.z], i * 3);
      this.tc.copy(this.blue).lerp(this.cl[f.code].col, u); FC.set([this.tc.r, this.tc.g, this.tc.b], i * 3); FS[i] = 0.26; FA[i] = Math.sin(Math.PI * u) * 0.9 * (on ? 1 : 0.08);
    });
    ['position', 'aColor', 'aSize', 'aAlpha'].forEach(a => this.fGeo.attributes[a].needsUpdate = true);
    this.hov = null;
    if (this.mx >= 0) { let bd = 14, best = null; this.coins.forEach(c => { if (focus && focus !== c.code) return; const [sx, sy] = this.project(c.p[0], c.p[1], c.p[2]), d = Math.hypot(sx - this.mx, sy - this.my); if (d < bd) { bd = d; best = { c, sx, sy }; } }); if (best) { const c = best.c; this.hov = c; this.renderer.domElement.style.cursor = 'pointer'; this.showTip(best.sx, best.sy, '<b style="color:#eef3f8">' + c.coin + '</b> · <span style="color:' + c.k.hex + '">' + c.code + '</span><br>confidence ' + c.conf + '% · ' + (c.rad / c.k.R < 0.45 ? 'core' : 'periphery') + '<br><span style="color:#5b6878">click to find in grid</span>', c.k.hex); } else { this.hideTip(); this.renderer.domElement.style.cursor = 'grab'; } }
  }
}

// ================= cycle ring =================
class Cycle extends Scene3D {
  cfg() { this.dist0 = 21; this.pitch0 = 0.7; this.yaw0 = 0.25; this.autoRot = 0.05; this.fov = 36; this.fitAspect = 1.3; }
  build() {
    const T = this.T, S = this.scene, cyc = this.S.cycle, n = cyc.phases.length, R = (this.R = 7.2), seg = (this.seg = Math.PI * 2 / n), gap = 0.035;
    this.target.set(0, 0.2, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 0.9)); const dl = new T.DirectionalLight(0xffffff, 1.2); dl.position.set(4, 10, 6); S.add(dl);
    const g = []; [2.5, 4.5, R - 1.2, R + 1.2].forEach(r => { for (let i = 0; i < 96; i++) { const a0 = i / 96 * Math.PI * 2, a1 = (i + 1) / 96 * Math.PI * 2; g.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r); } });
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * seg; g.push(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2, Math.cos(a) * (R + 1.8), 0, Math.sin(a) * (R + 1.8)); }
    S.add(lines(T, g, 0x1b2532, 0.9));
    this.segs = cyc.phases.map((p, i) => {
      const cur = p.n === cyc.phase, phi0 = -Math.PI / 2 + i * seg + gap, pv = new T.Object3D(); pv.rotation.y = -phi0;
      const m = new T.Mesh(new T.TorusGeometry(R, cur ? 0.6 : 0.38, 20, 48, seg - gap * 2), new T.MeshStandardMaterial({ color: p.c, emissive: p.c, emissiveIntensity: cur ? 0.9 : 0.12, roughness: 0.32, metalness: 0.3, transparent: true, opacity: cur ? 1 : 0.6 }));
      m.rotation.x = Math.PI / 2; m.userData.p = p; pv.add(m); S.add(pv);
      const am = -Math.PI / 2 + (i + 0.5) * seg, lb = label(T, String(p.n).padStart(2, '0'), { size: cur ? 0.8 : 0.55, color: cur ? '#eef3f8' : '#6b7889', weight: 600 }); lb.position.set(Math.cos(am) * (R + 1.9), 0.1, Math.sin(am) * (R + 1.9)); S.add(lb);
      if (cur) { const nm = label(T, p.name.split(' / ')[0].toUpperCase(), { size: 0.5, color: p.c, weight: 600 }); nm.position.set(Math.cos(am) * (R + 3.1), 0.1, Math.sin(am) * (R + 3.1)); S.add(nm); }
      return { pv, m, cur, p };
    });
    const am = (this.am = -Math.PI / 2 + (cyc.phase - 1 + cyc.progress) * seg);
    this.marker = new T.Mesh(new T.SphereGeometry(0.32, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff })); S.add(this.marker);
    this.beam = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 7, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false })); S.add(this.beam);
    this.light = new T.PointLight(0xff7a3d, 8, 10); S.add(this.light);
    const N = 1100, r = this.CQ.seeded('cyc'); this.parts = []; for (let i = 0; i < N; i++) this.parts.push({ a: r() * Math.PI * 2, rr: R + this.CQ.gauss(r) * 0.85, y: this.CQ.gauss(r) * 0.32, sp: 0.03 + r() * 0.05, s: 0.06 + r() * 0.14 });
    this.pGeo = ptsGeo(T, N); const pp = new T.Points(this.pGeo, this.glow()); pp.frustumCulled = false; S.add(pp);
    this.mGeo = ptsGeo(T, 1); this.mGeo.attributes.aColor.array.set([1, 0.6, 0.35]); const mp = new T.Points(this.mGeo, this.glow()); mp.frustumCulled = false; S.add(mp);
    this.cols = cyc.phases.map(p => new T.Color(p.c));
  }
  frame(t, dt) {
    const R = this.R, cyc = this.S.cycle, lift = 0.45 + 0.12 * Math.sin(t * 2);
    this.segs.forEach(s => { if (s.cur) { s.pv.position.y = lift; s.m.material.emissiveIntensity = 0.75 + 0.35 * Math.sin(t * 3); } });
    const x = Math.cos(this.am) * R, z = Math.sin(this.am) * R; this.marker.position.set(x, lift + 0.05, z); this.beam.position.set(x, lift + 3.5, z); this.beam.material.opacity = 0.35 + 0.2 * Math.sin(t * 4); this.light.position.set(x, lift + 1, z);
    this.mGeo.attributes.position.array.set([x, lift + 0.05, z]); this.mGeo.attributes.aSize.array[0] = 2.6 + Math.sin(t * 4) * 0.5; this.mGeo.attributes.aAlpha.array[0] = 0.9; ['position', 'aSize', 'aAlpha'].forEach(a => this.mGeo.attributes[a].needsUpdate = true);
    const P = this.pGeo.attributes.position.array, C = this.pGeo.attributes.aColor.array, S = this.pGeo.attributes.aSize.array, A = this.pGeo.attributes.aAlpha.array, seg = this.seg;
    this.parts.forEach((p, i) => { p.a += dt * p.sp; const a = p.a % (Math.PI * 2); P[i * 3] = Math.cos(a) * p.rr; P[i * 3 + 1] = p.y; P[i * 3 + 2] = Math.sin(a) * p.rr; let idx = Math.floor(((a + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / seg); const c = this.cols[idx % this.cols.length], cur = idx + 1 === cyc.phase; C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; S[i] = p.s * (cur ? 1.8 : 1); A[i] = cur ? 0.9 : 0.35; if (cur) P[i * 3 + 1] += lift * 0.8; });
    ['position', 'aColor', 'aSize', 'aAlpha'].forEach(a => this.pGeo.attributes[a].needsUpdate = true);
    if (this.mx >= 0 && this._hoverDirty) { this._hoverDirty = false; const hit = this.ray().intersectObjects(this.segs.map(s => s.m))[0]; if (hit) { const p = hit.object.userData.p; this.showTip(this.mx, this.my, '<b style="color:#eef3f8">Phase ' + p.n + ' · ' + p.name + '</b><br><span style="color:' + p.c + '">' + p.group + '</span>' + (p.n === cyc.phase ? ' · current · ' + cyc.sub.toLowerCase() : ''), p.c); } else this.hideTip(); }
  }
}

// ================= gamma landscape =================
class Gamma3D extends Scene3D {
  static attrs = ['coin'];
  cfg() { this.dist0 = 33; this.pitch0 = 0.46; this.yaw0 = 0.38; this.sway = 0.1; this.fov = 34; this.fitAspect = 1.9; }
  zOf(i) { return (i - 1.5) * 3.3; }
  build() {
    const T = this.T, S = this.scene, gm = this.S.gamma, fmt = this.CQ.fmt, XS = (this.XS = 0.36);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.1)); const dl = new T.DirectionalLight(0xffffff, 1.6); dl.position.set(-6, 14, 10); S.add(dl);
    this.bars = []; gm.order.forEach((c, ri) => gm.coins[c].profile.forEach((b, i) => { const v = b.L + b.S; this.bars.push({ coin: c, ri, d: i - 50, L: b.L, S: b.S, side: b.L >= b.S ? 'L' : 'S', h: v > 0 ? Math.min(11, Math.sqrt(v / 1e6) * 1.15) : 0 }); }));
    const geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    this.inst = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), this.bars.length); this.inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const w0 = new T.Color(1, 1, 1); this.bars.forEach((b, i) => this.inst.setColorAt(i, w0)); S.add(this.inst);
    const zf = this.zOf(gm.order.length - 1) + 2.4, zb = this.zOf(0) - 2.4, g = [];
    for (let d = -50; d <= 50; d += 5) g.push(d * XS, 0, zb, d * XS, 0, zf); gm.order.forEach((c, i) => { const z = this.zOf(i); g.push(-50 * XS, 0, z, 50 * XS, 0, z); }); S.add(lines(T, g, 0x1b2532));
    const wl = []; [1e6, 10e6, 50e6].forEach(v => { const y = Math.sqrt(v / 1e6) * 1.15; wl.push(-50 * XS, y, zb, 50 * XS, y, zb); const s = label(T, fmt.usd(v), { size: 0.45, color: '#5b6878', anchor: 'right' }); s.position.set(-50 * XS - 0.4, y, zb); S.add(s); }); S.add(lines(T, wl, 0x1b2532, 0.8));
    [-50, -25, 0, 25, 50].forEach(d => { const s = label(T, d === 0 ? 'mark' : (d > 0 ? '+' : '') + d + '%', { size: 0.5, color: d === 0 ? '#eef3f8' : '#6b7889' }); s.position.set(d * XS, 0, zf + 1); S.add(s); });
    const mk = new T.Mesh(new T.PlaneGeometry(zf - zb, 11.5), new T.MeshBasicMaterial({ color: 0xeef3f8, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false })); mk.rotation.y = Math.PI / 2; mk.position.set(0, 5.75, (zf + zb) / 2); S.add(mk); S.add(lines(T, [0, 0, zb, 0, 0, zf, 0, 0, zb, 0, 11.5, zb], 0xeef3f8, 0.5));
    this.rowLabels = gm.order.map((c, i) => { const s = label(T, c, { size: 0.75, color: '#eef3f8', weight: 600, anchor: 'right' }); s.position.set(-50 * XS - 0.8, 0.3, this.zOf(i)); S.add(s); return s; });
    this.flips = gm.order.map((c, i) => { const co = gm.coins[c], fp = Math.max(-50, Math.min(50, (co.flip / this.S.px[c] - 1) * 100)), z = this.zOf(i), x = fp * XS; const m = new T.Mesh(new T.PlaneGeometry(2.6, 9), new T.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false })); m.rotation.y = Math.PI / 2; m.position.set(x, 4.5, z); S.add(m); const ln = lines(T, [x, 0, z - 1.3, x, 0, z + 1.3, x, 9, z - 1.3, x, 9, z + 1.3, x, 0, z, x, 9, z], 0xffb547, 0.8); S.add(ln); const s = label(T, 'flip ' + fmt.px(co.flip), { size: 0.45, color: '#ffb547', weight: 600, anchor: 'bottom' }); s.position.set(x, 9.1, z); S.add(s); return { m, ln, s }; });
    this.cL = new T.Color(0x2ee6a6); this.cS = new T.Color(0xff5c6c); this.cW = new T.Color(1, 1, 1); this.tc = new T.Color(); this.m4 = new T.Matrix4(); this.q = new T.Quaternion(); this.v = new T.Vector3(); this.sc = new T.Vector3();
    this.born = performance.now(); this.selT = this.born; this.sel = 'BTC';
  }
  onAttr() { const c = this.getAttribute('coin') || 'BTC'; if (c !== this.sel) { this.sel = c; this.selT = performance.now(); } }
  frame(t, dt, pnow) {
    const gm = this.S.gamma, si = Math.max(0, gm.order.indexOf(this.sel)), XS = this.XS, fmt = this.CQ.fmt;
    this.target.x += (0 - this.target.x) * 0.05; this.target.y += (2.2 - this.target.y) * 0.05; this.target.z += (this.zOf(si) * 0.6 - this.target.z) * 0.05;
    const scan = ((t * 0.09) % 1) * 44 - 22;
    this.bars.forEach((b, i) => {
      const x = b.d * XS, z = this.zOf(b.ri), selRow = b.ri === si, k0 = ease((pnow - this.born - Math.abs(b.d) * 14 - b.ri * 120) / 800), k1 = selRow ? ease((pnow - this.selT - Math.abs(b.d) * 9) / 650) : 1;
      const h = Math.max(0.015, b.h * k0 * (selRow ? 0.25 + 0.75 * k1 : 1) * (Math.abs(b.d) < 5 ? 1 + 0.05 * Math.sin(t * 5 + b.d) : 1));
      this.m4.compose(this.v.set(x, 0, z), this.q, this.sc.set(0.27, h, selRow ? 2 : 1.3)); this.inst.setMatrixAt(i, this.m4);
      const s = Math.exp(-Math.pow(x - scan, 2) / 1.2);
      this.tc.copy(b.side === 'L' ? this.cL : this.cS).multiplyScalar(selRow ? 1 : 0.32).lerp(this.cW, s * (selRow ? 0.55 : 0.25)); if (!b.h) this.tc.setRGB(0.08, 0.1, 0.13); this.inst.setColorAt(i, this.tc);
    });
    this.inst.instanceMatrix.needsUpdate = true; this.inst.instanceColor.needsUpdate = true;
    this.flips.forEach((f, i) => { const on = i === si; f.m.material.opacity = on ? 0.14 + 0.05 * Math.sin(t * 3) : 0.04; f.ln.material.opacity = on ? 0.9 : 0.25; f.s.material.opacity = on ? 1 : 0.3; });
    this.rowLabels.forEach((s, i) => { s.material.opacity = i === si ? 1 : 0.4; });
    if (this.mx >= 0 && this._hoverDirty) { this._hoverDirty = false; const hit = this.ray().intersectObject(this.inst)[0]; if (hit && hit.instanceId != null) { const b = this.bars[hit.instanceId], p = this.S.px[b.coin]; this.showTip(this.mx, this.my, '<b style="color:#eef3f8">' + b.coin + '</b> · ' + (b.d > 0 ? '+' : '') + b.d + '% → ' + fmt.px(p * (1 + b.d / 100)) + '<br><span style="color:#2ee6a6">L ' + fmt.usd(b.L) + '</span> · <span style="color:#ff5c6c">S ' + fmt.usd(b.S) + '</span>', b.side === 'L' ? '#2ee6a6' : '#ff5c6c'); } else this.hideTip(); }
  }
}

// ================= liquidity terrain =================
class Depth3D extends Scene3D {
  cfg() { this.dist0 = 30; this.pitch0 = 0.62; this.yaw0 = -0.5; this.sway = 0.1; this.fov = 34; this.fitAspect = 1.8; }
  build() {
    const T = this.T, S = this.scene, bk = this.S.books, C = (this.C = bk.cols), L = (this.L = bk.levels), W = (this.W = 30), D = (this.D = 14);
    this.target.set(0, 0.6, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.0)); const dl = new T.DirectionalLight(0xffffff, 1.6); dl.position.set(8, 12, 6); S.add(dl);
    const geo = (this.geo = new T.PlaneGeometry(W, D, C - 1, L - 1)); geo.rotateX(-Math.PI / 2); geo.setAttribute('color', new T.BufferAttribute(new Float32Array(C * L * 3), 3));
    this.grp = new T.Group(); S.add(this.grp);
    this.mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: T.DoubleSide })); this.grp.add(this.mesh);
    this.grp.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x9fc3ff, wireframe: true, transparent: true, opacity: 0.05, depthWrite: false })));
    this.edgeGeo = new T.BufferGeometry(); this.edgeGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(L * 3), 3)); const edge = new T.Line(this.edgeGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); edge.frustumCulled = false; S.add(edge);
    const g = []; for (let i = 0; i <= 12; i++) { const x = -W / 2 + i / 12 * W; g.push(x, -0.01, -D / 2, x, -0.01, D / 2); } S.add(lines(T, g, 0x161e29));
    const zMid = -D / 2 + 24.5 * (D / (L - 1)); S.add(lines(T, [-W / 2, 0.02, zMid, W / 2, 0.02, zMid], 0xeef3f8, 0.35));
    const lb = (t, x, z, o) => { const s = label(T, t, o); s.position.set(x, 0.05, z); S.add(s); return s; };
    lb('ASKS', -W / 2 - 0.6, -D / 4, { size: 0.6, color: '#ff5c6c', weight: 600, anchor: 'right' }); lb('BIDS', -W / 2 - 0.6, D / 4, { size: 0.6, color: '#2ee6a6', weight: 600, anchor: 'right' });
    lb('−6h', -W / 2, D / 2 + 1, { size: 0.5, color: '#6b7889' }); lb('−3h', 0, D / 2 + 1, { size: 0.5, color: '#6b7889' }); lb('now', W / 2, D / 2 + 1, { size: 0.5, color: '#eef3f8', weight: 600 });
    [[0, '+50'], [12.5, '+25'], [20, '+10'], [24.5, 'mid'], [29, '−10'], [36.5, '−25'], [49, '−50']].forEach(([r, t]) => lb(t + (t === 'mid' ? '' : ' bps'), W / 2 + 0.8, -D / 2 + r * (D / (L - 1)), { size: 0.42, color: t === 'mid' ? '#eef3f8' : '#6b7889', anchor: 'left' }));
    this.cur = new Float32Array(C * L); this.tgt = new Float32Array(C * L); this.compute(true); this.cur.set(this.tgt);
    this.PN = 90; this.pGeo = ptsGeo(T, this.PN); const pp = new T.Points(this.pGeo, this.glow()); pp.frustumCulled = false; S.add(pp); this.parts = Array.from({ length: this.PN }, () => ({ life: 0 }));
    this.shiftT = 0; this.cA = new T.Color(0xff5c6c); this.cB = new T.Color(0x2ee6a6); this.cD = new T.Color(0x0b1018); this.cSat = new T.Color(0x243042); this.tc = new T.Color();
  }
  compute(reset) {
    const d = this.S.books.depth, C = this.C, L = this.L; let mx = 0; d.forEach(col => col.forEach(v => { if (v > mx) mx = v; }));
    this.mxS = reset || !this.mxS ? mx : this.mxS * 0.85 + mx * 0.15;
    const row = this.S.bookRows.find(b => b.coin === this.S.books.focus); this.sat = row && row.sat10;
    for (let c = 0; c < C; c++) for (let r = 0; r < L; r++) this.tgt[r * C + c] = Math.pow(d[c][r] / this.mxS, 0.65) * 5.2;
  }
  onData(t) {
    if (t === 'depth') { const C = this.C; for (let r = 0; r < this.L; r++) for (let c = 0; c < C - 1; c++) this.cur[r * C + c] = this.cur[r * C + c + 1]; this.compute(false); this.shiftT = performance.now(); }
    if (t === 'focus') { this.compute(true); }
  }
  frame(t, dt, pnow) {
    const C = this.C, L = this.L, pos = this.geo.attributes.position, col = this.geo.attributes.color.array, fmt = this.CQ.fmt;
    for (let i = 0; i < C * L; i++) this.cur[i] += (this.tgt[i] - this.cur[i]) * 0.12;
    for (let r = 0; r < L; r++) { const ask = r < L / 2, dist = ask ? L / 2 - r : r - L / 2 + 1, satRow = this.sat && dist > 5; for (let c = 0; c < C; c++) { const i = r * C + c, h = this.cur[i]; pos.setY(i, h); const v = Math.min(1, h / 5.2), fresh = 0.35 + 0.65 * (c / C); if (satRow) this.tc.copy(this.cSat).multiplyScalar(fresh); else { this.tc.copy(this.cD).lerp(ask ? this.cA : this.cB, Math.min(1, 0.18 + v * 1.1) * fresh); if (v > 0.7) this.tc.lerp(this.cW || (this.cW = new this.T.Color(1, 1, 1)), (v - 0.7) * 1.2); } col[i * 3] = this.tc.r; col[i * 3 + 1] = this.tc.g; col[i * 3 + 2] = this.tc.b; } }
    pos.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.computeVertexNormals();
    const dx = this.W / (C - 1), k = this.shiftT ? Math.min(1, (pnow - this.shiftT) / 1900) : 1; this.grp.position.x = dx * (1 - k);
    const E = this.edgeGeo.attributes.position.array; for (let r = 0; r < L; r++) { E[r * 3] = this.W / 2 + this.grp.position.x; E[r * 3 + 1] = this.cur[r * C + C - 1] + 0.03; E[r * 3 + 2] = -this.D / 2 + r * (this.D / (L - 1)); } this.edgeGeo.attributes.position.needsUpdate = true;
    const P = this.pGeo.attributes.position.array, PC = this.pGeo.attributes.aColor.array, PS = this.pGeo.attributes.aSize.array, PA = this.pGeo.attributes.aAlpha.array;
    this.parts.forEach((p, i) => { if (p.life <= 0 && Math.random() < 0.04) { const r = Math.floor(Math.random() * L), h = this.cur[r * C + C - 1]; if (h > 1.6) { p.life = 1; p.x = this.W / 2; p.z = -this.D / 2 + r * (this.D / (L - 1)); p.y = h; p.ask = r < L / 2; } } if (p.life > 0) { p.life -= dt * 0.6; p.y += dt * 1.4; p.x -= dt * 0.4; } const a = Math.max(0, p.life); P.set([p.x || 0, p.y || 0, p.z || 0], i * 3); PC.set(p.ask ? [1, 0.4, 0.45] : [0.2, 0.95, 0.7], i * 3); PS[i] = 0.35; PA[i] = a * 0.9; });
    ['position', 'aColor', 'aSize', 'aAlpha'].forEach(a => this.pGeo.attributes[a].needsUpdate = true);
    if (this.mx >= 0 && this._hoverDirty) { this._hoverDirty = false; const hit = this.ray().intersectObject(this.mesh)[0]; if (hit && hit.face) { const i = hit.face.a, c = i % C, r = Math.floor(i / C), ask = r < L / 2, bps = ask ? (L / 2 - r) * 2 : (r - L / 2 + 1) * 2, val = this.S.books.depth[c][r], mins = (C - 1 - c) * 3; this.showTip(this.mx, this.my, '<b style="color:#eef3f8">' + this.S.books.focus + '</b> · <span style="color:' + (ask ? '#ff5c6c' : '#2ee6a6') + '">' + (ask ? 'ask +' : 'bid −') + bps + ' bps</span><br>depth ' + fmt.usd(val) + (this.sat && bps > 10 ? ' (beyond 20-level window)' : '') + '<br>' + (mins ? '≈' + (mins >= 60 ? (mins / 60).toFixed(1) + 'h' : mins + 'm') + ' ago' : 'live edge'), ask ? '#ff5c6c' : '#2ee6a6'); } else this.hideTip(); }
  }
}


// ================= volume bubbles (glossy floating spheres) =================
class Bubbles3D extends Scene3D {
  static attrs = ['band', 'sel'];
  cfg() { this.dist0 = 33; this.pitch0 = 0.28; this.yaw0 = 0.5; this.autoRot = 0.035; this.fov = 34; this.fitAspect = 2.1; }
  build() {
    const T = this.T, S = this.scene, rows = this.S.volRows, BAND = this.CQ.BAND, r = this.renderer, tm = o => { o.material.toneMapped = false; return o; };
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.target.set(-0.5, 2.4, 0);
    const pm = new T.PMREMGenerator(r), env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(40, 40, 40), new T.MeshBasicMaterial({ color: 0x05070b, side: T.BackSide })));
    const panel = (hex, k, x, y, z, w, h) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ side: T.DoubleSide })); m.material.color.setHex(hex).multiplyScalar(k); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    panel(0xffffff, 6, 0, 18, 4, 16, 10); panel(0x4c9bff, 3.2, -18, 4, 6, 8, 18); panel(0xff7a3d, 2.6, 18, 2, -6, 8, 14); panel(0x2ee6a6, 1.6, 4, -6, 18, 14, 5);
    S.environment = this.envTex = pm.fromScene(env, 0.03).texture; pm.dispose(); env.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
    S.add(new T.HemisphereLight(0xbfd4ff, 0x05070a, 0.35)); const dl = new T.DirectionalLight(0xffffff, 1.4); dl.position.set(-6, 14, 10); S.add(dl);
    const X = c => (c + 2) * 0.85, Y = m => Math.log(m) * 4.4, Z = oi => (Math.log10(Math.max(oi, 1e4)) - 7.4) * 2.1;
    const fy = (this.fy = -4.4), x0 = -12.2, x1 = 11.2, z0 = -6.4, z1 = 4.8, y1 = Y(1), y2 = Y(2), g = [];
    [-15, -10, -5, 0, 5, 10].forEach(c => g.push(X(c), fy, z0, X(c), fy, z1)); [1e5, 1e6, 1e7, 1e8, 1e9].forEach(v => g.push(x0, fy, Z(v), x1, fy, Z(v)));
    S.add(lines(T, g, 0x1b2532, 0.9));
    const rect = y => [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0];
    S.add(lines(T, rect(y1), 0xeef3f8, 0.16)); S.add(lines(T, rect(y2), 0xff7a3d, 0.55));
    const p2 = (this.p2 = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }))); p2.rotation.x = -Math.PI / 2; p2.position.set((x0 + x1) / 2, y2, (z0 + z1) / 2); S.add(p2);
    S.add(lines(T, [x0, fy, z0, x0, Y(12), z0], 0x2a3442, 1));
    [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [5, '5×'], [10, '10×']].forEach(([m, t]) => { const l = tm(label(T, t, { size: 0.62, color: m === 2 ? '#ff7a3d' : '#6b7889', weight: 600, anchor: 'right' })); l.position.set(x0 - 0.3, Y(m), z0); S.add(l); });
    [-15, -10, -5, 0, 5, 10].forEach(c => { const l = tm(label(T, (c > 0 ? '+' : '') + c + '%', { size: 0.58, color: c === 0 ? '#eef3f8' : '#6b7889' })); l.position.set(X(c), fy, z1 + 0.9); S.add(l); });
    [[1e5, 'OI $100K'], [1e7, 'OI $10M'], [1e9, 'OI $1B']].forEach(([v, t]) => { const l = tm(label(T, t, { size: 0.5, color: '#5b6878', anchor: 'left' })); l.position.set(x1 + 0.4, fy, Z(v)); S.add(l); });
    const sz = tm(label(T, '2× · SURGING ZONE', { size: 0.52, color: '#ff7a3d', weight: 600, anchor: 'left' })); sz.position.set(x1 + 0.4, y2, z0); S.add(sz);
    const px = tm(label(T, '24H PRICE CHANGE →', { size: 0.48, color: '#5b6878', weight: 600 })); px.position.set(X(0), fy, z1 + 2); S.add(px);
    const geo = new T.SphereGeometry(1, 48, 32);
    this.nodes = rows.map((row, i) => {
      const col = new T.Color(BAND[row.band].c);
      const mat = new T.MeshPhysicalMaterial({ color: col, roughness: 0.16, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.35, iridescenceIOR: 1.3, envMapIntensity: 1.3, emissive: col, emissiveIntensity: 0.06, transparent: true });
      const m = new T.Mesh(geo, mat); m.userData.i = i; m.scale.setScalar(0.001); S.add(m);
      const n = { row, m, mat, col, rad: 0.32 + Math.max(0, (Math.log10(row.n24) - 5) / 4.2) * 1.55, home: new T.Vector3(X(row.chg), Y(row.mult), Z(row.oi)), ph: Math.random() * 7, sc: 1, op: 1 };
      if (row.mult >= 1.9 || n.rad > 1.25) { n.lb = tm(label(T, row.coin + ' ' + row.mult.toFixed(1) + '×', { size: 0.52, color: '#eef3f8', weight: 600, anchor: 'bottom', bg: 'rgba(7,10,14,0.6)' })); S.add(n.lb); }
      return n;
    });
    const N = this.nodes.length, dv = new T.Vector3();
    for (let it = 0; it < 160; it++) for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const a = this.nodes[i], b = this.nodes[j]; dv.copy(b.home).sub(a.home); const L = dv.length() || 0.01, need = a.rad + b.rad + 0.2; if (L < need) { dv.multiplyScalar((need - L) / L * 0.5); a.home.sub(dv); b.home.add(dv); } }
    this.gGeo = ptsGeo(T, N); const gp = new T.Points(this.gGeo, this.glow()); gp.frustumCulled = false; S.add(gp);
    this.nodes.forEach((n, i) => this.gGeo.attributes.aColor.array.set([n.col.r, n.col.g, n.col.b], i * 3));
    const D = 520, dr = this.CQ.seeded('dust'); this.dust = []; for (let i = 0; i < D; i++) this.dust.push({ x: x0 + dr() * (x1 - x0), y: fy + dr() * 17, z: z0 + dr() * (z1 - z0), v: 0.12 + dr() * 0.3, s: 0.05 + dr() * 0.1 });
    this.dGeo = ptsGeo(T, D); this.dust.forEach((p, i) => { this.dGeo.attributes.aColor.array.set([0.45, 0.65, 1], i * 3); this.dGeo.attributes.aSize.array[i] = p.s; }); const dp = new T.Points(this.dGeo, this.glow()); dp.frustumCulled = false; S.add(dp);
    this.born = performance.now();
  }
  onClick() { if (this.hov) window.dispatchEvent(new CustomEvent('cq:vol', { detail: this.hov.row.coin })); }
  frame(t, dt, pnow) {
    const band = this.getAttribute('band') || 'All bands', sel = this.getAttribute('sel') || '', fmt = this.CQ.fmt, BAND = this.CQ.BAND;
    if (this.mx < 0) this.hov = null;
    else if (this._hoverDirty) { this._hoverDirty = false; const hit = this.ray().intersectObjects(this.nodes.filter(n => n.op > 0.5).map(n => n.m))[0]; this.hov = hit ? this.nodes[hit.object.userData.i] : null; this.renderer.domElement.style.cursor = this.hov ? 'pointer' : 'grab'; }
    const GP = this.gGeo.attributes.position.array, GS = this.gGeo.attributes.aSize.array, GA = this.gGeo.attributes.aAlpha.array;
    this.nodes.forEach((n, i) => {
      const k = ease((pnow - this.born - i * 45) / 1100), on = band === 'All bands' || n.row.band === band, isSel = n.row.coin === sel, isHov = n === this.hov;
      n.op += ((on ? 1 : 0.1) - n.op) * 0.1; n.sc += (((on ? 1 : 0.55) * (isHov ? 1.15 : 1) * (isSel ? 1.1 : 1)) - n.sc) * 0.12;
      const x = n.home.x + Math.sin(t * 0.45 + n.ph) * 0.18, y = n.home.y + Math.sin(t * 0.8 + n.ph * 1.3) * 0.28 - (1 - k) * 8, z = n.home.z + Math.cos(t * 0.5 + n.ph) * 0.18, s = Math.max(0.001, n.rad * n.sc * k);
      n.m.position.set(x, y, z); n.m.scale.setScalar(s); n.mat.opacity = n.op; n.mat.depthWrite = n.op > 0.5;
      n.mat.emissiveIntensity = isSel ? 0.35 + 0.25 * Math.sin(t * 4) : isHov ? 0.3 : 0.06;
      GP.set([x, y, z], i * 3); GS[i] = s * (isSel ? 4.6 + Math.sin(t * 4) * 0.6 : 3.4); GA[i] = (isSel ? 0.5 : 0.2) * n.op * k;
      if (n.lb) { n.lb.position.set(x, y + s + 0.25, z); n.lb.material.opacity = n.op * k; }
    });
    ['position', 'aSize', 'aAlpha'].forEach(a => this.gGeo.attributes[a].needsUpdate = true);
    const DP = this.dGeo.attributes.position.array, DA = this.dGeo.attributes.aAlpha.array;
    this.dust.forEach((p, i) => { p.y += p.v * dt; if (p.y > this.fy + 17) p.y = this.fy; DP.set([p.x + Math.sin(t * 0.3 + i) * 0.3, p.y, p.z], i * 3); DA[i] = 0.28 * Math.sin(Math.PI * (p.y - this.fy) / 17); });
    this.dGeo.attributes.position.needsUpdate = true; this.dGeo.attributes.aAlpha.needsUpdate = true;
    this.p2.material.opacity = 0.04 + 0.025 * Math.sin(t * 1.5);
    if (this.hov) { const n = this.hov, r = n.row, c = BAND[r.band].c, [sx, sy] = this.project(n.m.position.x, n.m.position.y + n.m.scale.x, n.m.position.z); this.showTip(sx, sy, '<b style="color:#eef3f8">' + r.coin + '</b> · <span style="color:' + c + '">' + r.mult.toFixed(2) + '× · ' + r.band + '</span><br>24h ' + fmt.usd(r.n24) + ' vs 30d mean ' + fmt.usd(r.mean) + '<br>px ' + fmt.pct(r.chg) + ' · OI ' + fmt.usd(r.oi) + '<br><span style="color:#5b6878">click for 30-day series</span>', c); } else if (this.mx >= 0) this.hideTip();
  }
}


// ================= event horizon (calendar) =================
class Horizon3D extends Scene3D {
  static attrs = ['filter'];
  cfg() { this.dist0 = 34; this.pitch0 = 0.34; this.yaw0 = 0; this.sway = 0.16; this.fov = 38; this.fitAspect = 2.2; }
  Z(d) { return 10 - d * 2.2; }
  build() {
    const T = this.T, S = this.scene, evs = this.S.events, Z = d => this.Z(d), W = (this.W = 7.6), hash = this.CQ.hash, MON = ['Oct', 'Nov'];
    this.target.set(0, 1.6, -14);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 0.9)); const dl = new T.DirectionalLight(0xffffff, 1.2); dl.position.set(4, 12, 10); S.add(dl);
    const g = [], gw = [];
    for (let d = 0; d <= 31; d++) { const z = Z(d), dt = new Date(2026, 9, 14 + d); (dt.getDay() === 1 ? gw : g).push(-W, 0, z, W, 0, z); if (d % 2 === 0 && d < 31) { const l = label(T, dt.getDate() + ' ' + MON[dt.getMonth() - 9], { size: 0.62, color: d === 0 ? '#eef3f8' : '#6b7889', weight: d === 0 ? 600 : 500, anchor: 'right' }); l.position.set(-W - 0.6, 0, z); S.add(l); } }
    S.add(lines(T, g, 0x18212c, 0.9)); S.add(lines(T, gw, 0x2a3646, 1)); S.add(lines(T, [-W, 0, Z(0), -W, 0, Z(31), W, 0, Z(0), W, 0, Z(31)], 0x2a3646, 1));
    const zn = (this.zn = Z(0.77));
    S.add(lines(T, [-W, 0, zn, -W, 7, zn, -W, 7, zn, W, 7, zn, W, 7, zn, W, 0, zn, -W, 0, zn, W, 0, zn], 0xeef3f8, 0.75));
    this.gate = new T.Mesh(new T.PlaneGeometry(W * 2, 7), new T.MeshBasicMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.04, side: T.DoubleSide, depthWrite: false })); this.gate.position.set(0, 3.5, zn); S.add(this.gate);
    const nl = label(T, 'NOW', { size: 0.8, color: '#eef3f8', weight: 600, anchor: 'bottom' }); nl.position.set(0, 7.25, zn); S.add(nl);
    this.NS = 150; this.walls = [-1, 1].map(side => {
      const n = this.NS + 1, pos = new Float32Array(n * 6), idx = [];
      for (let i = 0; i < n; i++) { const z = Z(i / this.NS * 31); pos.set([side * (W + 0.05), 0, z, side * (W + 0.05), 0, z], i * 6); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(idx);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xa98bff, transparent: true, opacity: 0.11, side: T.DoubleSide, depthWrite: false })); m.frustumCulled = false; S.add(m);
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); const ln = new T.Line(eg, new T.LineBasicMaterial({ color: 0xc7b4ff, transparent: true, opacity: 0.85 })); ln.frustumCulled = false; S.add(ln);
      return { side, geo, eg };
    });
    this.dens = new Float32Array(this.NS + 1); this.densCur = new Float32Array(this.NS + 1); this.dMax = 0; this.calcDens('All types'); this.dMax = Math.max(...this.dens) || 1; this.calcDens('All types');
    const box = new T.BoxGeometry(0.42, 1, 0.42); box.translate(0, 0.5, 0); const ringG = new T.RingGeometry(0.55, 0.7, 40);
    const archR = W - 0.7, arch = new T.TorusGeometry(archR, 0.1, 10, 80, Math.PI);
    this.items = evs.map((e, i) => {
      const hex = e.type === 'Macro' ? '#ffb547' : e.type === 'Depeg' ? '#ff5c6c' : '#a98bff', col = new T.Color(hex), day = e.day === 0 ? 0.95 : e.day + 0.5, z = Z(day);
      const it = { e, hex, col, z, i, op: 1, sc: 1 };
      if (e.type === 'Macro') { it.kind = 'arch'; it.hs = 0.22 + e.mag * 1.05; it.m = new T.Mesh(arch, new T.MeshBasicMaterial({ color: col, transparent: true })); it.m.position.set(0, 0, z); it.x = 0; it.topY = archR * it.hs; }
      else { it.kind = 'pillar'; const h = hash(e.sym + e.id), sd = h < 0.5 ? -1 : 1; it.x = sd * (1.5 + ((h * 7.31) % 1) * 4.6); it.h = 0.8 + e.mag * 9; it.m = new T.Mesh(box, new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2, transparent: true })); it.m.position.set(it.x, 0, z); it.topY = it.h;
        it.ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); it.ring.rotation.x = -Math.PI / 2; it.ring.position.set(it.x, 0.02, z); S.add(it.ring); }
      it.m.userData.it = it; S.add(it.m);
      if (e.mag >= 0.4) { const txt = e.sym === 'market-wide' ? e.size + ' · ' + e.mag.toFixed(2) : e.sym + ' ' + e.size.split(',')[0]; it.lb = label(T, txt, { size: 0.62, color: '#eef3f8', weight: 600, anchor: 'bottom', bg: 'rgba(7,10,14,0.7)' }); S.add(it.lb); }
      return it;
    });
    this.gGeo = ptsGeo(T, this.items.length); const gp = new T.Points(this.gGeo, this.glow()); gp.frustumCulled = false; S.add(gp);
    this.items.forEach((it, i) => this.gGeo.attributes.aColor.array.set([it.col.r, it.col.g, it.col.b], i * 3));
    const P = 460, pr = this.CQ.seeded('hz'); this.parts = []; for (let i = 0; i < P; i++) this.parts.push({ x: (pr() * 2 - 1) * W, y: pr() * 0.6, z: Z(pr() * 31), v: 1.2 + pr() * 2.4, s: 0.06 + pr() * 0.12 });
    this.pGeo = ptsGeo(T, P); this.parts.forEach((p, i) => { this.pGeo.attributes.aColor.array.set([0.72, 0.62, 1], i * 3); this.pGeo.attributes.aSize.array[i] = p.s; }); const pp = new T.Points(this.pGeo, this.glow()); pp.frustumCulled = false; S.add(pp);
    this.born = performance.now();
  }
  calcDens(f) { const evs = this.S.events.filter(e => f === 'All types' || e.type === f); for (let i = 0; i <= this.NS; i++) { const t = i / this.NS * 31; let s = 0; evs.forEach(e => { s += e.mag * Math.exp(-Math.pow(t - (e.day + 0.5), 2) / 2.2); }); this.dens[i] = this.dMax ? s / this.dMax * 6 : s; } }
  onAttr() { this.calcDens(this.getAttribute('filter') || 'All types'); }
  frame(t, dt, pnow) {
    const f = this.getAttribute('filter') || 'All types', fmt = this.CQ.fmt;
    for (let i = 0; i <= this.NS; i++) this.densCur[i] += (this.dens[i] - this.densCur[i]) * 0.06;
    const grow = ease((pnow - this.born) / 1600);
    this.walls.forEach(w => { const p = w.geo.attributes.position.array, e = w.eg.attributes.position.array; for (let i = 0; i <= this.NS; i++) { const h = this.densCur[i] * grow; p[i * 6 + 4] = h; e[i * 3] = p[i * 6]; e[i * 3 + 1] = h; e[i * 3 + 2] = p[i * 6 + 2]; } w.geo.attributes.position.needsUpdate = true; w.eg.attributes.position.needsUpdate = true; });
    const GP = this.gGeo.attributes.position.array, GS = this.gGeo.attributes.aSize.array, GA = this.gGeo.attributes.aAlpha.array;
    this.items.forEach((it, i) => {
      const e = it.e, on = f === 'All types' || e.type === f, k = ease((pnow - this.born - 300 - e.day * 55) / 900), soon = e.day <= 2, pulse = soon ? 0.5 + 0.5 * Math.sin(t * 4 + i) : 0;
      it.op += ((on ? 1 : 0.1) - it.op) * 0.1;
      const y = it.kind === 'arch' ? it.topY * k : it.h * k;
      if (it.kind === 'arch') { it.m.scale.set(1, Math.max(0.001, it.hs * k), 1); it.m.material.opacity = it.op * (0.75 + 0.25 * pulse); }
      else { it.m.scale.set(1, Math.max(0.001, it.h * k), 1); it.m.material.opacity = it.op; it.m.material.emissiveIntensity = 0.5 + pulse * 0.6 + (it === this.hov ? 0.6 : 0);
        const ph = (t * 0.7 + i * 0.13) % 1; it.ring.scale.setScalar(1 + (e.day <= 7 ? ph * 2.4 : 0)); it.ring.material.opacity = (e.day <= 7 ? 0.6 * (1 - ph) : 0.18) * it.op; }
      GP.set([it.x, y, it.z], i * 3); GS[i] = (1.1 + e.mag * 2.6) * (1 + pulse * 0.5) * k; GA[i] = (0.55 + pulse * 0.4) * it.op;
      if (it.lb) { it.lb.position.set(it.x, y + 0.35, it.z); it.lb.material.opacity = it.op * k; }
    });
    ['position', 'aSize', 'aAlpha'].forEach(a => this.gGeo.attributes[a].needsUpdate = true);
    const PP = this.pGeo.attributes.position.array, PA = this.pGeo.attributes.aAlpha.array, z0 = this.Z(31), z1 = this.zn;
    this.parts.forEach((p, i) => { p.z += p.v * dt; if (p.z > z1) p.z = z0; PP.set([p.x, p.y + 0.05, p.z], i * 3); const u = (p.z - z0) / (z1 - z0); PA[i] = 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, u))); });
    this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.aAlpha.needsUpdate = true;
    this.gate.material.opacity = 0.035 + 0.025 * Math.sin(t * 2.2);
    if (this.mx < 0) this.hov = null;
    else if (this._hoverDirty) { this._hoverDirty = false; const hit = this.ray().intersectObjects(this.items.filter(it => it.op > 0.5).map(it => it.m))[0]; this.hov = hit ? hit.object.userData.it : null; this.renderer.domElement.style.cursor = this.hov ? 'pointer' : 'grab'; }
    if (this.hov) { const it = this.hov, e = it.e, [sx, sy] = this.project(it.x, it.kind === 'arch' ? it.topY : it.h, it.z); this.showTip(sx, sy, '<b style="color:#eef3f8">' + e.name + '</b><br><span style="color:' + it.hex + '">' + e.type + '</span> · ' + e.date + ' · ' + e.rel + '<br>magnitude ' + e.mag.toFixed(2) + ' · bias ' + (e.bias === 'risk' ? 'risk flag' : e.bias) + '<br>' + e.size + ' · ' + e.src, it.hex); } else if (this.mx >= 0) this.hideTip();
  }
}

const def = (n, c) => { if (!customElements.get(n)) customElements.define(n, c); };
def('cq-liqstream', LiqStream); def('cq-galaxy', Galaxy); def('cq-cycle', Cycle); def('cq-gamma3d', Gamma3D); def('cq-depth3d', Depth3D); def('cq-bubbles3d', Bubbles3D); def('cq-horizon3d', Horizon3D);
})();
