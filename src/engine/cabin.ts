import * as THREE from 'three';
import type { Materials, MatKey } from './materials';
import type { Textures } from './textures';
import { B, C, RB, merge, mergeTinted, pick, rand, tf, type Tinted } from './util';

/** Bus interior. Units are metres; the bus faces -z, floor at y = 0. */
export const BUS = { W: 2.5, L: 11, H: 2.15 } as const;
export const ROWS = Array.from({ length: 11 }, (_, i) => -3.9 + i * 0.78);
const REAR_Z = 4.85;
const LEFT_X = [-1.0, -0.7, -0.42];   // window, middle, aisle
const RIGHT_X = [0.52, 1.0];          // aisle, window
const REAR_X = [-0.9, -0.45, 0, 0.45, 0.9];

export interface SeatSpot {
  id: string;
  label: string;
  group: 'left' | 'right' | 'rear';
  row: number;          // 0 = front row, 11 = rear bench
  col: number;
  x: number;            // eye position
  z: number;
  side: -1 | 1;         // nearest wall
  yaw: number;          // default look direction
  window: boolean;
  occupied: boolean;
}

function makeSeats(): SeatSpot[] {
  const seats: SeatSpot[] = [];
  const leftNames = ['left window', 'left middle', 'left aisle'];
  const rightNames = ['right aisle', 'right window'];
  ROWS.forEach((z, i) => {
    LEFT_X.forEach((x, c) => seats.push({ id: `r${i}-L${c + 1}`, label: `Row ${i + 1} · ${leftNames[c]}`, group: 'left', row: i, col: c, x, z: z + 0.22, side: -1, yaw: [0.5, 0.3, 0.12][c], window: c === 0, occupied: false }));
    RIGHT_X.forEach((x, c) => seats.push({ id: `r${i}-R${c + 1}`, label: `Row ${i + 1} · ${rightNames[c]}`, group: 'right', row: i, col: c, x, z: z + 0.22, side: 1, yaw: [-0.12, -0.5][c], window: c === 1, occupied: false }));
  });
  REAR_X.forEach((x, c) => seats.push({ id: `rear-${c + 1}`, label: `Back bench · seat ${c + 1}`, group: 'rear', row: 11, col: c, x, z: REAR_Z + 0.12, side: x < 0 ? -1 : 1, yaw: 0, window: c === 0 || c === 4, occupied: false }));
  return seats;
}

interface PersonOpts { shirt: string; pants?: string; hair?: string; seated?: boolean; armUp?: boolean; bag?: boolean; bun?: boolean }
const SKIN = ['#7a4e34', '#5f3c28', '#8c5e40', '#6a4430', '#94664a'];
const HAIR = ['#0f0c0a', '#15110d', '#1d1712', '#0b0a09'];

/** Torso with real shoulders: a capsule widened at the top and flattened front to back. */
function torso(r: number, len: number, y: number) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 16);
  const p = g.attributes.position, half = len / 2 + r;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + half) / (2 * half);
    const sh = THREE.MathUtils.smoothstep(t, 0.45, 0.85);
    p.setX(i, p.getX(i) * (1.12 + sh * 0.38));
    p.setZ(i, p.getZ(i) * (0.74 - sh * 0.06));
    if (t > 0.86) p.setY(i, p.getY(i) - (t - 0.86) * half * 0.9);   // square the shoulder line
  }
  g.computeVertexNormals();
  return g.translate(0, y, 0);
}
const limb = (r: number, len: number, x: number, y: number, z: number, rx = 0, rz = 0) =>
  tf(new THREE.CapsuleGeometry(r, len, 4, 10), x, y, z, rx, 0, rz);
