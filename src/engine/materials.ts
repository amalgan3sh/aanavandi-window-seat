import * as THREE from 'three';
import type { Textures } from './textures';
import { weather, type WeatherOpts } from './weather';

const std = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
/** A standard material with wear: grime, dirt near the floor, uneven sheen. */
const worn = (color: string, roughness: number, metalness: number, w: WeatherOpts = {}, extra: THREE.MeshStandardMaterialParameters = {}) =>
  weather(std(color, roughness, metalness, extra), w);

export function makeMaterials(T: Textures) {
  const roadScroll = { value: new THREE.Vector3() };
  return {
    // cabin, colours sampled from the reference photo; years of monsoon use on every surface
    seat: worn('#2a5c6c', 0.42, 0.02, { indoor: true, grime: 0.28, scale: 6, rough: 0.35, floorDirt: 0.25 }),
    yellow: worn('#cfa224', 0.36, 0.0, { indoor: true, grime: 0.35, scale: 9, rough: 0.4 }),
    chrome: worn('#aab0b5', 0.3, 0.85, { indoor: true, grime: 0.3, scale: 8, rough: 0.35 }),
    rack: worn('#7f858b', 0.38, 0.75, { indoor: true, grime: 0.35, scale: 5, rough: 0.3 }),
    ceiling: worn('#5a6168', 0.62, 0.05, { indoor: true, grime: 0.3, scale: 1.5, rough: 0.25 }),
    rib: worn('#41474c', 0.55, 0.1, { indoor: true, grime: 0.3, scale: 3 }),
    wall: worn('#626a70', 0.5, 0.06, { indoor: true, grime: 0.35, scale: 2.5, stretch: 4, rough: 0.3 }),
    wallLow: worn('#31404a', 0.58, 0.04, { indoor: true, grime: 0.4, scale: 3, stretch: 2, floorDirt: 0.45, rough: 0.3 }),
    sill: worn('#252b30', 0.4, 0.08, { indoor: true, grime: 0.3, scale: 6, rough: 0.5 }),
    shutter: worn('#6a706a', 0.55, 0.06, { indoor: true, grime: 0.4, scale: 3, stretch: 3, rough: 0.35 }),
    strap: worn('#1b1d20', 0.75, 0, { indoor: true, grime: 0.1 }),
    cord: worn('#a68b62', 0.95, 0, { indoor: true, grime: 0.1 }),
    brass: worn('#b38c35', 0.35, 0.85, { indoor: true, grime: 0.4, scale: 20 }),
    livery: worn('#9c231c', 0.45, 0.15, { indoor: true, grime: 0.4, scale: 1.5, stretch: 5, rough: 0.35 }),
    liveryY: worn('#d4b245', 0.5, 0.1, { indoor: true, grime: 0.35, scale: 2, stretch: 4 }),
    radioBody: worn('#33271e', 0.55, 0.1, { indoor: true, grime: 0.3, scale: 10 }),
    floor: worn('#c9cdd0', 0.45, 0.6, { indoor: true, grime: 0.45, scale: 1.2, rough: 0.35 }, { map: T.floor }),
    tube: std('#ffffff', 0.4, 0, { emissive: '#fff4e2', emissiveIntensity: 1 }),
    radioDial: std('#2a2016', 0.4, 0, { emissive: '#ffb347', emissiveIntensity: 0 }),
    // shared
    vc: weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { grime: 0.35, scale: 0.8, stretch: 6, rough: 0.2 }),
    people: weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), { indoor: true, grime: 0.12, scale: 28, rough: 0.3 }),
    frond: new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, color: '#c8d4b8' }),
    window: std('#2a2622', 0.5, 0, { emissive: '#ffcf7a', emissiveIntensity: 0 }),
    lamp: std('#e8e8e8', 0.5, 0, { emissive: '#ffd38a', emissiveIntensity: 0 }),
    road: weather(std('#ffffff', 0.5, 0.0, { map: T.road }), { grime: 0.2, scale: 0.6, rough: 0.3, wet: 1, scroll: roadScroll, xz: true }),
    grass: weather(std('#ffffff', 0.9, 0, { map: T.grass }), { grime: 0.35, scale: 0.05, rough: 0.1, wet: 0.5, scroll: roadScroll, xz: true }),
    roadScroll,
  };
}
export type Materials = ReturnType<typeof makeMaterials>;
export type MatKey = Exclude<keyof Materials, 'roadScroll'>;
