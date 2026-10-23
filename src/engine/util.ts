import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const B = (w: number, h: number, d: number, ws = 1, hs = 1, ds = 1) => new THREE.BoxGeometry(w, h, d, ws, hs, ds);
/** Box with softened edges; nothing manufactured has razor-sharp corners. */
export const RB = (w: number, h: number, d: number, r = 0.02, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
export const C = (r: number, len: number, seg = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, len, seg);

/** Rotate (x, y, z order) then translate a geometry in place. */
export function tf<T extends THREE.BufferGeometry>(geo: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

export function tint<T extends THREE.BufferGeometry>(geo: T, hex: string): T {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // indexed and non-indexed geometry (rounded boxes) cannot merge directly
  if (list.some((g) => g.index) && list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('Geometry merge failed: attribute sets differ');
  return g;
}

export type Tinted = [THREE.BufferGeometry, string];
export const mergeTinted = (list: Tinted[]) => merge(list.map(([g, c]) => tint(g, c)));
