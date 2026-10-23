import * as THREE from 'three';
import type { Materials } from './materials';
import { drawSign, type Textures } from './textures';
import { B, C, merge, mergeTinted, pick, rand, tf, tint, type Tinted } from './util';

/** Everything outside the bus. The bus stays at the origin; the world slides toward +z. */
export const GY = -0.95;
const Z_MIN = -175, Z_MAX = 28, SPAN = Z_MAX - Z_MIN;

/** A coconut palm: a ringed, leaning trunk and a crown of leaflet fronds (alpha-tested planes). */
function coconutGeo() {
  const H = rand(6, 9.5), bend = rand(-0.9, 0.9), bendZ = rand(-0.5, 0.5);
  const tr = tint(new THREE.CylinderGeometry(0.11, 0.17, H, 9, 16).translate(0, H / 2, 0), '#6a5e50');
  const p = tr.attributes.position, col = tr.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / H;
    p.setX(i, p.getX(i) + bend * t * t);
    p.setZ(i, p.getZ(i) + bendZ * t * t);
    const ring = 0.86 + 0.14 * Math.abs(Math.sin(y * 9)) - (1 - t) * 0.12;   // leaf scars, darker wet base
    col.setXYZ(i, col.getX(i) * ring, col.getY(i) * ring, col.getZ(i) * ring);
  }
  tr.computeVertexNormals();
  const nuts = Array.from({ length: 5 }, () => tint(new THREE.SphereGeometry(0.13, 8, 6).translate(bend + rand(-0.17, 0.17), H - 0.25, bendZ + rand(-0.17, 0.17)), pick(['#5d5a24', '#6b6228', '#4f4a1e'])));
  const trunk = merge([tr, ...nuts]);

  const fronds: THREE.BufferGeometry[] = [];
  const n = 15;
  for (let k = 0; k < n; k++) {
    const old = k >= n - 3, len = rand(2.6, 3.4);
    const f = new THREE.PlaneGeometry(1.7, len, 4, 10).rotateX(Math.PI / 2).translate(0, 0, len / 2);
    const fp = f.attributes.position, uv = f.attributes.uv;
    const up = old ? -0.2 : rand(0.35, 0.8), droop = old ? 2.6 : rand(1.2, 1.8);
    for (let i = 0; i < fp.count; i++) {
      uv.setY(i, 1 - uv.getY(i));
      const t = fp.getZ(i) / len, x = fp.getX(i);
      fp.setY(i, len * (up * t - droop * 0.35 * t * t) - Math.abs(x) * 0.45);   // arch, droop, leaflets hanging in a V
    }
    f.computeVertexNormals();
    f.rotateY((k / n) * Math.PI * 2 + rand(-0.2, 0.2));
    f.translate(bend, H - 0.05, bendZ);
    fronds.push(f);
  }
  return { trunk, crown: merge(fronds) };
}

function houseGroup(M: Materials) {
  const w = rand(5, 7.5), d = rand(4, 6), h = 2.8;
  const col = pick(['#e9dcc0', '#d8c59c', '#a9c3c9', '#dba99f', '#e5e0d0', '#c8d6a8']);
  const roof = new THREE.ConeGeometry(1 / Math.SQRT2, 1.9, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(w + 0.9, 1, d + 0.9);
  roof.translate(0, h + 0.95, 0);
  const base = mergeTinted([
    [B(w + 0.3, 0.45, d + 0.3).translate(0, 0.22, 0), '#7a6a58'],
    [B(w, h, d).translate(0, h / 2 + 0.4, 0), col],
    [roof, pick(['#9b4a32', '#8a3f2b', '#a55638'])],
    [B(0.05, 1.9, 0.9).translate(w / 2 + 0.02, 1.35, 0), '#5b3a25'],
    [B(1.2, 0.12, d + 0.6).translate(w / 2 + 0.5, h + 0.3, 0), '#8a3f2b'],
  ]);
  const wins = merge([B(0.06, 0.9, 0.9).translate(w / 2 + 0.02, 1.7, -d / 3), B(0.06, 0.9, 0.9).translate(w / 2 + 0.02, 1.7, d / 3)]);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(base, M.vc), new THREE.Mesh(wins, M.window));
  return g;
}

