/**
 * Canvas charts ported from docs/design/cq-charts.js. Drawing code is kept as in the prototype
 * so the look is identical; the only change is where data comes from (setData, fed by real
 * datasets, instead of the prototype's mock engine).
 */
import { CanvasView, tip } from "./canvas";
import type { GammaCoinSlice, LadderSlice, SqueezeSlice } from "./types";
import { A, ease, fmt, gauss, hash, MONO } from "./theme";

// ---------- sparkline ----------

export interface SparkData {
  values: number[];
  color?: string;
  /** Gradient fill under the line. */
  fill?: boolean;
  /** Pulsing end dot, redrawn every frame. */
  live?: boolean;
  lw?: number;
  /** Bars with a dashed reference line at `mean`. */
  mode?: "line" | "bars";
  mean?: number;
}

export class Spark extends CanvasView<SparkData> {
  protected override init(): void {
    this.loop = !!this.data.live;
    this.intro = 900;
  }

  protected override onData(prev: SparkData): void {
    this.loop = !!this.data.live;
    if (prev.values.length < 2 && this.data.values.length >= 2) this.replay(900);
  }

  protected draw(now: number): void {
    const { ctx, w, h } = this;
    const s = this.data.values;
    ctx.clearRect(0, 0, w, h);
    if (s.length < 2) return;
    const col = this.data.color ?? "#4c9bff";
    const p = ease(this.age(now) / 0.9);
    const live = !!this.data.live;
    const pad = live ? 5 : 2;
    let mn = Math.min(...s);
    let mx = Math.max(...s);
    if (this.data.mode === "bars") mn = 0;
    if (mx - mn < 1e-12) {
      mx += 1;
      mn -= 1;
    }
    const X = (i: number) => pad + (i / (s.length - 1)) * (w - pad * 2);
    const Y = (v: number) => h - pad - ((v - mn) / (mx - mn)) * (h - pad * 2);
    if (this.data.mode === "bars") {
      const bw = (w - pad * 2) / s.length;
      const ref = this.data.mean ?? NaN;
      s.forEach((v, i) => {
        const k = ease((this.age(now) - i * 0.02) / 0.6);
        const bh = Math.max(1, (h - pad * 2) * (v / mx) * k);
        ctx.fillStyle = i === s.length - 1 ? col : A(col, 0.32);
        ctx.fillRect(pad + i * bw + 1, h - pad - bh, Math.max(1, bw - 2), bh);
      });
      if (!Number.isNaN(ref)) {
        const y = Y(ref);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(230,237,245,0.35)";
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(w - pad, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#8b98a9";
        ctx.font = `10px ${MONO}`;
        ctx.fillText("30d mean", pad + 4, y - 4);
      }
      return;
    }
    const n = Math.max(2, Math.ceil(s.length * p));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(i);
      const y = Y(s[i]!);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = this.data.lw ?? 1.4;
    ctx.lineJoin = "round";
    ctx.stroke();
    if (this.data.fill) {
      ctx.lineTo(X(n - 1), h);
      ctx.lineTo(X(0), h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, A(col, 0.3));
      g.addColorStop(1, A(col, 0));
      ctx.fillStyle = g;
      ctx.fill();
    }
    if (live || p < 1) {
      const x = X(n - 1);
      const y = Y(s[n - 1]!);
      const k = ((now / 1000) % 1.6) / 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 2 + k * 5, 0, 7);
      ctx.fillStyle = A(col, 0.4 * (1 - k));
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 7);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
}

// ---------- gauge ----------

export interface GaugeData {
  value: number;
  color?: string;
  max?: number;
}

export class Gauge extends CanvasView<GaugeData> {
  private cur = 0;

  protected override init(): void {
    this.loop = true;
  }

