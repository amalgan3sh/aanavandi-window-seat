import * as THREE from 'three';

/**
 * Wear and tear for flat-coloured materials. Patches a standard material's shader with
 * 3D noise in object space, so merged geometry needs no UVs: blotchy grime, dirt that
 * gathers low down, rain streaks running down walls, and roughness that varies like
 * real worn paint, vinyl or wet ground.
 */
export interface WeatherOpts {
  grime?: number;      // 0..1 how dark the dirt blotches get
  scale?: number;      // noise frequency per metre
  stretch?: number;    // >1 stretches noise vertically into streaks
  floorDirt?: number;  // extra darkening near y = 0
  rough?: number;      // roughness variation amplitude
  wet?: number;        // 0..1 puddles: dark, glossy patches (ground planes)
  scroll?: { value: THREE.Vector3 };  // offset for surfaces whose texture scrolls
  xz?: boolean;        // sample noise on the ground plane (x, -z of a rotated plane)
  indoor?: boolean;    // under the roof: only part of the open sky's light reaches it
}

/** How wet the ground is right now, 0 dry .. 1 soaked. Shared by every ground material. */
export const WETNESS = { value: 1 };
/** Share of sky light that reaches surfaces inside the bus. Lower on clear days, when the sky is much brighter than the shaded cabin. */
export const INDOOR = { value: 1 };

const NOISE = /* glsl */ `
varying vec3 vWPos;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float wFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * wNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export function weather<T extends THREE.MeshStandardMaterial>(mat: T, o: WeatherOpts = {}): T {
  const { grime = 0.25, scale = 3, stretch = 1, floorDirt = 0, rough = 0.25, wet = 0, xz = false, indoor = false } = o;
  const scroll = o.scroll ?? { value: new THREE.Vector3() };
  const f = (n: number) => n.toFixed(4);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wScroll = scroll;
    sh.uniforms.wWet = WETNESS;
    sh.uniforms.wIndoor = INDOOR;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos = ${xz ? 'vec3(position.x, 0.0, -position.y)' : 'position'};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 wScroll;\nuniform float wWet;\nuniform float wIndoor;${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wp = (vWPos + wScroll) * ${f(scale)} * vec3(1.0, ${f(1 / stretch)}, 1.0);
        float wn = wFbm(wp);
        float wd = smoothstep(0.35, 0.8, wn);
        diffuseColor.rgb *= 1.0 - ${f(grime)} * wd;
        diffuseColor.rgb *= 1.0 - ${f(floorDirt)} * (1.0 - smoothstep(0.0, 0.45, vWPos.y));
        float wSoak = ${f(wet)} * wWet;
        float wPud = wSoak * smoothstep(0.55 + (1.0 - wWet) * 0.2, 0.7 + (1.0 - wWet) * 0.2, wFbm((vWPos + wScroll) * 0.35 + 3.7));
        diffuseColor.rgb *= (1.0 - wPud * 0.45) * (1.0 - wSoak * 0.18);   // wet ground is darker`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (wn - 0.5) * ${f(rough)} + wd * ${f(rough * 0.5)}, 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, wSoak);
        roughnessFactor = mix(roughnessFactor, 0.06, wPud);`)
      .replace('#include <aomap_fragment>', indoor
        ? '#include <aomap_fragment>\n        reflectedLight.indirectDiffuse *= wIndoor;\n        reflectedLight.indirectSpecular *= wIndoor;'
        : '#include <aomap_fragment>');
  };
  mat.customProgramCacheKey = () => `w${grime}${scale}${stretch}${floorDirt}${rough}${wet}${xz}${indoor}`;
  return mat;
}