function lampGroup(M: Materials, glow: THREE.SpriteMaterial) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeTinted([[C(0.06, 6.5, 6, 0.09).translate(0, 3.25, 0), '#7d8288'], [B(1.7, 0.07, 0.07).translate(0.85, 6.4, 0), '#7d8288']]), M.vc));
  const hd = new THREE.Mesh(B(0.5, 0.12, 0.22), M.lamp);
  hd.position.set(1.55, 6.32, 0);
  const sp = new THREE.Sprite(glow);
  sp.position.set(1.55, 6.1, 0);
  sp.scale.set(3.4, 3.4, 1);
  g.add(hd, sp);
  return g;
}

function kadaGroup(M: Materials, T: Textures) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeTinted([
    [B(2.6, 2.6, 3.4).translate(-0.3, 1.3, 0), '#3f7f8a'], [B(0.05, 1.4, 2.8).translate(1.0, 1.2, 0), '#1b1410'],
    [tf(B(3.6, 0.06, 4.0), 0.2, 2.85, 0, 0, 0, 0.14), '#8d9399'], [B(0.45, 0.08, 2.2).translate(1.7, 0.45, 0), '#6b4a2e'],
    [B(0.4, 0.9, 2.6).translate(0.95, 0.45, 0), '#c9b089'],
    [C(0.05, 2.5, 5).translate(1.9, 1.25, 1.8), '#5b4a3a'], [C(0.05, 2.5, 5).translate(1.9, 1.25, -1.8), '#5b4a3a'],
  ]), M.vc));
  const glow = new THREE.Mesh(B(0.04, 0.8, 2.4), M.window);
  glow.position.set(0.98, 1.5, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), new THREE.MeshBasicMaterial({ map: T.kada, toneMapped: false }));
  sign.position.set(1.05, 2.35, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(glow, sign);
  return g;
}

function vehicleGroup(M: Materials, type: 'bus' | 'auto' | 'lorry') {
  const g = new THREE.Group();
  let parts: Tinted[];
  let lights: THREE.BufferGeometry[];
  if (type === 'bus') {
    parts = [[B(2.5, 2.4, 10).translate(0, 1.6, 0), '#b3221d'], [B(2.52, 0.32, 10.02).translate(0, 1.0, 0), '#e8d9a8'], [B(2.53, 0.8, 9.2).translate(0, 2.15, 0), '#1e2226'], [B(2.3, 0.9, 0.05).translate(0, 2.1, 5.01), '#1e2226']];
    lights = [B(0.3, 0.2, 0.05).translate(-0.9, 0.9, 5.02), B(0.3, 0.2, 0.05).translate(0.9, 0.9, 5.02)];
  } else if (type === 'auto') {
    parts = [[B(1.3, 0.9, 2.4).translate(0, 0.75, 0), '#e9c21e'], [B(1.35, 0.12, 2.3).translate(0, 1.9, -0.1), '#1a1a1a'], [B(1.3, 0.8, 0.1).translate(0, 1.5, 1.0), '#1a1a1a'], [B(1.3, 0.9, 0.08).translate(0, 1.4, -1.1), '#2a3b2a']];
    lights = [B(0.22, 0.18, 0.05).translate(0, 1.0, 1.22)];
  } else {
    parts = [[B(2.3, 2.0, 2.2).translate(0, 1.5, 3.6), '#d9792b'], [B(2.4, 2.6, 6).translate(0, 1.8, -0.8), '#2f4f8a'], [B(2.2, 0.7, 0.05).translate(0, 2.0, 4.71), '#1e2226']];
    lights = [B(0.3, 0.2, 0.05).translate(-0.8, 0.9, 4.72), B(0.3, 0.2, 0.05).translate(0.8, 0.9, 4.72)];
  }
  const wheelZ = type === 'auto' ? [-0.9] : [-3, 3];
  for (const wz of wheelZ) for (const wx of [-1.05, 1.05]) parts.push([tf(C(0.45, 0.3, 10), wx * (type === 'auto' ? 0.55 : 1), 0.45, wz, 0, 0, Math.PI / 2), '#141414']);
  if (type === 'auto') parts.push([tf(C(0.3, 0.2, 10), 0, 0.3, 1.0, 0, 0, Math.PI / 2), '#141414']);
  g.add(new THREE.Mesh(mergeTinted(parts), M.vc), new THREE.Mesh(merge(lights), M.lamp));
  return g;
}