  protected draw(now: number): void {
    const { ctx, w, h } = this;
    const v = this.data.value;
    const max = this.data.max ?? 100;
    const col = this.data.color ?? "#4c9bff";
    ctx.clearRect(0, 0, w, h);
    this.cur += (v - this.cur) * 0.05;
    const R = Math.max(10, Math.min(w / 2 - 14, (h - 16) / 1.72));
    const cx = w / 2;
    const cy = (h - 1.707 * R) / 2 + R;
    const a0 = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    const lw = Math.max(5, R * 0.1);
    const f = this.cur / max;
    const a1 = a0 + span * f;
    for (let i = 0; i <= 50; i++) {
      const a = a0 + (span * i) / 50;
      const major = i % 10 === 0;
      const r0 = R + lw * 0.9 + 3;
      const r1 = r0 + (major ? 7 : 3.5);
      ctx.strokeStyle = i / 50 <= f ? A(col, major ? 0.9 : 0.55) : `rgba(150,170,195,${major ? 0.28 : 0.12})`;
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.lineCap = "round";
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(150,170,195,0.08)";
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + span);
    ctx.stroke();
    let grad: string | CanvasGradient = col;
    if (ctx.createConicGradient) {
      grad = ctx.createConicGradient(a0, cx, cy);
      grad.addColorStop(0, A(col, 0.15));
      grad.addColorStop(Math.max(0.01, 0.75 * f), col);
      grad.addColorStop(Math.min(1, 0.75 * f + 0.001), A(col, 0));
    }
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, Math.max(a0 + 0.001, a1));
    ctx.stroke();
    ctx.shadowBlur = 0;
    const ph = (now / 2200) % 1;
    const as = a0 + (a1 - a0) * ph;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * Math.sin(ph * Math.PI)})`;
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.max(a0, as - 0.25), as);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    const tx = cx + Math.cos(a1) * R;
    const ty = cy + Math.sin(a1) * R;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(tx, ty, lw * 0.42, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineCap = "butt";
    ctx.fillStyle = "#eef3f8";
    ctx.font = `600 ${Math.round(R * 0.5)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(this.cur)), cx, cy + R * 0.02);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

// ---------- Monte Carlo fan ----------

export interface FanData {
  /** 24h cumulative return quantiles, in percent. */
  p5: number;
  p50: number;
  p95: number;
}

interface FanPath {
  pts: number[];
  born: number;
  done: boolean;
}

/**
 * Illustrative Monte Carlo paths drawn inside CDA's own p5/p50/p95 for the next 24h. The
 * quantile lines, cones and labels are CDA's numbers; the animated paths only visualise the
 * spread those quantiles imply.
 */
export class Fan extends CanvasView<FanData> {
  private paths: FanPath[] = [];
  private bins = new Float32Array(56);
  private lastSpawn = 0;
  private readonly N = 48;

  protected override init(): void {
    this.loop = true;
    for (let i = 0; i < 60; i++) this.spawn(performance.now() - 8000 + i * 60, true);
  }

  protected override onData(prev: FanData): void {
    if (prev.p5 !== this.data.p5 || prev.p95 !== this.data.p95 || prev.p50 !== this.data.p50) {
      this.paths = [];
      this.bins = new Float32Array(56);
      for (let i = 0; i < 60; i++) this.spawn(performance.now() - 8000 + i * 60, true);
    }
  }

  private P() {
    const { p5, p50, p95 } = this.data;
    return { p5, p50, p95, sig: (p95 - p5) / 3.29 };
  }

  private spawn(t: number, seedOnly: boolean): void {
    const { p50, sig } = this.P();
    const N = this.N;
    const pts = [0];
    let x = 0;
    const ss = sig / Math.sqrt(N);
    for (let i = 1; i <= N; i++) {
      x += p50 / N + gauss() * ss * (Math.random() < 0.04 ? 2 : 1);
      pts.push(x);
    }
    this.paths.push({ pts, born: t, done: seedOnly });
    if (seedOnly) this.bin(x);
    if (this.paths.length > 150) this.paths.shift();
  }

  private range(): [number, number] {
    const { p5, p95 } = this.P();
    return [Math.min(p5, -1) * 1.85, Math.max(p95, 1) * 1.85];
  }

  private bin(v: number): void {
    const [lo, hi] = this.range();
    const i = Math.floor(((v - lo) / (hi - lo)) * this.bins.length);
    if (i >= 0 && i < this.bins.length) this.bins[i]! += 1;
  }

