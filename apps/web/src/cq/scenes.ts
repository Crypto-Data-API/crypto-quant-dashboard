/**
 * three.js scenes ported from docs/design/cq-scenes.js. Geometry, colours and motion follow the
 * prototype; data comes from real datasets through setData(). Where real data differs in shape
 * from the prototype's mock (any current regime, any number of GEX coins, CDA's depth bands and
 * snapshot cadence) the scene adapts rather than assuming the mock's values.
 */
import type * as THREE from "three";
import { label, lines, ptsArrays, ptsGeo, Scene3D, touch } from "./scene";
import { BAND, bandColor, clamp, ease, fmt, hash, REG, seeded, gauss, type RegCode } from "./theme";
import type { BubblesSlice, CalEvent, CycleSlice, DepthSlice, GalaxySlice, GammaSlice, HorizonSlice, LiqStreamSlice, TapeEvent, VolRow } from "./types";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]!);

/** Scenes animate an intro from build time; a rebuild for new data skips it. */
const SETTLED = 1e6;

// ================= live liquidation stream =================

export class LiqStream extends Scene3D<LiqStreamSlice> {
  private readonly XL = -14;
  private readonly XR = 14;
  private readonly WIN = 360;
  private readonly MAX = 260;
  private nowPlane!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private sph!: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private gGeo!: THREE.BufferGeometry;
  private stemGeo!: THREE.BufferGeometry;
  private rings: Array<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>> = [];
  private beams: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>> = [];
  private labels = new Map<string, THREE.Sprite>();
  private spawn = new Map<string, number>();
  private seen = new Set<string>();
  private cL!: THREE.Color;
  private cS!: THREE.Color;
  private tmpC!: THREE.Color;
  private white!: THREE.Color;
  private m4!: THREE.Matrix4;
  private q!: THREE.Quaternion;
  private v!: THREE.Vector3;
  private sc!: THREE.Vector3;

  protected override cfg(): void {
    this.dist0 = 22;
    this.yaw0 = 0.42;
    this.pitch0 = 0.34;
    this.fov = 34;
    this.sway = 0.1;
    this.fitAspect = 2.4;
  }

  private yOf(size: number): number {
    return Math.max(0.2, (Math.log10(Math.max(1, size)) - 2) * 1.5);
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const { XL, XR } = this;
    this.target.set(0.5, 1.5, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.3));
    const dl = new T.DirectionalLight(0xffffff, 1.4);
    dl.position.set(6, 12, 9);
    S.add(dl);
    const g: number[] = [];
    for (let m = 0; m <= 6; m++) {
      const x = XR - (m / 6) * 28;
      g.push(x, 0, -3.6, x, 0, 3.6);
    }
    [-3.6, 0, 3.6].forEach((z) => g.push(XL, 0, z, XR, 0, z));
    S.add(lines(T, g, 0x1b2532));
    const w: number[] = [];
    [1, 2, 3].forEach((e) => {
      const y = this.yOf(Math.pow(10, e + 2));
      w.push(XL, y, -3.6, XR, y, -3.6);
      const sl = label(T, `$${["1K", "10K", "100K"][e - 1]}`, { size: 0.62, color: "#6b7889", anchor: "right" });
      sl.position.set(XL - 0.3, y, -3.6);
      S.add(sl);
    });
    S.add(lines(T, w, 0x1b2532, 0.8));
    for (let m = 1; m <= 6; m++) {
      const s = label(T, `−${m}m`, { size: 0.6, color: "#6b7889" });
      s.position.set(XR - (m / 6) * 28, 0, 4.4);
      S.add(s);
    }
    const nl = label(T, "NOW", { size: 0.66, color: "#eef3f8", weight: 600 });
    nl.position.set(XR, 0, 4.4);
    S.add(nl);
    (
      [
        [-1.8, 0x2ee6a6, "LONG LIQ", "#2ee6a6"],
        [1.8, 0xff5c6c, "SHORT LIQ", "#ff5c6c"],
      ] as const
    ).forEach(([z, c, t, cs]) => {
      const m = new T.Mesh(new T.PlaneGeometry(28, 1.5), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.003, z);
      S.add(m);
      S.add(lines(T, [XL, 0.01, z, XR, 0.01, z], c, 0.5));
      const s = label(T, t, { size: 0.6, color: cs, weight: 600, anchor: "right" });
      s.position.set(XL - 0.4, 0.05, z);
      S.add(s);
    });
    this.nowPlane = new T.Mesh(new T.PlaneGeometry(7.5, 7), new T.MeshBasicMaterial({ color: 0x4c9bff, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false }));
    this.nowPlane.rotation.y = Math.PI / 2;
    this.nowPlane.position.set(XR, 3.5, 0);
    S.add(this.nowPlane);
    S.add(lines(T, [XR, 0, -3.6, XR, 7, -3.6, XR, 0, 3.6, XR, 7, 3.6, XR, 7, -3.6, XR, 7, 3.6], 0x4c9bff, 0.35));
    this.sph = new T.InstancedMesh(new T.SphereGeometry(1, 18, 12), new T.MeshStandardMaterial({ roughness: 0.25, metalness: 0.3 }), this.MAX);
    this.sph.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const c0 = new T.Color(1, 1, 1);
    for (let i = 0; i < this.MAX; i++) this.sph.setColorAt(i, c0);
    this.sph.count = 0;
    this.sph.frustumCulled = false;
    S.add(this.sph);
    this.gGeo = ptsGeo(T, this.MAX);
    const gp = new T.Points(this.gGeo, this.glow());
    gp.frustumCulled = false;
    S.add(gp);
    this.stemGeo = new T.BufferGeometry();
    this.stemGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(this.MAX * 6), 3));
    this.stemGeo.setAttribute("color", new T.BufferAttribute(new Float32Array(this.MAX * 6), 3));
    const st = new T.LineSegments(this.stemGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    st.frustumCulled = false;
    S.add(st);
    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const m = new T.Mesh(new T.RingGeometry(0.86, 1, 48), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      S.add(m);
      this.rings.push(m);
    }
    this.beams = [];
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.08, 9), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.visible = false;
      S.add(m);
      this.beams.push(m);
    }
    this.labels = new Map();
    this.cL = new T.Color(0x2ee6a6);
    this.cS = new T.Color(0xff5c6c);
    this.tmpC = new T.Color();
    this.white = new T.Color(1, 1, 1);
    this.m4 = new T.Matrix4();
    this.q = new T.Quaternion();
    this.v = new T.Vector3();
    this.sc = new T.Vector3();
    // Events already on the tape when the scene opens do not flash.
    this.seen = new Set(this.data.tape.map((e) => e.id));
  }

  protected override onData(): void {
    const now = performance.now();
    const ids = new Set<string>();
    for (const ev of this.data.tape) {
      ids.add(ev.id);
      if (!this.seen.has(ev.id)) this.fx(ev, now);
    }
    this.seen = ids;
  }

  private fx(ev: TapeEvent, now: number): void {
    this.spawn.set(ev.id, now);
    const z = ev.side === "L" ? -1.8 : 1.8;
    const col = ev.side === "L" ? 0x2ee6a6 : 0xff5c6c;
    const r = this.rings.find((m) => !m.visible);
    if (r) {
      r.visible = true;
      r.userData.t0 = now;
      r.userData.big = ev.size > 5000;
      r.position.set(this.XR, 0.02, z);
      r.material.color.setHex(col);
    }
    const b = this.beams.find((m) => !m.visible);
    if (b) {
      b.visible = true;
      b.userData.t0 = now;
      b.position.set(this.XR, 4.5, z);
      b.material.color.setHex(col);
    }
  }

  protected frame(t: number, _dt: number, pnow: number): void {
    const now = Date.now();
    const tape = this.data.tape;
    const coin = this.data.coin.toUpperCase().trim();
    const min = this.data.min || 0;
    const { P, C: CA, S: SZ, A: AL } = ptsArrays(this.gGeo);
    const SP = this.stemGeo.attributes.position!.array as Float32Array;
    const SC = this.stemGeo.attributes.color!.array as Float32Array;
    const live = new Set<string>();
    const pts: Array<{ ev: TapeEvent; x: number; y: number; z: number }> = [];
    let n = 0;
    for (const ev of tape) {
      if (n >= this.MAX) break;
      const age = (now - ev.ts) / 1000;
      if (age > this.WIN || age < -5) continue;
      const match = (!coin || coin === "ALL" || ev.coin.toUpperCase().includes(coin)) && ev.size >= min;
      const x = this.XR - (Math.max(0, age) / this.WIN) * 28;
      const z = ev.side === "L" ? -1.8 : 1.8;
      const st = this.spawn.get(ev.id);
      const k = st ? Math.min(1, (pnow - st) / 800) : 1;
      const el = k < 1 ? ease(k) * (1 + 0.45 * Math.sin(k * Math.PI)) : 1;
      const fade = Math.min(1, (x - this.XL) / 3);
      const y = this.yOf(ev.size) + (1 - ease(k)) * 2.5;
      const r = (0.1 + Math.pow(ev.size, 0.25) * 0.028) * (match ? 1 : 0.6);
      const base = ev.side === "L" ? this.cL : this.cS;
      const dim = (match ? 1 : 0.18) * fade;
      this.m4.compose(this.v.set(x, y, z), this.q, this.sc.setScalar(Math.max(0.001, r * el)));
      this.sph.setMatrixAt(n, this.m4);
      this.tmpC.copy(base).multiplyScalar(0.25 + 0.75 * dim);
      if (k < 1) this.tmpC.lerp(this.white, (1 - k) * 0.7);
      this.sph.setColorAt(n, this.tmpC);
      P[n * 3] = x;
      P[n * 3 + 1] = y;
      P[n * 3 + 2] = z;
      CA[n * 3] = base.r;
      CA[n * 3 + 1] = base.g;
      CA[n * 3 + 2] = base.b;
      SZ[n] = r * 7 * (1 + (1 - k) * 2.5);
      AL[n] = (0.4 + (1 - k) * 1.2) * dim;
      SP.set([x, 0, z, x, y, z], n * 6);
      SC.set([base.r * 0.1 * dim, base.g * 0.1 * dim, base.b * 0.1 * dim, base.r * 0.7 * dim, base.g * 0.7 * dim, base.b * 0.7 * dim], n * 6);
      if (ev.size >= 4000 && match) {
        let s = this.labels.get(ev.id);
        if (!s) {
          s = label(this.T, `${ev.coin} ${fmt.usd(ev.size)}`, { size: 0.56, color: "#eef3f8", weight: 600, bg: "rgba(7,10,14,0.75)", anchor: "bottom" });
          this.scene.add(s);
          this.labels.set(ev.id, s);
        }
        s.position.set(x, y + r + 0.2, z);
        (s.material as THREE.SpriteMaterial).opacity = fade;
        live.add(ev.id);
      }
      pts.push({ ev, x, y, z });
      n++;
    }
    this.labels.forEach((s, id) => {
      if (!live.has(id)) {
        this.scene.remove(s);
        const m = s.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
        this.labels.delete(id);
      }
    });
    for (const id of this.spawn.keys()) if (!this.seen.has(id)) this.spawn.delete(id);
    this.sph.count = n;
    this.sph.instanceMatrix.needsUpdate = true;
    if (this.sph.instanceColor) this.sph.instanceColor.needsUpdate = true;
    this.gGeo.setDrawRange(0, n);
    touch(this.gGeo);
    this.stemGeo.setDrawRange(0, n * 2);
    touch(this.stemGeo, ["position", "color"]);
    this.rings.forEach((m) => {
      if (!m.visible) return;
      const a = (pnow - (m.userData.t0 as number)) / 1400;
      if (a >= 1) {
        m.visible = false;
        return;
      }
      const s = 0.3 + ease(a) * (m.userData.big ? 4.5 : 2.6);
      m.scale.set(s, s, s);
      m.material.opacity = 0.9 * (1 - a);
    });
    this.beams.forEach((m) => {
      if (!m.visible) return;
      const a = (pnow - (m.userData.t0 as number)) / 700;
      if (a >= 1) {
        m.visible = false;
        return;
      }
      m.material.opacity = 0.8 * (1 - a);
      m.scale.x = 1 + a * 3;
      m.lookAt(this.camera.position.x, m.position.y, this.camera.position.z);
    });
    this.nowPlane.material.opacity = 0.05 + 0.03 * Math.sin(t * 2.4);
    if (this.mx >= 0) {
      let best: { p: (typeof pts)[number]; sx: number; sy: number } | null = null;
      let bd = 18;
      pts.forEach((p) => {
        const [sx, sy] = this.project(p.x, p.y, p.z);
        const d = Math.hypot(sx - this.mx, sy - this.my);
        if (d < bd) {
          bd = d;
          best = { p, sx, sy };
        }
      });
      if (best) {
        const { p, sx, sy } = best as { p: (typeof pts)[number]; sx: number; sy: number };
        const e = p.ev;
        const c = e.side === "L" ? "#2ee6a6" : "#ff5c6c";
        this.showTip(
          sx,
          sy,
          `<b style="color:#eef3f8">${esc(e.coin)}</b> <span style="color:${c}">${e.side === "L" ? "long liq · forced sell" : "short liq · forced buy"}</span><br>${fmt.usd(e.size)} · ${esc(e.venue)} · ${fmt.time(e.ts)}`,
          c,
        );
      } else this.hideTip();
    }
  }
}

