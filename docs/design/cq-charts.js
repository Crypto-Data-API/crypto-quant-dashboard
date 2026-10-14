(function () {
if (window.__cqCharts) return; window.__cqCharts = 1;
const waitCQ = () => new Promise(r => { const f = () => (window.CQ ? r(window.CQ) : setTimeout(f, 30)); f(); });
const MONO = "'Geist Mono', ui-monospace, monospace";
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
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

const g01 = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function tip(ctx, W, H, x, y, lines, accent) {
  ctx.font = '500 11px ' + MONO; const pad = 9, lh = 16;
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2, th = lines.length * lh + pad * 2 - 5;
  let tx = x + 14, ty = y - th - 10; if (tx + tw > W - 4) tx = x - tw - 14; if (tx < 4) tx = 4; if (ty < 4) ty = y + 16; if (ty + th > H - 2) ty = H - th - 2;
  ctx.fillStyle = 'rgba(7,10,14,0.95)'; ctx.strokeStyle = accent ? rgba(accent, 0.7) : '#2a3442'; ctx.lineWidth = 1; rr(ctx, tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? '#eef3f8' : '#9aa8b8'; ctx.font = (i === 0 ? '600 ' : '400 ') + '11px ' + MONO; ctx.fillText(l, tx + pad, ty + pad + 9 + i * lh); });
}

class CanvasEl extends HTMLElement {
  static get observedAttributes() { return this.attrs || []; }
  connectedCallback() {
    if (this._c) return;
    this.style.display = 'block'; this.style.position = 'relative';
    if (!this.style.width) this.style.width = '100%'; if (!this.style.height) this.style.height = '100%';
    const c = (this._c = document.createElement('canvas'));
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    this.appendChild(c); this.ctx = c.getContext('2d'); if (this.constructor.fs) this._fsOff = fsButton(this, '#080b10'); this.w = 0; this.h = 0; this.mx = -1; this.my = -1;
    this._born = performance.now();
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._io = new IntersectionObserver(es => { this._vis = es[es.length - 1].isIntersecting; }); this._io.observe(this);
    c.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(); this.mx = e.clientX - b.left; this.my = e.clientY - b.top; if (this._ready && !this.loop) this.draw(performance.now()); });
    c.addEventListener('pointerleave', () => { this.mx = this.my = -1; if (this._ready && !this.loop) this.draw(performance.now()); });
    c.addEventListener('click', () => this._ready && this.onClick && this.onClick());
    waitCQ().then(CQ => document.fonts.ready.then(() => {
      if (!this._c || this._ready) return; this.CQ = CQ; this.S = CQ.state; this.init && this.init(); this._ready = true; this._resize();
      this._unsub = CQ.on((t, p) => this.onData && this.onData(t, p));
      const fr = now => { if (!this._c) return; this._last = performance.now(); if (this._vis !== false && !document.hidden && this.w) this.draw(now); if (this.loop || now - this._born < (this.intro || 0)) this._raf = requestAnimationFrame(fr); else this._raf = 0; };
      this._iv = setInterval(() => { if (!this._c || !this.w) return; const n = performance.now(); if (n - (this._last || 0) > 300 && (this.loop || n - this._born < (this.intro || 0) + 400)) this.draw(n); }, 150);
      this._kick = () => { if (!this._raf) this._raf = requestAnimationFrame(fr); };
      this._kick();
    }));
  }
  replay(ms) { this._born = performance.now(); if (ms) this.intro = ms; this._kick && this._kick(); }
  disconnectedCallback() { this._fsOff && this._fsOff(); this._fsOff = null; cancelAnimationFrame(this._raf); clearInterval(this._iv); this._raf = 0; this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); this._unsub && this._unsub(); this._c && this._c.remove(); this._c = null; this._ready = false; }
  attributeChangedCallback() { if (this._ready) { this.onAttr && this.onAttr(); this._kick(); if (!this.loop) this.draw(performance.now()); } }
  _resize() { if (!this._c) return; const w = this.clientWidth, h = this.clientHeight, d = Math.min(2, window.devicePixelRatio || 1); if (!w || !h) return; this.w = w; this.h = h; this._c.width = Math.round(w * d); this._c.height = Math.round(h * d); this.ctx.setTransform(d, 0, 0, d, 0, 0); if (this._ready) { this.onResize && this.onResize(); this.draw(performance.now()); } }
  attr(n, d) { const v = this.getAttribute(n); return v == null || v === '' ? d : v; }
  num(n, d) { const v = parseFloat(this.getAttribute(n)); return isNaN(v) ? d : v; }
  age(now) { return (now - this._born) / 1000; }
}

