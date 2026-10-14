/**
 * three.js scene base, ported from the prototype's Scene3D custom element
 * (docs/design/cq-scenes.js): orbit camera with drag and inertia, optional auto-rotate and
 * sway (off when the "Auto-rotate 3D views" setting is off), fog, additive glow points, canvas
 * text sprites, an HTML tooltip and the fullscreen button. three is loaded on demand, so pages
 * without 3D never download it.
 *
 * Unlike the prototype, data changes over time: setData() hands a scene new data and a scene
 * calls rebuild() when its structure changed, keeping the camera where the viewer left it.
 */
import type * as THREE from "three";
import { getUi } from "@/lib/settings";
import { fsButton } from "./canvas";
import { MONO } from "./theme";

export type ThreeNS = typeof THREE;

let threePromise: Promise<ThreeNS> | null = null;
export const loadThree = () => (threePromise ??= import("three"));

const BG = 0x080b10;

export interface LabelOpts {
  size?: number;
  weight?: number;
  color?: string;
  bg?: string;
  anchor?: "left" | "right" | "bottom";
  depthTest?: boolean;
  opacity?: number;
  order?: number;
}

/** Text sprite drawn on a canvas texture (Geist Mono). */
export function label(T: ThreeNS, text: string, o: LabelOpts = {}): THREE.Sprite {
  const size = o.size ?? 0.6;
  const fs = 56;
  const c = document.createElement("canvas");
  const x = c.getContext("2d")!;
  const font = `${o.weight ?? 500} ${fs}px ${MONO}`;
  x.font = font;
  c.width = Math.ceil(x.measureText(text).width) + 28;
  c.height = fs + 28;
  x.font = font;
  x.textBaseline = "middle";
  if (o.bg) {
    x.fillStyle = o.bg;
    x.beginPath();
    if (x.roundRect) x.roundRect(2, 2, c.width - 4, c.height - 4, 14);
    else x.rect(2, 2, c.width - 4, c.height - 4);
    x.fill();
  }
  x.fillStyle = o.color ?? "#9aa8b8";
  x.fillText(text, 14, c.height / 2 + 2);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, fog: false, opacity: o.opacity ?? 1 }));
  s.scale.set((size * c.width) / c.height, size, 1);
  if (o.anchor === "left") s.center.set(0, 0.5);
  if (o.anchor === "right") s.center.set(1, 0.5);
  if (o.anchor === "bottom") s.center.set(0.5, 0);
  s.renderOrder = o.order ?? 5;
  return s;
}

/** Additive soft-glow points with per-point size, colour and alpha. */
export function glowMat(T: ThreeNS): THREE.ShaderMaterial {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uScale: { value: 400 } },
    vertexShader:
      "attribute float aSize; attribute vec3 aColor; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }",
    fragmentShader:
      "varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a=a*a; float core=smoothstep(0.14,0.0,d); gl_FragColor=vec4(vC*(a+core*0.9)*vA, 1.0); }",
  });
}

export interface PtsAttrs {
  position: THREE.BufferAttribute;
  aColor: THREE.BufferAttribute;
  aSize: THREE.BufferAttribute;
  aAlpha: THREE.BufferAttribute;
}

export function ptsGeo(T: ThreeNS, n: number): THREE.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aColor", new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aSize", new T.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("aAlpha", new T.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/** Typed views of a ptsGeo's attribute arrays. */
export function ptsArrays(g: THREE.BufferGeometry) {
  return {
    P: g.attributes.position!.array as Float32Array,
    C: g.attributes.aColor!.array as Float32Array,
    S: g.attributes.aSize!.array as Float32Array,
    A: g.attributes.aAlpha!.array as Float32Array,
  };
}

export function touch(g: THREE.BufferGeometry, names: string[] = ["position", "aColor", "aSize", "aAlpha"]): void {
  for (const n of names) {
    const a = g.attributes[n];
    if (a) a.needsUpdate = true;
  }
}

export function lines(T: ThreeNS, arr: number[], color: number, opacity?: number): THREE.LineSegments {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
  return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: opacity ?? 1, depthWrite: false }));
}

