import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Mockup engine: simulated ADS-B-like traffic over dark map tiles. Swap `plan()` output for live OpenSky state vectors later.
const FT = 0.0003048, KT = 0.000514444, D2R = Math.PI / 180, TR = 80;

export const AIRPORTS = {
  YVR: { code: 'YVR', lat: 49.1947, lon: -123.1792,
    rwys: [{ h: 100, len: 3.03, e: 0.3, n: 0.85 }, { h: 100, len: 3.5, e: 0.4, n: -0.45 }, { h: 133, len: 2.23, e: -1.5, n: 0.2 }],
    arr: [{ r: 1, h: 280 }, { r: 0, h: 280 }], dep: [{ r: 0, h: 280 }] },
  SEA: { code: 'SEA', lat: 47.4502, lon: -122.3088,
    rwys: [{ h: 180, len: 3.63, e: 0.3, n: 0 }, { h: 180, len: 2.87, e: -0.05, n: 0.2 }, { h: 180, len: 2.59, e: -0.45, n: 0.4 }],
    arr: [{ r: 0, h: 180 }, { r: 2, h: 180 }], dep: [{ r: 1, h: 180 }] },
  YYC: { code: 'YYC', lat: 51.1215, lon: -114.0076,
    rwys: [{ h: 172, len: 4.27, e: 0.9, n: 0 }, { h: 172, len: 3.86, e: -0.9, n: 0.3 }, { h: 90, len: 2.44, e: 0, n: -1.6 }],
    arr: [{ r: 0, h: 352 }, { r: 1, h: 352 }], dep: [{ r: 1, h: 352 }] },
  YYZ: { code: 'YYZ', lat: 43.6777, lon: -79.6248,
    rwys: [{ h: 66, len: 2.96, e: -0.5, n: 0.8 }, { h: 66, len: 2.89, e: 0.3, n: -0.5 }, { h: 56, len: 3.39, e: -1.5, n: -0.6 }, { h: 146, len: 3.37, e: 1.6, n: 0.6 }],
    arr: [{ r: 0, h: 246 }, { r: 2, h: 236 }], dep: [{ r: 1, h: 246 }] },
};
const AIRLINES = [['ACA', 'Air Canada'], ['WJA', 'WestJet'], ['JZA', 'Jazz'], ['PCO', 'Pacific Coastal'], ['FLE', 'Flair'], ['TSC', 'Air Transat'], ['POE', 'Porter'], ['ASA', 'Alaska'], ['UAL', 'United'], ['DAL', 'Delta'], ['CPA', 'Cathay Pacific'], ['ANA', 'All Nippon'], ['BAW', 'British Airways'], ['KLM', 'KLM'], ['QFA', 'Qantas'], ['FDX', 'FedEx']];
const FLEET = [['A320', 'narrow', 4], ['B38M', 'narrow', 5], ['A321', 'narrow', 3], ['B737', 'narrow', 3], ['BCS3', 'narrow', 3], ['DH8D', 'prop', 4], ['E175', 'regional', 3], ['CRJ9', 'regional', 2], ['B789', 'wide', 3], ['A333', 'wide', 2], ['B77W', 'wide', 3], ['A359', 'wide', 2], ['B748', 'quad', 1]];
const CITIES = ['YYZ', 'YYC', 'YUL', 'YEG', 'YWG', 'YLW', 'YYJ', 'YXE', 'SFO', 'LAX', 'SEA', 'PDX', 'DEN', 'ORD', 'JFK', 'LAS', 'PHX', 'HNL', 'MEX', 'LHR', 'AMS', 'FRA', 'HKG', 'NRT', 'ICN', 'PVG', 'SYD', 'TPE', 'DFW', 'SJC'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const wpick = a => { let t = a.reduce((s, x) => s + x[2], 0) * Math.random(); for (const x of a) { if ((t -= x[2]) <= 0) return x; } return a[0]; };
const dirv = h => [Math.sin(h * D2R), Math.cos(h * D2R)];
const mix = (a, b, t) => ({ e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t, alt: a.alt + (b.alt - a.alt) * t, spd: a.spd + (b.spd - a.spd) * t });
function chaikin(p, it) { for (let k = 0; k < it; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) q.push(mix(p[i], p[i + 1], .25), mix(p[i], p[i + 1], .75)); q.push(p[p.length - 1]); p = q; } return p; }

