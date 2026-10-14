(function () {
if (window.CQ) return;
let seed = 1337;
function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss(r = rnd) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function seeded(str) { let s = Math.floor(hash(str) * 1e9); return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (s) => { s = String(s).replace(/[$,≥+]/g, ''); const m = { K: 1e3, M: 1e6, B: 1e9 }[s.slice(-1)]; return m ? parseFloat(s) * m : parseFloat(s); };
function weighted(pairs) { const tot = pairs.reduce((a, p) => a + p[1], 0); let r = rnd() * tot; for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; } return pairs[0][0]; }

const fmt = {
  usd(v) { const a = Math.abs(v), s = v < 0 ? '-' : ''; if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K'; return s + '$' + Math.round(a); },
  px(p) { if (p >= 1000) return Math.round(p).toLocaleString('en-US'); if (p >= 100) return p.toFixed(2); if (p >= 1) return p.toFixed(3); if (p >= 0.01) return p.toFixed(4); return p.toFixed(6); },
  pct(v, dp = 1) { return (v > 0 ? '+' : v < 0 ? '' : '') + v.toFixed(dp) + '%'; },
  time(ts) { const d = new Date(ts); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); },
  dur(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60); return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's'; },
  ago(sec) { if (sec < 60) return Math.max(0, Math.floor(sec)) + 's ago'; if (sec < 3600) return Math.floor(sec / 60) + 'm ago'; return Math.floor(sec / 3600) + 'h ago'; }
};

const C = { long: '#2ee6a6', short: '#ff5c6c', blue: '#4c9bff', amber: '#ffb547', violet: '#a98bff', orange: '#ff7a3d', ink: '#e6edf5', mute: '#8b98a9', dim: '#5b6878' };
const REG = {
  BULL: { label: 'Strong trend (bull)', color: C.long }, BEAR: { label: 'Strong trend (bear)', color: C.short },
  RANGE: { label: 'Range / low vol', color: C.blue }, CHOP: { label: 'Choppy / high vol', color: C.amber },
  SQZ: { label: 'Squeeze / coiled', color: C.violet }, SPIKE: { label: 'Vol spike', color: C.orange }
};

// ---------- KPIs ----------
const kpis = [
  { key: 'btcDom', label: 'BTC dominance', base: 59.1, vol: 0.0003, f: v => v.toFixed(1) + '%' },
  { key: 'stable', label: 'Stablecoin mcap', base: 310.92e9, vol: 0.00002, f: fmt.usd },
  { key: 'hlVol', label: 'HL 24h volume', base: 4.31e9, vol: 0.0008, f: fmt.usd },
  { key: 'btcOi', label: 'BTC OI · all venues', base: 14.08e9, vol: 0.0004, f: fmt.usd },
  { key: 'hlOi', label: 'HL open interest', base: 11.78e9, vol: 0.0004, f: fmt.usd },
  { key: 'liq24', label: '24h liquidations', base: 40.2e6, vol: 0.0008, f: fmt.usd },
  { key: 'ls', label: 'L/S ratio', base: 1.29, vol: 0.0012, f: v => v.toFixed(2) },
  { key: 'whale', label: 'Whale short share', base: 54.6, vol: 0.0006, f: v => v.toFixed(1) + '%' },
  { key: 'fg', label: 'Fear & greed', base: 58, vol: 0.003, f: v => String(Math.round(v)) }
];
const kpiHist = {};
kpis.forEach(k => { k.v = k.base; kpiHist[k.key] = []; for (let i = 0; i < 60; i++) { k.v += (k.base - k.v) * 0.03 + k.base * k.vol * gauss() * 1.4; kpiHist[k.key].push(k.v); } });

// ---------- prices ----------
const px = { BTC: 83818, ETH: 2516, SOL: 107.78, HYPE: 81.731, ZEC: 1255, NEAR: 5.057, PUMP: 0.005033, XRP: 1.377, STRK: 0.0824, WLD: 0.5130, XMR: 552.99, PONS: 0.3304, ENA: 0.2106, UNI: 7.403, VVV: 23.577, S: 0.0568, ZRO: 2.063, ONDO: 0.4670, XPL: 0.0819, INJ: 8.106, RENDER: 2.006, SUI: 1.057, CRV: 0.3343, LIT: 3.351, AAVE: 160.45 };

// ---------- regime model ----------
const regime = {
  name: 'Range / Low Volatility', code: 'RANGE', conf: 96, raw: 96, inRegime: 5 * 3600 + 34 * 60 + 12,
  volSpike: 3.0, drop5: 4.6, p5: -4.4, p50: 0.22, p95: 4.7, headConf: 6, barAge: 22,
  outcome: [{ k: 'Strong down', v: 10, c: '#ff5c6c' }, { k: 'Mild down', v: 22, c: '#c9505c' }, { k: 'Flat', v: 33, c: '#56606d' }, { k: 'Mild up', v: 24, c: '#1fa67a' }, { k: 'Strong up', v: 11, c: '#2ee6a6' }],
  vol: [{ k: 'Low', v: 39 }, { k: 'Medium', v: 36 }, { k: 'High', v: 25 }],
  liqRisk: [{ k: 'Low', v: 35 }, { k: 'Medium', v: 33 }, { k: 'High', v: 32 }],
  next24: [{ k: 'Stays', code: 'RANGE', v: 42 }, { k: 'SQZ', code: 'SQZ', v: 24 }, { k: 'CHOP', code: 'CHOP', v: 12 }, { k: 'BULL', code: 'BULL', v: 12 }, { k: 'BEAR', code: 'BEAR', v: 8 }, { k: 'SPIKE', code: 'SPIKE', v: 2 }]
};
const model = [
  ['Status', 'loaded'], ['Model', 'HMM v2.0.0 (features fv2)'], ['Last retrain', '21 Jun, 03:03 (115d 15h ago)'], ['Last inference', '14 Oct, 18:06'],
  ['Universe', '178 active / 234 tracked / 179 warmed up'], ['Labels', 'BULL · BEAR · RANGE · CHOP · SPIKE · SQZ'],
  ['Validation', '5 walk-forward folds, mean OOS loglik −9.44, max flap 1.14/day'], ['Anchor checks', '10/10 historical anchors matched'],
  ['Drift (7d loglik)', '−7.90 vs baseline −9.44 (z 1.45)'], ['sha256', 'c5d498980c79428bc315938fd1562c318a8cc1a4543988c5cad2c3573afa9701']
];
const health = [{ k: 'Combined', v: 62, tag: 'NEUTRAL', c: C.blue }, { k: 'Long-term', v: 77, tag: 'BULLISH', c: C.long }, { k: 'Short-term', v: 47, tag: 'BEARISH', c: C.short }];

const REGIME_COINS = {
  BULL: 'GRASS:98 TRX:98 CHIP:98 TIA:98 FIL:98 INJ:98 APT:56 DOT:98 OP:98 MET:98 ATOM:98 STX:98 ZK:98 LINEA:98 ALT:98 INIT:59 DYM:98 YGG:38 HYPER:98',
  BEAR: 'CRV:98 LDO:38 PENGU:58 SYRUP:98 BCH:53 NIL:92 SEI:52 GRIFFAIN:98 MELANIA:38 MINA:98 FOGO:38',
  RANGE: 'ETH:38 HYPE:98 SOL:98 ZEC:60 NEAR:98 XRP:98 PUMP:98 LIT:98 ENA:98 DOGE:38 ZRO:98 UNI:38 WLD:98 VVV:98 LINK:38 AAVE:98 SUI:98 XMR:55 TAO:98 XPL:98 ONDO:98 MON:98 ADA:98 AERO:60 LTC:98 GRAM:98 ASTER:98 AVAX:64 ARB:98 XLM:98 JUP:98 FET:98 HBAR:98 PURR:55 TRUMP:55 PENDLE:98 ALGO:98 MEGA:98 VIRTUAL:98 POL:98 CC:98 WIF:98 MNT:98 IMX:98 JTO:98 EIGEN:75 ICP:38 ETC:98 CAKE:60 ENS:86 0G:38 DYDX:98 SAND:38 BOME:38 POPCAT:98 AR:98 BERA:52 KAS:98 APEX:52 REZ:60 IOTA:55 STBL:58 HMSTR:98 RUNE:98 APE:97 2Z:52 GMX:95 PNUT:98 GOAT:91 ZEN:38 BSV:98 BIO:98 ZORA:98 ZETA:98 SUPER:98 AVNT:55 MERL:82 GALA:98 AXS:98 NEO:98 SNX:98 ORDI:98 LAYER:98 SKR:38 MEME:96 CELO:98 MOODENG:98 MOVE:98 USUAL:98 ACE:61 NOT:98 TURBO:98 NXPC:44 BRETT:98 ANIME:72 FORM:98 AIXBT:98 PROVE:58 TNSR:98 ZRC:98 BLAST:41 SCR:98 MAV:98 IP:98 WCT:66 SOPH:98 POLYX:98 STG:98 MEW:98 CHILLGUY:47 DOOD:98 BANANA:98 BIGTIME:98',
  CHOP: '',
  SQZ: 'BTC:98 KAITO:98 W:91 BNB:98 PAXG:98 kPEPE:98 kBONK:84 kSHIB:98 TON:98 FARTCOIN:63 SPX:98 JELLY:52 VINE:98 PROMPT:71 TST:98 BABY:98 OM:57 RESOLV:98 HEMI:49 SAHARA:98',
  SPIKE: 'S:98 STRK:98 RENDER:98 BLUR:96 RSR:98 PEOPLE:88 AZTEC:98 IO:74 SAGA:98 PYTH:98 ME:61 MANTA:98 ARK:55'
};
const regimeCoins = [];
Object.entries(REGIME_COINS).forEach(([code, s]) => s.split(' ').filter(Boolean).forEach(tok => { const [coin, c] = tok.split(':'); regimeCoins.push({ coin, code, conf: +c }); }));
const regimeOrder = ['BULL', 'BEAR', 'RANGE', 'CHOP', 'SQZ', 'SPIKE'];

// ---------- cycle ----------
const cycle = {
  phase: 10, progress: 0.18, sub: 'Early distribution', since: '27 Sep', daysIn: 17,
  phases: [
    { n: 1, name: 'Capitulation', group: 'Markdown', c: '#ff5c6c' },
    { n: 2, name: 'Accumulation / base', group: 'Accumulation', c: '#4c9bff' },
    { n: 3, name: 'Early markup', group: 'Accumulation', c: '#4c9bff' },
    { n: 4, name: 'Trend expansion', group: 'Markup', c: '#2ee6a6' },
    { n: 5, name: 'Mid-cycle reset', group: 'Markup', c: '#2ee6a6' },
    { n: 6, name: 'Late markup', group: 'Markup', c: '#2ee6a6' },
    { n: 7, name: 'Euphoria / blow-off', group: 'Peak', c: '#ffb547' },
    { n: 8, name: 'Peak formation', group: 'Peak', c: '#ffb547' },
    { n: 9, name: 'Blow-off reversal', group: 'Distribution', c: '#ff7a3d' },
    { n: 10, name: 'Distribution / Post-Peak Deleveraging', group: 'Distribution', c: '#ff7a3d' }
  ],
  playbook: [
    { k: 'Leverage', v: 'Cut gross. Funding stays near baseline while OI bleeds — deleveraging, not capitulation.' },
    { k: 'Rotation', v: 'Favour BTC over alts. Dominance at 59.1% and rising is typical of post-peak phases.' },
    { k: 'Entries', v: 'Fade rallies into short liquidation clusters; avoid chasing breakouts in RANGE regime.' },
    { k: 'Exit signal', v: 'Phase rolls to Capitulation if long-term health drops below 40 with a liquidation spike.' }
  ],
  history: [{ p: 6, d: 41 }, { p: 7, d: 23 }, { p: 8, d: 30 }, { p: 9, d: 19 }, { p: 10, d: 17 }]
};

// ---------- liquidations ----------
const liqRolling = [
  { k: '1h', L: 73.0e3, S: 1.23e6 }, { k: '4h', L: 1.3e6, S: 1.4e6 }, { k: '12h', L: 2.6e6, S: 5.8e6 }, { k: '24h', L: 14.3e6, S: 11.3e6 }
];
const HEAT = 'ETH 4.7M 65|BTC 4.6M 44|SOL 3.1M 53|ZEC 2.1M 35|NEAR 1.8M 61|STRK 1.4M 50|S 804.5K 57|XRP 788.0K 73|DOGE 604.0K 36|OP 599.4K 37|W 418.9K 71|SUI 358.2K 71|UNI 340.1K 60|WLD 301.9K 67|HYPE 276.2K 85|INJ 266.7K 67|TIA 220.3K 67|FIL 192.3K 52|PUMP 187.8K 78|ADA 146.4K 90|PONS 114.3K 37|ZRO 108.9K 90|BLUR 101.2K 79|STX 92.7K 40';
const liqHeat = HEAT.split('|').map(r => { const [coin, v, l] = r.split(' '); return { coin, v: num(v), l: +l }; });
const byExchange = [{ k: 'Bybit', L: 36.4e3, S: 268.3e3 }, { k: 'OKX', L: 76.1e3, S: 144.8e3 }, { k: 'Hyperliquid', L: 0, S: 148.5e3 }];

const TAPE0 = '18:34:03 GPS S 615 Bybit|18:33:04 GPS L 1.1K Bybit|18:33:03 GPS L 4.9K Okx|18:32:54 GPS L 522 Okx|18:32:53 GPS L 716 Okx|18:32:19 SNDK L 1.7K Okx|18:31:44 OP L 619 Okx|18:31:39 SNDK L 39.3K Okx|18:31:34 GPS L 1.3K Bybit|18:30:32 GPS L 585 Okx|18:30:32 GPS L 784 Bybit|18:30:31 GPS L 727 Okx|18:30:14 CNPY L 1.7K Okx|18:29:41 WAL L 329 Bybit|18:28:45 XPL L 655 Okx|18:28:40 Q S 277 Bybit|18:28:31 SOL L 311 Bybit|18:27:48 CNPY L 300 Okx|18:27:32 S L 3.3K Okx|18:27:32 CNPY L 2.5K Okx|18:27:32 PONS L 2.3K Okx|18:27:32 CASHCAT L 3.0K Okx|18:26:54 GPS L 980 Bybit';
const toSec = s => { const [h, m, x] = s.split(':').map(Number); return h * 3600 + m * 60 + x; };
const now0 = Date.now();
let liqId = 0;
const tape = TAPE0.split('|').map(r => { const [t, coin, side, size, venue] = r.split(' '); return { id: ++liqId, ts: now0 - 6000 - (toSec('18:34:03') - toSec(t)) * 1000, coin, side, size: num(size), venue }; });
const LIQ_POOL = [['GPS', 6], ['ETH', 5], ['BTC', 5], ['SOL', 3], ['HYPE', 3], ['SNDK', 2], ['CNPY', 2], ['ZEC', 2], ['SUI', 2], ['OP', 2], ['S', 2], ['XPL', 1], ['WAL', 1], ['Q', 1], ['PONS', 1], ['CASHCAT', 1], ['DOT', 1], ['RENDER', 1], ['LINEA', 1], ['QNT', 1], ['STRK', 1], ['NEAR', 1], ['DOGE', 1], ['FARTCOIN', 1]];
const squeeze = { threshold: 35, window: '5m', venues: 'okx+bybit+hyperliquid', coins: [
  { coin: 'GPS', sev: 41, side: 'L' }, { coin: 'SNDK', sev: 38, side: 'L' }, { coin: 'CNPY', sev: 36, side: 'L' }, { coin: 'ZEC', sev: 27, side: 'S' }, { coin: 'S', sev: 24, side: 'L' },
  { coin: 'ETH', sev: 21, side: 'L' }, { coin: 'OP', sev: 19, side: 'S' }, { coin: 'SOL', sev: 16, side: 'L' }, { coin: 'HYPE', sev: 14, side: 'L' }, { coin: 'SUI', sev: 12, side: 'S' }, { coin: 'BTC', sev: 9, side: 'S' }, { coin: 'XPL', sev: 7, side: 'L' }
] };

// ---------- gamma ----------
const gamma = {
  order: ['BTC', 'ETH', 'SOL', 'HYPE'],
  coins: {
    BTC: { inv: -91.3e6, flip: 102723, dealers: 101, funding: 0.0013, L: 49.9e6, S: 141.2e6, score: -0.55, conf: 1.0, fuel: 'balanced', since: '14 Oct, 18:14', note: 'funding near baseline; no cluster near mark; flip line far from mark; balanced positioning (mm skew mid-range)', pct: [38, 84, 54, 14, 67] },
    ETH: { inv: -130.7e6, flip: 1998, dealers: 106, funding: 0.0013, L: 44.1e6, S: 174.8e6, score: -0.41, conf: 0.94, fuel: 'short-heavy', since: '14 Oct, 16:52', note: 'funding near baseline; dense short cluster 6–9% above mark; flip below mark; dealers net short', pct: [61, 72, 31, 22, 58] },
    SOL: { inv: -54.3e6, flip: 133.21, dealers: 79, funding: 0.0013, L: 469.5e3, S: 54.8e6, score: -0.62, conf: 0.97, fuel: 'short-heavy', since: '14 Oct, 11:20', note: 'almost no long fuel below; shorts stacked above mark; flip line far above; mm skew extreme', pct: [22, 88, 93, 11, 64] },
    HYPE: { inv: 15.2e6, flip: 65.964, dealers: 114, funding: 0.0013, L: 50.8e6, S: 35.6e6, score: -0.18, conf: 0.81, fuel: 'long-heavy', since: '14 Oct, 17:40', note: 'long cluster 4% below mark; flip below; dealers net long — dampening into dips', pct: [74, 66, 47, 39, 71] }
  },
  pctLabels: ['Near-mark density', '|Distance to flip|', 'MM skew', 'Regime score', 'Funding']
};
function genProfile(coin) {
  const g = gamma.coins[coin], r = seeded('gex' + coin), prof = new Array(101).fill(0).map(() => ({ L: 0, S: 0 }));
  if (coin === 'BTC') {
    [[-50, 27], [-47, 10], [-41, 1], [-29, 0.3], [-12, 0.6], [-9, 1.1], [-8, 2.5], [-4, 3.5], [-2, 0.4]].forEach(([i, v]) => prof[i + 50].L = v * 1e6);
    [[1, 1.0], [18, 0.7], [20, 7], [25, 24], [28, 2], [30, 1], [34, 7], [41, 0.4], [48, 4], [50, 88]].forEach(([i, v]) => prof[i + 50].S = v * 1e6);
  } else {
    const k = 9 + Math.floor(r() * 5);
    for (let j = 0; j < k; j++) { const i = 1 + Math.floor(Math.pow(r(), 0.8) * 49); prof[50 - i].L += Math.pow(r(), 3) * 1 + 0.02; }
    for (let j = 0; j < k; j++) { const i = 1 + Math.floor(Math.pow(r(), 0.8) * 49); prof[50 + i].S += Math.pow(r(), 3) * 1 + 0.02; }
    prof[0].L += 0.6 + r(); prof[100].S += 0.8 + r();
    const sl = prof.reduce((a, b) => a + b.L, 0), ss = prof.reduce((a, b) => a + b.S, 0);
    prof.forEach(b => { b.L = b.L / sl * g.L; b.S = b.S / ss * g.S; });
  }
  prof.forEach((b, i) => { if (!b.L && i < 50 && r() < 0.35) b.L = r() * 2e5; if (!b.S && i > 50 && r() < 0.35) b.S = r() * 2e5; });
  return prof;
}
gamma.order.forEach(c => { gamma.coins[c].profile = genProfile(c); });
function genClusters(coin) {
  if (coin === 'BTC') return [[85284, 1.75, 'S', 8.0e6, 2], [84865, 1.25, 'S', 17.4e6, 2], [84446, 0.75, 'S', 8.3e6, 4], [82770, -1.25, 'L', 4.5e6, 2], [82351, -1.75, 'L', 295.6e3, 3], [81932, -2.25, 'L', 2.7e6, 2]];
  const r = seeded('cl' + coin), p = px[coin], out = [];
  [2.25, 1.5, 0.75].forEach(d => out.push([p * (1 + d / 100), d, 'S', Math.pow(r(), 2) * 12e6 + 2e5, 1 + Math.floor(r() * 5)]));
  [-1.0, -1.75, -2.5].forEach(d => out.push([p * (1 + d / 100), d, 'L', Math.pow(r(), 2) * 9e6 + 2e5, 1 + Math.floor(r() * 5)]));
  return out;
}

// ---------- volume scanner ----------
const VOL = 'S 0.0569 -2.1 14.3M 3.8 1.3M 530.1K 10.8 1.5M extreme|BLUR 0.0106 -13.8 2.9M 31.0 359.2K 173.4K 8.15 1.1M extreme|RSR 0.002022 0.1 2.9M -58.0 572.7K 75.2K 5.04 1.6M surging|RENDER 2.005 -7.2 10.7M -12.0 2.4M 1.2M 4.55 3.8M surging|OP 0.1515 9.2 7.5M 25.8 1.8M 1.5M 4.11 5.9M surging|ZK 0.0161 7.1 4.1M 3.2 1.1M 484.1K 3.79 3.3M surging|STX 0.4447 3.6 5.7M -54.5 1.7M 1.0M 3.25 3.9M surging|AZTEC 0.0205 -4.1 2.5M -20.0 864.1K 481.8K 2.85 3.1M elevated|PYTH 0.0825 -3.3 4.6M 2.0 1.6M 810.6K 2.84 5.4M elevated|GMX 8.501 -0.3 535.6K 5.8 193.5K 174.2K 2.77 1.2M elevated|PEOPLE 0.007977 0.4 528.3K -67.0 205.9K 150.4K 2.57 364.1K elevated|ALT 0.008303 0.8 478.8K -11.0 214.3K 158.2K 2.23 915.9K elevated|SYRUP 0.2299 -12.1 3.3M -23.9 1.6M 1.5M 2.06 8.1M elevated|TIA 0.5561 -8.7 5.5M -44.9 2.8M 1.6M 1.92 11.2M elevated|INIT 0.1233 -0.0 487.0K -16.0 271.9K 232.6K 1.79 505.2K elevated|INJ 8.104 1.3 11.3M -8.0 6.6M 5.3M 1.72 9.6M elevated|SEI 0.0654 1.8 3.6M -12.6 2.1M 1.7M 1.71 4.5M elevated|W 0.0166 -14.3 6.9M -37.7 4.1M 1.0M 1.69 6.1M elevated|CC 0.1224 -1.2 3.2M -0.7 1.9M 1.5M 1.67 6.5M elevated|MERL 0.0302 -4.5 328.1K -41.9 229.7K 189.5K 1.43 598.4K normal|STRK 0.0822 -5.2 29.7M -41.5 21.8M 4.2M 1.36 36.9M normal|HYPER 0.0725 -0.1 138.1K -38.7 102.7K 81.2K 1.34 58.5K normal|ATOM 1.807 -1.9 1.8M -24.9 1.4M 874.9K 1.30 4.2M normal|APT 0.8263 -2.3 5.1M -29.2 4.0M 4.1M 1.28 6.6M normal|BOME 0.000790 -0.6 492.0K 16.7 435.0K 295.9K 1.13 2.1M normal|XMR 553.24 1.6 22.1M 11.5 19.9M 14.9M 1.11 67.2M normal|SKR 0.0160 -1.4 871.1K -6.9 836.9K 676.8K 1.04 385.5K normal|DYDX 0.1340 -1.0 369.6K -13.9 361.4K 292.2K 1.02 2.2M normal|IO 0.1651 -2.0 593.1K -28.3 627.6K 367.0K 0.94 1.0M normal|ZEC 1255 3.4 74.2M -9.1 84.3M 79.0M 0.88 611.5M normal|SUI 1.057 -1.1 58.0M -14.2 71.6M 66.0M 0.81 67.9M normal|ETH 2515 -0.6 812.0M -10.4 1.14B 1.06B 0.71 2.74B quiet|HYPE 81.758 0.9 188.0M -6.2 284.8M 270.0M 0.66 1.66B quiet|BTC 83795 -0.4 1.42B -12.0 2.29B 2.10B 0.62 3.19B quiet|SOL 107.74 -1.3 214.0M -18.6 369.0M 342.0M 0.58 632.1M quiet|XRP 1.377 -0.8 96.0M -21.3 174.5M 158.0M 0.55 260.7M quiet|DOGE 0.1712 -2.2 61.0M -16.7 124.5M 110.2M 0.49 188.3M quiet|NEAR 5.057 0.4 22.4M -19.0 49.8M 44.1M 0.45 355.7M quiet';
const volRows = VOL.split('|').map(r => {
  const [coin, p, chg, n24, dDay, mean, med, mult, oi, band] = r.split(' ');
  const rr = seeded('v' + coin), m = +mult, s7 = [], s30 = [];
  for (let i = 0; i < 14; i++) { const t = i / 13; s7.push(1 + gauss(rr) * 0.18 + (t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * (m - 1) : 0)); }
  for (let i = 0; i < 30; i++) { s30.push(Math.max(0.15, 1 + gauss(rr) * 0.3 + (rr() < 0.08 ? rr() * 2 : 0))); }
  s30[29] = m;
  return { coin, price: +p, chg: +chg, n24: num(n24), dDay: +dDay, mean: num(mean), med: num(med), mult: m, oi: num(oi), band, s7, s30 };
});
const volStats = { total: 4.24e9, perps: 178, mult: 0.68, at2x: 13, surging: 13, top: 'S', topMult: 10.8, topN: 14.3e6, topMean: 1.3e6 };
const BAND = { extreme: { c: '#ff5c6c' }, surging: { c: '#ff7a3d' }, elevated: { c: '#ffb547' }, normal: { c: '#4c9bff' }, quiet: { c: '#5b6878' } };

// ---------- order books ----------
const BOOKS = 'BTC 0.12 ≥10.8M ≥10.8M ≥10.8M 0.35 3.19B Neutral SQZ|ETH 0.40 ≥24.6M ≥24.6M ≥24.6M -0.05 2.74B Deep RANGE|HYPE 0.12 ≥474.7K ≥474.7K ≥474.7K 0.32 1.66B Neutral RANGE|ZEC 0.80 775.9K ≥2.0M ≥2.0M 0.15 611.5M Neutral RANGE|SOL 0.93 5.7M ≥11.6M ≥11.6M -0.05 632.1M Neutral RANGE|NEAR 1.38 ≥141.2K ≥141.2K ≥141.2K 0.15 355.7M Neutral RANGE|PUMP 1.99 51.1K 332.1K ≥682.9K -0.30 201.9M Neutral RANGE|XRP 0.73 2.0M ≥4.4M ≥4.4M 0.08 260.7M Neutral RANGE|STRK 1.21 22.7K ≥148.5K ≥148.5K -0.28 37.0M Neutral SPIKE|WLD 0.20 ≥76.6K ≥76.6K ≥76.6K 0.30 73.6M Withdrawal RANGE|XMR 1.27 ≥61.4K ≥61.4K ≥61.4K 0.03 67.2M Neutral RANGE|PONS 3.33 22.0K ≥40.9K ≥40.9K 0.42 31.2M Withdrawal BEAR|ENA 0.95 ≥225.1K ≥233.0K ≥233.0K -0.32 118.9M Neutral RANGE|UNI 1.35 ≥46.4K ≥46.4K ≥46.4K -0.03 74.2M Neutral RANGE|VVV 1.70 18.8K ≥32.3K ≥32.3K 0.07 73.3M Neutral RANGE|S 1.76 9.1K ≥51.9K ≥51.9K 0.03 1.5M Neutral SPIKE|ZRO 0.49 25.7K ≥43.9K ≥43.9K 0.04 81.4M Neutral RANGE|ONDO 1.07 ≥69.2K ≥69.2K ≥69.2K 0.15 53.2M Withdrawal RANGE|XPL 1.71 ≥50.4K ≥50.4K ≥50.4K 0.42 53.7M Neutral RANGE|INJ 1.60 ≥19.8K ≥19.8K ≥19.8K 0.05 9.6M Neutral BULL|RENDER 1.50 17.5K ≥42.9K ≥48.7K 0.40 3.8M Neutral SPIKE|SUI 2.84 226.0K ≥740.0K ≥740.0K -0.55 67.9M Neutral RANGE|CRV 1.80 26.3K ≥66.7K ≥66.7K 0.28 18.0M Neutral BEAR|LIT 2.09 ≥43.7K ≥46.8K ≥46.8K -0.10 157.4M Withdrawal RANGE|AAVE 0.62 ≥134.3K ≥225.6K ≥225.6K 0.05 68.2M Neutral RANGE';
const bookRows = BOOKS.split('|').map(r => {
  const [coin, spread, d10, d25, d100, imb, oi, liq, hmm] = r.split(' ');
  return { coin, spread: +spread, d10: num(d10), d25: num(d25), d100: num(d100), sat10: d10.startsWith('≥'), sat25: d25.startsWith('≥'), sat100: d100.startsWith('≥'), imb: +imb, oi: num(oi), liq, hmm };
});
const books = { focus: 'BTC', ladder: null, depth: null, cols: 120, levels: 50, updated: Date.now() };
function tickSize(coin) { const p = px[coin]; if (p > 10000) return 1; if (p > 1000) return 0.1; if (p > 100) return 0.01; if (p > 10) return 0.001; if (p > 1) return 0.001; if (p > 0.1) return 0.0001; return 0.000001; }
function genLadder(coin) {
  const row = bookRows.find(b => b.coin === coin), t = tickSize(coin), mid = px[coin];
  const base = Math.max(row.d10 / 24, 400), asks = [], bids = [];
  const ask0 = Math.ceil(mid / t) * t, bid0 = ask0 - t;
  for (let i = 0; i < 12; i++) {
    asks.push({ p: ask0 + i * t, usd: base * Math.exp(gauss() * 0.7) * (1 - row.imb * 0.4), o: 1 + Math.floor(rnd() * 10), ch: 0 });
    bids.push({ p: bid0 - i * t, usd: base * Math.exp(gauss() * 0.7) * (1 + row.imb * 0.4), o: 1 + Math.floor(rnd() * 10), ch: 0 });
  }
  return { coin, t, asks, bids, base, imb: row.imb };
}
function depthColumn(coin, prev) {
  const row = bookRows.find(b => b.coin === coin), sat = row.sat10, L = books.levels, half = L / 2, col = new Float32Array(L);
  const scale = row.d25 / 12;
  for (let i = 0; i < L; i++) {
    const isAsk = i < half, d = isAsk ? half - i : i - half + 1;
    let target = scale * (0.35 + d * 0.06) * (isAsk ? 1 - row.imb * 0.5 : 1 + row.imb * 0.5);
    const w = Math.sin(i * 1.7 + hash(coin) * 9) > 0.86 ? 2.4 : 1;
    target *= w;
    if (sat && d > 5) target = scale * 0.06;
    const pv = prev ? prev[i] : target;
    col[i] = Math.max(0, pv * 0.82 + target * 0.18 + target * 0.22 * gauss());
  }
  return col;
}
function genDepth(coin) { const cols = []; let prev = null; for (let i = 0; i < books.cols; i++) { prev = depthColumn(coin, prev); cols.push(prev); } return cols; }
function setFocus(coin) { books.focus = coin; books.ladder = genLadder(coin); books.depth = genDepth(coin); books.updated = Date.now(); emit('focus'); }

// ---------- calendar ----------
const EV = '0|Macro|CPI release|market-wide|risk|0.90|CPI|fred;0|Unlock|STRK token unlock (2.26% of FDV)|STRK|short|0.45|$18.9M, 2.26% of FDV|defillama;1|Macro|PPI release|market-wide|risk|0.60|PPI|fred;1|Unlock|ARB token unlock (0.93% of FDV)|ARB|short|0.19|$17.8M, 0.93% of FDV|defillama;2|Unlock|W token unlock (0.50% of FDV)|W|short|0.10|$820.7K, 0.50% of FDV|defillama;3|Unlock|ZK token unlock (0.82% of FDV)|ZK|short|0.16|$2.8M, 0.82% of FDV|defillama;5|Unlock|KAITO token unlock (0.92% of FDV)|KAITO|short|0.18|$2.9M, 0.92% of FDV|defillama;6|Unlock|ZRO token unlock (2.36% of FDV)|ZRO|short|0.47|$48.9M, 2.36% of FDV|defillama;9|Unlock|GRAM token unlock (0.69% of FDV)|GRAM|short|0.14|$50.5M, 0.69% of FDV|defillama;10|Unlock|AVAX token unlock (0.23% of FDV)|AVAX|neutral|0.05|$17.2M, 0.23% of FDV|defillama;11|Unlock|XPL token unlock (2.28% of FDV)|XPL|short|0.46|$19.0M, 2.28% of FDV|defillama;12|Unlock|ALT token unlock (1.88% of FDV)|ALT|short|0.38|$1.6M, 1.88% of FDV|defillama;13|Unlock|RESOLV token unlock (1.82% of FDV)|RESOLV|short|0.36|$331.5K, 1.82% of FDV|defillama;14|Macro|FOMC release|market-wide|risk|0.57|FOMC|fed_calendar;14|Unlock|B2 token unlock (1.51% of FDV)|B2|short|0.30|$1.4M, 1.51% of FDV|defillama;14|Unlock|GRASS token unlock (0.76% of FDV)|GRASS|short|0.15|$5.6M, 0.76% of FDV|defillama;15|Macro|PCE release|market-wide|risk|0.37|PCE|fred;16|Unlock|ZORA token unlock (1.25% of FDV)|ZORA|short|0.25|$855.7K, 1.25% of FDV|defillama;16|Unlock|REZ token unlock (0.83% of FDV)|REZ|short|0.17|$323.2K, 0.83% of FDV|defillama;17|Unlock|SUI token unlock (1.12% of FDV)|SUI|short|0.22|$38.4M, 1.12% of FDV|defillama;18|Unlock|ENA token unlock (0.64% of FDV)|ENA|short|0.13|$9.8M, 0.64% of FDV|defillama;20|Macro|Nonfarm payrolls|market-wide|risk|0.72|NFP|fred;21|Unlock|APT token unlock (1.05% of FDV)|APT|short|0.21|$11.3M, 1.05% of FDV|defillama;22|Unlock|OP token unlock (0.98% of FDV)|OP|short|0.20|$6.2M, 0.98% of FDV|defillama;24|Unlock|TIA token unlock (1.42% of FDV)|TIA|short|0.28|$7.9M, 1.42% of FDV|defillama;26|Unlock|STRK token unlock (2.11% of FDV)|STRK|short|0.42|$17.4M, 2.11% of FDV|defillama;27|Unlock|PYTH token unlock (0.71% of FDV)|PYTH|short|0.14|$3.1M, 0.71% of FDV|defillama;29|Macro|CPI release|market-wide|risk|0.88|CPI|fred';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = new Date(2026, 9, 14);
const events = EV.split(';').map((r, i) => {
  const [d, type, name, sym, bias, mag, size, src] = r.split('|'); const dt = new Date(today.getTime() + (+d) * 864e5);
  return { id: i, day: +d, date: dt.getDate() + ' ' + MON[dt.getMonth()], rel: +d === 0 ? 'today' : 'in ' + d + 'd', type, name, sym, bias, mag: +mag, size, src };
});
const calendar = { score: 54, label: 'Elevated', next7: 16, next30: 46, total: 46, scoreExact: 54.3, mix: [{ k: 'Unlock', v: 31, c: C.violet }, { k: 'Macro', v: 7, c: C.amber }, { k: 'Depeg', v: 0, c: C.short }], sub: [{ k: 'Unlock subscore', v: 79.5 }, { k: 'Macro subscore', v: 90.0 }, { k: 'Depeg subscore', v: 0.0 }] };

const status = { budget: 429, budgetMax: 500, rate: 112, rateHist: Array.from({ length: 40 }, () => 100 + rnd() * 40), worker: true, redis: true, plan: 'Pro Plus' };

// ---------- bus ----------
const subs = new Set();
function emit(type, p) { subs.forEach(fn => { try { fn(type, p); } catch (e) { console.error(e); } }); }
const S = { kpis, kpiHist, px, regime, model, health, regimeCoins, regimeOrder, cycle, liqRolling, liqHeat, byExchange, tape, squeeze, gamma, volRows, volStats, bookRows, books, calendar, events, status, t0: Date.now() };

function tick() {
  kpis.forEach(k => { k.v += (k.base - k.v) * 0.03 + k.base * k.vol * gauss(); const h = kpiHist[k.key]; h.push(k.v); if (h.length > 60) h.shift(); });
  Object.keys(px).forEach(c => { px[c] *= 1 + gauss() * 0.00035; });
  regime.inRegime += 1;
  status.rate = clamp(status.rate + gauss() * 6, 70, 190); status.rateHist.push(status.rate); if (status.rateHist.length > 40) status.rateHist.shift();
  if (rnd() < 0.15) status.budget = clamp(status.budget + (rnd() < 0.5 ? -1 : 1), 400, 480);
  squeeze.coins.forEach(c => { c.sev = clamp(c.sev + gauss() * 0.6, 2, 60); });
  emit('tick');
}
function spawnLiq() {
  if (window.CQ && window.CQ.paused) { setTimeout(spawnLiq, 600); return; }
  const coin = weighted(LIQ_POOL), side = rnd() < 0.8 ? 'L' : 'S';
  let size = Math.exp(Math.log(900) + gauss() * 1.05); if (rnd() < 0.03) size = 2e4 + rnd() * 1e5; size = clamp(size, 150, 2.5e5);
  const ev = { id: ++liqId, ts: Date.now(), coin, side, size, venue: weighted([['Okx', 50], ['Bybit', 38], ['Hyperliquid', 12]]) };
  tape.unshift(ev); if (tape.length > 120) tape.pop();
  liqRolling.forEach(w => { w[side] += size; });
  kpis[5].v += size;
  emit('liq', ev);
  setTimeout(spawnLiq, 500 + rnd() * 2600);
}
function bookTick() {
  const lad = books.ladder; if (!lad) return;
  const now = Date.now();
  for (let j = 0; j < 4; j++) {
    const side = rnd() < 0.5 ? lad.asks : lad.bids, i = Math.floor(Math.pow(rnd(), 1.6) * 12), lv = side[i];
    const f = Math.exp(gauss() * 0.35); lv.usd = clamp(lv.usd * f, lad.base * 0.05, lad.base * 8); lv.ch = now; lv.dir = f > 1 ? 1 : -1;
    if (rnd() < 0.3) lv.o = clamp(lv.o + (rnd() < 0.5 ? -1 : 1), 1, 14);
  }
  emit('book');
}
function depthTick() { if (!books.depth) return; books.depth.push(depthColumn(books.focus, books.depth[books.depth.length - 1])); books.depth.shift(); books.updated = Date.now(); emit('depth'); }

setFocus('BTC');
const live = () => !(window.CQ && window.CQ.paused);
setInterval(() => live() && tick(), 1000);
setInterval(() => live() && bookTick(), 420);
setInterval(() => live() && depthTick(), 2000);
setTimeout(spawnLiq, 1200);

window.CQ = { state: S, fmt, C, REG, BAND, on(fn) { subs.add(fn); return () => subs.delete(fn); }, emit, setFocus, genClusters, seeded, hash, gauss, rnd };
})();
