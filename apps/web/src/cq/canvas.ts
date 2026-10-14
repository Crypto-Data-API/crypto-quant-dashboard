/**
 * Canvas view base, ported from the prototype's CanvasEl custom element (docs/design/cq-charts.js).
 * A view owns a <canvas> inside a host element: it sizes it to the host (device pixel ratio up
 * to 2), redraws on a requestAnimationFrame loop while animating, keeps a slow interval going
 * when frames stall (background tabs, hidden canvases), tracks the pointer for tooltips and
 * optionally adds the fullscreen button. Data arrives through setData(); nothing is global.
 */
import { A, MONO } from "./theme";

const EXPAND =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>';
const COLLAPSE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"></path></svg>';

/** Fullscreen toggle in the host's top-right corner; falls back to a fixed overlay. Returns its cleanup. */
export function fsButton(el: HTMLElement, bg: string): () => void {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = EXPAND;
  b.title = "Fullscreen";
  b.setAttribute("aria-label", "Fullscreen");
  b.style.cssText =
    "position:absolute;top:10px;right:10px;z-index:6;width:30px;height:30px;display:flex;align-items:center;justify-content:center;padding:0;background:rgba(8,11,16,.78);border:1px solid #232d3a;border-radius:8px;color:#9aa8b8;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:color .2s,border-color .2s";
  b.onmouseenter = () => {
    b.style.color = "#fff";
    b.style.borderColor = "#3a4859";
  };
  b.onmouseleave = () => {
    b.style.color = "#9aa8b8";
    b.style.borderColor = "#232d3a";
  };
  let pseudo = false;
  let saved = "";
  const bg0 = el.style.background;
  const isOn = () => document.fullscreenElement === el || pseudo;
  const sync = () => {
    const on = isOn();
    b.innerHTML = on ? COLLAPSE : EXPAND;
    b.title = on ? "Exit fullscreen (Esc)" : "Fullscreen";
    b.setAttribute("aria-label", b.title);
    if (!pseudo) el.style.background = on ? bg : bg0;
  };
  const exitPseudo = () => {
    pseudo = false;
    el.style.cssText = saved;
    sync();
  };
  const enterPseudo = () => {
    saved = el.style.cssText;
    pseudo = true;
    Object.assign(el.style, { position: "fixed", left: "0", top: "0", right: "0", bottom: "0", width: "100vw", height: "100vh", zIndex: "2147483000", background: bg, borderRadius: "0" });
    sync();
  };
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pseudo) return exitPseudo();
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
      return;
    }
    if (el.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(enterPseudo);
    else enterPseudo();
  });
  const onFs = () => sync();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && pseudo) exitPseudo();
  };
  document.addEventListener("fullscreenchange", onFs);
  window.addEventListener("keydown", onKey);
  el.appendChild(b);
  return () => {
    document.removeEventListener("fullscreenchange", onFs);
    window.removeEventListener("keydown", onKey);
    if (pseudo) exitPseudo();
    b.remove();
  };
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Canvas tooltip: first line bright, the rest muted, accent border. */
export function tip(ctx: CanvasRenderingContext2D, W: number, H: number, x: number, y: number, lines: string[], accent?: string): void {
  ctx.font = `500 11px ${MONO}`;
  const pad = 9;
  const lh = 16;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const th = lines.length * lh + pad * 2 - 5;
  let tx = x + 14;
  let ty = y - th - 10;
  if (tx + tw > W - 4) tx = x - tw - 14;
  if (tx < 4) tx = 4;
  if (ty < 4) ty = y + 16;
  if (ty + th > H - 2) ty = H - th - 2;
  ctx.fillStyle = "rgba(7,10,14,0.95)";
  ctx.strokeStyle = accent ? A(accent, 0.7) : "#2a3442";
  ctx.lineWidth = 1;
  rr(ctx, tx, ty, tw, th, 6);
  ctx.fill();
  ctx.stroke();
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? "#eef3f8" : "#9aa8b8";
    ctx.font = `${i === 0 ? "600 " : "400 "}11px ${MONO}`;
    ctx.fillText(l, tx + pad, ty + pad + 9 + i * lh);
  });
}