/** A limb segment running from joint `a` to joint `b`, tapering from r0 to r1. */
function bone(a: [number, number, number], b: [number, number, number], r0: number, r1 = r0) {
  const A = new THREE.Vector3(...a), B3 = new THREE.Vector3(...b), d = B3.clone().sub(A);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), 10, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B3.x) / 2, (A.y + B3.y) / 2, (A.z + B3.z) / 2);
}
const joint = (r: number, x: number, y: number, z: number) => new THREE.SphereGeometry(r, 10, 8).translate(x, y, z);

function personGeo({ shirt, pants = '#2b2d33', hair = pick(HAIR), seated = true, armUp = false, bag = false, bun = false }: PersonOpts) {
  const skin = pick(SKIN);
  const p: Tinted[] = [];
  const headY = seated ? 1.2 : 1.62, chestY = seated ? 0.8 : 1.22;
  const collar = new THREE.Color(shirt).multiplyScalar(0.8).getStyle();
  if (seated) {
    p.push([torso(0.15, 0.24, chestY), shirt]);
    for (const sx of [-1, 1]) {
      p.push([limb(0.07, 0.3, sx * 0.1, 0.53, -0.16, Math.PI / 2), pants]);           // thighs
      // shoulder → elbow at the side → hands resting together on the lap
      const sh: [number, number, number] = [sx * 0.215, 0.96, 0.0], el: [number, number, number] = [sx * 0.235, 0.72, -0.03], hd: [number, number, number] = [sx * 0.09, 0.64, -0.24];
      p.push([bone(sh, el, 0.05, 0.042), shirt], [joint(0.042, ...el), shirt]);
      p.push([bone(el, hd, 0.036, 0.03), skin], [new THREE.SphereGeometry(0.038, 10, 8).scale(0.8, 0.55, 1.25).translate(...hd), skin]);
    }
  } else {
    p.push([torso(0.155, 0.3, chestY), shirt]);
    p.push([B(0.32, 0.14, 0.2).translate(0, 0.9, 0), pants]);
    for (const sx of [-1, 1]) p.push([limb(0.065, 0.74, sx * 0.08, 0.47, 0), pants]);
    if (armUp) {
      p.push([limb(0.045, 0.3, 0.22, 1.5, 0, 0, -0.1), shirt]);
      p.push([limb(0.04, 0.26, 0.24, 1.8, 0), skin]);
      p.push([new THREE.SphereGeometry(0.042, 8, 6).translate(0.24, 1.97, 0), skin]);
    } else p.push([limb(0.045, 0.42, 0.23, 1.12, -0.04, -0.3, 0.08), shirt]);
    p.push([limb(0.045, 0.42, -0.23, 1.12, 0.0, 0.1, -0.08), shirt]);
    if (bag) p.push([RB(0.3, 0.22, 0.11, 0.03).translate(-0.2, 0.95, -0.08), '#3a2a1e'], [tf(B(0.03, 0.62, 0.02), -0.04, 1.2, -0.13, 0, 0, 0.55), '#2a1e14']);
  }
  p.push([new THREE.TorusGeometry(0.06, 0.016, 6, 16).rotateX(Math.PI / 2).translate(0, headY - 0.165, 0.005), collar]);

  // head, tipped a little each way so nobody sits like a mannequin
  const head: Tinted[] = [
    [C(0.04, 0.12, 10).translate(0, headY - 0.12, 0.01), skin],
    [new THREE.SphereGeometry(0.1, 18, 14).scale(0.84, 1.08, 0.98).translate(0, headY, 0), skin],
    [new THREE.SphereGeometry(0.104, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.86, 1.06, 1.0).rotateX(0.45).translate(0, headY + 0.012, 0.006), hair],
  ];
  for (const sx of [-1, 1]) head.push([new THREE.SphereGeometry(0.026, 8, 6).scale(0.45, 1, 0.75).translate(sx * 0.084, headY - 0.005, 0.01), skin]);
  if (bun) {
    head.push([new THREE.SphereGeometry(0.048, 10, 8).translate(0, headY - 0.045, 0.1), hair]);
    for (let i = 0; i < 9; i++) {   // a strand of jasmine draped round the bun
      const a = -1.3 + (i / 8) * 2.6;
      head.push([new THREE.SphereGeometry(0.011, 6, 5).translate(Math.sin(a) * 0.05, headY - 0.06 - Math.cos(a) * 0.012, 0.1 + Math.cos(a) * 0.045), '#f1eee2']);
    }
  }
  const tilt = new THREE.Matrix4().makeTranslation(0, headY - 0.15, 0)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand(-0.12, 0.08), rand(-0.35, 0.35), rand(-0.08, 0.08))))
    .multiply(new THREE.Matrix4().makeTranslation(0, -(headY - 0.15), 0));
  for (const [g, c] of head) p.push([g.applyMatrix4(tilt), c]);
  return mergeTinted(p);
}