export abstract class Scene3D<D> {
  protected readonly host: HTMLElement;
  protected data: D;
  protected T!: ThreeNS;
  protected renderer!: THREE.WebGLRenderer;
  protected scene!: THREE.Scene;
  protected camera!: THREE.PerspectiveCamera;
  protected target!: THREE.Vector3;
  protected glows: THREE.ShaderMaterial[] = [];
  protected w = 0;
  protected h = 0;
  protected mx = -1;
  protected my = -1;
  protected hoverDirty = false;
  protected ready = false;
  // camera config, set in cfg()
  protected dist0 = 30;
  protected yaw0 = 0;
  protected pitch0 = 0.4;
  protected fov = 36;
  protected autoRot = 0;
  protected sway = 0;
  protected fitAspect = 0;
  private yaw = 0;
  private pitch = 0.4;
  private dist = 30;
  private vyaw = 0;
  private swayK: number | null = null;
  private dragState: { x: number; y: number; moved: number } | null = null;
  private readonly tipEl: HTMLDivElement;
  private readonly loadEl: HTMLDivElement;
  private fsOff: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private vis: boolean | undefined;
  private raf = 0;
  private iv: ReturnType<typeof setInterval> | null = null;
  private lastRaf = 0;
  private t0 = 0;
  private on = true;
  private pv: THREE.Vector3 | null = null;
  private rc: THREE.Raycaster | null = null;
  protected envTex: THREE.Texture | null = null;

  constructor(host: HTMLElement, data: D) {
    this.host = host;
    this.data = data;
    Object.assign(host.style, { display: "block", position: "relative", overflow: "hidden", background: "#080b10", touchAction: "pan-y" });
    const tp = document.createElement("div");
    tp.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;display:none;background:rgba(7,10,14,.95);border:1px solid #2a3442;border-radius:7px;padding:7px 10px;font:500 11px/1.55 ${MONO};color:#9aa8b8;white-space:nowrap;z-index:3;box-shadow:0 8px 24px rgba(0,0,0,.5)`;
    host.appendChild(tp);
    this.tipEl = tp;
    this.fsOff = fsButton(host, "#080b10");
    const ld = document.createElement("div");
    ld.textContent = "initialising WebGL…";
    ld.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 11px ${MONO};color:#5b6878;letter-spacing:.06em`;
    host.appendChild(ld);
    this.loadEl = ld;
    Promise.all([loadThree(), document.fonts.ready])
      .then(([T]) => {
        if (!this.on || this.ready) return;
        this.T = T;
        this.setup();
      })
      .catch((e: unknown) => {
        ld.textContent = "3D unavailable";
        ld.style.display = "flex";
        console.error("[cq-scenes]", e instanceof Error ? e.message : e);
      });
  }

  /** Camera configuration (dist0, yaw0, pitch0, fov, autoRot, sway, fitAspect). */
  protected cfg(): void {}
  /** Add everything to this.scene from this.data. */
  protected abstract build(): void;
  /** Per-frame update. t = seconds since setup, dt = frame delta, pnow = performance.now(). */
  protected abstract frame(t: number, dt: number, pnow: number): void;
  /** New data: update in place, or call rebuild(). */
  protected onData(_prev: D): void {
    this.rebuild();
  }
  protected onClick(): void {}

  setData(data: D): void {
    const prev = this.data;
    this.data = data;
    if (this.ready) this.onData(prev);
  }