export abstract class CanvasView<D> {
  protected readonly host: HTMLElement;
  protected readonly c: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected data: D;
  protected w = 0;
  protected h = 0;
  protected mx = -1;
  protected my = -1;
  /** Keep drawing every frame (animated views). */
  protected loop = false;
  /** Keep drawing for this many ms after mount or replay() (intro animations). */
  protected intro = 0;
  protected born = performance.now();
  protected ready = false;
  private vis: boolean | undefined;
  private raf = 0;
  /** Last animation frame; the interval fallback draws when frames stall (background windows). */
  private lastRaf = 0;
  private readonly iv: ReturnType<typeof setInterval>;
  private readonly ro: ResizeObserver;
  private readonly io: IntersectionObserver;
  private fsOff: (() => void) | null = null;
  private disposed = false;

  constructor(host: HTMLElement, data: D, opts: { fullscreen?: boolean } = {}) {
    this.host = host;
    this.data = data;
    const c = document.createElement("canvas");
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(c);
    this.c = c;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    if (opts.fullscreen) this.fsOff = fsButton(host, "#080b10");
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver((es) => {
      this.vis = es[es.length - 1]?.isIntersecting;
    });
    this.io.observe(host);
    c.addEventListener("pointermove", (e) => {
      const b = c.getBoundingClientRect();
      this.mx = e.clientX - b.left;
      this.my = e.clientY - b.top;
      if (this.ready && !this.loop) this.draw(performance.now());
    });
    c.addEventListener("pointerleave", () => {
      this.mx = this.my = -1;
      if (this.ready && !this.loop) this.draw(performance.now());
    });
    c.addEventListener("click", () => {
      if (this.ready) this.onClick();
    });
    this.iv = setInterval(() => {
      if (!this.ready || !this.w) return;
      const n = performance.now();
      if (n - this.lastRaf > 300 && (this.loop || n - this.born < this.intro + 400)) this.draw(n);
    }, 150);
    void document.fonts.ready.then(() => {
      if (this.disposed || this.ready) return;
      this.init();
      this.ready = true;
      this.resize();
      this.kick();
    });
    // Canvas text is drawn with Geist Mono: redraw once a late font load finishes.
    document.fonts.addEventListener("loadingdone", this.onFonts);
  }

  private readonly onFonts = () => {
    if (this.ready) this.draw(performance.now());
  };

  /** One-time setup once fonts are ready (canvas text uses Geist Mono). */
  protected init(): void {}
  protected onResize(): void {}
  /** New data arrived (the previous value is passed for comparisons). */
  protected onData(_prev: D): void {}
  protected onClick(): void {}
  protected abstract draw(now: number): void;

  setData(data: D): void {
    const prev = this.data;
    this.data = data;
    if (!this.ready) return;
    this.onData(prev);
    this.kick();
    if (!this.loop) this.draw(performance.now());
  }

  /** Restart the intro animation. */
  replay(ms?: number): void {
    this.born = performance.now();
    if (ms) this.intro = ms;
    this.kick();
  }

  protected age(now: number): number {
    return (now - this.born) / 1000;
  }

  private frame(now: number): void {
    this.lastRaf = performance.now();
    if (this.vis !== false && !document.hidden && this.w) this.draw(now);
  }

  private kick(): void {
    if (this.raf || this.disposed) return;
    const fr = (now: number) => {
      if (this.disposed) return;
      this.frame(now);
      this.raf = this.loop || now - this.born < this.intro ? requestAnimationFrame(fr) : 0;
    };
    this.raf = requestAnimationFrame(fr);
  }

  private resize(): void {
    if (this.disposed) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.c.width = Math.round(w * d);
    this.c.height = Math.round(h * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.ready) {
      this.onResize();
      this.draw(performance.now());
    }
  }

  destroy(): void {
    this.disposed = true;
    this.ready = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.iv);
    this.ro.disconnect();
    this.io.disconnect();
    document.fonts.removeEventListener("loadingdone", this.onFonts);
    this.fsOff?.();
    this.fsOff = null;
    this.c.remove();
  }
}