// ---------- sparkline ----------
class Spark extends CanvasEl {
  static attrs = ['data', 'color', 'src'];
  init() { this.loop = this.hasAttribute('live'); this.intro = 900; }
  onAttr() { if (this.hasAttribute('replay')) this.replay(700); }
  series() { const s = this.getAttribute('src'); if (s) return s.split('.').reduce((o, k) => (o ? o[k] : null), this.S) || []; const d = this.getAttribute('data'); return d ? d.split(',').map(Number) : []; }
  onData(t) { if (t === 'tick' && this.getAttribute('src') && !this.loop) this.draw(performance.now()); }
  draw(now) {
    const { ctx, w, h } = this, s = this.series(); ctx.clearRect(0, 0, w, h); if (s.length < 2) return;
    const col = this.attr('color', '#4c9bff'), p = ease(this.age(now) / 0.9), live = this.hasAttribute('live'), pad = live ? 5 : 2;
    let mn = Math.min(...s), mx = Math.max(...s); if (this.attr('mode') === 'bars') mn = 0; if (mx - mn < 1e-12) { mx += 1; mn -= 1; }
    const X = i => pad + (i / (s.length - 1)) * (w - pad * 2), Y = v => h - pad - ((v - mn) / (mx - mn)) * (h - pad * 2);
    if (this.attr('mode') === 'bars') {
      const bw = (w - pad * 2) / s.length, ref = this.num('mean', NaN);
      s.forEach((v, i) => { const k = ease((this.age(now) - i * 0.02) / 0.6), bh = Math.max(1, (h - pad * 2) * (v / mx) * k); ctx.fillStyle = i === s.length - 1 ? col : rgba(col, 0.32); ctx.fillRect(pad + i * bw + 1, h - pad - bh, Math.max(1, bw - 2), bh); });
      if (!isNaN(ref)) { const y = Y(ref); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(230,237,245,0.35)'; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#8b98a9'; ctx.font = '10px ' + MONO; ctx.fillText('30d mean', pad + 4, y - 4); }
      return;
    }
    const n = Math.max(2, Math.ceil(s.length * p));
    ctx.beginPath(); for (let i = 0; i < n; i++) { const x = X(i), y = Y(s[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = col; ctx.lineWidth = this.num('lw', 1.4); ctx.lineJoin = 'round'; ctx.stroke();
    if (this.hasAttribute('fill')) { ctx.lineTo(X(n - 1), h); ctx.lineTo(X(0), h); ctx.closePath(); const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fill(); }
    if (live || p < 1) { const x = X(n - 1), y = Y(s[n - 1]), k = (now / 1000) % 1.6 / 1.6; ctx.beginPath(); ctx.arc(x, y, 2 + k * 5, 0, 7); ctx.fillStyle = rgba(col, 0.4 * (1 - k)); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fillStyle = col; ctx.fill(); }
  }
}

// ---------- gauge ----------
class Gauge extends CanvasEl {
  static attrs = ['value', 'color'];
  init() { this.loop = true; this.cur = 0; }
  draw(now) {
    const { ctx, w, h } = this, v = this.num('value', 0), max = this.num('max', 100), col = this.attr('color', '#4c9bff');
    ctx.clearRect(0, 0, w, h); this.cur += (v - this.cur) * 0.05;
    const R = Math.max(10, Math.min(w / 2 - 14, (h - 16) / 1.72)), cx = w / 2, cy = (h - 1.707 * R) / 2 + R, a0 = Math.PI * 0.75, span = Math.PI * 1.5, lw = Math.max(5, R * 0.1);
    const f = this.cur / max, a1 = a0 + span * f;
    for (let i = 0; i <= 50; i++) { const a = a0 + span * i / 50, major = i % 10 === 0, r0 = R + lw * 0.9 + 3, r1 = r0 + (major ? 7 : 3.5); ctx.strokeStyle = i / 50 <= f ? rgba(col, major ? 0.9 : 0.55) : 'rgba(150,170,195,' + (major ? 0.28 : 0.12) + ')'; ctx.lineWidth = major ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
    ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(150,170,195,0.08)'; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + span); ctx.stroke();
    let grad = col; if (ctx.createConicGradient) { grad = ctx.createConicGradient(a0, cx, cy); grad.addColorStop(0, rgba(col, 0.15)); grad.addColorStop(Math.max(0.01, 0.75 * f), col); grad.addColorStop(Math.min(1, 0.75 * f + 0.001), rgba(col, 0)); }
    ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.strokeStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, R, a0, Math.max(a0 + 0.001, a1)); ctx.stroke(); ctx.shadowBlur = 0;
    const ph = (now / 2200) % 1, as = a0 + (a1 - a0) * ph; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * Math.sin(ph * Math.PI)) + ')'; ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.arc(cx, cy, R, Math.max(a0, as - 0.25), as); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    const tx = cx + Math.cos(a1) * R, ty = cy + Math.sin(a1) * R; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, lw * 0.42, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.lineCap = 'butt';
    ctx.fillStyle = '#eef3f8'; ctx.font = '600 ' + Math.round(R * 0.5) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.round(this.cur)), cx, cy + R * 0.02); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}

// ---------- Monte Carlo fan ----------
class Fan extends CanvasEl {
  static fs = true;
  static attrs = ['p5', 'p50', 'p95'];
  init() { this.loop = true; this.paths = []; this.bins = new Float32Array(56); this.lastSpawn = 0; this.N = 48; for (let i = 0; i < 60; i++) this.spawn(performance.now() - 8000 + i * 60, true); }
  P() { const p5 = this.num('p5', -4.4), p50 = this.num('p50', 0.22), p95 = this.num('p95', 4.7); return { p5, p50, p95, sig: (p95 - p5) / 3.29 }; }
  spawn(t, seedOnly) { const { p50, sig } = this.P(), N = this.N, pts = [0]; let x = 0; const ss = sig / Math.sqrt(N); for (let i = 1; i <= N; i++) { x += p50 / N + g01() * ss * (Math.random() < 0.04 ? 2 : 1); pts.push(x); } this.paths.push({ pts, born: t, done: !!seedOnly }); if (seedOnly) this.bin(x); if (this.paths.length > 150) this.paths.shift(); }
  range() { const { p5, p95 } = this.P(); return [Math.min(p5, -1) * 1.85, Math.max(p95, 1) * 1.85]; }
  bin(v) { const [lo, hi] = this.range(), i = Math.floor((v - lo) / (hi - lo) * this.bins.length); if (i >= 0 && i < this.bins.length) this.bins[i] += 1; }
  draw(now) {
    const { ctx, w, h } = this, { p5, p50, p95, sig } = this.P(), [lo, hi] = this.range(), N = this.N;
    ctx.clearRect(0, 0, w, h);
    const D = Math.min(130, w * 0.2), pl = 40, pr = D + 12, pt = 8, pb = 22, W = w - pl - pr, H = h - pt - pb;
    const X = i => pl + (i / N) * W, Y = v => pt + (1 - (v - lo) / (hi - lo)) * H;
    if (now - this.lastSpawn > 70) { this.spawn(now); this.lastSpawn = now; }
    for (let i = 0; i < this.bins.length; i++) this.bins[i] *= 0.9975;
    ctx.font = '10px ' + MONO; ctx.lineWidth = 1;
    for (let g = Math.ceil(lo / 2) * 2; g <= hi; g += 2) { const y = Y(g); ctx.strokeStyle = g === 0 ? 'rgba(200,215,235,0.22)' : 'rgba(150,170,195,0.07)'; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - 4, y); ctx.stroke(); ctx.fillStyle = '#5b6878'; ctx.fillText((g > 0 ? '+' : '') + g + '%', 4, y + 3); }
    ['now', '+6h', '+12h', '+18h', '+24h'].forEach((l, i) => { const x = pl + W * i / 4; ctx.fillStyle = '#5b6878'; ctx.fillText(l, Math.min(x, pl + W - 26), h - 6); ctx.strokeStyle = 'rgba(150,170,195,0.05)'; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + H); ctx.stroke(); });
    const cone = (k, fill) => { ctx.beginPath(); for (let i = 0; i <= N; i++) { const t = i / N; ctx.lineTo(X(i), Y(p50 * t + k * sig * Math.sqrt(t))); } for (let i = N; i >= 0; i--) { const t = i / N; ctx.lineTo(X(i), Y(p50 * t - k * sig * Math.sqrt(t))); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    cone(1.645, 'rgba(76,155,255,0.06)'); cone(0.674, 'rgba(76,155,255,0.08)');
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.paths) {
      const a = (now - p.born) / 1000, head = Math.min(1, a / 1.1), n = Math.max(1, Math.floor(head * N)), end = p.pts[N];
      if (head >= 1 && !p.done) { p.done = true; this.bin(end); }
      const alpha = head < 1 ? 0.7 : Math.max(0, 0.13 * (1 - (a - 1.1) / 7));
      if (alpha <= 0) continue;
      const col = end > p95 ? '#2ee6a6' : end < p5 ? '#ff5c6c' : '#4c9bff';
      ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = head < 1 ? 1.2 : 1; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const y = Y(p.pts[i]); i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); } ctx.stroke();
      if (head < 1) { ctx.fillStyle = rgba(col, 0.9); ctx.beginPath(); ctx.arc(X(n), Y(p.pts[n]), 1.8, 0, 7); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(238,243,248,0.7)'; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(N), Y(p50)); ctx.stroke(); ctx.setLineDash([]);
    const dx = pl + W + 10, bmax = Math.max(1, ...this.bins), bh = H / this.bins.length;
    ctx.strokeStyle = 'rgba(150,170,195,0.12)'; ctx.beginPath(); ctx.moveTo(dx, pt); ctx.lineTo(dx, pt + H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx, pt + H);
    for (let i = 0; i < this.bins.length; i++) { const v = lo + (i + 0.5) / this.bins.length * (hi - lo); ctx.lineTo(dx + (this.bins[i] / bmax) * (D - 8), Y(v)); }
    ctx.lineTo(dx, pt); ctx.closePath();
    const gr = ctx.createLinearGradient(0, Y(p95), 0, Y(p5)); gr.addColorStop(0, 'rgba(46,230,166,0.45)'); gr.addColorStop(0.5, 'rgba(76,155,255,0.35)'); gr.addColorStop(1, 'rgba(255,92,108,0.45)'); ctx.fillStyle = gr; ctx.fill();
    [[p95, 'p95', '#2ee6a6'], [p50, 'med', '#eef3f8'], [p5, 'p5', '#ff5c6c']].forEach(([v, l, c]) => { const y = Y(v); ctx.strokeStyle = rgba(c, 0.6); ctx.beginPath(); ctx.moveTo(dx - 4, y); ctx.lineTo(w - 2, y); ctx.stroke(); ctx.fillStyle = c; ctx.font = '600 10.5px ' + MONO; ctx.textAlign = 'right'; ctx.fillText(l + ' ' + (v > 0 ? '+' : '') + v.toFixed(v === p50 ? 2 : 1) + '%', w - 2, y - 4); ctx.textAlign = 'left'; });
    void bh;
  }
}