interface PoolItem { obj: THREE.Object3D; place: (o: THREE.Object3D, init: boolean) => void }

export function buildWorld(M: Materials, T: Textures) {
  const group = new THREE.Group();
  const glowMat = new THREE.SpriteMaterial({ map: T.glow, color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

  const road = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 400), M.road);
  road.rotation.x = -Math.PI / 2;
  road.position.set(2.4, GY + 0.01, -100);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), M.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, GY - 0.02, -100);
  group.add(road, grass);

  // distant hills and power lines: static, they read as far away / parallel to the road
  const statics: Tinted[] = [];
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const hill = new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const hp = hill.attributes.position, ph = rand(0, 9);
    for (let j = 0; j < hp.count; j++) {   // uneven ridgeline and gullies instead of a perfect dome
      const a = Math.atan2(hp.getZ(j), hp.getX(j)), y = hp.getY(j);
      const k = 1 + (Math.sin(a * 3 + ph) * 0.12 + Math.sin(a * 7 + ph * 2) * 0.06 + Math.sin(a * 17) * 0.025) * y;
      hp.setXYZ(j, hp.getX(j) * k, y * (1 + Math.sin(a * 5 + ph) * 0.18), hp.getZ(j) * k);
    }
    hill.computeVertexNormals();
    hill.scale(rand(55, 95), rand(18, 36), rand(40, 70));
    statics.push([tf(hill, side * rand(80, 200), GY - 2, rand(-330, -170)), pick(['#2e4a38', '#355440', '#2a4033'])]);
  }
  for (const y of [7.4, 7.05, 6.7]) statics.push([tf(C(0.012, 420, 4), 8.2, GY + y, -100, Math.PI / 2), '#1d1f22']);
  group.add(new THREE.Mesh(mergeTinted(statics), M.vc));

  // recycled roadside objects
  const treeGeos = Array.from({ length: 7 }, coconutGeo);
  const postGeo = mergeTinted([[B(0.22, 8, 0.22).translate(0, 4, 0), '#a7a49c'], [B(1.4, 0.12, 0.12).translate(0, 7.3, 0), '#8f8c85']]);
  const paddyGeo = mergeTinted([[tf(new THREE.PlaneGeometry(26, 40), 0, 0, 0, -Math.PI / 2), '#5f7d36'], ...Array.from({ length: 6 }, (_, i): Tinted => [B(26, 0.12, 0.3).translate(0, 0.03, -18 + i * 7.2), '#6b5a3a'])]);
  drawSign(T.kada, 'ചായക്കട', 'Tea · Snacks', { bg: '#1f5e6e', fg: '#fff3d6', sub: '#f2d27a', border: '#0e2f37' });

  const pool: PoolItem[] = [];
  const add = (obj: THREE.Object3D, place: PoolItem['place'], y = GY) => {
    place(obj, true);
    obj.position.y = y;
    group.add(obj);
    pool.push({ obj, place });
  };
  const trees: THREE.Object3D[] = [];
  const tree = (side: -1 | 1): PoolItem['place'] => (o, init) => {
    const tg = pick(treeGeos);
    (o.children[0] as THREE.Mesh).geometry = tg.trunk;
    (o.children[1] as THREE.Mesh).geometry = tg.crown;
    o.rotation.y = rand(0, Math.PI * 2);
    o.userData = { phase: rand(0, 20), freq: rand(0.35, 0.6), give: rand(0.6, 1.2) };
    if (init) trees.push(o);
    o.position.x = side < 0 ? rand(-32, -3.6) : rand(8.8, 34);
    if (init) o.position.z = rand(Z_MIN, Z_MAX);
  };
  const palm = () => new THREE.Group().add(new THREE.Mesh(treeGeos[0].trunk, M.vc), new THREE.Mesh(treeGeos[0].crown, M.frond));
  for (let i = 0; i < 36; i++) add(palm(), tree(-1));
  for (let i = 0; i < 26; i++) add(palm(), tree(1));
  for (let i = 0; i < 6; i++) add(houseGroup(M), (o, init) => { o.position.x = rand(-21, -10); if (init) o.position.z = Z_MIN + (i * SPAN) / 6 + rand(0, 10); });
  for (let i = 0; i < 5; i++) add(houseGroup(M), (o, init) => { o.position.x = rand(14, 26); o.rotation.y = Math.PI; if (init) o.position.z = Z_MIN + (i * SPAN) / 5 + rand(0, 10); });
  for (let i = 0; i < 7; i++) add(lampGroup(M, glowMat), (o, init) => { o.position.x = -3.3; if (init) o.position.z = Z_MIN + (i * SPAN) / 7; });
  for (let i = 0; i < 7; i++) add(new THREE.Mesh(postGeo, M.vc), (o, init) => { o.position.x = 8.2; if (init) o.position.z = Z_MIN + (i * SPAN) / 7 + 12; });
  for (let i = 0; i < 3; i++) add(new THREE.Mesh(paddyGeo, M.vc), (o, init) => { o.position.x = rand(-36, -20); if (init) o.position.z = Z_MIN + (i * SPAN) / 3; }, GY + 0.01);
  add(kadaGroup(M, T), (o, init) => { o.position.x = -5.6; if (init) o.position.z = -60; });
  add(kadaGroup(M, T), (o, init) => { o.position.x = 10.8; o.rotation.y = Math.PI; if (init) o.position.z = -140; });

  const vehicles = (['bus', 'auto', 'lorry', 'auto'] as const).map((t, i) => {
    const g = vehicleGroup(M, t);
    g.position.set(t === 'auto' ? 4.0 : 4.8, GY, -150 - i * 120);
    group.add(g);
    return { g, v: t === 'auto' ? 8 : 12, auto: t === 'auto', phase: rand(0, 20) };
  });

  // the bus shelter that appears beside the window at each stop
  const shelter = new THREE.Group();
  shelter.add(new THREE.Mesh(mergeTinted([
    [B(2.1, 0.1, 4.6).translate(0, 2.6, 0), '#3b6e9c'], [B(0.06, 1.8, 4.6).translate(-1.0, 1.4, 0), '#c9c2b0'],
    [B(0.45, 0.08, 3.4).translate(-0.6, 0.45, 0), '#6b6f73'], [C(0.05, 2.6, 6).translate(0.95, 1.3, 2.2), '#8a8f94'],
    [C(0.05, 2.6, 6).translate(0.95, 1.3, -2.2), '#8a8f94'], [C(0.04, 0.45, 6).translate(-0.6, 0.22, 1.5), '#6b6f73'],
    [C(0.04, 0.45, 6).translate(-0.6, 0.22, -1.5), '#6b6f73'],
  ]), M.vc));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: T.shelter, toneMapped: false }));
  board.position.set(1.06, 3.1, 0);
  board.rotation.y = Math.PI / 2;
  shelter.add(board);
  shelter.position.set(-3.7, GY, 80);
  shelter.visible = false;
  group.add(shelter);

  // rain streaks outside the cabin
  const RAIN_N = 2200;
  const rainPos = new Float32Array(RAIN_N * 6);
  const rd = new Float32Array(RAIN_N * 4);
  for (let i = 0; i < RAIN_N; i++) {
    const side = Math.random() < 0.55 ? -1 : 1;
    rd[i * 4] = side * rand(1.6, 22);
    rd[i * 4 + 1] = rand(-1, 14);
    rd[i * 4 + 2] = rand(-60, 18);
    rd[i * 4 + 3] = rand(11, 15);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: '#c9d3dc', transparent: true, opacity: 0.3, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);

  let dist = 0, time = 0;
  function update(dt: number, step: number, sf: number, rainLevel: number, windK = 1) {
    dist += step;
    time += dt;
    // monsoon wind: a slow swell with gusts riding on it
    const gust = Math.max(0, Math.sin(time * 0.23) * Math.sin(time * 0.61 + 1.3));
    const wind = (0.35 + 0.25 * Math.sin(time * 0.07) + gust * 0.9) * windK;
    for (const o of trees) {
      const u = o.userData, ph = time * u.freq + u.phase;
      o.rotation.x = (Math.sin(ph) * 0.012 + Math.sin(ph * 2.7) * 0.004) * u.give * (0.5 + wind);
      o.rotation.z = (wind * 0.035 + Math.sin(ph * 0.8 + 2) * 0.016 * (0.4 + wind)) * u.give;
    }
    T.road.offset.y = (dist / 10) % 1;
    T.grass.offset.y = (dist / 10) % 1;
    M.roadScroll.value.z = -dist;
    for (const p of pool) {
      p.obj.position.z += step;
      if (p.obj.position.z > Z_MAX) { p.obj.position.z -= SPAN; p.place(p.obj, false); }
    }
    for (const v of vehicles) {
      v.g.position.z += step + v.v * dt;
      if (v.g.position.z > 40) v.g.position.z = -170 - rand(0, 220);
      // body roll on bad tarmac; autos waddle on their single front wheel
      const ph = time + v.phase;
      v.g.position.y = GY + (Math.sin(ph * 7.3) * 0.5 + Math.sin(ph * 11.9) * 0.5) * (v.auto ? 0.025 : 0.018);
      v.g.rotation.z = (Math.sin(ph * 2.1) + Math.sin(ph * 5.3) * 0.4) * (v.auto ? 0.03 : 0.009);
      v.g.rotation.x = Math.sin(ph * 3.7) * (v.auto ? 0.012 : 0.004);
    }
    if (shelter.visible) {
      shelter.position.z += step;
      if (shelter.position.z > Z_MAX) shelter.visible = false;
    }
    // each streak is the drop's path during a ~1/25 s exposure, seen from the moving bus
    const vz = dt > 0 ? step / dt : sf * 11, vx = wind * 3.5, EXP = 0.042;
    for (let i = 0; i < RAIN_N; i++) {
      const j = i * 4;
      rd[j + 1] -= rd[j + 3] * dt;
      rd[j + 2] += step;
      rd[j] += vx * dt;
      if (rd[j] > 24) rd[j] -= 46; else if (rd[j] < -24) rd[j] += 46;
      if (Math.abs(rd[j]) < 1.6) rd[j] += rd[j] < 0 ? -3.2 : 3.2;
      if (rd[j + 1] < GY) { rd[j + 1] = rand(8, 14); rd[j + 2] = rand(-60, 18); }
      if (rd[j + 2] > 18) rd[j + 2] -= 78;
      const k = i * 6, x = rd[j], y = rd[j + 1], z = rd[j + 2];
      rainPos[k] = x; rainPos[k + 1] = y; rainPos[k + 2] = z;
      const vy = rd[j + 3];
      rainPos[k + 3] = x - vx * EXP; rainPos[k + 4] = y + vy * EXP; rainPos[k + 5] = z - vz * EXP;
    }
    rainGeo.attributes.position.needsUpdate = true;
    rainGeo.setDrawRange(0, Math.floor(RAIN_N * rainLevel) * 2);
    rainMat.opacity = 0.12 + rainLevel * 0.2;
  }

  /** Place the shelter so it ends up beside `atZ` after the bus covers `distance` metres. */
  function spawnShelter(ml: string, en: string, atZ: number, distance: number) {
    drawSign(T.shelter, ml, en);
    shelter.position.z = atZ - distance;
    shelter.visible = true;
  }

  return { group, update, spawnShelter, glowMat, rainMat, ground: [road, grass] };
}
export type World = ReturnType<typeof buildWorld>;