  protected draw(now: number): void {
    const { ctx, w, h } = this;
    const { p5, p50, p95, sig } = this.P();
    const [lo, hi] = this.range();
    const N = this.N;
    ctx.clearRect(0, 0, w, h);
    const D = Math.min(130, w * 0.2);
    const pl = 40;
    const pr = D + 12;
    const pt = 8;
    const pb = 22;
    const W = w - pl - pr;
    const H = h - pt - pb;
    const X = (i: number) => pl + (i / N) * W;
    const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * H;
    if (now - this.lastSpawn > 70) {
      this.spawn(now, false);
      this.lastSpawn = now;
    }
    for (let i = 0; i < this.bins.length; i++) this.bins[i]! *= 0.9975;
    ctx.font = `10px ${MONO}`;
    ctx.lineWidth = 1;
    for (let g = Math.ceil(lo / 2) * 2; g <= hi; g += 2) {
      const y = Y(g);
      ctx.strokeStyle = g === 0 ? "rgba(200,215,235,0.22)" : "rgba(150,170,195,0.07)";
      ctx.beginPath();
      ctx.moveTo(pl, y);
      ctx.lineTo(w - 4, y);
      ctx.stroke();
      ctx.fillStyle = "#5b6878";
      ctx.fillText(`${g > 0 ? "+" : ""}${g}%`, 4, y + 3);
    }
    ["now", "+6h", "+12h", "+18h", "+24h"].forEach((l, i) => {
      const x = pl + (W * i) / 4;
      ctx.fillStyle = "#5b6878";
      ctx.fillText(l, Math.min(x, pl + W - 26), h - 6);
      ctx.strokeStyle = "rgba(150,170,195,0.05)";
      ctx.beginPath();
      ctx.moveTo(x, pt);
      ctx.lineTo(x, pt + H);
      ctx.stroke();
    });
    const cone = (k: number, fill: string) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        ctx.lineTo(X(i), Y(p50 * t + k * sig * Math.sqrt(t)));
      }
      for (let i = N; i >= 0; i--) {
        const t = i / N;
        ctx.lineTo(X(i), Y(p50 * t - k * sig * Math.sqrt(t)));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    cone(1.645, "rgba(76,155,255,0.06)");
    cone(0.674, "rgba(76,155,255,0.08)");
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.paths) {
      const a = (now - p.born) / 1000;
      const head = Math.min(1, a / 1.1);
      const n = Math.max(1, Math.floor(head * N));
      const end = p.pts[N]!;
      if (head >= 1 && !p.done) {
        p.done = true;
        this.bin(end);
      }
      const alpha = head < 1 ? 0.7 : Math.max(0, 0.13 * (1 - (a - 1.1) / 7));
      if (alpha <= 0) continue;
      const col = end > p95 ? "#2ee6a6" : end < p5 ? "#ff5c6c" : "#4c9bff";
      ctx.strokeStyle = A(col, alpha);
      ctx.lineWidth = head < 1 ? 1.2 : 1;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const y = Y(p.pts[i]!);
        if (i) ctx.lineTo(X(i), y);
        else ctx.moveTo(X(i), y);
      }
      ctx.stroke();
      if (head < 1) {
        ctx.fillStyle = A(col, 0.9);
        ctx.beginPath();
        ctx.arc(X(n), Y(p.pts[n]!), 1.8, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(238,243,248,0.7)";
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(N), Y(p50));
    ctx.stroke();
    ctx.setLineDash([]);
    const dx = pl + W + 10;
    const bmax = Math.max(1, ...this.bins);
    ctx.strokeStyle = "rgba(150,170,195,0.12)";
    ctx.beginPath();
    ctx.moveTo(dx, pt);
    ctx.lineTo(dx, pt + H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx, pt + H);
    for (let i = 0; i < this.bins.length; i++) {
      const v = lo + ((i + 0.5) / this.bins.length) * (hi - lo);
      ctx.lineTo(dx + (this.bins[i]! / bmax) * (D - 8), Y(v));
    }
    ctx.lineTo(dx, pt);
    ctx.closePath();
    const gr = ctx.createLinearGradient(0, Y(p95), 0, Y(p5));
    gr.addColorStop(0, "rgba(46,230,166,0.45)");
    gr.addColorStop(0.5, "rgba(76,155,255,0.35)");
    gr.addColorStop(1, "rgba(255,92,108,0.45)");
    ctx.fillStyle = gr;
    ctx.fill();
    (
      [
        [p95, "p95", "#2ee6a6"],
        [p50, "med", "#eef3f8"],
        [p5, "p5", "#ff5c6c"],
      ] as const
    ).forEach(([v, l, c]) => {
      const y = Y(v);
      ctx.strokeStyle = A(c, 0.6);
      ctx.beginPath();
      ctx.moveTo(dx - 4, y);
      ctx.lineTo(w - 2, y);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.font = `600 10.5px ${MONO}`;
      ctx.textAlign = "right";
      ctx.fillText(`${l} ${v > 0 ? "+" : ""}${v.toFixed(v === p50 ? 2 : 1)}%`, w - 2, y - 4);
      ctx.textAlign = "left";
    });
  }
}