export const RAMP = [[0, 0xffb020], [5000, 0xb6f03c], [12000, 0x2ff0c0], [22000, 0x3cb8ff], [32000, 0x9a7bff], [42000, 0xff5ad8]];
const lerpHex = (a, b, t) => { const c = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return (c(16) << 16) | (c(8) << 8) | c(0); };
export function rampHex(alt) { if (alt <= 0) return RAMP[0][1]; for (let i = 1; i < RAMP.length; i++) if (alt <= RAMP[i][0]) return lerpHex(RAMP[i - 1][1], RAMP[i][1], (alt - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0])); return RAMP[RAMP.length - 1][1]; }
export const hexCss = h => '#' + h.toString(16).padStart(6, '0');

// Placeholder low-poly airframes (nose = -Z). Replace with GLB per class when models arrive.
const SPEC = {
  narrow: { len: 1, fr: .055, span: .55, sweep: .2, eng: [[.19, -.06, -.06], [-.19, -.06, -.06]], er: .03 },
  wide: { len: 1.25, fr: .075, span: .74, sweep: .26, eng: [[.26, -.08, -.1], [-.26, -.08, -.1]], er: .048 },
  quad: { len: 1.3, fr: .085, span: .8, sweep: .28, eng: [[.24, -.085, -.1], [-.24, -.085, -.1], [.46, -.07, 0], [-.46, -.07, 0]], er: .04 },
  regional: { len: .82, fr: .045, span: .42, sweep: .13, eng: [[.085, .03, .24], [-.085, .03, .24]], er: .028, ttail: true },
  prop: { len: .75, fr: .042, span: .5, sweep: .02, eng: [[.15, .035, -.1], [-.15, .035, -.1]], er: .028, high: true, prop: true },
};
const geoCache = {};
function geos(cls) {
  if (geoCache[cls]) return geoCache[cls];
  const P = SPEC[cls], L = P.len, out = [];
  const add = g => { g.userData.shared = true; out.push(g); };
  const fus = new THREE.CylinderGeometry(P.fr, P.fr, L * .78, 12); fus.rotateX(Math.PI / 2); add(fus);
  const nose = new THREE.ConeGeometry(P.fr, L * .14, 12); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -L * .46); add(nose);
  const tail = new THREE.ConeGeometry(P.fr, L * .2, 12); tail.rotateX(Math.PI / 2); tail.translate(0, P.fr * .2, L * .49); add(tail);
  const wing = (span, f0, c, sweep, y, th) => {
    const s = new THREE.Shape(), le = f0 + c / 2, te = f0 - c / 2, tle = le - sweep, tte = tle - c * .38;
    s.moveTo(0, le); s.lineTo(span, tle); s.lineTo(span, tte); s.lineTo(0, te); s.lineTo(-span, tte); s.lineTo(-span, tle); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g;
  };
  const finH = L * .2;
  add(wing(P.span, L * .02, L * .24, P.sweep * L, P.high ? P.fr * .8 : -P.fr * .45, .014));
  add(wing(P.span * .36, -L * .44, L * .12, P.sweep * L * .5, P.ttail ? P.fr * .6 + finH * .95 : P.fr * .1, .01));
  const fs = new THREE.Shape(); fs.moveTo(-L * .3, 0); fs.lineTo(-L * .45 - P.sweep * L * .3, finH); fs.lineTo(-L * .53 - P.sweep * L * .3, finH); fs.lineTo(-L * .52, 0); fs.closePath();
  const fin = new THREE.ExtrudeGeometry(fs, { depth: .012, bevelEnabled: false }); fin.translate(0, 0, -.006); fin.rotateY(Math.PI / 2); fin.translate(0, P.fr * .6, 0); add(fin);
  P.eng.forEach(([x, y, z]) => {
    const e = new THREE.CylinderGeometry(P.er, P.er * .85, L * .18, 10); e.rotateX(Math.PI / 2); e.translate(x, y, z); add(e);
    if (P.prop) { const b = new THREE.BoxGeometry(.2, .012, .006); b.translate(x, y, z - L * .1); add(b); }
  });
  return (geoCache[cls] = out);
}