// ================= regime galaxy =================

interface Cluster {
  code: RegCode;
  n: number;
  center: THREE.Vector3;
  col: THREE.Color;
  hex: string;
  R: number;
  lb: THREE.Sprite;
  lb2: THREE.Sprite;
  ci: number;
}

interface Star {
  coin: string;
  code: RegCode;
  conf: number;
  k: Cluster;
  rad: number;
  th: number;
  yo: number;
  w: number;
  major: boolean;
  lb?: THREE.Sprite;
  p: [number, number, number];
}

interface Flow {
  code: RegCode;
  t: number;
  sp: number;
  j: THREE.Vector3;
  a: number;
  rr: number;
}

const MAJORS = new Set(["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "ZEC", "SUI", "S", "STRK", "CRV", "TIA", "OP", "KAITO"]);
/** The prototype's ring order around the centre (RANGE sits in the middle there). */
const RING: RegCode[] = ["BULL", "SQZ", "SPIKE", "BEAR", "CHOP", "RANGE"];

export interface GalaxyData extends GalaxySlice {
  /** Highlighted regime ("" = all). */
  focus: string;
}

export class Galaxy extends Scene3D<GalaxyData> {
  private cl: Partial<Record<RegCode, Cluster>> = {};
  private coins: Star[] = [];
  private cGeo!: THREE.BufferGeometry;
  private coreGeo!: THREE.BufferGeometry;
  private fGeo!: THREE.BufferGeometry;
  private flow: Flow[] = [];
  private centerC!: THREE.Vector3;
  /** Orbit particles around the centre use the regime colour's raw sRGB components (prototype: [0.3, 0.6, 1] for RANGE). */
  private centerRGB: [number, number, number] = [0.3, 0.6, 1];
  private blue!: THREE.Color;
  private tc!: THREE.Color;
  private hov: Star | null = null;

  protected override cfg(): void {
    this.dist0 = 34;
    this.pitch0 = 0.58;
    this.yaw0 = 0.35;
    this.autoRot = 0.035;
    this.fov = 36;
    this.fitAspect = 1.6;
  }

  static signature(d: GalaxySlice): string {
    return `${d.current}|${d.next24.map((f) => `${f.code}${f.v}`).join(",")}|${d.coins.map((c) => `${c.coin}${c.code}${c.conf}`).join(",")}`;
  }

  protected override onData(prev: GalaxyData): void {
    if (Galaxy.signature(prev) !== Galaxy.signature(this.data)) this.rebuild();
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const { coins, current, next24 } = this.data;
    this.target.set(0, -0.5, 0);
    const ring = RING.filter((c) => c !== current);
    const cl: Partial<Record<RegCode, Cluster>> = {};
    (["BULL", "BEAR", "RANGE", "CHOP", "SQZ", "SPIKE"] as RegCode[]).forEach((code) => {
      const n = coins.filter((c) => c.code === code).length;
      let center: THREE.Vector3;
      if (code === current) center = new T.Vector3(0, 0, 0);
      else {
        const i = ring.indexOf(code);
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        center = new T.Vector3(Math.cos(a) * 16, Math.sin(i * 1.7) * 1.4, Math.sin(a) * 16);
      }
      cl[code] = { code, n, center, col: new T.Color(REG[code].color), hex: REG[code].color, R: code === current ? 7 : 1.8 + Math.sqrt(n) * 0.8, lb: null!, lb2: null!, ci: 0 };
    });
    this.cl = cl;
    const stars: number[] = [];
    const sr = seeded("stars");
    for (let i = 0; i < 900; i++) {
      const u = sr() * 2 - 1;
      const th = sr() * Math.PI * 2;
      const rr = 70 + sr() * 60;
      const s = Math.sqrt(1 - u * u);
      stars.push(Math.cos(th) * s * rr, u * rr * 0.6, Math.sin(th) * s * rr);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.Float32BufferAttribute(stars, 3));
    S.add(new T.Points(sg, new T.PointsMaterial({ color: 0x3a4a62, size: 0.35, sizeAttenuation: true, fog: false })));
    Object.values(cl).forEach((c) => {
      const rings = c.code === current ? [0.45, 0.75, 1.05] : [1.05];
      rings.forEach((k, j) => {
        const m = new T.Mesh(
          new T.RingGeometry(c.R * k - 0.03, c.R * k + 0.03, 128),
          new T.MeshBasicMaterial({ color: c.col, transparent: true, opacity: j === rings.length - 1 ? 0.28 : 0.1, side: T.DoubleSide, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.copy(c.center);
        S.add(m);
      });
      const lb = label(T, `${c.code} · ${c.n}`, { size: 0.9, color: c.hex, weight: 600, anchor: "bottom" });
      lb.position.copy(c.center).add(new T.Vector3(0, c.R * 0.35 + 1.4, 0));
      S.add(lb);
      c.lb = lb;
      const lb2 = label(T, REG[c.code].label, { size: 0.5, color: "#8b98a9", anchor: "bottom" });
      lb2.position.copy(c.center).add(new T.Vector3(0, c.R * 0.35 + 0.75, 0));
      S.add(lb2);
      c.lb2 = lb2;
    });
    this.coins = coins.map((c) => {
      const r = seeded(`g${c.coin}`);
      const k = cl[c.code]!;
      const rad = k.R * Math.min(1.02, 0.12 + (1 - c.conf / 100) * 0.95 + r() * 0.3);
      return { ...c, k, rad, th: r() * Math.PI * 2, yo: (r() - 0.5) * k.R * 0.22, w: 0.22 / (0.5 + rad * 0.3), major: MAJORS.has(c.coin), p: [0, 0, 0] };
    });
    this.cGeo = ptsGeo(T, Math.max(1, this.coins.length));
    const cp = new T.Points(this.cGeo, this.glow());
    cp.frustumCulled = false;
    S.add(cp);
    const { C: CA, S: SZ } = ptsArrays(this.cGeo);
    this.coins.forEach((c, i) => {
      CA.set([c.k.col.r, c.k.col.g, c.k.col.b], i * 3);
      SZ[i] = (0.55 + (c.conf / 100) * 0.75) * (c.major ? 1.9 : 1);
      if (c.major) {
        c.lb = label(T, c.coin, { size: 0.5, color: "#eef3f8", weight: 600, anchor: "left" });
        S.add(c.lb);
      }
    });
    this.cGeo.setDrawRange(0, this.coins.length);
    this.coreGeo = ptsGeo(T, 6);
    const cores = new T.Points(this.coreGeo, this.glow());
    cores.frustumCulled = false;
    S.add(cores);
    const core = ptsArrays(this.coreGeo);
    Object.values(cl).forEach((c, i) => {
      core.P.set([c.center.x, c.center.y, c.center.z], i * 3);
      core.C.set([c.col.r, c.col.g, c.col.b], i * 3);
      core.S[i] = c.n ? 3 + Math.sqrt(c.n) * 0.9 : 2;
      core.A[i] = c.n ? 0.5 : 0.15;
      c.ci = i;
    });
    const flows = next24;
    const tot = flows.reduce((a, f) => a + f.v, 0);
    const M = 520;
    const fr = seeded("flow");
    this.flow = [];
    if (tot > 0) {
      for (let i = 0; i < M; i++) {
        let x = fr() * tot;
        let d = flows[0]!;
        for (const f of flows) {
          if ((x -= f.v) <= 0) {
            d = f;
            break;
          }
        }
        this.flow.push({ code: d.code, t: fr(), sp: 0.12 + fr() * 0.1, j: new T.Vector3((fr() - 0.5) * 2, 4 + fr() * 3, (fr() - 0.5) * 2), a: fr() * Math.PI * 2, rr: 7.6 + fr() * 1.6 });
      }
    }
    this.fGeo = ptsGeo(T, Math.max(1, this.flow.length));
    this.fGeo.setDrawRange(0, this.flow.length);
    const fp = new T.Points(this.fGeo, this.glow());
    fp.frustumCulled = false;
    S.add(fp);
    flows.forEach((f) => {
      if (f.code === current) return;
      const c = cl[f.code]!;
      const mid = c.center.clone().multiplyScalar(0.5).add(new T.Vector3(0, 3.8, 0));
      const s = label(T, `${f.v}%`, { size: 0.6, color: c.hex, weight: 600, bg: "rgba(8,11,16,0.85)" });
      s.position.copy(mid);
      S.add(s);
    });
    const stays = flows.find((f) => f.code === current);
    if (stays) {
      const sl = label(T, `stays ${stays.v}%`, { size: 0.55, color: REG[current].color, weight: 600, bg: "rgba(8,11,16,0.85)" });
      sl.position.set(0, 0.2, cl[current]!.R + 1.4);
      S.add(sl);
    }
    this.centerC = cl[current]!.center;
    const hx = parseInt(REG[current].color.slice(1), 16);
    this.centerRGB = [((hx >> 16) & 255) / 255, ((hx >> 8) & 255) / 255, (hx & 255) / 255];
    this.blue = new T.Color(REG[current].color);
    this.tc = new T.Color();
  }

  protected override onClick(): void {
    if (this.hov) window.dispatchEvent(new CustomEvent("cq:coin", { detail: this.hov.coin }));
  }

  protected frame(t: number, dt: number): void {
    const focus = this.data.focus;
    const current = this.data.current;
    const { P, A: AL } = ptsArrays(this.cGeo);
    this.coins.forEach((c, i) => {
      const a = c.th + c.w * t;
      const x = c.k.center.x + Math.cos(a) * c.rad;
      const z = c.k.center.z + Math.sin(a) * c.rad;
      const y = c.k.center.y + c.yo + Math.sin(t * 0.6 + c.th) * 0.12;
      P[i * 3] = x;
      P[i * 3 + 1] = y;
      P[i * 3 + 2] = z;
      const on = !focus || focus === c.code;
      AL[i] = on ? 0.95 : 0.08;
      c.p = [x, y, z];
      if (c.lb) {
        c.lb.position.set(x + 0.35, y + 0.25, z);
        (c.lb.material as THREE.SpriteMaterial).opacity = on ? 1 : 0.15;
      }
    });
    touch(this.cGeo, ["position", "aAlpha"]);
    const core = ptsArrays(this.coreGeo);
    Object.values(this.cl).forEach((c) => {
      const on = !focus || focus === c.code;
      (c.lb.material as THREE.SpriteMaterial).opacity = on ? 1 : 0.2;
      (c.lb2.material as THREE.SpriteMaterial).opacity = on ? 1 : 0.2;
      core.A[c.ci] = (c.n ? 0.45 + 0.12 * Math.sin(t * 2 + c.ci) : 0.15) * (on ? 1 : 0.2);
    });
    touch(this.coreGeo, ["aAlpha"]);
    const F = ptsArrays(this.fGeo);
    const A0 = this.centerC;
    this.flow.forEach((f, i) => {
      f.t += dt * f.sp;
      if (f.t > 1) f.t -= 1;
      const on = !focus || focus === f.code;
      if (f.code === current) {
        const a = f.a + f.t * Math.PI * 2;
        F.P.set([Math.cos(a) * f.rr, Math.sin(a * 3) * 0.3, Math.sin(a) * f.rr], i * 3);
        F.C.set(this.centerRGB, i * 3);
        F.S[i] = 0.2;
        F.A[i] = 0.5 * (on ? 1 : 0.1);
        return;
      }
      const B = this.cl[f.code]!.center;
      const u = f.t;
      const cx = (A0.x + B.x) / 2 + f.j.x;
      const cy = (A0.y + B.y) / 2 + f.j.y;
      const cz = (A0.z + B.z) / 2 + f.j.z;
      const iu = 1 - u;
      F.P.set([iu * iu * A0.x + 2 * iu * u * cx + u * u * B.x, iu * iu * A0.y + 2 * iu * u * cy + u * u * B.y, iu * iu * A0.z + 2 * iu * u * cz + u * u * B.z], i * 3);
      this.tc.copy(this.blue).lerp(this.cl[f.code]!.col, u);
      F.C.set([this.tc.r, this.tc.g, this.tc.b], i * 3);
      F.S[i] = 0.26;
      F.A[i] = Math.sin(Math.PI * u) * 0.9 * (on ? 1 : 0.08);
    });
    touch(this.fGeo);
    this.hov = null;
    if (this.mx >= 0) {
      let bd = 14;
      let best: { c: Star; sx: number; sy: number } | null = null;
      this.coins.forEach((c) => {
        if (focus && focus !== c.code) return;
        const [sx, sy] = this.project(c.p[0], c.p[1], c.p[2]);
        const d = Math.hypot(sx - this.mx, sy - this.my);
        if (d < bd) {
          bd = d;
          best = { c, sx, sy };
        }
      });
      if (best) {
        const { c, sx, sy } = best as { c: Star; sx: number; sy: number };
        this.hov = c;
        this.setCursor("pointer");
        this.showTip(
          sx,
          sy,
          `<b style="color:#eef3f8">${esc(c.coin)}</b> · <span style="color:${c.k.hex}">${c.code}</span><br>confidence ${c.conf}% · ${c.rad / c.k.R < 0.45 ? "core" : "periphery"}<br><span style="color:#5b6878">click to find in grid</span>`,
          c.k.hex,
        );
      } else {
        this.hideTip();
        this.setCursor("grab");
      }
    }
  }
}

// ================= cycle ring =================

interface CycleSeg {
  pv: THREE.Object3D;
  m: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  cur: boolean;
}

export class Cycle extends Scene3D<CycleSlice> {
  private readonly R = 7.2;
  private seg = 0;
  private segs: CycleSeg[] = [];
  private am = 0;
  private marker!: THREE.Mesh;
  private beam!: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private light!: THREE.PointLight;
  private parts: Array<{ a: number; rr: number; y: number; sp: number; s: number }> = [];
  private pGeo!: THREE.BufferGeometry;
  private mGeo!: THREE.BufferGeometry;
  private cols: THREE.Color[] = [];

  protected override cfg(): void {
    this.dist0 = 21;
    this.pitch0 = 0.7;
    this.yaw0 = 0.25;
    this.autoRot = 0.05;
    this.fov = 36;
    this.fitAspect = 1.3;
  }

  protected override onData(prev: CycleSlice): void {
    const sig = (d: CycleSlice) => `${d.phase}|${d.progress.toFixed(3)}|${d.sub}|${d.phases.map((p) => p.name).join(",")}`;
    if (sig(prev) !== sig(this.data)) this.rebuild();
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const cyc = this.data;
    const n = Math.max(1, cyc.phases.length);
    const R = this.R;
    const seg = (this.seg = (Math.PI * 2) / n);
    const gap = 0.035;
    this.target.set(0, 0.2, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 0.9));
    const dl = new T.DirectionalLight(0xffffff, 1.2);
    dl.position.set(4, 10, 6);
    S.add(dl);
    const g: number[] = [];
    [2.5, 4.5, R - 1.2, R + 1.2].forEach((r) => {
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * Math.PI * 2;
        const a1 = ((i + 1) / 96) * Math.PI * 2;
        g.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
      }
    });
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * seg;
      g.push(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2, Math.cos(a) * (R + 1.8), 0, Math.sin(a) * (R + 1.8));
    }
    S.add(lines(T, g, 0x1b2532, 0.9));
    this.segs = cyc.phases.map((p, i) => {
      const cur = p.n === cyc.phase;
      const phi0 = -Math.PI / 2 + i * seg + gap;
      const pv = new T.Object3D();
      pv.rotation.y = -phi0;
      const m = new T.Mesh(
        new T.TorusGeometry(R, cur ? 0.6 : 0.38, 20, 48, seg - gap * 2),
        new T.MeshStandardMaterial({ color: p.c, emissive: p.c, emissiveIntensity: cur ? 0.9 : 0.12, roughness: 0.32, metalness: 0.3, transparent: true, opacity: cur ? 1 : 0.6 }),
      );
      m.rotation.x = Math.PI / 2;
      m.userData.p = p;
      pv.add(m);
      S.add(pv);
      const am = -Math.PI / 2 + (i + 0.5) * seg;
      const lb = label(T, String(p.n).padStart(2, "0"), { size: cur ? 0.8 : 0.55, color: cur ? "#eef3f8" : "#6b7889", weight: 600 });
      lb.position.set(Math.cos(am) * (R + 1.9), 0.1, Math.sin(am) * (R + 1.9));
      S.add(lb);
      if (cur) {
        const nm = label(T, p.name.split(" / ")[0]!.toUpperCase(), { size: 0.5, color: p.c, weight: 600 });
        nm.position.set(Math.cos(am) * (R + 3.1), 0.1, Math.sin(am) * (R + 3.1));
        S.add(nm);
      }
      return { pv, m, cur };
    });
    const idx = cyc.phase ? cyc.phases.findIndex((p) => p.n === cyc.phase) : -1;
    this.am = -Math.PI / 2 + (Math.max(0, idx) + cyc.progress) * seg;
    this.marker = new T.Mesh(new T.SphereGeometry(0.32, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff }));
    this.marker.visible = idx >= 0;
    S.add(this.marker);
    this.beam = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 7, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }));
    this.beam.visible = idx >= 0;
    S.add(this.beam);
    const curPhase = idx >= 0 ? cyc.phases[idx] : undefined;
    this.light = new T.PointLight(curPhase ? new T.Color(curPhase.c).getHex() : 0xff7a3d, 8, 10);
    S.add(this.light);
    const N = 1100;
    const r = seeded("cyc");
    this.parts = [];
    for (let i = 0; i < N; i++) this.parts.push({ a: r() * Math.PI * 2, rr: R + gauss(r) * 0.85, y: gauss(r) * 0.32, sp: 0.03 + r() * 0.05, s: 0.06 + r() * 0.14 });
    this.pGeo = ptsGeo(T, N);
    const pp = new T.Points(this.pGeo, this.glow());
    pp.frustumCulled = false;
    S.add(pp);
    this.mGeo = ptsGeo(T, 1);
    ptsArrays(this.mGeo).C.set([1, 0.6, 0.35]);
    const mp = new T.Points(this.mGeo, this.glow());
    mp.frustumCulled = false;
    mp.visible = idx >= 0;
    S.add(mp);
    this.cols = cyc.phases.map((p) => new T.Color(p.c));
  }

  protected frame(t: number, dt: number): void {
    const R = this.R;
    const cyc = this.data;
    const lift = 0.45 + 0.12 * Math.sin(t * 2);
    this.segs.forEach((s) => {
      if (s.cur) {
        s.pv.position.y = lift;
        s.m.material.emissiveIntensity = 0.75 + 0.35 * Math.sin(t * 3);
      }
    });
    const x = Math.cos(this.am) * R;
    const z = Math.sin(this.am) * R;
    this.marker.position.set(x, lift + 0.05, z);
    this.beam.position.set(x, lift + 3.5, z);
    this.beam.material.opacity = 0.35 + 0.2 * Math.sin(t * 4);
    this.light.position.set(x, lift + 1, z);
    const M = ptsArrays(this.mGeo);
    M.P.set([x, lift + 0.05, z]);
    M.S[0] = 2.6 + Math.sin(t * 4) * 0.5;
    M.A[0] = 0.9;
    touch(this.mGeo, ["position", "aSize", "aAlpha"]);
    const { P, C: Cc, S: Sz, A: Al } = ptsArrays(this.pGeo);
    const seg = this.seg;
    const n = this.cols.length || 1;
    this.parts.forEach((p, i) => {
      p.a += dt * p.sp;
      const a = p.a % (Math.PI * 2);
      P[i * 3] = Math.cos(a) * p.rr;
      P[i * 3 + 1] = p.y;
      P[i * 3 + 2] = Math.sin(a) * p.rr;
      const idx = Math.floor((((((a + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / seg)) % n;
      const c = this.cols[idx];
      const cur = cyc.phases[idx]?.n === cyc.phase;
      if (c) {
        Cc[i * 3] = c.r;
        Cc[i * 3 + 1] = c.g;
        Cc[i * 3 + 2] = c.b;
      }
      Sz[i] = p.s * (cur ? 1.8 : 1);
      Al[i] = cur ? 0.9 : 0.35;
      if (cur) P[i * 3 + 1]! += lift * 0.8;
    });
    touch(this.pGeo);
    if (this.mx >= 0 && this.hoverDirty) {
      this.hoverDirty = false;
      const hit = this.ray().intersectObjects(this.segs.map((s) => s.m))[0];
      if (hit) {
        const p = hit.object.userData.p as CycleSlice["phases"][number];
        this.showTip(
          this.mx,
          this.my,
          `<b style="color:#eef3f8">Phase ${p.n} · ${esc(p.name)}</b><br><span style="color:${p.c}">${esc(p.group)}</span>${p.n === cyc.phase ? ` · current${cyc.sub ? ` · ${esc(cyc.sub.toLowerCase())}` : ""}` : ""}`,
          p.c,
        );
      } else this.hideTip();
    }
  }
}

// ================= gamma landscape =================

interface GammaBar {
  coin: string;
  ri: number;
  d: number;
  L: number;
  S: number;
  side: "L" | "S";
  h: number;
}

export class Gamma3D extends Scene3D<GammaSlice> {
  private readonly XS = 0.36;
  private bars: GammaBar[] = [];
  private inst!: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private rowLabels: THREE.Sprite[] = [];
  private flips: Array<{ m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; ln: THREE.LineSegments; s: THREE.Sprite } | null> = [];
  private cL!: THREE.Color;
  private cS!: THREE.Color;
  private cW!: THREE.Color;
  private tc!: THREE.Color;
  private m4!: THREE.Matrix4;
  private q!: THREE.Quaternion;
  private v!: THREE.Vector3;
  private sc!: THREE.Vector3;
  private born = 0;
  private selT = 0;
  private sel = "";

  protected override cfg(): void {
    this.dist0 = 33;
    this.pitch0 = 0.46;
    this.yaw0 = 0.38;
    this.sway = 0.1;
    this.fov = 34;
    this.fitAspect = 1.9;
  }

  private zOf(i: number): number {
    return (i - (this.data.order.length - 1) / 2) * 3.3;
  }

  static signature(d: GammaSlice): string {
    return d.order
      .map((c) => {
        const x = d.coins[c];
        if (!x) return c;
        let s = 0;
        x.profile.forEach((b) => (s += b.L + b.S));
        return `${c}:${Math.round(s)}:${x.flip ?? ""}:${x.mark ?? ""}`;
      })
      .join("|");
  }

  protected override onData(prev: GammaSlice): void {
    if (Gamma3D.signature(prev) !== Gamma3D.signature(this.data)) {
      this.rebuild();
      this.born = performance.now() - SETTLED;
    }
    if (this.data.sel !== this.sel) {
      this.sel = this.data.sel;
      this.selT = performance.now();
    }
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const gm = this.data;
    const XS = this.XS;
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.1));
    const dl = new T.DirectionalLight(0xffffff, 1.6);
    dl.position.set(-6, 14, 10);
    S.add(dl);
    this.bars = [];
    gm.order.forEach((c, ri) =>
      (gm.coins[c]?.profile ?? []).forEach((b, i) => {
        const v = b.L + b.S;
        this.bars.push({ coin: c, ri, d: i - 50, L: b.L, S: b.S, side: b.L >= b.S ? "L" : "S", h: v > 0 ? Math.min(11, Math.sqrt(v / 1e6) * 1.15) : 0 });
      }),
    );
    const geo = new T.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.inst = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), Math.max(1, this.bars.length));
    this.inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.inst.count = this.bars.length;
    const w0 = new T.Color(1, 1, 1);
    this.bars.forEach((_b, i) => this.inst.setColorAt(i, w0));
    S.add(this.inst);
    const rows = Math.max(1, gm.order.length);
    const zf = this.zOf(rows - 1) + 2.4;
    const zb = this.zOf(0) - 2.4;
    const g: number[] = [];
    for (let d = -50; d <= 50; d += 5) g.push(d * XS, 0, zb, d * XS, 0, zf);
    gm.order.forEach((_c, i) => {
      const z = this.zOf(i);
      g.push(-50 * XS, 0, z, 50 * XS, 0, z);
    });
    S.add(lines(T, g, 0x1b2532));
    const wl: number[] = [];
    [1e6, 10e6, 50e6].forEach((v) => {
      const y = Math.sqrt(v / 1e6) * 1.15;
      wl.push(-50 * XS, y, zb, 50 * XS, y, zb);
      const s = label(T, fmt.usd(v), { size: 0.45, color: "#5b6878", anchor: "right" });
      s.position.set(-50 * XS - 0.4, y, zb);
      S.add(s);
    });
    S.add(lines(T, wl, 0x1b2532, 0.8));
    [-50, -25, 0, 25, 50].forEach((d) => {
      const s = label(T, d === 0 ? "mark" : `${d > 0 ? "+" : ""}${d}%`, { size: 0.5, color: d === 0 ? "#eef3f8" : "#6b7889" });
      s.position.set(d * XS, 0, zf + 1);
      S.add(s);
    });
    const mk = new T.Mesh(new T.PlaneGeometry(zf - zb, 11.5), new T.MeshBasicMaterial({ color: 0xeef3f8, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }));
    mk.rotation.y = Math.PI / 2;
    mk.position.set(0, 5.75, (zf + zb) / 2);
    S.add(mk);
    S.add(lines(T, [0, 0, zb, 0, 0, zf, 0, 0, zb, 0, 11.5, zb], 0xeef3f8, 0.5));
    this.rowLabels = gm.order.map((c, i) => {
      const s = label(T, c, { size: 0.75, color: "#eef3f8", weight: 600, anchor: "right" });
      s.position.set(-50 * XS - 0.8, 0.3, this.zOf(i));
      S.add(s);
      return s;
    });
    this.flips = gm.order.map((c, i) => {
      const co = gm.coins[c];
      if (!co || co.flip === null || !co.mark) return null;
      const fp = clamp((co.flip / co.mark - 1) * 100, -50, 50);
      const z = this.zOf(i);
      const x = fp * XS;
      const m = new T.Mesh(new T.PlaneGeometry(2.6, 9), new T.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false }));
      m.rotation.y = Math.PI / 2;
      m.position.set(x, 4.5, z);
      S.add(m);
      const ln = lines(T, [x, 0, z - 1.3, x, 0, z + 1.3, x, 9, z - 1.3, x, 9, z + 1.3, x, 0, z, x, 9, z], 0xffb547, 0.8);
      S.add(ln);
      const s = label(T, `flip ${fmt.px(co.flip)}`, { size: 0.45, color: "#ffb547", weight: 600, anchor: "bottom" });
      s.position.set(x, 9.1, z);
      S.add(s);
      return { m, ln, s };
    });
    this.cL = new T.Color(0x2ee6a6);
    this.cS = new T.Color(0xff5c6c);
    this.cW = new T.Color(1, 1, 1);
    this.tc = new T.Color();
    this.m4 = new T.Matrix4();
    this.q = new T.Quaternion();
    this.v = new T.Vector3();
    this.sc = new T.Vector3();
    if (!this.born) this.born = performance.now();
    this.sel = gm.sel;
    if (!this.selT) this.selT = this.born;
  }

  protected frame(t: number, _dt: number, pnow: number): void {
    const gm = this.data;
    const si = Math.max(0, gm.order.indexOf(this.sel));
    const XS = this.XS;
    this.target.x += (0 - this.target.x) * 0.05;
    this.target.y += (2.2 - this.target.y) * 0.05;
    this.target.z += (this.zOf(si) * 0.6 - this.target.z) * 0.05;
    const scan = ((t * 0.09) % 1) * 44 - 22;
    this.bars.forEach((b, i) => {
      const x = b.d * XS;
      const z = this.zOf(b.ri);
      const selRow = b.ri === si;
      const k0 = ease((pnow - this.born - Math.abs(b.d) * 14 - b.ri * 120) / 800);
      const k1 = selRow ? ease((pnow - this.selT - Math.abs(b.d) * 9) / 650) : 1;
      const h = Math.max(0.015, b.h * k0 * (selRow ? 0.25 + 0.75 * k1 : 1) * (Math.abs(b.d) < 5 ? 1 + 0.05 * Math.sin(t * 5 + b.d) : 1));
      this.m4.compose(this.v.set(x, 0, z), this.q, this.sc.set(0.27, h, selRow ? 2 : 1.3));
      this.inst.setMatrixAt(i, this.m4);
      const s = Math.exp(-Math.pow(x - scan, 2) / 1.2);
      this.tc
        .copy(b.side === "L" ? this.cL : this.cS)
        .multiplyScalar(selRow ? 1 : 0.32)
        .lerp(this.cW, s * (selRow ? 0.55 : 0.25));
      if (!b.h) this.tc.setRGB(0.08, 0.1, 0.13);
      this.inst.setColorAt(i, this.tc);
    });
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    this.flips.forEach((f, i) => {
      if (!f) return;
      const on = i === si;
      f.m.material.opacity = on ? 0.14 + 0.05 * Math.sin(t * 3) : 0.04;
      (f.ln.material as THREE.LineBasicMaterial).opacity = on ? 0.9 : 0.25;
      (f.s.material as THREE.SpriteMaterial).opacity = on ? 1 : 0.3;
    });
    this.rowLabels.forEach((s, i) => {
      (s.material as THREE.SpriteMaterial).opacity = i === si ? 1 : 0.4;
    });
    if (this.mx >= 0 && this.hoverDirty) {
      this.hoverDirty = false;
      const hit = this.ray().intersectObject(this.inst)[0];
      if (hit && hit.instanceId != null) {
        const b = this.bars[hit.instanceId];
        const mark = b ? gm.coins[b.coin]?.mark : null;
        if (b) {
          this.showTip(
            this.mx,
            this.my,
            `<b style="color:#eef3f8">${esc(b.coin)}</b> · ${b.d > 0 ? "+" : ""}${b.d}%${mark ? ` → ${fmt.px(mark * (1 + b.d / 100))}` : ""}<br><span style="color:#2ee6a6">L ${fmt.usd(b.L)}</span> · <span style="color:#ff5c6c">S ${fmt.usd(b.S)}</span>`,
            b.side === "L" ? "#2ee6a6" : "#ff5c6c",
          );
        }
      } else this.hideTip();
    }
  }
}