// ---------- squeeze radar ----------

export class Radar extends CanvasView<SqueezeSlice> {
  protected override init(): void {
    this.loop = true;
  }

  protected draw(now: number): void {
    const { ctx, w, h } = this;
    const sq = this.data;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 16;
    const M = 52;
    const rOf = (s: number) => R * (1 - Math.min(s, M) / M);
    ctx.clearRect(0, 0, w, h);
    const sw = ((now / 3200) % 1) * Math.PI * 2;
    [0, 20, 50].forEach((s) => {
      ctx.strokeStyle = "rgba(150,170,195,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rOf(s), 0, 7);
      ctx.stroke();
    });
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(255,181,71,0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, rOf(sq.threshold), 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(150,170,195,0.07)";
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r1 = R + (i % 6 ? 3 : 6);
      ctx.strokeStyle = "rgba(150,170,195,0.2)";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(sw - 1.3, cx, cy);
      const e = 1.3 / (Math.PI * 2);
      g.addColorStop(0, "rgba(76,155,255,0)");
      g.addColorStop(e, "rgba(76,155,255,0.22)");
      g.addColorStop(e + 0.0005, "rgba(76,155,255,0)");
      g.addColorStop(1, "rgba(76,155,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(120,180,255,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,181,71,0.85)";
    ctx.font = `600 9.5px ${MONO}`;
    ctx.fillText(`${sq.threshold}%`, cx + 4, cy - rOf(sq.threshold) - 4);
    sq.coins.forEach((c) => {
      const a = hash(c.coin) * Math.PI * 2;
      const r = rOf(c.sev);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      let d = (sw - a) % (Math.PI * 2);
      if (d < 0) d += Math.PI * 2;
      const lit = Math.exp(-d * 1.4);
      const alert = c.sev >= sq.threshold;
      const col = alert ? (c.side === "L" ? "#2ee6a6" : "#ff5c6c") : "#7f93ad";
      if (alert) {
        const k = (now / 1400) % 1;
        ctx.strokeStyle = A(col, 0.6 * (1 - k));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 4 + k * 12, 0, 7);
        ctx.stroke();
      }
      ctx.shadowColor = col;
      ctx.shadowBlur = 8 * lit + (alert ? 6 : 0);
      ctx.fillStyle = A(col, 0.45 + 0.55 * lit);
      ctx.beginPath();
      ctx.arc(x, y, alert ? 3.6 : 2.6, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = alert ? "#eef3f8" : A("#9aa8b8", 0.5 + 0.5 * lit);
      ctx.font = `${alert ? "600 " : ""}10px ${MONO}`;
      const left = x < cx;
      ctx.textAlign = left ? "right" : "left";
      ctx.fillText(`${c.coin} ${Math.round(c.sev)}%`, x + (left ? -6 : 6), y + 3 + (Math.sin(a) > 0 ? 3 : -1));
      ctx.textAlign = "left";
    });
  }
}

// ---------- gamma cumulative positioning ----------

export class Cum extends CanvasView<GammaCoinSlice> {
  protected override init(): void {
    this.intro = 1000;
  }

  protected override onData(prev: GammaCoinSlice): void {
    if (prev.coin !== this.data.coin) this.replay(1000);
  }

  protected draw(now: number): void {
    const { ctx, w, h } = this;
    const g = this.data;
    const prof = g.profile;
    const p = ease(this.age(now) / 0.9);
    ctx.clearRect(0, 0, w, h);
    if (prof.length !== 101) return;
    const pl = 52;
    const pr = 16;
    const pt = 14;
    const pb = 26;
    const W = w - pl - pr;
    const H = h - pt - pb;
    const X = (d: number) => pl + ((d + 50) / 100) * W;
    const cl = [0];
    const cs = [0];
    for (let d = 1; d <= 50; d++) {
      cl.push(cl[d - 1]! + prof[50 - d]!.L);
      cs.push(cs[d - 1]! + prof[50 + d]!.S);
    }
    const mx = Math.max(cl[50]!, cs[50]!, 1);
    const Y = (v: number) => pt + H - (v / mx) * H * p;
    ctx.font = `10px ${MONO}`;
    for (let i = 0; i <= 4; i++) {
      const v = (mx * i) / 4;
      const y = pt + H - (H * i) / 4;
      ctx.strokeStyle = "rgba(150,170,195,0.07)";
      ctx.beginPath();
      ctx.moveTo(pl, y);
      ctx.lineTo(w - pr, y);
      ctx.stroke();
      ctx.fillStyle = "#5b6878";
      ctx.fillText(fmt.usd(v), 4, y + 3);
    }
    [-50, -25, 0, 25, 50].forEach((d) => {
      ctx.fillStyle = "#5b6878";
      ctx.textAlign = "center";
      ctx.fillText(d === 0 ? "mark" : `${d > 0 ? "+" : ""}${d}%`, X(d), h - 8);
      ctx.textAlign = "left";
    });
    const side = (arr: number[], sign: number, col: string) => {
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let d = 1; d <= 50; d++) ctx.lineTo(X(sign * d), Y(arr[d]!));
      ctx.lineTo(X(sign * 50), pt + H);
      ctx.lineTo(X(0), pt + H);
      ctx.closePath();
      const gr = ctx.createLinearGradient(0, pt, 0, pt + H);
      gr.addColorStop(0, A(col, 0.35));
      gr.addColorStop(1, A(col, 0.02));
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let d = 1; d <= 50; d++) ctx.lineTo(X(sign * d), Y(arr[d]!));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    };
    side(cl, -1, "#2ee6a6");
    side(cs, 1, "#ff5c6c");
    ctx.strokeStyle = "rgba(238,243,248,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(0), pt);
    ctx.lineTo(X(0), pt + H);
    ctx.stroke();
    if (g.flip !== null && g.mark) {
      const fp = Math.max(-50, Math.min(50, (g.flip / g.mark - 1) * 100));
      ctx.strokeStyle = "#ffb547";
      ctx.beginPath();
      ctx.moveTo(X(fp), pt);
      ctx.lineTo(X(fp), pt + H);
      ctx.stroke();
      ctx.fillStyle = "#ffb547";
      ctx.font = `600 10px ${MONO}`;
      ctx.fillText(`flip ${fmt.px(g.flip)}`, X(fp) + (fp > 0 ? -80 : 5), pt + 10);
    }
    if (this.mx > pl && this.mx < w - pr) {
      const d = Math.round(((this.mx - pl) / W) * 100 - 50);
      const ad = Math.abs(d);
      const v = d < 0 ? cl[ad]! : cs[ad]!;
      ctx.strokeStyle = "rgba(238,243,248,0.25)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(d), pt);
      ctx.lineTo(X(d), pt + H);
      ctx.stroke();
      ctx.setLineDash([]);
      tip(ctx, w, h, X(d), Y(v), [`${d > 0 ? "+" : ""}${d}% from mark`, `${d < 0 ? "Cum. long liq " : "Cum. short liq "}${fmt.usd(v)}`], d < 0 ? "#2ee6a6" : "#ff5c6c");
    }
  }
}