  private setup(): void {
    const T = this.T;
    this.cfg();
    let r: THREE.WebGLRenderer;
    try {
      r = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    } catch (e) {
      this.loadEl.textContent = "3D unavailable";
      console.error("[cq-scenes]", e instanceof Error ? e.message : e);
      return;
    }
    this.renderer = r;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setClearColor(BG, 1);
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab";
    this.host.prepend(r.domElement);
    this.loadEl.style.display = "none";
    this.newScene();
    this.camera = new T.PerspectiveCamera(this.fov, 1, 0.1, 400);
    this.yaw = this.yaw0;
    this.pitch = this.pitch0;
    this.dist = this.dist0;
    this.target = new T.Vector3();
    const el = r.domElement;
    el.addEventListener("pointerdown", (e) => {
      this.dragState = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    });
    el.addEventListener("pointermove", (e) => {
      const b = el.getBoundingClientRect();
      this.mx = e.clientX - b.left;
      this.my = e.clientY - b.top;
      this.hoverDirty = true;
      const drag = this.dragState;
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        this.vyaw = -dx * 0.006;
        this.yaw += this.vyaw;
        this.pitch = Math.max(0.05, Math.min(1.35, this.pitch + dy * 0.004));
      }
    });
    el.addEventListener("pointerup", () => {
      if (this.dragState && this.dragState.moved < 5) this.onClick();
      this.dragState = null;
      el.style.cursor = "grab";
    });
    el.addEventListener("pointerleave", () => {
      this.mx = this.my = -1;
      this.hideTip();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.io = new IntersectionObserver((es) => {
      this.vis = es[es.length - 1]?.isIntersecting;
    });
    this.io.observe(this.host);
    this.build();
    this.ready = true;
    this.resize();
    this.t0 = performance.now();
    let last = this.t0;
    const step = (now: number, force: boolean) => {
      if (!this.on) return;
      if (!force && (this.vis === false || document.hidden || !this.w)) {
        last = now;
        return;
      }
      if (!this.w) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      const t = (now - this.t0) / 1000;
      last = now;
      const mo = getUi().motion ? 1 : 0;
      this.swayK = this.swayK === null ? mo : this.swayK + (mo - this.swayK) * 0.05;
      if (!this.dragState) {
        this.yaw += this.vyaw + this.autoRot * dt * mo;
        this.vyaw *= 0.94;
      }
      const yw = this.yaw + this.sway * this.swayK * Math.sin(t * 0.13);
      const c = this.camera;
      const tg = this.target;
      c.position.set(tg.x + Math.sin(yw) * Math.cos(this.pitch) * this.dist, tg.y + Math.sin(this.pitch) * this.dist, tg.z + Math.cos(yw) * Math.cos(this.pitch) * this.dist);
      c.lookAt(tg);
      this.frame(t, dt, now);
      r.render(this.scene, c);
    };
    const fr = () => {
      if (!this.on) return;
      this.raf = requestAnimationFrame(fr);
      this.lastRaf = performance.now();
      step(performance.now(), false);
    };
    this.raf = requestAnimationFrame(fr);
    this.iv = setInterval(() => {
      const n = performance.now();
      if (this.on && n - this.lastRaf > 400) step(n, true);
    }, 200);
  }

  private newScene(): void {
    this.scene = new this.T.Scene();
    this.scene.fog = new this.T.Fog(BG, this.dist0 * 0.8, this.dist0 * 2.4);
  }

  /** Rebuild the scene from current data, keeping the camera and renderer. */
  protected rebuild(): void {
    if (!this.ready) return;
    this.hideTip();
    this.disposeScene();
    this.glows = [];
    this.newScene();
    this.build();
    this.resize();
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fitAspect) this.dist = this.dist0 * Math.max(1, Math.pow(this.fitAspect / (w / h), 0.85));
    const s = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.glows.forEach((m) => {
      m.uniforms.uScale!.value = s;
    });
  }

  protected glow(): THREE.ShaderMaterial {
    const m = glowMat(this.T);
    this.glows.push(m);
    if (this.renderer && this.h) m.uniforms.uScale!.value = (this.h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    return m;
  }

  protected project(x: number, y: number, z: number): [number, number, number] {
    const v = (this.pv ??= new this.T.Vector3()).set(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h, v.z];
  }

  protected showTip(x: number, y: number, html: string, accent?: string): void {
    const tp = this.tipEl;
    tp.innerHTML = html;
    tp.style.display = "block";
    tp.style.borderColor = accent ?? "#2a3442";
    const tw = tp.offsetWidth;
    const th = tp.offsetHeight;
    let tx = x + 14;
    let ty = y - th - 10;
    if (tx + tw > this.w - 4) tx = x - tw - 14;
    if (ty < 4) ty = y + 16;
    tp.style.transform = `translate(${Math.max(4, tx)}px,${ty}px)`;
  }

  protected hideTip(): void {
    this.tipEl.style.display = "none";
  }

  protected setCursor(c: string): void {
    if (this.renderer) this.renderer.domElement.style.cursor = c;
  }

  protected ray(): THREE.Raycaster {
    this.rc ??= new this.T.Raycaster();
    this.rc.setFromCamera(new this.T.Vector2((this.mx / this.w) * 2 - 1, -(this.my / this.h) * 2 + 1), this.camera);
    return this.rc;
  }

  private disposeScene(): void {
    this.scene?.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      mats.forEach((mat) => {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      });
    });
    this.envTex?.dispose();
    this.envTex = null;
  }

  destroy(): void {
    this.on = false;
    this.ready = false;
    cancelAnimationFrame(this.raf);
    if (this.iv) clearInterval(this.iv);
    this.ro?.disconnect();
    this.io?.disconnect();
    if (this.renderer) {
      this.disposeScene();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.tipEl.remove();
    this.loadEl.remove();
    this.fsOff?.();
    this.fsOff = null;
  }
}