// ================= liquidity terrain =================

/** Rows: 0-24 asks from +50 to +2 bps, 25-49 bids from -2 to -50 bps (2 bps each). */
export const DEPTH_LEVELS = 50;
/** Six hours of snapshots at CDA's ~2-minute cadence. */
export const DEPTH_COLS = 180;

/** Band (in bps from mid) a terrain row belongs to. */
export function depthRowBand(r: number): { ask: boolean; bps: number; lo: number; hi: number } {
  const ask = r < DEPTH_LEVELS / 2;
  const dist = ask ? DEPTH_LEVELS / 2 - r : r - DEPTH_LEVELS / 2 + 1;
  const bps = dist * 2;
  const [lo, hi] = bps <= 10 ? [0, 10] : bps <= 25 ? [10, 25] : [25, 50];
  return { ask, bps, lo, hi };
}

export class Depth3D extends Scene3D<DepthSlice> {
  private readonly C = DEPTH_COLS;
  private readonly L = DEPTH_LEVELS;
  private readonly W = 30;
  private readonly D = 14;
  private geo!: THREE.PlaneGeometry;
  private grp!: THREE.Group;
  private mesh!: THREE.Mesh;
  private edgeGeo!: THREE.BufferGeometry;
  private cur = new Float32Array(DEPTH_COLS * DEPTH_LEVELS);
  private tgt = new Float32Array(DEPTH_COLS * DEPTH_LEVELS);
  private mxS = 0;
  private shiftT = 0;
  private shiftN = 1;
  private parts: Array<{ life: number; x?: number; y?: number; z?: number; ask?: boolean }> = [];
  private pGeo!: THREE.BufferGeometry;
  private cA!: THREE.Color;
  private cB!: THREE.Color;
  private cD!: THREE.Color;
  private cSat!: THREE.Color;
  private cW!: THREE.Color;
  private tc!: THREE.Color;