export function createFlightScene(container, opts = {}) {
  const th = Object.assign({
    bg: 0x06080b, fogNear: 130, fogFar: 300, tiles: 'dark_nolabels', tint: [1, 1, 1], zoom: 10, tileR: 3,
    grid: 0x141c24, rings: 0x24323f, ringLabel: '#55697a', runway: 0xdfe7ef, approach: 0xffffff,
    colorFn: f => rampHex(f.alt), selColor: 0xffffff, dropOpacity: .45, emissive: .55,
    exag: 3, size: 1, speed: 4, labelHTML: null, labelMode: 'all', theta: .55, phi: .98, r: 100,
    counts: { ARR: 12, DEP: 8, OVR: 7 },
  }, opts);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(th.bg);
  const cv = renderer.domElement; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
  container.appendChild(cv);
  const overlay = document.createElement('div'); overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; container.appendChild(overlay);

  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(th.bg, th.fogNear, th.fogFar);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 2000);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x101418, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(40, 90, 30); scene.add(dl);
  let w = 1, h = 1;
  const resize = () => { w = container.clientWidth || 1; h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  let visible = true; const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(container);

  const home = { theta: th.theta, phi: th.phi, r: th.r, tx: 0, ty: 0, tz: 0 };
  const cam = { ...home }, goal = { ...home };
  const ev = {}; const emit = (k, d) => (ev[k] || []).forEach(fn => fn(d));
  let ap = null, world = null, flights = [], statics = [], selId = null, follow = false, uid = 0, raf = 0, last = performance.now();
  const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
  const dotGeo = new THREE.RingGeometry(.35, .55, 24); dotGeo.rotateX(-Math.PI / 2); dotGeo.userData.shared = true;

  const halo = new THREE.Mesh(new THREE.RingGeometry(.66, .74, 48), new THREE.MeshBasicMaterial({ color: th.selColor, transparent: true, depthTest: false, side: THREE.DoubleSide }));
  halo.renderOrder = 10; halo.visible = false; scene.add(halo);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
  const route = new THREE.Line(rg, new THREE.LineDashedMaterial({ color: th.selColor, dashSize: 1.2, gapSize: .9, transparent: true, opacity: .7 }));
  route.frustumCulled = false; route.visible = false; scene.add(route);

  const project = (x, y, z) => { tmpV.set(x, y, z).project(camera); if (tmpV.z > 1) return null; return [(tmpV.x + 1) / 2 * w, (1 - tmpV.y) / 2 * h]; };
  const mkLabel = css => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;' + css; overlay.appendChild(d); return d; };
  const lineOf = (pts, mat) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))); const l = new THREE.Line(g, mat); return l; };
  const circle = (r, color, op) => { const p = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; p.push([Math.sin(a) * r, .05, Math.cos(a) * r]); } return lineOf(p, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })); };
  const ends = (rw, hd) => { const [de, dn] = dirv(hd); return { thr: { e: rw.e - de * rw.len / 2, n: rw.n - dn * rw.len / 2 }, de, dn }; };

  function buildWorld() {
    if (world) { scene.remove(world); world.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    statics.forEach(s => s.el.remove()); statics = [];
    world = new THREE.Group(); scene.add(world);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: th.bg })); base.rotation.x = -Math.PI / 2; base.position.y = -.05; world.add(base);
    // map tiles
    const z = th.zoom, N = 2 ** z, kx = 111.32 * Math.cos(ap.lat * D2R), ky = 110.574;
    const cx = Math.floor((ap.lon + 180) / 360 * N), cy = Math.floor((1 - Math.log(Math.tan(ap.lat * D2R) + 1 / Math.cos(ap.lat * D2R)) / Math.PI) / 2 * N);
    const t2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) / D2R;
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
    for (let tx = cx - th.tileR; tx <= cx + th.tileR; tx++) for (let ty = cy - th.tileR; ty <= cy + th.tileR; ty++) {
      const e0 = (tx / N * 360 - 180 - ap.lon) * kx, e1 = ((tx + 1) / N * 360 - 180 - ap.lon) * kx;
      const n0 = (t2lat(ty) - ap.lat) * ky, n1 = (t2lat(ty + 1) - ap.lat) * ky;
      const mat = new THREE.MeshBasicMaterial({ color: th.bg });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(e1 - e0, n0 - n1), mat);
      m.rotation.x = -Math.PI / 2; m.position.set((e0 + e1) / 2, 0, -(n0 + n1) / 2); world.add(m);
      const url = `https://${'abcd'[(tx + ty) % 4]}.basemaps.cartocdn.com/${th.tiles}/${z}/${tx}/${ty}@2x.png`;
      loader.load(url, tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.map = tex; mat.color.setRGB(...th.tint); mat.needsUpdate = true; });
    }
    if (th.grid != null) { const g = new THREE.GridHelper(200, 20, th.grid, th.grid); g.material.transparent = true; g.material.opacity = .6; g.position.y = .02; world.add(g); }
    [10, 20, 30, 40].forEach(nm => {
      const r = nm * 1.852; world.add(circle(r, th.rings, .9));
      statics.push({ e: Math.sin(150 * D2R) * r, n: Math.cos(150 * D2R) * r, alt: 0, el: mkLabel(`font:500 10px/1 'IBM Plex Mono',monospace;color:${th.ringLabel};transform-origin:0 0`), html: nm + ' NM' });
    });
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, b]) => statics.push({ e: Math.sin(b * D2R) * 80, n: Math.cos(b * D2R) * 80, alt: 0, el: mkLabel(`font:600 11px/1 'IBM Plex Mono',monospace;color:${th.ringLabel}`), html: t }));
    ap.rwys.forEach(rw => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(.11, .04, rw.len), new THREE.MeshBasicMaterial({ color: th.runway }));
      m.position.set(rw.e, .06, -rw.n); m.rotation.y = -rw.h * D2R; world.add(m);
    });
    ap.arr.forEach(a => {
      const R = ends(ap.rwys[a.r], a.h);
      const l = lineOf([[R.thr.e, .06, -R.thr.n], [R.thr.e - R.de * 22, .06, -(R.thr.n - R.dn * 22)]], new THREE.LineDashedMaterial({ color: th.approach, dashSize: .8, gapSize: .8, transparent: true, opacity: .35 }));
      l.computeLineDistances(); world.add(l);
    });
  }

  function sampleAt(f, s) {
    s = Math.max(0, Math.min(f.total, s)); let i = f.seg || 0;
    while (i < f.cum.length - 2 && f.cum[i + 1] < s) i++; while (i > 0 && f.cum[i] > s) i--; f.seg = i;
    const a = f.path[i], b = f.path[i + 1], L = (f.cum[i + 1] - f.cum[i]) || 1e-6; return mix(a, b, (s - f.cum[i]) / L);
  }
  function upd(f, sim) {
    const q = sampleAt(f, f.s), a = sampleAt(f, Math.min(f.total, f.s + .6));
    f.e = q.e; f.n = q.n; f.alt = q.alt; f.spd = q.spd;
    const dx = a.e - q.e, dn = a.n - q.n, dd = Math.hypot(dx, dn);
    if (dd > 1e-3) { const hd = (Math.atan2(dx, dn) / D2R + 360) % 360; if (f.hdg != null && sim > 0) { const dh = ((hd - f.hdg + 540) % 360) - 180; const tgt = Math.max(-.6, Math.min(.6, -(dh / sim) * .14)); f.bank += (tgt - f.bank) * .08; } f.hdg = hd; }
    if (f.hdg == null) f.hdg = 0;
    const vs = dd > 1e-3 ? (a.alt - q.alt) / (dd / (Math.max(q.spd, 30) * KT)) * 60 : 0;
    f.vs = sim > 0 ? f.vs + (vs - f.vs) * .15 : vs;
    if (sim > 0) { f.histT += sim; if (f.histT >= 2) { f.histT = 0; f.hist.push({ e: f.e, n: f.n, alt: f.alt }); if (f.hist.length > TR - 1) f.hist.shift(); } }
  }
  function setModel(f, cls) { while (f.model.children.length) f.model.remove(f.model.children[0]); geos(cls).forEach(g => f.model.add(new THREE.Mesh(g, f.mat))); f.cls = cls; }
  function plan(f, initial) {
    const al = pick(AIRLINES), fl = wpick(FLEET); let cls = fl[1];
    f.cs = al[0] + Math.floor(rnd(1, 1999)); f.airline = al[1]; f.type = fl[0];
    f.icao = 'c0' + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
    if (f.cat === 'OVR' && (cls === 'prop' || cls === 'regional')) { cls = 'narrow'; f.type = 'B38M'; }
    const cities = CITIES.filter(c => c !== ap.code);
    let raw;
    if (f.cat === 'ARR') {
      const a = pick(ap.arr), R = ends(ap.rwys[a.r], a.h), { de, dn } = R, pe = dn, pn = -de;
      const [be, bn] = dirv(rnd(0, 360)), R0 = rnd(75, 90);
      const entry = { e: be * R0, n: bn * R0, alt: rnd(11000, 17000), spd: rnd(270, 300) };
      const faf = { e: R.thr.e - de * 20, n: R.thr.n - dn * 20, alt: 3800, spd: 170 };
      const side = Math.sign((entry.e - faf.e) * pe + (entry.n - faf.n) * pn) || 1;
      raw = [entry];
      if ((entry.e - R.thr.e) * de + (entry.n - R.thr.n) * dn > -10) raw.push({ e: R.thr.e + de * 6 + pe * side * 14, n: R.thr.n + dn * 6 + pn * side * 14, alt: Math.min(entry.alt - 1500, 10000), spd: 240 });
      raw.push({ e: faf.e - de * 8 + pe * side * 12, n: faf.n - dn * 8 + pn * side * 12, alt: 6500, spd: 210 }, faf, { ...R.thr, alt: 50, spd: 140 }, { e: R.thr.e + de * 2.4, n: R.thr.n + dn * 2.4, alt: 0, spd: 30 });
      f.orig = pick(cities); f.dest = ap.code;
    } else if (f.cat === 'DEP') {
      const d = pick(ap.dep), R = ends(ap.rwys[d.r], d.h), { de, dn } = R, [xe, xn] = dirv(rnd(0, 360));
      raw = [{ ...R.thr, alt: 0, spd: 25 }, { e: R.thr.e + de * 2.2, n: R.thr.n + dn * 2.2, alt: 0, spd: 150 }, { e: R.thr.e + de * 9, n: R.thr.n + dn * 9, alt: 3000, spd: 210 },
        { e: R.thr.e + de * 14 + xe * 8, n: R.thr.n + dn * 14 + xn * 8, alt: 7000, spd: 250 }, { e: xe * 40, n: xn * 40, alt: rnd(13000, 16000), spd: 290 }, { e: xe * 92, n: xn * 92, alt: rnd(21000, 27000), spd: 320 }];
      f.orig = ap.code; f.dest = pick(cities);
    } else {
      const [de, dn] = dirv(rnd(0, 360)), off = rnd(-45, 45), pe = dn, pn = -de, alt = pick([28000, 31000, 33000, 35000, 37000, 39000]), spd = rnd(440, 490);
      raw = [{ e: -de * 100 + pe * off, n: -dn * 100 + pn * off, alt, spd }, { e: pe * off, n: pn * off, alt, spd }, { e: de * 100 + pe * off, n: dn * 100 + pn * off, alt, spd }];
      f.orig = pick(cities); do { f.dest = pick(cities); } while (f.dest === f.orig);
    }
    f.path = chaikin(raw, 3); f.cum = [0];
    for (let i = 1; i < f.path.length; i++) f.cum.push(f.cum[i - 1] + Math.hypot(f.path[i].e - f.path[i - 1].e, f.path[i].n - f.path[i - 1].n));
    f.total = f.cum[f.cum.length - 1]; f.seg = 0;
    f.s = initial ? rnd(0, f.total * .9) : 0;
    f.delay = f.cat === 'DEP' ? (initial ? (Math.random() < .3 ? rnd(0, 60) : 0) : rnd(10, 80)) : 0;
    f.hist = []; f.histT = 0; f.hdg = null; f.bank = 0; f.vs = 0;
    if (f.cls !== cls) setModel(f, cls);
    upd(f, 0);
    const step = Math.max(f.spd, 120) * KT * 2;
    for (let k = TR - 2; k >= 1; k--) { const s = f.s - k * step; if (s < 0) continue; const p = sampleAt(f, s); f.hist.push({ e: p.e, n: p.n, alt: p.alt }); }
    sampleAt(f, f.s);
  }
  function makeFlight(cat) {
    const f = { cat, id: ++uid, cls: null };
    f.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: th.emissive, roughness: .45, metalness: .1, flatShading: true });
    f.model = new THREE.Group(); f.model.rotation.order = 'YXZ';
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    f.drop = new THREE.Line(dg, new THREE.LineBasicMaterial({ transparent: true, opacity: th.dropOpacity })); f.drop.frustumCulled = false;
    f.dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: .7, side: THREE.DoubleSide }));
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TR * 3), 3)); tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TR * 3), 3));
    f.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true })); f.trail.frustumCulled = false;
    f.g = new THREE.Group(); f.g.add(f.model, f.drop, f.dot, f.trail); scene.add(f.g);
    f.lab = mkLabel('');
    plan(f, true); return f;
  }
  function clearFlights() { flights.forEach(f => { scene.remove(f.g); f.g.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); f.mat.dispose(); f.lab.remove(); }); flights = []; }

  function step(f, sim) {
    if (f.delay > 0) { f.delay -= sim; return; }
    if (sim <= 0) return;
    f.s += Math.max(f.spd, 30) * KT * sim;
    if (f.s >= f.total) { if (f.id === selId) select(null); plan(f, false); return; }
    upd(f, sim);
  }
  const phase = f => { const d = Math.hypot(f.e, f.n);
    if (f.cat === 'ARR') return f.alt < 80 ? 'Landing' : f.alt < 4200 && d < 26 ? 'Final approach' : f.alt < 10500 ? 'Approach' : 'Descent';
    if (f.cat === 'DEP') return f.alt < 80 ? 'Takeoff roll' : f.alt < 10000 ? 'Initial climb' : 'Climb';
    return 'Cruise'; };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!visible) return;
    const sim = dt * th.speed;
    flights.forEach(f => step(f, sim));
    const sf = selId && flights.find(f => f.id === selId);
    if (follow && sf && sf.delay <= 0) { goal.tx = sf.e; goal.ty = sf.alt * FT * th.exag; goal.tz = -sf.n; }
    const k = 1 - Math.exp(-dt * 6), kt = follow ? 1 - Math.exp(-dt * 10) : k;
    cam.theta += (goal.theta - cam.theta) * k; cam.phi += (goal.phi - cam.phi) * k; cam.r += (goal.r - cam.r) * k;
    cam.tx += (goal.tx - cam.tx) * kt; cam.ty += (goal.ty - cam.ty) * kt; cam.tz += (goal.tz - cam.tz) * kt;
    const sp = Math.sin(cam.phi);
    camera.position.set(cam.tx + cam.r * sp * Math.sin(cam.theta), cam.ty + cam.r * Math.cos(cam.phi), cam.tz + cam.r * sp * Math.cos(cam.theta));
    camera.lookAt(cam.tx, cam.ty, cam.tz); camera.updateMatrixWorld();
    const cp = camera.position;
    for (const f of flights) {
      const vis = f.delay <= 0; f.g.visible = vis;
      if (!vis) { f.lab.style.display = 'none'; continue; }
      const isSel = f.id === selId, col = th.colorFn(f, isSel); f.col = col;
      f.mat.color.setHex(col); f.mat.emissive.setHex(col);
      const x = f.e, y = f.alt * FT * th.exag, z = -f.n;
      const sc = Math.min(4, Math.max(.25, Math.hypot(cp.x - x, cp.y - y, cp.z - z) / 50)) * th.size; f.sc = sc;
      f.model.position.set(x, y, z); f.model.scale.setScalar(sc);
      const climb = Math.atan2(f.vs / 60 * FT * th.exag, Math.max(f.spd, 60) * KT);
      f.model.rotation.set(Math.max(-.4, Math.min(.4, climb)), -f.hdg * D2R, f.bank);
      const da = f.drop.geometry.attributes.position; da.array.set([x, 0, z, x, y, z]); da.needsUpdate = true;
      f.drop.material.color.setHex(col); f.drop.visible = y > .05;
      f.dot.position.set(x, .08, z); f.dot.scale.setScalar(sc * .8); f.dot.material.color.setHex(col);
      const pa = f.trail.geometry.attributes.position, ca = f.trail.geometry.attributes.color, n = f.hist.length + 1;
      for (let i = 0; i < n; i++) {
        const p = i < f.hist.length ? f.hist[i] : f, t = (i + 1) / n, fade = .08 + .92 * t * t;
        pa.array[i * 3] = p.e; pa.array[i * 3 + 1] = p.alt * FT * th.exag; pa.array[i * 3 + 2] = -p.n;
        tmpC.setHex(th.colorFn({ alt: p.alt, cat: f.cat }, isSel));
        ca.array[i * 3] = tmpC.r * fade; ca.array[i * 3 + 1] = tmpC.g * fade; ca.array[i * 3 + 2] = tmpC.b * fade;
      }
      pa.needsUpdate = ca.needsUpdate = true; f.trail.geometry.setDrawRange(0, n);
      const showLab = th.labelHTML && (th.labelMode === 'all' || isSel);
      const pr = showLab && project(x, y, z);
      if (!pr) { f.lab.style.display = 'none'; continue; }
      f.lab.style.display = 'block'; f.lab.style.zIndex = isSel ? 2 : 1;
      f.lab.style.transform = `translate(${pr[0] + 10}px,${pr[1] - 8}px) translateY(-100%)`;
      const html = th.labelHTML(f, hexCss(col), isSel);
      if (html !== f.labHtml) { f.lab.innerHTML = html; f.labHtml = html; }
    }
    if (sf && sf.delay <= 0) {
      halo.visible = true; halo.position.copy(sf.model.position); halo.quaternion.copy(camera.quaternion); halo.scale.setScalar(sf.sc * (1.05 + .06 * Math.sin(now / 220)));
      const arr = rg.attributes.position.array; let c = 0;
      const put = p => { if (c >= 600) return; arr[c * 3] = p.e; arr[c * 3 + 1] = p.alt * FT * th.exag; arr[c * 3 + 2] = -p.n; c++; };
      put(sf); for (let i = 0; i < sf.path.length; i++) if (sf.cum[i] > sf.s) put(sf.path[i]);
      rg.attributes.position.needsUpdate = true; rg.setDrawRange(0, c); route.computeLineDistances(); route.visible = c > 1;
    } else { halo.visible = false; route.visible = false; }
    for (const s of statics) {
      const pr = project(s.e, s.alt * FT * th.exag, -s.n);
      if (!pr) { s.el.style.display = 'none'; continue; }
      s.el.style.display = 'block'; s.el.style.transform = `translate(${pr[0]}px,${pr[1]}px) translate(-50%,-50%)`;
      if (s.el.textContent !== s.html) s.el.textContent = s.html;
    }
    renderer.render(scene, camera);
  }

  function snapshot() {
    const counts = { ARR: 0, DEP: 0, OVR: 0 };
    const rows = flights.filter(f => f.delay <= 0).map(f => { counts[f.cat]++; return {
      id: f.id, cs: f.cs, airline: f.airline, type: f.type, icao: f.icao, cat: f.cat, alt: Math.round(f.alt), spd: Math.round(f.spd), hdg: Math.round(f.hdg),
      vs: Math.round(f.vs / 50) * 50, orig: f.orig, dest: f.dest, color: hexCss(th.colorFn(f, false)), dist: +(Math.hypot(f.e, f.n) / 1.852).toFixed(1),
      progress: Math.min(1, f.s / f.total), eta: Math.max(1, Math.round((f.total - f.s) / (Math.max(f.spd, 120) * KT) / 60)), phase: phase(f) }; });
    rows.sort((a, b) => b.alt - a.alt);
    emit('update', { rows, counts });
  }

  // input
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.shiftKey }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; const r = cv.getBoundingClientRect(), s = w / r.width;
    const dx = (e.clientX - drag.x) * s, dy = (e.clientY - drag.y) * s; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = goal.r * .0016, st = Math.sin(goal.theta), ct = Math.cos(goal.theta);
      goal.tx -= ct * dx * k; goal.tz -= -st * dx * k; goal.tx += -st * dy * k; goal.tz += -ct * dy * k;
      if (follow) setFollow(false);
    } else { goal.theta -= dx * .005; goal.phi = Math.min(1.5, Math.max(.06, goal.phi - dy * .004)); }
  });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null; cv.style.cursor = 'grab';
    if (!d || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) return;
    const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * (w / r.width), my = (e.clientY - r.top) * (h / r.height);
    let best = null, bd = 28;
    for (const f of flights) { if (f.delay > 0) continue; const p = project(f.e, f.alt * FT * th.exag, -f.n); if (!p) continue; const dd = Math.hypot(p[0] - mx, p[1] - my); if (dd < bd) { bd = dd; best = f; } }
    select(best ? best.id : null);
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); goal.r = Math.min(320, Math.max(3, goal.r * Math.exp(e.deltaY * .0012))); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  function select(id) { selId = id; if (!id && follow) setFollow(false); emit('select', id); snapshot(); }
  function setFollow(b) {
    follow = !!(b && selId); if (follow) { goal.r = Math.min(goal.r, 18); goal.phi = Math.min(goal.phi, 1.2); } else { goal.ty = 0; }
    emit('follow', follow);
  }
  function setView(v) {
    if (follow) setFollow(false);
    Object.assign(goal, home);
    if (v === 'top') Object.assign(goal, { phi: .06, r: 150 });
    if (v === 'side') Object.assign(goal, { phi: 1.45, r: 110 });
  }
  function normAirport(a) {
    if (typeof a === 'string') return AIRPORTS[a];
    if (AIRPORTS[a.iata]) return AIRPORTS[a.iata];
    const h = a.rwy ?? 90, o = (h + 90) % 360;
    return { code: a.iata || a.icao, lat: a.lat, lon: a.lon,
      rwys: [{ h, len: 3.2, e: 0, n: 0 }, { h, len: 2.8, e: .9 * Math.sin(o * D2R), n: .9 * Math.cos(o * D2R) }],
      arr: [{ r: 0, h }, { r: 1, h }], dep: [{ r: 1, h }] };
  }
  function setAirport(code) {
    ap = normAirport(code); selId = null; follow = false; emit('select', null); emit('follow', false);
    clearFlights(); buildWorld(); Object.assign(goal, home);
    Object.entries(th.counts).forEach(([c, n]) => { for (let i = 0; i < n; i++) flights.push(makeFlight(c)); });
    snapshot();
  }
  setAirport(opts.airport || 'YVR');
  raf = requestAnimationFrame(frame);
  const tick = setInterval(snapshot, 500);

  return {
    on(k, fn) { (ev[k] = ev[k] || []).push(fn); snapshot(); },
    select, setFollow, setView, setAirport,
    destroy() { cancelAnimationFrame(raf); clearInterval(tick); ro.disconnect(); io.disconnect(); clearFlights(); renderer.dispose(); cv.remove(); overlay.remove(); },
  };
}
