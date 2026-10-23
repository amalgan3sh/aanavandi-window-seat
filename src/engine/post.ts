import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Camera look in display space: a soft filmic grade, lens fall-off, fringe and grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.045 },
    tint: { value: new THREE.Color(1, 1, 1) },
    sat: { value: 0.88 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time, grain, sat; uniform vec3 tint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 ca = d * r2 * 0.005;   // lateral chromatic aberration, only toward the corners
      vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat) * tint;
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;     // gentle S-curve
      c = mix(c, vec3(0.03, 0.035, 0.04), 0.035);        // lifted blacks, like a phone sensor
      c *= 1.0 - smoothstep(0.12, 0.62, r2) * 0.42;      // vignette
      float g = h(vUv * 913.0 + fract(time * 7.13)) - 0.5;
      c += g * grain * (1.15 - l);                        // grain shows in the shadows
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function makePost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, high: boolean) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let ao: GTAOPass | null = null;
  if (high) {
    // contact shadow where seats meet the floor, under rails, around heads: the biggest step away from "CG"
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8, distanceFallOff: 0.6 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return {
    composer, bloom, grade, high,
    setSize(w: number, h: number, pr: number) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      ao?.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));   // AO is soft; half resolution is plenty
    },
    dispose() { composer.dispose(); rt.dispose(); ao?.dispose(); },
  };
}
export type Post = ReturnType<typeof makePost>;