  protected override cfg(): void {
    this.dist0 = 30;
    this.pitch0 = 0.62;
    this.yaw0 = -0.5;
    this.sway = 0.1;
    this.fov = 34;
    this.fitAspect = 1.8;
  }

  /** Typical spacing between snapshots, ms. */
  private cadence(): number {
    const t = this.data.times;
    if (t.length < 2) return 120_000;
    const d = t.slice(1).map((v, i) => v - t[i]!).sort((a, b) => a - b);
    return d[Math.floor(d.length / 2)] || 120_000;
  }

  private span(ms: number): string {
    const m = Math.round(ms / 60_000);
    return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const { C, L, W, D } = this;
    this.target.set(0, 0.6, 0);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 1.0));
    const dl = new T.DirectionalLight(0xffffff, 1.6);
    dl.position.set(8, 12, 6);
    S.add(dl);
    const geo = (this.geo = new T.PlaneGeometry(W, D, C - 1, L - 1));
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute("color", new T.BufferAttribute(new Float32Array(C * L * 3), 3));
    this.grp = new T.Group();
    S.add(this.grp);
    this.mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: T.DoubleSide }));
    this.grp.add(this.mesh);
    this.grp.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x9fc3ff, wireframe: true, transparent: true, opacity: 0.05, depthWrite: false })));
    this.edgeGeo = new T.BufferGeometry();
    this.edgeGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(L * 3), 3));
    const edge = new T.Line(this.edgeGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    edge.frustumCulled = false;
    S.add(edge);
    const g: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -W / 2 + (i / 12) * W;
      g.push(x, -0.01, -D / 2, x, -0.01, D / 2);
    }
    S.add(lines(T, g, 0x161e29));
    const zMid = -D / 2 + 24.5 * (D / (L - 1));
    S.add(lines(T, [-W / 2, 0.02, zMid, W / 2, 0.02, zMid], 0xeef3f8, 0.35));
    const lb = (t: string, x: number, z: number, o: Parameters<typeof label>[2]) => {
      const s = label(T, t, o);
      s.position.set(x, 0.05, z);
      S.add(s);
      return s;
    };
    lb("ASKS", -W / 2 - 0.6, -D / 4, { size: 0.6, color: "#ff5c6c", weight: 600, anchor: "right" });
    lb("BIDS", -W / 2 - 0.6, D / 4, { size: 0.6, color: "#2ee6a6", weight: 600, anchor: "right" });
    const full = (C - 1) * this.cadence();
    lb(`−${this.span(full)}`, -W / 2, D / 2 + 1, { size: 0.5, color: "#6b7889" });
    lb(`−${this.span(full / 2)}`, 0, D / 2 + 1, { size: 0.5, color: "#6b7889" });
    lb("now", W / 2, D / 2 + 1, { size: 0.5, color: "#eef3f8", weight: 600 });
    (
      [
        [0, "+50"],
        [12.5, "+25"],
        [20, "+10"],
        [24.5, "mid"],
        [29, "−10"],
        [36.5, "−25"],
        [49, "−50"],
      ] as const
    ).forEach(([r, t]) => lb(t + (t === "mid" ? "" : " bps"), W / 2 + 0.8, -D / 2 + r * (D / (L - 1)), { size: 0.42, color: t === "mid" ? "#eef3f8" : "#6b7889", anchor: "left" }));
    this.compute(true);
    this.cur.set(this.tgt);
    const PN = 90;
    this.pGeo = ptsGeo(T, PN);
    const pp = new T.Points(this.pGeo, this.glow());
    pp.frustumCulled = false;
    S.add(pp);
    this.parts = Array.from({ length: PN }, () => ({ life: 0 }));
    this.shiftT = 0;
    this.cA = new T.Color(0xff5c6c);
    this.cB = new T.Color(0x2ee6a6);
    this.cD = new T.Color(0x0b1018);
    this.cSat = new T.Color(0x243042);
    this.cW = new T.Color(1, 1, 1);
    this.tc = new T.Color();
  }

  /** Target heights from the snapshot columns (right-aligned: the last column is the live edge). */
  private compute(reset: boolean): void {
    const { C, L } = this;
    const cols = this.data.cols;
    let mx = 0;
    cols.forEach((col) => col.forEach((v) => {
      if (v > mx) mx = v;
    }));
    this.mxS = reset || !this.mxS ? mx : this.mxS * 0.85 + mx * 0.15;
    const off = C - cols.length;
    for (let c = 0; c < C; c++) {
      const col = cols[c - off];
      for (let r = 0; r < L; r++) this.tgt[r * C + c] = col && this.mxS > 0 ? Math.pow(col[r]! / this.mxS, 0.65) * 5.2 : 0;
    }
  }

  protected override onData(prev: DepthSlice): void {
    if (prev.coin !== this.data.coin) {
      this.rebuild();
      return;
    }
    const lastPrev = prev.times[prev.times.length - 1] ?? 0;
    const added = this.data.times.filter((t) => t > lastPrev).length;
    if (added > 0 && added < this.C) {
      const { C, L } = this;
      for (let r = 0; r < L; r++) for (let c = 0; c < C - added; c++) this.cur[r * C + c] = this.cur[r * C + c + added]!;
      this.shiftT = performance.now();
      this.shiftN = added;
    }
    this.compute(added >= this.C);
  }

  protected frame(t: number, dt: number, pnow: number): void {
    const { C, L } = this;
    const pos = this.geo.attributes.position!;
    const col = this.geo.attributes.color!.array as Float32Array;
    for (let i = 0; i < C * L; i++) this.cur[i]! += (this.tgt[i]! - this.cur[i]!) * 0.12;
    const sat = this.data.sat;
    for (let r = 0; r < L; r++) {
      const ask = r < L / 2;
      const dist = ask ? L / 2 - r : r - L / 2 + 1;
      const satRow = sat && dist > 5;
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const h = this.cur[i]!;
        pos.setY(i, h);
        const v = Math.min(1, h / 5.2);
        const fresh = 0.35 + 0.65 * (c / C);
        if (satRow) this.tc.copy(this.cSat).multiplyScalar(fresh);
        else {
          this.tc.copy(this.cD).lerp(ask ? this.cA : this.cB, Math.min(1, 0.18 + v * 1.1) * fresh);
          if (v > 0.7) this.tc.lerp(this.cW, (v - 0.7) * 1.2);
        }
        col[i * 3] = this.tc.r;
        col[i * 3 + 1] = this.tc.g;
        col[i * 3 + 2] = this.tc.b;
      }
    }
    pos.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
    this.geo.computeVertexNormals();
    const dx = (this.W / (C - 1)) * this.shiftN;
    const k = this.shiftT ? Math.min(1, (pnow - this.shiftT) / 1900) : 1;
    this.grp.position.x = dx * (1 - k);
    const E = this.edgeGeo.attributes.position!.array as Float32Array;
    for (let r = 0; r < L; r++) {
      E[r * 3] = this.W / 2 + this.grp.position.x;
      E[r * 3 + 1] = this.cur[r * C + C - 1]! + 0.03;
      E[r * 3 + 2] = -this.D / 2 + r * (this.D / (L - 1));
    }
    this.edgeGeo.attributes.position!.needsUpdate = true;
    const Pt = ptsArrays(this.pGeo);
    this.parts.forEach((p, i) => {
      if (p.life <= 0 && Math.random() < 0.04) {
        const r = Math.floor(Math.random() * L);
        const h = this.cur[r * C + C - 1]!;
        if (h > 1.6) {
          p.life = 1;
          p.x = this.W / 2;
          p.z = -this.D / 2 + r * (this.D / (L - 1));
          p.y = h;
          p.ask = r < L / 2;
        }
      }
      if (p.life > 0) {
        p.life -= dt * 0.6;
        p.y = (p.y ?? 0) + dt * 1.4;
        p.x = (p.x ?? 0) - dt * 0.4;
      }
      const a = Math.max(0, p.life);
      Pt.P.set([p.x ?? 0, p.y ?? 0, p.z ?? 0], i * 3);
      Pt.C.set(p.ask ? [1, 0.4, 0.45] : [0.2, 0.95, 0.7], i * 3);
      Pt.S[i] = 0.35;
      Pt.A[i] = a * 0.9;
    });
    touch(this.pGeo);
    void t;
    if (this.mx >= 0 && this.hoverDirty) {
      this.hoverDirty = false;
      const hit = this.ray().intersectObject(this.mesh)[0];
      if (hit && hit.face) {
        const i = hit.face.a;
        const c = i % C;
        const r = Math.floor(i / C);
        const band = depthRowBand(r);
        const cols = this.data.cols;
        const ci = c - (C - cols.length);
        const v = cols[ci]?.[r];
        const at = this.data.times[ci];
        const mins = at ? Math.round((Date.now() - at) / 60_000) : null;
        const per = band.hi - band.lo;
        const color = band.ask ? "#ff5c6c" : "#2ee6a6";
        this.showTip(
          this.mx,
          this.my,
          v === undefined
            ? `<b style="color:#eef3f8">${esc(this.data.coin)}</b><br>no snapshot this far back yet`
            : `<b style="color:#eef3f8">${esc(this.data.coin)}</b> · <span style="color:${color}">${band.ask ? "ask" : "bid"} ${band.lo}–${band.hi} bps</span><br>band depth ${fmt.usd(v * (per / 2))}${sat && band.bps > 10 ? " (lower bound: beyond the 20-level window)" : ""}<br>${mins === null ? "" : mins <= 1 ? "live edge" : `≈${mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`} ago`}`,
          color,
        );
      } else this.hideTip();
    }
  }
}

// ================= volume bubbles =================

interface BubbleNode {
  row: VolRow;
  m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  mat: THREE.MeshPhysicalMaterial;
  col: THREE.Color;
  rad: number;
  home: THREE.Vector3;
  ph: number;
  sc: number;
  op: number;
  lb?: THREE.Sprite;
}

export class Bubbles3D extends Scene3D<BubblesSlice> {
  private nodes: BubbleNode[] = [];
  private gGeo!: THREE.BufferGeometry;
  private dGeo!: THREE.BufferGeometry;
  private dust: Array<{ x: number; y: number; z: number; v: number; s: number }> = [];
  private p2!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly fy = -4.4;
  private born = 0;
  private hov: BubbleNode | null = null;

  protected override cfg(): void {
    this.dist0 = 33;
    this.pitch0 = 0.28;
    this.yaw0 = 0.5;
    this.autoRot = 0.035;
    this.fov = 34;
    this.fitAspect = 2.1;
  }

  static signature(d: BubblesSlice): string {
    return d.rows.map((r) => `${r.coin}:${r.mult?.toFixed(2)}:${r.chg?.toFixed(1)}:${r.band}`).join("|");
  }

  protected override onData(prev: BubblesSlice): void {
    if (Bubbles3D.signature(prev) !== Bubbles3D.signature(this.data)) {
      this.rebuild();
      this.born = performance.now() - SETTLED;
    }
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const rows = this.data.rows;
    const r = this.renderer;
    const tm = <O extends THREE.Sprite>(o: O): O => {
      (o.material as THREE.SpriteMaterial).toneMapped = false;
      return o;
    };
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.target.set(-0.5, 2.4, 0);
    const pm = new T.PMREMGenerator(r);
    const env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(40, 40, 40), new T.MeshBasicMaterial({ color: 0x05070b, side: T.BackSide })));
    const panel = (hex: number, k: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ side: T.DoubleSide }));
      m.material.color.setHex(hex).multiplyScalar(k);
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(0xffffff, 6, 0, 18, 4, 16, 10);
    panel(0x4c9bff, 3.2, -18, 4, 6, 8, 18);
    panel(0xff7a3d, 2.6, 18, 2, -6, 8, 14);
    panel(0x2ee6a6, 1.6, 4, -6, 18, 14, 5);
    this.envTex = pm.fromScene(env, 0.03).texture;
    S.environment = this.envTex;
    pm.dispose();
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    S.add(new T.HemisphereLight(0xbfd4ff, 0x05070a, 0.35));
    const dl = new T.DirectionalLight(0xffffff, 1.4);
    dl.position.set(-6, 14, 10);
    S.add(dl);
    const X = (c: number) => (clamp(c, -15, 12) + 2) * 0.85;
    const Y = (m: number) => Math.log(clamp(m, 0.35, 14)) * 4.4;
    const Z = (oi: number) => (Math.log10(Math.max(oi, 1e4)) - 7.4) * 2.1;
    const fy = this.fy;
    const x0 = -12.2;
    const x1 = 11.2;
    const z0 = -6.4;
    const z1 = 4.8;
    const y1 = Y(1);
    const y2 = Y(2);
    const g: number[] = [];
    [-15, -10, -5, 0, 5, 10].forEach((c) => g.push(X(c), fy, z0, X(c), fy, z1));
    [1e5, 1e6, 1e7, 1e8, 1e9].forEach((v) => g.push(x0, fy, Z(v), x1, fy, Z(v)));
    S.add(lines(T, g, 0x1b2532, 0.9));
    const rect = (y: number) => [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0];
    S.add(lines(T, rect(y1), 0xeef3f8, 0.16));
    S.add(lines(T, rect(y2), 0xff7a3d, 0.55));
    this.p2 = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }));
    this.p2.rotation.x = -Math.PI / 2;
    this.p2.position.set((x0 + x1) / 2, y2, (z0 + z1) / 2);
    S.add(this.p2);
    S.add(lines(T, [x0, fy, z0, x0, Y(12), z0], 0x2a3442, 1));
    (
      [
        [0.5, "0.5×"],
        [1, "1×"],
        [2, "2×"],
        [5, "5×"],
        [10, "10×"],
      ] as const
    ).forEach(([m, t]) => {
      const l = tm(label(T, t, { size: 0.62, color: m === 2 ? "#ff7a3d" : "#6b7889", weight: 600, anchor: "right" }));
      l.position.set(x0 - 0.3, Y(m), z0);
      S.add(l);
    });
    [-15, -10, -5, 0, 5, 10].forEach((c) => {
      const l = tm(label(T, `${c > 0 ? "+" : ""}${c}%`, { size: 0.58, color: c === 0 ? "#eef3f8" : "#6b7889" }));
      l.position.set(X(c), fy, z1 + 0.9);
      S.add(l);
    });
    (
      [
        [1e5, "OI $100K"],
        [1e7, "OI $10M"],
        [1e9, "OI $1B"],
      ] as const
    ).forEach(([v, t]) => {
      const l = tm(label(T, t, { size: 0.5, color: "#5b6878", anchor: "left" }));
      l.position.set(x1 + 0.4, fy, Z(v));
      S.add(l);
    });
    const sz = tm(label(T, "2× · SURGING ZONE", { size: 0.52, color: "#ff7a3d", weight: 600, anchor: "left" }));
    sz.position.set(x1 + 0.4, y2, z0);
    S.add(sz);
    const pxl = tm(label(T, "24H PRICE CHANGE →", { size: 0.48, color: "#5b6878", weight: 600 }));
    pxl.position.set(X(0), fy, z1 + 2);
    S.add(pxl);
    const geo = new T.SphereGeometry(1, 48, 32);
    this.nodes = rows.map((row, i) => {
      const col = new T.Color(bandColor(row.band));
      const mat = new T.MeshPhysicalMaterial({
        color: col,
        roughness: 0.16,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.35,
        iridescenceIOR: 1.3,
        envMapIntensity: 1.3,
        emissive: col,
        emissiveIntensity: 0.06,
        transparent: true,
      });
      const m = new T.Mesh(geo, mat);
      m.userData.i = i;
      m.scale.setScalar(0.001);
      S.add(m);
      const mult = row.mult ?? 1;
      const n: BubbleNode = {
        row,
        m,
        mat,
        col,
        rad: 0.32 + Math.max(0, (Math.log10(Math.max(1, row.n24 ?? 1)) - 5) / 4.2) * 1.55,
        home: new T.Vector3(X(row.chg ?? 0), Y(mult), Z(row.oi ?? 1e4)),
        ph: hash(row.coin) * 7,
        sc: 1,
        op: 1,
      };
      if (mult >= 1.9 || n.rad > 1.25) {
        n.lb = tm(label(T, `${row.coin} ${mult.toFixed(1)}×`, { size: 0.52, color: "#eef3f8", weight: 600, anchor: "bottom", bg: "rgba(7,10,14,0.6)" }));
        S.add(n.lb);
      }
      return n;
    });
    const N = this.nodes.length;
    const dv = new T.Vector3();
    for (let it = 0; it < 160; it++) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = this.nodes[i]!;
          const b = this.nodes[j]!;
          dv.copy(b.home).sub(a.home);
          const Ld = dv.length() || 0.01;
          const need = a.rad + b.rad + 0.2;
          if (Ld < need) {
            dv.multiplyScalar(((need - Ld) / Ld) * 0.5);
            a.home.sub(dv);
            b.home.add(dv);
          }
        }
      }
    }
    this.gGeo = ptsGeo(T, Math.max(1, N));
    this.gGeo.setDrawRange(0, N);
    const gp = new T.Points(this.gGeo, this.glow());
    gp.frustumCulled = false;
    S.add(gp);
    const gA = ptsArrays(this.gGeo);
    this.nodes.forEach((n, i) => gA.C.set([n.col.r, n.col.g, n.col.b], i * 3));
    const D = 520;
    const dr = seeded("dust");
    this.dust = [];
    for (let i = 0; i < D; i++) this.dust.push({ x: x0 + dr() * (x1 - x0), y: fy + dr() * 17, z: z0 + dr() * (z1 - z0), v: 0.12 + dr() * 0.3, s: 0.05 + dr() * 0.1 });
    this.dGeo = ptsGeo(T, D);
    const dA = ptsArrays(this.dGeo);
    this.dust.forEach((p, i) => {
      dA.C.set([0.45, 0.65, 1], i * 3);
      dA.S[i] = p.s;
    });
    const dp = new T.Points(this.dGeo, this.glow());
    dp.frustumCulled = false;
    S.add(dp);
    if (!this.born) this.born = performance.now();
  }

  protected override onClick(): void {
    if (this.hov) window.dispatchEvent(new CustomEvent("cq:vol", { detail: this.hov.row.coin }));
  }

  protected frame(t: number, dt: number, pnow: number): void {
    const band = this.data.band || "All bands";
    const sel = this.data.sel;
    if (this.mx < 0) this.hov = null;
    else if (this.hoverDirty) {
      this.hoverDirty = false;
      const hit = this.ray().intersectObjects(this.nodes.filter((n) => n.op > 0.5).map((n) => n.m))[0];
      this.hov = hit ? (this.nodes[hit.object.userData.i as number] ?? null) : null;
      this.setCursor(this.hov ? "pointer" : "grab");
    }
    const G = ptsArrays(this.gGeo);
    this.nodes.forEach((n, i) => {
      const k = ease((pnow - this.born - i * 45) / 1100);
      const on = band === "All bands" || n.row.band === band;
      const isSel = n.row.coin === sel;
      const isHov = n === this.hov;
      n.op += ((on ? 1 : 0.1) - n.op) * 0.1;
      n.sc += ((on ? 1 : 0.55) * (isHov ? 1.15 : 1) * (isSel ? 1.1 : 1) - n.sc) * 0.12;
      const x = n.home.x + Math.sin(t * 0.45 + n.ph) * 0.18;
      const y = n.home.y + Math.sin(t * 0.8 + n.ph * 1.3) * 0.28 - (1 - k) * 8;
      const z = n.home.z + Math.cos(t * 0.5 + n.ph) * 0.18;
      const s = Math.max(0.001, n.rad * n.sc * k);
      n.m.position.set(x, y, z);
      n.m.scale.setScalar(s);
      n.mat.opacity = n.op;
      n.mat.depthWrite = n.op > 0.5;
      n.mat.emissiveIntensity = isSel ? 0.35 + 0.25 * Math.sin(t * 4) : isHov ? 0.3 : 0.06;
      G.P.set([x, y, z], i * 3);
      G.S[i] = s * (isSel ? 4.6 + Math.sin(t * 4) * 0.6 : 3.4);
      G.A[i] = (isSel ? 0.5 : 0.2) * n.op * k;
      if (n.lb) {
        n.lb.position.set(x, y + s + 0.25, z);
        (n.lb.material as THREE.SpriteMaterial).opacity = n.op * k;
      }
    });
    touch(this.gGeo, ["position", "aSize", "aAlpha"]);
    const Dd = ptsArrays(this.dGeo);
    this.dust.forEach((p, i) => {
      p.y += p.v * dt;
      if (p.y > this.fy + 17) p.y = this.fy;
      Dd.P.set([p.x + Math.sin(t * 0.3 + i) * 0.3, p.y, p.z], i * 3);
      Dd.A[i] = 0.28 * Math.sin((Math.PI * (p.y - this.fy)) / 17);
    });
    touch(this.dGeo, ["position", "aAlpha"]);
    this.p2.material.opacity = 0.04 + 0.025 * Math.sin(t * 1.5);
    if (this.hov) {
      const n = this.hov;
      const r = n.row;
      const c = BAND[r.band]?.c ?? "#5b6878";
      const [sx, sy] = this.project(n.m.position.x, n.m.position.y + n.m.scale.x, n.m.position.z);
      this.showTip(
        sx,
        sy,
        `<b style="color:#eef3f8">${esc(r.coin)}</b> · <span style="color:${c}">${(r.mult ?? 0).toFixed(2)}× · ${esc(r.band)}</span><br>24h ${fmt.usd(r.n24)} vs 30d mean ${fmt.usd(r.mean)}<br>px ${fmt.pct(r.chg)} · OI ${fmt.usd(r.oi)}<br><span style="color:#5b6878">click for 30-day series</span>`,
        c,
      );
    } else if (this.mx >= 0) this.hideTip();
  }
}

// ================= event horizon (calendar) =================

interface HorizonItem {
  e: CalEvent;
  hex: string;
  col: THREE.Color;
  z: number;
  i: number;
  op: number;
  kind: "arch" | "pillar";
  x: number;
  h: number;
  hs: number;
  topY: number;
  m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>;
  ring?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  lb?: THREE.Sprite;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const typeColor = (t: CalEvent["type"]) => (t === "Macro" ? "#ffb547" : t === "Depeg" ? "#ff5c6c" : t === "Mint" ? "#4c9bff" : "#a98bff");

export class Horizon3D extends Scene3D<HorizonSlice> {
  private readonly W = 7.6;
  private readonly NS = 150;
  private zn = 0;
  private gate!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private walls: Array<{ geo: THREE.BufferGeometry; eg: THREE.BufferGeometry }> = [];
  private dens = new Float32Array(151);
  private densCur = new Float32Array(151);
  private dMax = 0;
  private items: HorizonItem[] = [];
  private gGeo!: THREE.BufferGeometry;
  private pGeo!: THREE.BufferGeometry;
  private parts: Array<{ x: number; y: number; z: number; v: number; s: number }> = [];
  private born = 0;
  private hov: HorizonItem | null = null;

  protected override cfg(): void {
    this.dist0 = 34;
    this.pitch0 = 0.34;
    this.yaw0 = 0;
    this.sway = 0.16;
    this.fov = 38;
    this.fitAspect = 2.2;
  }

  private Z(d: number): number {
    return 10 - d * 2.2;
  }

  static signature(d: HorizonSlice): string {
    return d.events.map((e) => `${e.id}:${e.day}:${e.mag}`).join("|");
  }

  protected override onData(prev: HorizonSlice): void {
    if (Horizon3D.signature(prev) !== Horizon3D.signature(this.data)) {
      this.rebuild();
      this.born = performance.now() - SETTLED;
    } else if (prev.filter !== this.data.filter) this.calcDens(this.data.filter);
  }

  protected build(): void {
    const T = this.T;
    const S = this.scene;
    const evs = this.data.events;
    const Z = (d: number) => this.Z(d);
    const W = this.W;
    this.target.set(0, 1.6, -14);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x05070a, 0.9));
    const dl = new T.DirectionalLight(0xffffff, 1.2);
    dl.position.set(4, 12, 10);
    S.add(dl);
    const g: number[] = [];
    const gw: number[] = [];
    for (let d = 0; d <= 31; d++) {
      const z = Z(d);
      const dt = new Date(this.data.today + d * 864e5);
      (dt.getDay() === 1 ? gw : g).push(-W, 0, z, W, 0, z);
      if (d % 2 === 0 && d < 31) {
        const l = label(T, `${dt.getDate()} ${MON[dt.getMonth()]}`, { size: 0.62, color: d === 0 ? "#eef3f8" : "#6b7889", weight: d === 0 ? 600 : 500, anchor: "right" });
        l.position.set(-W - 0.6, 0, z);
        S.add(l);
      }
    }
    S.add(lines(T, g, 0x18212c, 0.9));
    S.add(lines(T, gw, 0x2a3646, 1));
    S.add(lines(T, [-W, 0, Z(0), -W, 0, Z(31), W, 0, Z(0), W, 0, Z(31)], 0x2a3646, 1));
    const zn = (this.zn = Z(0.77));
    S.add(lines(T, [-W, 0, zn, -W, 7, zn, -W, 7, zn, W, 7, zn, W, 7, zn, W, 0, zn, -W, 0, zn, W, 0, zn], 0xeef3f8, 0.75));
    this.gate = new T.Mesh(new T.PlaneGeometry(W * 2, 7), new T.MeshBasicMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.04, side: T.DoubleSide, depthWrite: false }));
    this.gate.position.set(0, 3.5, zn);
    S.add(this.gate);
    const nl = label(T, "NOW", { size: 0.8, color: "#eef3f8", weight: 600, anchor: "bottom" });
    nl.position.set(0, 7.25, zn);
    S.add(nl);
    this.walls = [-1, 1].map((side) => {
      const n = this.NS + 1;
      const pos = new Float32Array(n * 6);
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const z = Z((i / this.NS) * 31);
        pos.set([side * (W + 0.05), 0, z, side * (W + 0.05), 0, z], i * 6);
        if (i < n - 1) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xa98bff, transparent: true, opacity: 0.11, side: T.DoubleSide, depthWrite: false }));
      m.frustumCulled = false;
      S.add(m);
      const eg = new T.BufferGeometry();
      eg.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
      const ln = new T.Line(eg, new T.LineBasicMaterial({ color: 0xc7b4ff, transparent: true, opacity: 0.85 }));
      ln.frustumCulled = false;
      S.add(ln);
      return { geo, eg };
    });
    this.dens = new Float32Array(this.NS + 1);
    this.densCur = new Float32Array(this.NS + 1);
    this.dMax = 0;
    this.calcDens("All types");
    this.dMax = Math.max(...this.dens) || 1;
    this.calcDens(this.data.filter);
    const box = new T.BoxGeometry(0.42, 1, 0.42);
    box.translate(0, 0.5, 0);
    const ringG = new T.RingGeometry(0.55, 0.7, 40);
    const archR = W - 0.7;
    const arch = new T.TorusGeometry(archR, 0.1, 10, 80, Math.PI);
    this.items = evs.map((e, i) => {
      const hex = typeColor(e.type);
      const col = new T.Color(hex);
      const day = e.day === 0 ? 0.95 : e.day + 0.5;
      const z = Z(day);
      let it: HorizonItem;
      if (e.type === "Macro") {
        const hs = 0.22 + e.mag * 1.05;
        const m = new T.Mesh(arch, new T.MeshBasicMaterial({ color: col, transparent: true }));
        m.position.set(0, 0, z);
        it = { e, hex, col, z, i, op: 1, kind: "arch", x: 0, h: 0, hs, topY: archR * hs, m };
      } else {
        const h = hash(e.sym + e.id);
        const sd = h < 0.5 ? -1 : 1;
        const x = sd * (1.5 + ((h * 7.31) % 1) * 4.6);
        const ph = 0.8 + e.mag * 9;
        const m = new T.Mesh(box, new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2, transparent: true }));
        m.position.set(x, 0, z);
        const ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.02, z);
        S.add(ring);
        it = { e, hex, col, z, i, op: 1, kind: "pillar", x, h: ph, hs: 0, topY: ph, m, ring };
      }
      it.m.userData.it = it;
      S.add(it.m);
      if (e.mag >= 0.4) {
        const txt = e.sym === "market-wide" ? `${e.size} · ${e.mag.toFixed(2)}` : `${e.sym} ${e.size.split(",")[0]}`;
        it.lb = label(T, txt, { size: 0.62, color: "#eef3f8", weight: 600, anchor: "bottom", bg: "rgba(7,10,14,0.7)" });
        S.add(it.lb);
      }
      return it;
    });
    this.gGeo = ptsGeo(T, Math.max(1, this.items.length));
    this.gGeo.setDrawRange(0, this.items.length);
    const gp = new T.Points(this.gGeo, this.glow());
    gp.frustumCulled = false;
    S.add(gp);
    const gA = ptsArrays(this.gGeo);
    this.items.forEach((it, i) => gA.C.set([it.col.r, it.col.g, it.col.b], i * 3));
    const P = 460;
    const pr = seeded("hz");
    this.parts = [];
    for (let i = 0; i < P; i++) this.parts.push({ x: (pr() * 2 - 1) * W, y: pr() * 0.6, z: Z(pr() * 31), v: 1.2 + pr() * 2.4, s: 0.06 + pr() * 0.12 });
    this.pGeo = ptsGeo(T, P);
    const pA = ptsArrays(this.pGeo);
    this.parts.forEach((p, i) => {
      pA.C.set([0.72, 0.62, 1], i * 3);
      pA.S[i] = p.s;
    });
    const pp = new T.Points(this.pGeo, this.glow());
    pp.frustumCulled = false;
    S.add(pp);
    if (!this.born) this.born = performance.now();
  }

  private calcDens(f: string): void {
    const evs = this.data.events.filter((e) => f === "All types" || e.type === f);
    for (let i = 0; i <= this.NS; i++) {
      const t = (i / this.NS) * 31;
      let s = 0;
      evs.forEach((e) => {
        s += e.mag * Math.exp(-Math.pow(t - (e.day + 0.5), 2) / 2.2);
      });
      this.dens[i] = this.dMax ? (s / this.dMax) * 6 : s;
    }
  }

  protected frame(t: number, dt: number, pnow: number): void {
    const f = this.data.filter;
    for (let i = 0; i <= this.NS; i++) this.densCur[i]! += (this.dens[i]! - this.densCur[i]!) * 0.06;
    const grow = ease((pnow - this.born) / 1600);
    this.walls.forEach((w) => {
      const p = w.geo.attributes.position!.array as Float32Array;
      const e = w.eg.attributes.position!.array as Float32Array;
      for (let i = 0; i <= this.NS; i++) {
        const h = this.densCur[i]! * grow;
        p[i * 6 + 4] = h;
        e[i * 3] = p[i * 6]!;
        e[i * 3 + 1] = h;
        e[i * 3 + 2] = p[i * 6 + 2]!;
      }
      w.geo.attributes.position!.needsUpdate = true;
      w.eg.attributes.position!.needsUpdate = true;
    });
    const G = ptsArrays(this.gGeo);
    this.items.forEach((it, i) => {
      const e = it.e;
      const on = f === "All types" || e.type === f;
      const k = ease((pnow - this.born - 300 - e.day * 55) / 900);
      const soon = e.day <= 2;
      const pulse = soon ? 0.5 + 0.5 * Math.sin(t * 4 + i) : 0;
      it.op += ((on ? 1 : 0.1) - it.op) * 0.1;
      const y = it.kind === "arch" ? it.topY * k : it.h * k;
      if (it.kind === "arch") {
        it.m.scale.set(1, Math.max(0.001, it.hs * k), 1);
        it.m.material.opacity = it.op * (0.75 + 0.25 * pulse);
      } else {
        it.m.scale.set(1, Math.max(0.001, it.h * k), 1);
        const mat = it.m.material as THREE.MeshStandardMaterial;
        mat.opacity = it.op;
        mat.emissiveIntensity = 0.5 + pulse * 0.6 + (it === this.hov ? 0.6 : 0);
        const ph = (t * 0.7 + i * 0.13) % 1;
        if (it.ring) {
          it.ring.scale.setScalar(1 + (e.day <= 7 ? ph * 2.4 : 0));
          it.ring.material.opacity = (e.day <= 7 ? 0.6 * (1 - ph) : 0.18) * it.op;
        }
      }
      G.P.set([it.x, y, it.z], i * 3);
      G.S[i] = (1.1 + e.mag * 2.6) * (1 + pulse * 0.5) * k;
      G.A[i] = (0.55 + pulse * 0.4) * it.op;
      if (it.lb) {
        it.lb.position.set(it.x, y + 0.35, it.z);
        (it.lb.material as THREE.SpriteMaterial).opacity = it.op * k;
      }
    });
    touch(this.gGeo, ["position", "aSize", "aAlpha"]);
    const Pp = ptsArrays(this.pGeo);
    const z0 = this.Z(31);
    const z1 = this.zn;
    this.parts.forEach((p, i) => {
      p.z += p.v * dt;
      if (p.z > z1) p.z = z0;
      Pp.P.set([p.x, p.y + 0.05, p.z], i * 3);
      const u = (p.z - z0) / (z1 - z0);
      Pp.A[i] = 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
    });
    touch(this.pGeo, ["position", "aAlpha"]);
    this.gate.material.opacity = 0.035 + 0.025 * Math.sin(t * 2.2);
    if (this.mx < 0) this.hov = null;
    else if (this.hoverDirty) {
      this.hoverDirty = false;
      const hit = this.ray().intersectObjects(this.items.filter((it) => it.op > 0.5).map((it) => it.m))[0];
      this.hov = hit ? ((hit.object.userData.it as HorizonItem) ?? null) : null;
      this.setCursor(this.hov ? "pointer" : "grab");
    }
    if (this.hov) {
      const it = this.hov;
      const e = it.e;
      const [sx, sy] = this.project(it.x, it.kind === "arch" ? it.topY : it.h, it.z);
      this.showTip(
        sx,
        sy,
        `<b style="color:#eef3f8">${esc(e.name)}</b><br><span style="color:${it.hex}">${e.type}</span> · ${esc(e.date)} · ${esc(e.rel)}<br>magnitude ${e.mag.toFixed(2)} · bias ${esc(e.bias)}<br>${esc(e.size)}${e.size ? " · " : ""}${esc(e.src)}`,
        it.hex,
      );
    } else if (this.mx >= 0) this.hideTip();
  }
}