// ---------- L2 ladder ----------

export class Ladder extends CanvasView<{ ladder: LadderSlice | null }> {
  private bars: Record<string, number> = {};

  protected override init(): void {
    this.loop = true;
  }

  protected override onData(prev: { ladder: LadderSlice | null }): void {
    if (prev.ladder?.coin !== this.data.ladder?.coin) this.bars = {};
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const lad = this.data.ladder;
    ctx.clearRect(0, 0, w, h);
    if (!lad || lad.asks.length === 0 || lad.bids.length === 0) return;
    const levels = Math.min(12, lad.asks.length, lad.bids.length);
    const dec = Math.max(0, -Math.floor(Math.log10(lad.t) + 1e-9));
    const fp = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const hdr = 20;
    const mid = 26;
    const rh = (h - hdr - mid) / (levels * 2);
    const cumA: number[] = [];
    const cumB: number[] = [];
    let a = 0;
    let b = 0;
    lad.asks.slice(0, levels).forEach((l) => cumA.push((a += l.usd)));
    lad.bids.slice(0, levels).forEach((l) => cumB.push((b += l.usd)));
    const mx = Math.max(a, b);
    const C1 = 8;
    const C2 = w * 0.47;
    const C3 = w * 0.64;
    const C4 = w - 8;
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#5b6878";
    ctx.fillText("Price", C1, 13);
    ctx.textAlign = "right";
    ctx.fillText("Size", C2, 13);
    ctx.fillText("Orders", C3, 13);
    ctx.fillText("Cum. USD", C4, 13);
    ctx.textAlign = "left";
    const now = Date.now();
    const row = (lv: LadderSlice["asks"][number], cum: number, y: number, isAsk: boolean, key: string) => {
      const col = isAsk ? "#ff5c6c" : "#2ee6a6";
      const tg = (cum / mx) * w * 0.62;
      this.bars[key] = (this.bars[key] ?? 0) + (tg - (this.bars[key] ?? 0)) * 0.18;
      const bw = this.bars[key]!;
      ctx.fillStyle = A(col, 0.13);
      ctx.fillRect(w - bw, y + 1, bw, rh - 2);
      const k = Math.max(0, (now - lv.ch) / 600);
      if (k < 1) {
        ctx.fillStyle = A(lv.dir > 0 ? col : "#eef3f8", 0.22 * (1 - k));
        ctx.fillRect(0, y + 1, w, rh - 2);
      }
      const units = lv.size;
      const su = units >= 1e6 ? `${(units / 1e6).toFixed(2)}M` : units >= 1e3 ? `${(units / 1e3).toFixed(1)}K` : units >= 100 ? units.toFixed(0) : units.toFixed(3);
      const ty = y + rh / 2 + 3.5;
      ctx.font = `500 11px ${MONO}`;
      ctx.fillStyle = col;
      ctx.fillText(fp(lv.p), C1, ty);
      ctx.textAlign = "right";
      ctx.fillStyle = k < 1 ? "#ffffff" : "#c9d3df";
      ctx.fillText(su, C2, ty);
      ctx.fillStyle = "#8b98a9";
      ctx.fillText(lv.o === null ? "—" : String(lv.o), C3, ty);
      ctx.fillStyle = "#c9d3df";
      ctx.fillText(fmt.usd(cum), C4, ty);
      ctx.textAlign = "left";
    };
    for (let i = levels - 1; i >= 0; i--) row(lad.asks[i]!, cumA[i]!, hdr + (levels - 1 - i) * rh, true, `a${i}`);
    const my = hdr + levels * rh;
    const ask0 = lad.asks[0]!.p;
    const bid0 = lad.bids[0]!.p;
    const spr = ((ask0 - bid0) / ((ask0 + bid0) / 2)) * 1e4;
    ctx.strokeStyle = "rgba(150,170,195,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, my + 0.5);
    ctx.lineTo(w, my + 0.5);
    ctx.moveTo(0, my + mid - 0.5);
    ctx.lineTo(w, my + mid - 0.5);
    ctx.stroke();
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = "#eef3f8";
    ctx.fillText(fp((ask0 + bid0) / 2), C1, my + 17);
    ctx.textAlign = "right";
    ctx.fillStyle = "#8b98a9";
    ctx.font = `10.5px ${MONO}`;
    const imb = lad.imb === null ? "" : ` · imb ${lad.imb > 0 ? "+" : ""}${lad.imb.toFixed(2)}`;
    ctx.fillText(`spread ${spr.toFixed(2)} bps${imb}`, C4, my + 17);
    ctx.textAlign = "left";
    for (let i = 0; i < levels; i++) row(lad.bids[i]!, cumB[i]!, my + mid + i * rh, false, `b${i}`);
  }
}