// ---------- squeeze radar ----------
class Radar extends CanvasEl {
  static fs = true;
  init() { this.loop = true; }
  draw(now) {
    const { ctx, w, h } = this, sq = this.S.squeeze, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 16, M = 52, rOf = s => R * (1 - Math.min(s, M) / M);
    ctx.clearRect(0, 0, w, h);
    const sw = ((now / 3200) % 1) * Math.PI * 2;
    [0, 20, 50].forEach(s => { ctx.strokeStyle = 'rgba(150,170,195,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, rOf(s), 0, 7); ctx.stroke(); });
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,181,71,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, rOf(sq.threshold), 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(150,170,195,0.07)'; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, r1 = R + (i % 6 ? 3 : 6); ctx.strokeStyle = 'rgba(150,170,195,0.2)'; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
    if (ctx.createConicGradient) { const g = ctx.createConicGradient(sw - 1.3, cx, cy); const e = 1.3 / (Math.PI * 2); g.addColorStop(0, 'rgba(76,155,255,0)'); g.addColorStop(e, 'rgba(76,155,255,0.22)'); g.addColorStop(e + 0.0005, 'rgba(76,155,255,0)'); g.addColorStop(1, 'rgba(76,155,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(120,180,255,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); ctx.stroke();
    ctx.fillStyle = 'rgba(255,181,71,0.85)'; ctx.font = '600 9.5px ' + MONO; ctx.fillText(sq.threshold + '%', cx + 4, cy - rOf(sq.threshold) - 4);
    sq.coins.forEach(c => {
      const a = this.CQ.hash(c.coin) * Math.PI * 2, r = rOf(c.sev), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      let d = (sw - a) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; const lit = Math.exp(-d * 1.4);
      const alert = c.sev >= sq.threshold, col = alert ? (c.side === 'L' ? '#2ee6a6' : '#ff5c6c') : '#7f93ad';
      if (alert) { const k = (now / 1400) % 1; ctx.strokeStyle = rgba(col, 0.6 * (1 - k)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 4 + k * 12, 0, 7); ctx.stroke(); }
      ctx.shadowColor = col; ctx.shadowBlur = 8 * lit + (alert ? 6 : 0); ctx.fillStyle = rgba(col, 0.45 + 0.55 * lit); ctx.beginPath(); ctx.arc(x, y, alert ? 3.6 : 2.6, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = alert ? '#eef3f8' : rgba('#9aa8b8', 0.5 + 0.5 * lit); ctx.font = (alert ? '600 ' : '') + '10px ' + MONO; const left = x < cx; ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(c.coin + ' ' + Math.round(c.sev) + '%', x + (left ? -6 : 6), y + 3 + (Math.sin(a) > 0 ? 3 : -1)); ctx.textAlign = 'left';
    });
  }
}

// ---------- volume bubble field ----------
class Bubbles extends CanvasEl {
  static fs = true;
  static attrs = ['band', 'sel'];
  init() { this.loop = true; this.nodes = this.S.volRows.map((r, i) => ({ r, x: 0, y: 0, vx: 0, vy: 0, on: false, rad: 3 + Math.max(0, (Math.log10(r.n24) - 5) / 4.2) * 22, delay: 200 + i * 28, ph: Math.random() * 7 })); }
  geo() { return { pl: 44, pr: 14, pt: 14, pb: 26 }; }
  tgt(r) { const { pl, pr, pt, pb } = this.geo(); const x = pl + ((r.chg + 16) / 28) * (this.w - pl - pr); const y0 = Math.log(0.35), y1 = Math.log(14); return [x, this.h - pb - ((Math.log(r.mult) - y0) / (y1 - y0)) * (this.h - pt - pb)]; }
  hit() { let best = null, bd = 1e9; this.nodes.forEach(n => { if (!n.on) return; const d = Math.hypot(n.x - this.mx, n.y - this.my); if (d < n.rad + 4 && d < bd) { bd = d; best = n; } }); return best; }
  onClick() { const n = this.hit(); if (n) window.dispatchEvent(new CustomEvent('cq:vol', { detail: n.r.coin })); }
  draw(now) {
    const { ctx, w, h } = this, { pl, pr, pt, pb } = this.geo(), age = this.age(now) * 1000, band = this.attr('band', 'All bands'), sel = this.attr('sel', '');
    ctx.clearRect(0, 0, w, h);
    const y0 = Math.log(0.35), y1 = Math.log(14), Ym = m => h - pb - ((Math.log(m) - y0) / (y1 - y0)) * (h - pt - pb), Xc = c => pl + ((c + 16) / 28) * (w - pl - pr);
    ctx.fillStyle = 'rgba(255,122,61,0.04)'; ctx.fillRect(pl, pt, w - pl - pr, Ym(2) - pt);
    ctx.font = '10px ' + MONO; ctx.lineWidth = 1;
    [0.5, 1, 2, 5, 10].forEach(m => { const y = Ym(m); ctx.strokeStyle = m === 1 ? 'rgba(200,215,235,0.22)' : m === 2 ? 'rgba(255,122,61,0.35)' : 'rgba(150,170,195,0.07)'; if (m === 2) ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = m === 2 ? '#ff7a3d' : '#5b6878'; ctx.fillText(m + '×', 8, y + 3); });
    [-15, -10, -5, 0, 5, 10].forEach(c => { const x = Xc(c); ctx.strokeStyle = c === 0 ? 'rgba(200,215,235,0.18)' : 'rgba(150,170,195,0.05)'; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, h - pb); ctx.stroke(); ctx.fillStyle = '#5b6878'; ctx.textAlign = 'center'; ctx.fillText((c > 0 ? '+' : '') + c + '%', x, h - 8); ctx.textAlign = 'left'; });
    ctx.fillStyle = '#5b6878'; ctx.textAlign = 'right'; ctx.fillText('x: 24h price change · y: 24h notional ÷ 30d mean', w - pr - 4, pt + 10); ctx.textAlign = 'left';
    const N = this.nodes;
    N.forEach((n, i) => { if (!n.on && age > n.delay) { const [tx] = this.tgt(n.r); n.on = true; n.x = tx; n.y = h + 20; } if (!n.on) return; const [tx, ty] = this.tgt(n.r); n.vx += (tx - n.x) * 0.035 + Math.sin(now / 1300 + n.ph) * 0.015; n.vy += (ty - n.y) * 0.035 + Math.cos(now / 1100 + n.ph) * 0.015; n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy; void i; });
    for (let it = 0; it < 2; it++) for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const a = N[i], b = N[j]; if (!a.on || !b.on) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, m = a.rad + b.rad + 1.5; if (d < m) { const k = (m - d) / d * 0.5; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; } }
    const hov = this.mx >= 0 ? this.hit() : null; this._c.style.cursor = hov ? 'pointer' : 'default';
    [...N].sort((a, b) => b.rad - a.rad).forEach(n => {
      if (!n.on) return; const col = this.CQ.BAND[n.r.band].c, dim = band !== 'All bands' && n.r.band !== band, A = dim ? 0.18 : 1;
      const g = ctx.createRadialGradient(n.x - n.rad * 0.3, n.y - n.rad * 0.3, 0, n.x, n.y, n.rad); g.addColorStop(0, rgba(col, 0.6 * A)); g.addColorStop(1, rgba(col, 0.1 * A));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.rad, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(col, 0.9 * A); ctx.lineWidth = 1; ctx.stroke();
      if (n.r.coin === sel || n === hov) { const k = (now / 1200) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 - k * 0.7) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.x, n.y, n.rad + 3 + k * 4, 0, 7); ctx.stroke(); }
      if (!dim && (n.r.mult >= 1.9 || n.rad > 15 || n.r.coin === sel)) { ctx.fillStyle = '#eef3f8'; ctx.font = '600 10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(n.r.coin, n.x, n.rad > 13 ? n.y + 3.5 : n.y - n.rad - 4); ctx.textAlign = 'left'; }
    });
    if (hov) { const r = hov.r, f = this.CQ.fmt; tip(ctx, w, h, hov.x, hov.y, [r.coin + '  ' + r.mult.toFixed(2) + '× · ' + r.band, '24h notional ' + f.usd(r.n24), '30d mean ' + f.usd(r.mean), '24h px ' + f.pct(r.chg), 'click to open 30d series'], this.CQ.BAND[r.band].c); }
  }
}

// ---------- catalyst timeline ----------
class Timeline extends CanvasEl {
  static fs = true;
  static attrs = ['filter'];
  init() { this.loop = true; }
  onAttr() { this.replay(); }
  draw(now) {
    const { ctx, w, h } = this, f = this.attr('filter', 'All types'), evs = this.S.events.filter(e => f === 'All types' || e.type === f), age = this.age(now);
    ctx.clearRect(0, 0, w, h);
    const pl = 14, pr = 14, pt = 22, pb = 30, W = w - pl - pr, H = h - pt - pb, X = d => pl + (d / 31) * W, base = pt + H;
    const nowD = 0.77, xn = X(nowD);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(pl, pt, xn - pl, H);
    ctx.font = '10px ' + MONO;
    for (let d = 0; d <= 31; d++) { const x = X(d), dt = new Date(2026, 9, 14 + d), wk = dt.getDay() === 1; ctx.strokeStyle = wk ? 'rgba(150,170,195,0.14)' : 'rgba(150,170,195,0.05)'; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, base); ctx.stroke(); if (d % 3 === 0 && d < 31) { ctx.fillStyle = '#5b6878'; ctx.fillText(dt.getDate() + (d === 0 || dt.getDate() <= 3 ? ' ' + ['Oct', 'Nov'][dt.getMonth() - 9] : ''), x + 3, h - 10); } }
    const curve = []; for (let i = 0; i <= 200; i++) { const t = i / 200 * 31; let s = 0; evs.forEach(e => { s += e.mag * Math.exp(-Math.pow(t - (e.day + 0.5), 2) / 2.2); }); curve.push(s); }
    const cm = Math.max(1, ...curve), shim = 0.75 + 0.25 * Math.sin(now / 900);
    ctx.beginPath(); ctx.moveTo(X(0), base); curve.forEach((s, i) => ctx.lineTo(X(i / 200 * 31), base - (s / cm) * H * 0.55 * ease(age / 1.2))); ctx.lineTo(X(31), base); ctx.closePath();
    const g = ctx.createLinearGradient(0, pt, 0, base); g.addColorStop(0, 'rgba(169,139,255,' + 0.22 * shim + ')'); g.addColorStop(1, 'rgba(169,139,255,0)'); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(169,139,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); curve.forEach((s, i) => { const x = X(i / 200 * 31), y = base - (s / cm) * H * 0.55 * ease(age / 1.2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const perDay = {}, pts = [];
    evs.forEach((e, i) => { const k = perDay[e.day] = (perDay[e.day] || 0) + 1; const x = X(e.day + 0.15 + (k - 1) * 0.28), p = ease((age - 0.25 - i * 0.04) / 0.7), y = base - e.mag * H * p; pts.push({ e, x, y }); });
    let hov = null, hd = 12; pts.forEach(p => { const d = Math.hypot(p.x - this.mx, p.y - this.my); if (this.mx >= 0 && d < hd) { hd = d; hov = p; } });
    pts.forEach(({ e, x, y }) => {
      const col = e.type === 'Macro' ? '#ffb547' : e.type === 'Depeg' ? '#ff5c6c' : '#a98bff', past = e.day + 0.15 < nowD;
      const gr = ctx.createLinearGradient(0, y, 0, base); gr.addColorStop(0, rgba(col, 0.9)); gr.addColorStop(1, rgba(col, 0.05)); ctx.strokeStyle = gr; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, y); ctx.stroke();
      ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = past ? rgba(col, 0.5) : col; ctx.beginPath(); ctx.arc(x, y, 2 + e.mag * 4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (e.mag >= 0.42) { ctx.fillStyle = '#c9d3df'; ctx.font = '600 10px ' + MONO; ctx.fillText(e.sym === 'market-wide' ? e.size : e.sym, x + 6, y - 4); }
    });
    const k = (now / 1600) % 1; ctx.strokeStyle = 'rgba(238,243,248,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn, pt - 6); ctx.lineTo(xn, base); ctx.stroke();
    ctx.fillStyle = '#eef3f8'; ctx.beginPath(); ctx.arc(xn, base, 3, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(238,243,248,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(xn, base, 3 + k * 10, 0, 7); ctx.stroke();
    ctx.fillStyle = '#eef3f8'; ctx.font = '600 10px ' + MONO; ctx.fillText('NOW', xn + 5, pt - 8);
    if (hov) { const e = hov.e; tip(ctx, w, h, hov.x, hov.y, [e.name, e.date + ' · ' + e.rel + ' · ' + e.type, 'magnitude ' + e.mag.toFixed(2) + ' · bias ' + (e.bias === 'risk' ? 'risk flag' : e.bias), e.size + ' · ' + e.src], e.type === 'Macro' ? '#ffb547' : '#a98bff'); }
  }
}

// ---------- gamma cumulative positioning ----------
class Cum extends CanvasEl {
  static fs = true;
  static attrs = ['coin'];
  init() { this.intro = 1000; }
  onAttr() { this.replay(1000); }
  draw(now) {
    const { ctx, w, h } = this, coin = this.attr('coin', 'BTC'), g = this.S.gamma.coins[coin], prof = g.profile, f = this.CQ.fmt, p = ease(this.age(now) / 0.9);
    ctx.clearRect(0, 0, w, h);
    const pl = 52, pr = 16, pt = 14, pb = 26, W = w - pl - pr, H = h - pt - pb, X = d => pl + ((d + 50) / 100) * W;
    const cl = [0], cs = [0]; for (let d = 1; d <= 50; d++) { cl.push(cl[d - 1] + prof[50 - d].L); cs.push(cs[d - 1] + prof[50 + d].S); }
    const mx = Math.max(cl[50], cs[50], 1), Y = v => pt + H - (v / mx) * H * p;
    ctx.font = '10px ' + MONO;
    for (let i = 0; i <= 4; i++) { const v = mx * i / 4, y = pt + H - H * i / 4; ctx.strokeStyle = 'rgba(150,170,195,0.07)'; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke(); ctx.fillStyle = '#5b6878'; ctx.fillText(f.usd(v), 4, y + 3); }
    [-50, -25, 0, 25, 50].forEach(d => { ctx.fillStyle = '#5b6878'; ctx.textAlign = 'center'; ctx.fillText(d === 0 ? 'mark' : (d > 0 ? '+' : '') + d + '%', X(d), h - 8); ctx.textAlign = 'left'; });
    const side = (arr, sign, col) => { ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let d = 1; d <= 50; d++) ctx.lineTo(X(sign * d), Y(arr[d])); ctx.lineTo(X(sign * 50), pt + H); ctx.lineTo(X(0), pt + H); ctx.closePath(); const gr = ctx.createLinearGradient(0, pt, 0, pt + H); gr.addColorStop(0, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0.02)); ctx.fillStyle = gr; ctx.fill(); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let d = 1; d <= 50; d++) ctx.lineTo(X(sign * d), Y(arr[d])); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke(); };
    side(cl, -1, '#2ee6a6'); side(cs, 1, '#ff5c6c');
    ctx.strokeStyle = 'rgba(238,243,248,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(0), pt); ctx.lineTo(X(0), pt + H); ctx.stroke();
    const fp = (g.flip / this.S.px[coin] - 1) * 100; ctx.strokeStyle = '#ffb547'; ctx.beginPath(); ctx.moveTo(X(fp), pt); ctx.lineTo(X(fp), pt + H); ctx.stroke(); ctx.fillStyle = '#ffb547'; ctx.font = '600 10px ' + MONO; ctx.fillText('flip ' + f.px(g.flip), X(fp) + (fp > 0 ? -80 : 5), pt + 10);
    if (this.mx > pl && this.mx < w - pr) { const d = Math.round((this.mx - pl) / W * 100 - 50), ad = Math.abs(d), v = d < 0 ? cl[ad] : cs[ad]; ctx.strokeStyle = 'rgba(238,243,248,0.25)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(d), pt); ctx.lineTo(X(d), pt + H); ctx.stroke(); ctx.setLineDash([]); tip(ctx, w, h, X(d), Y(v), [(d > 0 ? '+' : '') + d + '% from mark', (d < 0 ? 'Cum. long liq ' : 'Cum. short liq ') + f.usd(v)], d < 0 ? '#2ee6a6' : '#ff5c6c'); }
  }
}

// ---------- L2 ladder ----------
class Ladder extends CanvasEl {
  init() { this.loop = true; this.bars = {}; }
  draw(now) {
    const { ctx, w, h } = this, lad = this.S.books.ladder; ctx.clearRect(0, 0, w, h); if (!lad) return;
    const dec = Math.max(0, -Math.floor(Math.log10(lad.t) + 1e-9)), fp = p => p.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fu = this.CQ.fmt.usd, hdr = 20, mid = 26, rh = (h - hdr - mid) / 24;
    const cumA = [], cumB = []; let a = 0, b = 0; lad.asks.forEach(l => cumA.push(a += l.usd)); lad.bids.forEach(l => cumB.push(b += l.usd));
    const mx = Math.max(a, b), C1 = 8, C2 = w * 0.47, C3 = w * 0.64, C4 = w - 8;
    ctx.font = '10px ' + MONO; ctx.fillStyle = '#5b6878'; ctx.fillText('Price', C1, 13); ctx.textAlign = 'right'; ctx.fillText('Size', C2, 13); ctx.fillText('Orders', C3, 13); ctx.fillText('Cum. USD', C4, 13); ctx.textAlign = 'left';
    const row = (lv, cum, y, isAsk, key) => {
      const col = isAsk ? '#ff5c6c' : '#2ee6a6', tg = (cum / mx) * w * 0.62; this.bars[key] = (this.bars[key] || 0) + (tg - (this.bars[key] || 0)) * 0.18;
      ctx.fillStyle = rgba(col, 0.13); ctx.fillRect(w - this.bars[key], y + 1, this.bars[key], rh - 2);
      const k = Math.max(0, (Date.now() - lv.ch) / 600); if (k < 1) { ctx.fillStyle = rgba(lv.dir > 0 ? col : '#eef3f8', 0.22 * (1 - k)); ctx.fillRect(0, y + 1, w, rh - 2); }
      const units = lv.usd / lv.p, su = units >= 1e6 ? (units / 1e6).toFixed(2) + 'M' : units >= 1e3 ? (units / 1e3).toFixed(1) + 'K' : units >= 100 ? units.toFixed(0) : units.toFixed(3);
      const ty = y + rh / 2 + 3.5; ctx.font = '500 11px ' + MONO; ctx.fillStyle = col; ctx.fillText(fp(lv.p), C1, ty);
      ctx.textAlign = 'right'; ctx.fillStyle = k < 1 ? '#ffffff' : '#c9d3df'; ctx.fillText(su, C2, ty); ctx.fillStyle = '#8b98a9'; ctx.fillText(String(lv.o), C3, ty); ctx.fillStyle = '#c9d3df'; ctx.fillText(fu(cum), C4, ty); ctx.textAlign = 'left';
    };
    for (let i = 11; i >= 0; i--) row(lad.asks[i], cumA[i], hdr + (11 - i) * rh, true, 'a' + i);
    const my = hdr + 12 * rh, spr = (lad.asks[0].p - lad.bids[0].p) / ((lad.asks[0].p + lad.bids[0].p) / 2) * 1e4;
    ctx.strokeStyle = 'rgba(150,170,195,0.15)'; ctx.beginPath(); ctx.moveTo(0, my + 0.5); ctx.lineTo(w, my + 0.5); ctx.moveTo(0, my + mid - 0.5); ctx.lineTo(w, my + mid - 0.5); ctx.stroke();
    ctx.font = '600 11px ' + MONO; ctx.fillStyle = '#eef3f8'; ctx.fillText(fp((lad.asks[0].p + lad.bids[0].p) / 2), C1, my + 17); ctx.textAlign = 'right'; ctx.fillStyle = '#8b98a9'; ctx.font = '10.5px ' + MONO; ctx.fillText('spread ' + spr.toFixed(2) + ' bps · imb ' + (lad.imb > 0 ? '+' : '') + lad.imb.toFixed(2), C4, my + 17); ctx.textAlign = 'left';
    for (let i = 0; i < 12; i++) row(lad.bids[i], cumB[i], my + mid + i * rh, false, 'b' + i);
    void now;
  }
}

// ---------- cycle mini ring ----------
class MiniRing extends CanvasEl {
  init() { this.loop = true; }
  draw(now) {
    const { ctx, w, h } = this, cy = this.S.cycle, n = cy.phases.length, cx = w / 2, cY = h / 2, R = Math.min(w, h) / 2 - 10, seg = Math.PI * 2 / n, lw = Math.max(6, R * 0.16), gap = 0.05;
    ctx.clearRect(0, 0, w, h); ctx.lineCap = 'butt';
    cy.phases.forEach((p, i) => { const a0 = -Math.PI / 2 + i * seg + gap, a1 = a0 + seg - gap * 2, cur = p.n === cy.phase; ctx.lineWidth = cur ? lw * 1.25 : lw; ctx.strokeStyle = cur ? p.c : rgba(p.c, 0.2); if (cur) { ctx.shadowColor = p.c; ctx.shadowBlur = 14 + 6 * Math.sin(now / 500); } ctx.beginPath(); ctx.arc(cx, cY, R, a0, a1); ctx.stroke(); ctx.shadowBlur = 0; });
    const am = -Math.PI / 2 + (cy.phase - 1 + cy.progress) * seg, orb = (now / 4000) % 1;
    ctx.strokeStyle = 'rgba(150,170,195,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cY, R - lw * 1.2, 0, 7); ctx.stroke();
    const ao = am - Math.PI * 2 * (1 - orb) * 0.0 - 0.9 + orb * 0.9; for (let k = 0; k < 18; k++) { const a = am - k * 0.05; ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - k / 18)) + ')'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R - lw * 1.2), cY + Math.sin(a) * (R - lw * 1.2), 1.6 * (1 - k / 18) + 0.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(cx + Math.cos(am) * R, cY + Math.sin(am) * R, lw * 0.32, 0, 7); ctx.fill(); ctx.shadowBlur = 0; void ao;
    ctx.textAlign = 'center'; ctx.fillStyle = '#eef3f8'; ctx.font = '600 ' + Math.round(R * 0.44) + 'px ' + MONO; ctx.fillText(String(cy.phase), cx, cY + R * 0.1); ctx.fillStyle = '#5b6878'; ctx.font = Math.round(R * 0.16) + 'px ' + MONO; ctx.fillText('of ' + n, cx, cY + R * 0.34); ctx.textAlign = 'left';
  }
}

class Pulse extends HTMLElement {
  connectedCallback() { if (this.shadowRoot) return; const c = this.getAttribute('color') || '#2ee6a6', r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<style>:host{display:inline-block;width:7px;height:7px;position:relative;flex:none}i{position:absolute;inset:0;border-radius:50%;background:' + c + '}i+i{animation:p 1.8s ease-out infinite;opacity:.7}@keyframes p{to{transform:scale(3.2);opacity:0}}</style><i></i><i></i>'; }
}

const def = (n, c) => { if (!customElements.get(n)) customElements.define(n, c); };
def('cq-spark', Spark); def('cq-gauge', Gauge); def('cq-fan', Fan); def('cq-radar', Radar); def('cq-bubbles', Bubbles); def('cq-timeline', Timeline); def('cq-cum', Cum); def('cq-ladder', Ladder); def('cq-miniring', MiniRing); def('cq-pulse', Pulse);
})();