/** Who is already on the bus, by seat id. */
const RIDERS: [string, PersonOpts][] = [
  ['r4-L3', { shirt: '#d8c8a4' }], ['r2-L1', { shirt: '#2d5577', bun: true }], ['r3-R2', { shirt: '#7c2c2c', hair: '#2a221c' }],
  ['r1-R1', { shirt: '#e4e3dc' }], ['r0-L2', { shirt: '#4a6f46' }], ['r6-R2', { shirt: '#c9b26e', bun: true }],
  ['r8-L3', { shirt: '#5f4570' }], ['r9-R1', { shirt: '#b5603a' }], ['r7-L1', { shirt: '#a85d1e' }],
  ['r5-L2', { shirt: '#d6dae0', hair: '#3e3b38' }], ['rear-2', { shirt: '#3a5466' }], ['rear-4', { shirt: '#6e6036', hair: '#34312e' }],
];

export function buildCabin(M: Materials, T: Textures) {
  const { W, L, H } = BUS;
  const HW = W / 2;
  const bus = new THREE.Group();
  const clickables: THREE.Object3D[] = [];
  const blockers: THREE.Object3D[] = [];
  const bins: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {};
  const put = (key: MatKey, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    (bins[key] ||= []).push(tf(geo, x, y, z, rx, ry, rz));
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), M.floor);
  floor.rotation.x = -Math.PI / 2;
  bus.add(floor);
  blockers.push(floor);

  // ceiling, ribs, tube lights
  put('ceiling', B(W, 0.04, L), 0, H + 0.02, 0);
  for (let z = -L / 2 + 0.3; z < L / 2; z += 0.55) put('rib', B(W, 0.035, 0.05), 0, H - 0.016, z);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    const m = new THREE.Mesh(B(0.09, 0.05, 1.1), M.tube);
    m.position.set(0, H - 0.045, z);
    bus.add(m);
    put('rack', B(0.16, 0.03, 1.22), 0, H - 0.012, z);
  }

  // side walls, window pillars, luggage racks, outer livery
  for (const s of [-1, 1] as const) {
    const x = s * HW;
    put('wallLow', B(0.05, 0.82, L), x, 0.41, 0);
    put('wall', B(0.05, 0.43, L), x, 1.935, 0);
    put('wall', B(0.05, 0.9, 1.0), x, 1.27, -5.0);
    put('wall', B(0.05, 0.9, 1.0), x, 1.27, 5.0);
    for (let k = 0; k <= 10; k++) put('wall', B(0.06, 0.9, 0.07), x - s * 0.005, 1.27, -4.5 + k);
    put('sill', B(0.1, 0.03, L), x - s * 0.04, 0.835, 0);
    put('chrome', C(0.009, 9.0, 8), x - s * 0.02, 0.99, 0, Math.PI / 2);
    put('livery', B(0.03, 1.6, L + 0.1), x + s * 0.06, 0.02, 0);
    put('liveryY', B(0.035, 0.12, L + 0.1), x + s * 0.065, 0.7, 0);
    for (let i = 0; i < 5; i++) put('rack', C(0.008, 9.6, 6), x - s * (0.07 + i * 0.075), 1.8 + i * 0.028, 0, Math.PI / 2);
    for (let k = 0; k <= 10; k++) put('rack', B(0.36, 0.02, 0.02), x - s * 0.21, 1.86, -4.5 + k, 0, 0, -s * 0.36);
  }

  // front: windscreen frame, dashboard, driver cabin, engine box
  put('wallLow', B(W, 0.95, 0.05), 0, 0.475, -L / 2);
  put('wall', B(W, 0.36, 0.05), 0, 1.97, -L / 2);
  for (const px of [-1.19, 0, 1.19]) put('wall', B(0.1, 0.86, 0.06), px, 1.38, -L / 2);
  put('wallLow', B(W - 0.1, 0.12, 0.45), 0, 0.95, -L / 2 + 0.25);
  put('wallLow', B(0.9, 1.1, 0.04), 0.74, 0.55, -4.55);
  put('chrome', C(0.015, 0.9, 8), 0.74, 1.12, -4.55, 0, 0, Math.PI / 2);
  put('seat', RB(0.5, 0.12, 0.5, 0.045, 3), 0.75, 0.5, -5.0);
  put('seat', RB(0.5, 0.62, 0.09, 0.035, 3), 0.75, 0.86, -4.72, 0.1);
  put('strap', new THREE.TorusGeometry(0.22, 0.022, 8, 24), 0.75, 1.02, -5.18, -1.0);
  put('wallLow', B(0.55, 0.55, 0.9), -0.05, 0.28, -5.0);
  // rear wall
  put('wallLow', B(W, 0.82, 0.05), 0, 0.41, L / 2);
  put('wall', B(W, 1.33, 0.05), 0, 1.485, L / 2);

  // ceiling grab rails with hanging loops
  for (const rx of [-0.38, 0.38]) {
    put('yellow', C(0.02, 10.2, 10), rx, 1.97, 0, Math.PI / 2);
    for (let z = -4.5; z <= 4.5; z += 1.5) put('yellow', C(0.012, 0.18, 6), rx, 2.06, z);
    for (let z = -4.8; z <= 4.81; z += 0.6) {
      put('strap', C(0.006, 0.1, 5), rx, 1.91, z);
      put('strap', new THREE.TorusGeometry(0.042, 0.009, 6, 16), rx, 1.83, z, 0, Math.PI / 2);
    }
  }
  // bell cord and bell
  put('cord', C(0.005, 10, 5), 0.62, 2.08, 0, Math.PI / 2);
  put('brass', new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.62, 2.02, -5.25);
  const cordHit = new THREE.Mesh(B(0.22, 0.22, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  cordHit.position.set(0.62, 2.05, 0);
  cordHit.userData.kind = 'cord';
  bus.add(cordHit);
  clickables.push(cordHit);
  // vertical poles
  for (const z of [-3.4, -0.3, 2.8]) put('yellow', C(0.022, H, 10), -0.2, H / 2, z);
  for (const z of [-1.85, 1.25, 4.3]) put('yellow', C(0.022, H, 10), 0.28, H / 2, z);

  // the bus radio, front left above the windscreen
  const RADIO = new THREE.Vector3(-0.78, 1.83, -5.36);
  put('radioBody', B(0.42, 0.16, 0.14), RADIO.x, RADIO.y, RADIO.z);
  put('chrome', B(0.44, 0.012, 0.15), RADIO.x, RADIO.y + 0.085, RADIO.z);
  for (let i = 0; i < 5; i++) put('strap', B(0.004, 0.1, 0.004), RADIO.x - 0.17 + i * 0.022, RADIO.y, RADIO.z + 0.071);
  put('rack', B(0.02, 0.08, 0.2), RADIO.x, RADIO.y + 0.12, RADIO.z - 0.04);
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), M.radioDial);
  dial.position.set(RADIO.x + 0.07, RADIO.y + 0.01, RADIO.z + 0.072);
  bus.add(dial);

  // seats: teal vinyl, yellow top rail, chrome frame
  const bench = (cx: number, w: number, z: number) => {
    put('seat', RB(w, 0.12, 0.45, 0.045, 3), cx, 0.46, z);
    put('seat', RB(w, 0.56, 0.085, 0.035, 3), cx, 0.8, z + 0.22, 0.12);
    put('yellow', C(0.022, w + 0.02, 10), cx, 1.1, z + 0.27, 0, 0, Math.PI / 2);
    for (const sd of [-1, 1]) put('yellow', C(0.02, 0.16, 8), cx + (sd * w) / 2, 1.03, z + 0.27);
    put('chrome', B(w, 0.04, 0.04), cx, 0.4, z - 0.18);
    const aisle = cx < 0 ? cx + w / 2 - 0.05 : cx - w / 2 + 0.05;
    put('chrome', C(0.018, 0.4, 8), aisle, 0.2, z - 0.15);
    put('chrome', C(0.018, 0.4, 8), aisle, 0.2, z + 0.15);
    put('chrome', B(0.03, 0.6, 0.05), cx < 0 ? cx + w / 2 : cx - w / 2, 0.78, z + 0.22, 0.12);
  };
  ROWS.forEach((z) => { bench(-0.71, 0.98, z); bench(0.75, 0.9, z); });
  bench(0, 2.3, REAR_Z);

  // louvered shutters, separate meshes so they can be tapped
  const shutters: THREE.Mesh[] = [];
  for (const s of [-1, 1] as const)
    for (let k = 0; k < 10; k++) {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) parts.push(tf(B(0.025, 0.13, 0.88), 0, 0.065 + i * 0.125, 0, 0, 0, s * 0.35));
      parts.push(B(0.03, 0.03, 0.9));
      const m = new THREE.Mesh(merge(parts), M.shutter);
      const down = (s === 1 && (k === 2 || k === 7)) || (s === -1 && k === 8);
      m.userData = { kind: 'shutter', side: s, k, t: down ? 1 : 0, v: 0, target: down ? 1 : 0 };
      m.position.set(s * (HW + 0.04), down ? 0.83 : 1.42, -4.5 + k + 0.5);
      bus.add(m);
      shutters.push(m);
      clickables.push(m);
    }

  // destination board
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.26), new THREE.MeshBasicMaterial({ map: T.board, toneMapped: false }));
  board.position.set(0, 1.97, -L / 2 + 0.03);
  bus.add(board);

  for (const key of Object.keys(bins) as MatKey[]) {
    const mesh = new THREE.Mesh(merge(bins[key]!), M[key]);
    bus.add(mesh);
    blockers.push(mesh);
  }

  // passengers, the conductor (khaki) and the driver
  const seats = makeSeats();
  const byId = new Map(seats.map((s) => [s.id, s]));
  const people: THREE.Mesh[] = [];
  const addPerson = (opts: PersonOpts, x: number, z: number) => {
    const m = new THREE.Mesh(personGeo(opts), M.people);
    m.position.set(x, 0, z);
    m.userData = { standing: opts.seated === false, phase: Math.random() * 10 };
    bus.add(m);
    people.push(m);
  };
  for (const [id, opts] of RIDERS) {
    const s = byId.get(id);
    if (!s) continue;
    s.occupied = true;
    addPerson(opts, s.x, s.z - 0.14);
  }
  addPerson({ shirt: '#7d3b3b', seated: false, armUp: true }, 0.18, -1.15);
  addPerson({ shirt: '#a88f5f', pants: '#a88f5f', seated: false, bag: true }, 0.05, -2.55);
  addPerson({ shirt: '#e8e2d0' }, 0.75, -4.95);

  return { bus, shutters, clickables, blockers, seats, people, radioPos: RADIO };
}
export type Cabin = ReturnType<typeof buildCabin>;
