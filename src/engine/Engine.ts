import * as THREE from 'three';
import { AudioEngine } from './audio';
import { Conductor, type Line } from './conductor';
import { CONDUCTOR_VOICE } from './flags';
import { buildCabin, type Cabin, type SeatSpot } from './cabin';
import { makeMaterials, type Materials } from './materials';
import { makePost, type Post } from './post';
import { ROUTES, type RouteKey, type Stop } from './routes';
import { drawBoard, makeTextures, ML_FONT, type Textures } from './textures';
import { clamp, lerp, rand, smooth } from './util';
import { buildWorld, type World } from './world';
import { INDOOR, WETNESS } from './weather';

export type TimeKey = 'day' | 'evening' | 'night';
export type WeatherKey = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'storm';
interface Wx { cloud: number; rain: number; thunder: number; wind: number; wet: number }
/** Weather presets. rain and thunder also set the sound sliders. */
export const WEATHERS: Record<WeatherKey, Wx> = {
  clear: { cloud: 0.08, rain: 0, thunder: 0, wind: 0.35, wet: 0.1 },
  cloudy: { cloud: 0.65, rain: 0, thunder: 0, wind: 0.6, wet: 0.3 },
  drizzle: { cloud: 0.88, rain: 0.28, thunder: 0, wind: 0.6, wet: 0.75 },
  rain: { cloud: 1, rain: 0.7, thunder: 0.45, wind: 0.9, wet: 1 },
  storm: { cloud: 1, rain: 1, thunder: 0.9, wind: 1.6, wet: 1 },
};
export type Mode = 'preview' | 'running' | 'arriving' | 'break' | 'ride' | 'done';
export type { SeatSpot, Stop, RouteKey, Line };

export interface Snapshot {
  mode: Mode;
  paused: boolean;
  left: number;
  leg: number;
  stops: readonly Stop[];
  ticketNo: string;
  focused: number;
  seatId: string;
  myShutterDown: boolean;
  audioOn: boolean;
}
export interface EngineEvents {
  onSnapshot?(s: Snapshot): void;
  onToast?(big: string, sub: string, ms?: number): void;
  onDone?(s: Snapshot): void;
  onInteract?(): void;
  /** A line of conductor / passenger talk is being spoken (null when they stop). */
  onCaption?(line: Line | null): void;
}
export interface Mix { rain: number; engine: number; thunder: number; horn: boolean; voice: boolean }

const CRUISE = 11;      // m/s, about 40 km/h
const ARRIVE = 9;       // seconds of braking before a stop
const EYE_Y = 1.2;
const STAND_Y = 1.6;
const AISLE_X = 0.04;
const GEAR_TOP = [3, 6.5, 9.5, Infinity];   // m/s where the driver shifts up
const GEAR_ACC = [1.5, 1.2, 0.8, 0.45];     // m/s² pulling power in each gear
const HALF_PI = Math.PI / 2;

/** Damped spring step; returns the new velocity. */
function spring(x: number, v: number, target: number, k: number, zeta: number, dt: number) {
  return v + (k * (target - x) - 2 * zeta * Math.sqrt(k) * v) * dt;
}
/** `a` shifted by whole turns so it sits nearest to `ref`. */
const nearAngle = (a: number, ref: number) => a + Math.PI * 2 * Math.round((ref - a) / (Math.PI * 2));

interface WalkLeg { to: THREE.Vector3; dur: number; kind: 'rise' | 'step' | 'sit'; yaw?: number }
const DEFAULT_SEAT = 'r6-L1';

const COLOR_KEYS = ['top', 'bottom', 'ctop', 'cbot', 'fog', 'hs', 'hg', 'sc', 'rain', 'grade'] as const;
const NUM_KEYS = ['hemi', 'sun', 'inner', 'tube', 'lamp', 'win', 'env', 'head', 'exp', 'haze', 'bloom', 'stars', 'sunY'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type NumKey = (typeof NUM_KEYS)[number];
type Palette = Record<ColorKey, string> & Record<NumKey, number>;
const TIMES: Record<TimeKey, Palette> = {
  day: { ctop: '#3f86d4', cbot: '#d2e6f3', stars: 0, sunY: 40, top: '#6f7c86', bottom: '#b9c0c2', fog: '#a9b2b4', hs: '#dfe5e8', hg: '#7a7f6c', sc: '#f4f6f8', rain: '#cdd6de', grade: '#f2f8ff', hemi: 1.35, sun: 0.45, inner: 0.35, tube: 0.4, lamp: 0, win: 0, env: 0.9, head: 0, exp: 0.95, haze: 0.012, bloom: 0.16 },
  evening: { ctop: '#2c3a72', cbot: '#f4a865', stars: 0.15, sunY: 9, top: '#2b2f55', bottom: '#c98560', fog: '#94705f', hs: '#f2b48c', hg: '#3b3326', sc: '#ffb27a', rain: '#dcc0ae', grade: '#fff1e2', hemi: 0.9, sun: 0.45, inner: 1.0, tube: 1.2, lamp: 1.8, win: 1.0, env: 0.6, head: 90, exp: 1.05, haze: 0.014, bloom: 0.26 },
  night: { ctop: '#02040b', cbot: '#0e1730', stars: 1, sunY: 30, top: '#04060d', bottom: '#131a2c', fog: '#0e121c', hs: '#34466c', hg: '#0b0b0b', sc: '#9fb0d0', rain: '#93a4bc', grade: '#e6eeff', hemi: 0.2, sun: 0, inner: 2.2, tube: 2.4, lamp: 3.2, win: 1.8, env: 0.25, head: 280, exp: 1.15, haze: 0.016, bloom: 0.32 },
};

const WHITE = new THREE.Color(1, 1, 1);

export class Engine {
  readonly seats: SeatSpot[];
  mix: Mix = { rain: 0.7, engine: 0.55, thunder: 0.45, horn: true, voice: CONDUCTOR_VOICE };
  private wx: Wx = { ...WEATHERS.rain };
  private wxT: Wx = { ...WEATHERS.rain };

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.04, 600);
  private busRig = new THREE.Group();
  private head = new THREE.Group();
  private T: Textures;
  private M: Materials;
  private cabin: Cabin;
  private world: World;
  private audio: AudioEngine | null = null;
  private skyMat: THREE.ShaderMaterial;
  private post: Post;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private inner: THREE.PointLight[];
  private headlight: THREE.SpotLight;
  private envMats = new Set<THREE.MeshStandardMaterial>();
  private curC = {} as Record<ColorKey, THREE.Color>;
  private tgtC = {} as Record<ColorKey, THREE.Color>;
  private curN = {} as Record<NumKey, number>;
  private tgtN = {} as Record<NumKey, number>;

  private J = { mode: 'preview' as Mode, stops: ROUTES.north.stops as readonly Stop[], leg: 0, focus: 1500, brk: 300, left: 0, paused: false, focused: 0, v0: CRUISE, T0: ARRIVE, ticketNo: '' };
  private speed = CRUISE;
  private targetSpeed = CRUISE;
  private yaw = 0.5;
  private pitch = -0.1;
  private tYaw = 0.5;
  private tPitch = -0.1;
  private seat: SeatSpot;
  private headBase = new THREE.Vector3();
  private walk: { legs: WalkLeg[]; i: number; t: number; from: THREE.Vector3; stride: number } | null = null;
  private myShutter: THREE.Mesh;
  private flash = 0;
  private strokes: Array<{ at: number; i: number }> = [];
  private bump = 0;
  private bumpV = 0;
  private rearHit: { in: number; amp: number } | null = null;
  // body motion of the bus and how it is felt in the seat
  private dyn = {
    prev: CRUISE, acc: 0, lat: 0, gear: 3, shift: 0,
    curve: 0, curveT: 0, curveIn: 5, heading: 0,
    pitch: 0, pitchV: 0, roll: 0, rollV: 0,
    leanX: 0, leanXV: 0, leanZ: 0, leanZV: 0,
  };
  private timers = { bump: 1, thunder: rand(12, 30), horn: rand(10, 25), snap: 0, chat: rand(25, 50) };
  private conductor = new Conductor({
    audio: () => this.audio,
    // the conductor works the aisle; passengers talk from the seats around you
    pan: (who) => (who === 'c' ? this.panFor(0.05, -2.55) : this.panFor(rand(-1, 1), this.head.position.z - rand(0.5, 1.5))),
    onLine: (l) => this.ev.onCaption?.(l),
    onDone: () => this.ev.onCaption?.(null),
    onTicket: () => this.audio?.ticketMachine(),
  });
  private t = 0;
  private clock = new THREE.Clock();
  private drag: { x: number; y: number; moved: number } | null = null;
  private gyro: { fn: (e: DeviceOrientationEvent) => void } | null = null;
  private ray = new THREE.Raycaster();
  private off: Array<() => void> = [];
  private reduceMotion: boolean;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, private ev: EngineEvents = {}) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));   // post effects soften edges anyway
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0xbfc6ca, 0.012);
    this.pmrem = new THREE.PMREMGenerator(r);

    this.T = makeTextures(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.M = makeMaterials(this.T);
    this.cabin = buildCabin(this.M, this.T);
    this.world = buildWorld(this.M, this.T);
    this.seats = this.cabin.seats;
    scene.add(this.busRig, this.world.group);
    this.busRig.add(this.cabin.bus, this.head);
    this.head.add(this.camera);

    this.seat = this.seats.find((s) => s.id === DEFAULT_SEAT)!;
    this.headBase.set(this.seat.x, EYE_Y, this.seat.z);
    this.head.position.copy(this.headBase);
    this.myShutter = this.shutterFor(this.seat);

    // sky and lights
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, flash: { value: 0 }, time: { value: 0 },
        cover: { value: 1 }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 0 }, stars: { value: 0 },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 ground; uniform float flash; uniform float time; varying vec3 vW;
        uniform float cover; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt; uniform float stars;
        float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a*ns(p); p = p*2.1 + 3.7; a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vW - cameraPosition); float h = d.y;
          vec3 c = mix(bottom, top, smoothstep(-0.02, 0.55, h));
          // stars on a clear night
          vec2 sg = floor(vec2(atan(d.z, d.x) * 180., asin(clamp(h, -1., 1.)) * 180.));
          float st = step(0.9965, hs(sg)) * smoothstep(0.05, 0.3, h) * stars * (1. - cover);
          c += st * vec3(0.8, 0.85, 1.0) * (0.5 + 0.5 * sin(time * 3. + hs(sg + 7.) * 40.));
          // the sun and its glow, hidden as the cloud thickens
          float sd = max(dot(d, sunDir), 0.);
          c += sunCol * (pow(sd, 900.) * 6. + pow(sd, 12.) * 0.25 + pow(sd, 3.) * 0.08) * sunAmt;
          // clouds: scattered white cumulus when clear, a heavy low monsoon deck when overcast
          vec2 uv = d.xz / (max(h, 0.0) + 0.12) * 0.6 + vec2(time * 0.012, time * 0.02);
          float n = fbm(uv);
          float cl = smoothstep(0.78 - cover * 0.43, 0.95 - cover * 0.15, n) * smoothstep(-0.02, 0.25, h);
          vec3 cloudCol = mix(bottom * 1.12 + 0.04, mix(top, bottom, 0.25) * 0.82, cover);
          c = mix(c, cloudCol, cl * mix(0.9, 0.7, cover));
          c = mix(c, bottom * 1.06, (1. - smoothstep(0., 0.12, h)) * 0.6);
          c = mix(c, ground, smoothstep(0.0, -0.08, h));
          c += flash*vec3(.55,.6,.75)*(0.6 + n);
          gl_FragColor = vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), this.skyMat));
    // the environment for reflections is the same rain sky, not a studio
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat));
    this.post = makePost(r, scene, this.camera, !matchMedia('(pointer: coarse)').matches && r.capabilities.isWebGL2);
    this.hemi = new THREE.HemisphereLight('#dfe6ea', '#4a5a3a', 1.5);
    this.sun = new THREE.DirectionalLight('#ffffff', 0.6);
    this.sun.position.set(30, 40, 16);   // behind your right shoulder: lights the view out of the left windows
    scene.add(this.hemi, this.sun, this.sun.target);
    if (this.post.high) {
      // sunlight through the window openings, and the bus's shadow on the road
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      const sc = this.sun.shadow;
      sc.mapSize.set(2048, 2048);
      Object.assign(sc.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 20, far: 90 });
      sc.camera.updateProjectionMatrix();
      sc.bias = -0.0004;
      sc.normalBias = 0.02;
      sc.radius = 3;
      this.sun.castShadow = true;
      this.cabin.bus.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.world.ground.forEach((m) => (m.receiveShadow = true));
    }
    this.inner = [-3.2, 0, 3.2].map((z) => {
      const l = new THREE.PointLight('#fff1d6', 1, 6.5, 1.3);
      l.position.set(0, 2.0, z);
      this.busRig.add(l);
      return l;
    });
    this.headlight = new THREE.SpotLight('#ffe7b0', 0, 70, 0.5, 0.6, 1.1);
    this.headlight.position.set(0, 0.2, -5.6);
    this.headlight.target.position.set(0.6, -1, -32);
    this.busRig.add(this.headlight, this.headlight.target);

    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.envMats.add(m as THREE.MeshStandardMaterial);
    });
    this.loadPalette('day', true);

    this.drawBoard();
    if (document.fonts) {
      void Promise.all([document.fonts.load(`800 40px ${ML_FONT}`, 'കണ്ണൂർ'), document.fonts.load('700 20px "Sora"')])
        .then(() => { if (!this.disposed) { this.drawBoard(); } })
        .catch(() => {});
    }

    this.bindInput();
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  // ---------------- public API ----------------
  setTime(key: TimeKey) { this.loadPalette(key, false); }

  /** Roll the weather in over the next few seconds. Ground stays wet for a while after rain. */
  setWeather(key: WeatherKey, instant = false) {
    this.wxT = { ...WEATHERS[key] };
    if (instant) { this.wx = { ...this.wxT }; WETNESS.value = this.wx.wet; }
    this.mix.rain = this.wxT.rain;
    this.mix.thunder = this.wxT.thunder;
    this.envDirty = instant ? 2 : 16;
  }

  setMix(m: Partial<Mix>) { Object.assign(this.mix, m); this.ensureAudio(); }

  ensureAudio(): AudioEngine | null {
    if (!this.audio) this.audio = AudioEngine.create();
    this.audio?.resume();
    return this.audio;
  }
  get audioEngine() { return this.audio; }

  setMusicPlaying(on: boolean) {
    if (this.audio) this.audio.musicPlaying = on;
    this.M.radioDial.emissiveIntensity = on ? 2.2 : 0;
  }

  startJourney(route: RouteKey, minutes: number, ride = false) {
    const J = this.J;
    J.stops = ROUTES[route].stops;
    J.leg = 0; J.paused = false; J.focused = 0;
    J.focus = minutes === 1 ? 60 : minutes * 60;
    J.brk = minutes === 1 ? 20 : minutes >= 50 ? 600 : 300;
    J.mode = ride ? 'ride' : 'running';
    J.left = J.focus;
    J.ticketNo = `No. ${(Math.random() * 9000 + 1000) | 0} ${(Math.random() * 90 + 10) | 0}`;
    this.targetSpeed = CRUISE;
    this.drawBoard();
    this.ensureAudio()?.doubleBell();
    if (this.mix.voice) window.setTimeout(() => this.conductor.boarding(), 900);
    this.timers.chat = rand(30, 60);
    const s = J.stops;
    if (ride) this.toast('ഡബിൾ ബെൽ!', `${s[0][1]} → ${s[s.length - 1][1]} · just riding`);
    else this.toast('ടിക്കറ്റ്! ടിക്കറ്റ്!', `Next stop ${s[1][1]} · ${minutes === 1 ? '1 min' : `${minutes} min`} focus`);
    this.emit();
  }

  togglePause() {
    const J = this.J;
    if (J.mode !== 'running' && J.mode !== 'break') return;
    J.paused = !J.paused;
    if (!J.paused && J.mode === 'running') this.audio?.doubleBell();
    this.emit();
  }

  endJourney() {
    this.J.mode = 'ride';
    this.J.paused = false;
    this.targetSpeed = CRUISE;
    this.toast('Ride on', 'Timer stopped. Open Journey to start again.', 2600);
    this.emit();
  }

  toggleMyShutter() { this.ensureAudio(); this.toggleShutter(this.myShutter); }

  /** Walk to another free seat. */
  setSeat(id: string): boolean {
    const s = this.seats.find((x) => x.id === id);
    if (!s || s.occupied || s.id === this.seat.id) return false;
    const from = this.seat;
    this.seat = s;
    // stand, edge out of the row, walk the aisle, edge in, sit
    const ax = (x: number) => lerp(x, AISLE_X, 0.25);
    const dz = s.z - from.z, dir = Math.sign(dz) || 1;
    const legs: WalkLeg[] = [{ to: new THREE.Vector3(ax(from.x), STAND_Y, from.z - 0.06), dur: 0.8, kind: 'rise' }];
    const fx = Math.abs(from.x - AISLE_X), tx = Math.abs(s.x - AISLE_X);
    if (fx > 0.12) legs.push({ to: new THREE.Vector3(AISLE_X, STAND_Y, from.z), dur: 0.3 + fx / 0.6, kind: 'step', yaw: from.side < 0 ? -HALF_PI : HALF_PI });
    if (Math.abs(dz) > 0.05) legs.push({ to: new THREE.Vector3(AISLE_X, STAND_Y, s.z), dur: 0.4 + Math.abs(dz) / 1.05, kind: 'step', yaw: dir < 0 ? 0 : Math.PI });
    if (tx > 0.12) legs.push({ to: new THREE.Vector3(ax(s.x), STAND_Y, s.z), dur: 0.3 + tx / 0.6, kind: 'step', yaw: s.side < 0 ? HALF_PI : -HALF_PI });
    legs.push({ to: new THREE.Vector3(s.x, EYE_Y, s.z), dur: 0.9, kind: 'sit', yaw: s.yaw });
    this.walk = { legs, i: 0, t: 0, from: this.headBase.clone(), stride: 0 };
    this.tYaw = nearAngle(legs[1].yaw!, this.yaw);   // look where you are going as you get up
    this.tPitch = -0.18;
    this.myShutter = this.shutterFor(s);
    this.toast('സീറ്റ് മാറി', s.label, 2200);
    this.emit();
    return true;
  }

  async toggleGyro(): Promise<boolean> {
    if (this.gyro) {
      window.removeEventListener('deviceorientation', this.gyro.fn);
      this.gyro = null;
      return false;
    }
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') throw new Error('denied');
    } catch {
      this.toast('Motion blocked', 'Drag with your finger to look around instead.', 2600);
      return false;
    }
    let a0: number | null = null, b0 = 0;
    const y0 = this.tYaw, p0 = this.tPitch;
    const fn = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      if (a0 == null) { a0 = e.alpha; b0 = e.beta; }
      let da = e.alpha - a0;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      this.tYaw = y0 + THREE.MathUtils.degToRad(da);
      this.tPitch = clamp(p0 + THREE.MathUtils.degToRad(e.beta - b0), -1, 0.85);
    };
    window.addEventListener('deviceorientation', fn);
    this.gyro = { fn };
    return true;
  }

  snapshot(): Snapshot {
    const J = this.J;
    return { mode: J.mode, paused: J.paused, left: J.left, leg: J.leg, stops: J.stops, ticketNo: J.ticketNo, focused: J.focused, seatId: this.seat.id, myShutterDown: this.myShutter.userData.target === 1, audioOn: !!this.audio };
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.off.forEach((f) => f());
    if (this.gyro) window.removeEventListener('deviceorientation', this.gyro.fn);
    this.conductor.stop();
    this.audio?.close();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    Object.values(this.T).forEach((t) => t.dispose());
    this.post.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  // ---------------- internals ----------------
  private emit() { this.ev.onSnapshot?.(this.snapshot()); }
  private toast(big: string, sub: string, ms?: number) { this.ev.onToast?.(big, sub, ms); }

  private drawBoard() {
    const s = this.J.stops;
    drawBoard(this.T.board, s[0][0], s[s.length - 1][0]);
  }

  private shutterFor(s: SeatSpot) {
    let best = this.cabin.shutters[0], bd = Infinity;
    for (const m of this.cabin.shutters) {
      if (m.userData.side !== s.side) continue;
      const d = Math.abs(m.position.z - s.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  private toggleShutter(m: THREE.Mesh) {
    m.userData.target = m.userData.target ? 0 : 1;
    if (!m.userData.target) this.audio?.clack();   // dropping clacks when it hits the sill
    if (m === this.myShutter) this.emit();
  }

  private loadPalette(key: TimeKey, instant: boolean) {
    const p = TIMES[key];
    for (const k of COLOR_KEYS) {
      this.tgtC[k] = new THREE.Color(p[k]);
      if (instant) this.curC[k] = new THREE.Color(p[k]);
    }
    for (const k of NUM_KEYS) {
      this.tgtN[k] = p[k];
      if (instant) this.curN[k] = p[k];
    }
    this.envDirty = 3;   // refresh reflections a few times while the sky changes
  }

  private envDirty = 0;
  private envTimer = 0;
  private refreshEnv() {
    const u = this.skyMat.uniforms, f = u.flash.value;
    u.flash.value = 0;
    const next = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    u.flash.value = f;
    this.scene.environment = next.texture;
    this.envRT?.dispose();
    this.envRT = next;
  }

  private applyPalette(dt: number) {
    const a = 1 - Math.exp(-dt * 2.2);
    for (const k of COLOR_KEYS) this.curC[k].lerp(this.tgtC[k], a);
    for (const k of NUM_KEYS) this.curN[k] = lerp(this.curN[k], this.tgtN[k], a);
    const c = this.curC, n = this.curN, f = this.flash;
    // clouds roll in or break up over ~10 s; the ground soaks fast and dries slowly
    const w = this.wx, wt = this.wxT, b = 1 - Math.exp(-dt * 0.35);
    w.cloud = lerp(w.cloud, wt.cloud, b);
    w.wind = lerp(w.wind, wt.wind, b);
    WETNESS.value += clamp(wt.wet - WETNESS.value, -dt * 0.012, dt * 0.25);
    const clear = 1 - w.cloud;
    INDOOR.value = lerp(0.42, 1, w.cloud);   // shaded cabin vs the bright open sky
    const su = this.skyMat.uniforms;
    su.top.value.copy(c.ctop).lerp(c.top, w.cloud);
    su.bottom.value.copy(c.cbot).lerp(c.bottom, w.cloud);
    su.cover.value = w.cloud;
    su.stars.value = n.stars;
    su.sunCol.value.copy(c.sc);
    su.sunAmt.value = clamp(n.sun * 2, 0, 1) * clear * clear;
    this.sun.position.set(30, n.sunY, 16);
    su.sunDir.value.copy(this.sun.position).normalize();
    this.skyMat.uniforms.flash.value = f;
    this.skyMat.uniforms.ground.value.copy(c.hg);
    this.skyMat.uniforms.time.value = this.t;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(c.fog).lerp(c.cbot, clear * 0.7);
    fog.density = n.haze * (0.2 + 0.8 * w.cloud) * (0.55 + this.mix.rain * 0.7);
    this.post.bloom.strength = n.bloom + f * 0.6;
    this.post.grade.uniforms.tint.value.copy(c.grade).lerp(WHITE, clear * 0.6);
    this.post.grade.uniforms.sat.value = 0.88 + clear * 0.2;
    this.post.grade.uniforms.time.value = this.t;
    this.envTimer -= dt;
    if (this.envDirty > 0 && this.envTimer <= 0) { this.envDirty--; this.envTimer = 0.6; this.refreshEnv(); }
    this.hemi.color.copy(c.hs);
    this.hemi.groundColor.copy(c.hg);
    this.hemi.intensity = n.hemi * (0.75 + 0.25 * w.cloud) + f * 5;
    this.sun.color.copy(c.sc);
    this.sun.intensity = n.sun * (1 + clear * 6);   // direct sun is many times the overcast light
    this.inner.forEach((l) => (l.intensity = n.inner * 3));
    this.M.tube.emissiveIntensity = n.tube;
    this.M.lamp.emissiveIntensity = n.lamp;
    this.M.window.emissiveIntensity = n.win;
    this.world.glowMat.opacity = clamp(n.lamp / 3.2, 0, 1) * 0.9;
    this.world.rainMat.color.copy(c.rain);
    this.headlight.intensity = n.head;
    this.renderer.toneMappingExposure = n.exp * (1 + clear * 0.12);
    this.envMats.forEach((m) => (m.envMapIntensity = n.env));
  }

  private updateJourney(dt: number) {
    const J = this.J;
    if (J.mode === 'running') {
      if (J.paused) { this.targetSpeed = 0; return; }
      this.targetSpeed = CRUISE;
      J.left -= dt; J.focused += dt;
      if (J.left <= ARRIVE) {
        J.mode = 'arriving';
        J.v0 = Math.max(this.speed, 2);
        J.T0 = J.left;
        const next = J.stops[J.leg + 1];
        this.world.spawnShelter(next[0], next[1], this.head.position.z - 0.4, (J.v0 * J.T0) / 2);
        this.audio?.bell();
      }
    } else if (J.mode === 'arriving') {
      J.left -= dt; J.focused += dt;
      this.speed = J.v0 * clamp(J.left / J.T0, 0, 1);
      if (J.left <= 0) this.arrive();
    } else if (J.mode === 'break') {
      if (!J.paused) J.left -= dt;
      if (J.left <= 0) this.depart();
    }
  }

  private arrive() {
    const J = this.J;
    J.leg++;
    this.speed = 0;
    this.targetSpeed = 0;
    const stop = J.stops[J.leg];
    const last = J.leg >= J.stops.length - 1;
    if (this.mix.voice) this.conductor.arrive(stop, last, J.brk);
    else this.audio?.duck(3.5);
    if (last) {
      J.mode = 'done';
      this.toast(`${stop[0]}! ${stop[0]}!`, 'Last stop. Everybody down!');
      this.emit();
      window.setTimeout(() => { if (!this.disposed) this.ev.onDone?.(this.snapshot()); }, 3200);
      return;
    }
    J.mode = 'break';
    J.left = J.brk;
    const m = Math.round(J.brk / 60);
    this.toast(`${stop[0]}! ${stop[0]}!`, `ഇടവേള · ${J.brk < 60 ? `${J.brk} s` : `${m} min`} break · stretch your legs`);
    this.emit();
  }

  private depart() {
    const J = this.J;
    J.mode = 'running';
    J.left = J.focus;
    this.targetSpeed = CRUISE;
    if (this.mix.voice) this.conductor.depart();
    window.setTimeout(() => this.audio?.doubleBell(), this.mix.voice ? 1100 : 0);   // "Right, right!" then the bell
    this.toast('ഡബിൾ ബെൽ!', `Next stop ${J.stops[J.leg + 1][1]}`);
    this.emit();
  }

  private bindInput() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.off.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(c, 'pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); });
    on(c, 'pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
      const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
      this.tYaw += dx * k;
      this.tPitch = clamp(this.tPitch + dy * k * 0.8, -1.0, 0.85);
      if (d.moved > 20) this.ev.onInteract?.();
    });
    on(c, 'pointerup', (e) => { if (this.drag && this.drag.moved < 7) this.tap(e.clientX, e.clientY); this.drag = null; });
    on(c, 'pointercancel', () => { this.drag = null; });
    on(window, 'keydown', (e) => {
      const tEl = e.target as HTMLElement | null;
      if (tEl && tEl.closest && tEl.closest('input,button,a,textarea,select')) return;
      if (e.key === 'ArrowLeft') this.tYaw += 0.12;
      else if (e.key === 'ArrowRight') this.tYaw -= 0.12;
      else if (e.key === 'ArrowUp') this.tPitch = clamp(this.tPitch + 0.1, -1, 0.85);
      else if (e.key === 'ArrowDown') this.tPitch = clamp(this.tPitch - 0.1, -1, 0.85);
    });
    on(window, 'resize', () => this.resize());
  }

  private tap(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([...this.cabin.clickables, ...this.cabin.blockers], false)[0];
    if (!hit) return;
    const kind = hit.object.userData.kind;
    this.ensureAudio();
    this.ev.onInteract?.();
    if (kind === 'shutter') this.toggleShutter(hit.object as THREE.Mesh);
    else if (kind === 'cord') this.audio?.doubleBell();
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 80 : 64;
    this.camera.updateProjectionMatrix();
  }

  /** Pan value (-1 left .. 1 right) for a sound source at bus-space (x, z). */
  private panFor(x: number, z: number) {
    const dx = x - this.head.position.x, dz = z - this.head.position.z;
    const len = Math.hypot(dx, dz) || 1;
    // project onto the head's right vector (cos yaw, 0, -sin yaw); yaw turns the head left
    const lx = (dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / len;
    return clamp(lx * 0.8, -0.9, 0.9);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    this.updateJourney(dt);
    const D = this.dyn;
    if (this.J.mode !== 'arriving') {
      if (this.targetSpeed > this.speed + 0.01) {
        // pull away through the gears, with a short coast while the driver shifts
        if (D.shift > 0) { D.shift -= dt; this.speed = Math.max(0, this.speed - 0.25 * dt); }
        else {
          if (this.speed > GEAR_TOP[D.gear] && D.gear < 3) { D.gear++; D.shift = rand(0.45, 0.75); }
          const a = GEAR_ACC[D.gear] * clamp((this.targetSpeed - this.speed) * 1.5, 0.15, 1);
          this.speed = Math.min(this.targetSpeed, this.speed + a * dt);
        }
      } else this.speed += clamp(this.targetSpeed - this.speed, -2.4 * dt, 2.4 * dt);
    }
    if (this.speed < 0.3 || (this.speed < GEAR_TOP[D.gear - 1] - 0.5 && this.targetSpeed <= this.speed)) {
      D.gear = Math.max(0, GEAR_TOP.findIndex((g) => this.speed <= g));
    }
    const sf = this.speed / CRUISE, step = this.speed * dt;
    const lo = D.gear ? GEAR_TOP[D.gear - 1] : 0, hi = Math.min(GEAR_TOP[D.gear], CRUISE * 1.15);
    const rpm = this.speed < 0.2 ? 0 : clamp((this.speed - lo * 0.6) / (hi - lo * 0.6), 0, 1) * (D.shift > 0 ? 0.55 : 1);
    this.world.update(dt, step, sf, this.mix.rain, this.wx.wind);
    this.world.group.rotation.y = D.heading;

    // lightning, thunder, horns
    const tm = this.timers;
    tm.thunder -= dt;
    if (tm.thunder < 0) {
      tm.thunder = rand(22, 60) / (0.5 + this.mix.thunder * 1.6);   // storms strike far more often
      if (this.mix.rain > 0.3 && this.mix.thunder > 0.02) {
        // a strike is a leader glow followed by a few return strokes, tens of ms apart
        let at = this.t, n = 2 + ((Math.random() * 3) | 0);
        this.strokes.push({ at, i: 0.25 });
        while (n--) { at += rand(0.04, 0.16); this.strokes.push({ at, i: rand(0.6, 1) }); }
        if (Math.random() < 0.4) this.strokes.push({ at: at + rand(0.3, 0.6), i: rand(0.3, 0.6) });
        window.setTimeout(() => this.audio?.thunder(this.mix.thunder), rand(500, 1800));
      }
    }
    this.flash *= Math.exp(-dt * 11);
    this.strokes = this.strokes.filter((k) => {
      if (k.at > this.t) return true;
      this.flash = Math.max(this.flash, k.i);
      return false;
    });
    // the conductor works the aisle between stops
    tm.chat -= dt;
    if (tm.chat < 0) {
      tm.chat = rand(60, 150);
      const J = this.J;
      if (this.mix.voice && this.audio && (J.mode === 'running' || J.mode === 'ride') && !J.paused) {
        this.conductor.chat(J.stops[Math.min(J.leg + 1, J.stops.length - 1)], this.mix.rain > 0.2);
      }
    }
    tm.horn -= dt;
    if (tm.horn < 0) { tm.horn = rand(14, 40); if (this.speed > 3 && this.mix.horn) this.audio?.horn(); }

    // shutters slide
    // shutters drop under their own weight and bounce on the sill; pulling one up is a steady hand
    for (const m of this.cabin.shutters) {
      const u = m.userData;
      if (u.target) {
        if (u.t < 1 || Math.abs(u.v) > 0.01) {
          u.v += 6.5 * dt;
          u.t += u.v * dt;
          if (u.t >= 1) {
            if (u.v > 2) this.audio?.clack();
            u.t = 1; u.v = u.v > 0.6 ? -u.v * 0.22 : 0;
          }
        }
      } else {
        u.v = spring(u.t, u.v, 0, 55, 1, dt);
        u.t = Math.max(0, u.t + u.v * dt);
      }
      m.position.y = lerp(1.42, 0.83, u.t);
    }

    // forces: braking/pulling away along the bus, and the road's bends across it
    const accRaw = dt > 0 ? (this.speed - D.prev) / dt : 0;
    D.prev = this.speed;
    D.acc += (accRaw - D.acc) * Math.min(1, dt * 14);
    D.curveIn -= dt;
    if (D.curveIn < 0) { D.curveIn = rand(4, 11); D.curveT = Math.random() < 0.3 ? 0 : rand(-1, 1) / rand(70, 160); }
    D.curve += (D.curveT - D.curve) * Math.min(1, dt * 0.5);
    D.lat = this.speed * this.speed * D.curve;
    D.heading += (D.curve * 1.6 * sf - D.heading) * Math.min(1, dt * 0.8);

    // body on its springs: nose dives under braking, squats pulling away, leans out in bends
    D.pitchV = spring(D.pitch, D.pitchV, D.acc * 0.0065, 30, 0.32, dt);
    D.pitch += D.pitchV * dt;
    D.rollV = spring(D.roll, D.rollV, -D.lat * 0.011, 18, 0.38, dt);
    D.roll += D.rollV * dt;

    // potholes: front axle first, rear axle a wheelbase later
    tm.bump -= dt * sf;
    if (tm.bump < 0) {
      const amp = rand(0.5, 1.4) * sf * (Math.random() < 0.12 ? 2.2 : 1);
      this.bumpV += amp * 0.6;
      D.pitchV += amp * 0.05;
      D.rollV += amp * rand(-0.03, 0.03);
      this.rearHit = { in: 5.6 / Math.max(this.speed, 1), amp };
      tm.bump = rand(0.6, 3.2);
    }
    if (this.rearHit && (this.rearHit.in -= dt) < 0) {
      this.bumpV += this.rearHit.amp * 0.8;
      D.pitchV -= this.rearHit.amp * 0.05;
      this.rearHit = null;
    }
    this.bumpV += (-this.bump * 60 - this.bumpV * 6) * dt;
    this.bump += this.bumpV * dt;

    // diesel shake: a coarse idle judder when stopped, a fine road buzz when moving
    const idle = 1 - clamp(this.speed / 2, 0, 1);
    const shake = (Math.sin(this.t * 37) + Math.sin(this.t * 53.3) * 0.6) * (0.0011 * idle + 0.0004 * sf);
    const mo = this.reduceMotion ? 0.25 : 1;
    this.busRig.position.y = (this.bump * 0.012 + shake) * mo;
    this.busRig.rotation.z = (D.roll + this.bump * 0.004 + shake * 0.4) * mo;
    this.busRig.rotation.x = D.pitch * mo;

    // your body lags the bus: thrown forward when it brakes, sideways in bends
    const standing = this.walk ? 1.8 : 1;
    D.leanZV = spring(D.leanZ, D.leanZV, D.acc, 26, 0.42, dt);
    D.leanZ += D.leanZV * dt;
    D.leanXV = spring(D.leanX, D.leanXV, D.lat, 14, 0.5, dt);
    D.leanX += D.leanXV * dt;

    // walking to a new seat: stand up, edge out, walk the aisle, edge in, sit down
    if (this.walk) {
      const w = this.walk, leg = w.legs[w.i];
      const prev = this.headBase.clone();
      w.t = Math.min(1, w.t + dt / leg.dur);
      const e = leg.kind === 'sit' ? 1 - (1 - w.t) ** 3 : smooth(w.t);
      this.headBase.lerpVectors(w.from, leg.to, e);
      if (leg.kind === 'sit' && w.t > 0.6) this.headBase.y -= Math.sin(((w.t - 0.6) / 0.4) * Math.PI) * 0.025;
      w.stride += prev.distanceTo(this.headBase) * (leg.kind === 'step' ? 1 : 0);
      if (w.t >= 1) {
        w.from = leg.to.clone();
        w.i++;
        w.t = 0;
        const next = w.legs[w.i];
        if (!next) { this.walk = null; this.tPitch = -0.08; }
        else if (next.yaw !== undefined) this.tYaw = nearAngle(next.yaw, this.yaw);
      }
    }
    // footsteps: the head drops a little on each step and sways over the planted foot
    const stepPh = (this.walk ? this.walk.stride : 0) / 0.62 * Math.PI;
    const gait = this.walk && this.walk.legs[this.walk.i].kind === 'step' ? mo : 0;
    const k = 0.016 * standing * mo;
    this.head.position.set(
      this.headBase.x + D.leanX * k + Math.sin(stepPh) * 0.018 * gait,
      this.headBase.y - Math.abs(Math.cos(stepPh)) * 0.028 * gait + this.bump * 0.004 * mo,
      this.headBase.z + D.leanZ * k * 1.4,
    );

    // other passengers sway with the bus; standing ones swing from the grab loop
    for (const p of this.cabin.people) {
      const u = p.userData, g = u.standing ? 2.2 : 1;
      p.rotation.x = (D.leanZ * 0.009 * g + Math.sin(this.t * 0.5 + u.phase) * 0.004 * g + this.bump * 0.01) * mo;
      p.rotation.z = (-D.leanX * 0.012 * g + (u.standing ? Math.sin(this.t * 0.7 + u.phase) * 0.012 : 0)) * mo;
    }

    // look
    const lookRate = this.walk ? 4 : 10;
    this.yaw += (this.tYaw - this.yaw) * Math.min(1, dt * lookRate);
    this.pitch += (this.tPitch - this.pitch) * Math.min(1, dt * lookRate);
    this.head.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + D.leanZ * 0.004 * mo;
    this.camera.rotation.z = -D.leanX * 0.003 * mo + Math.sin(stepPh) * 0.006 * gait;

    this.applyPalette(dt);

    if (this.audio) {
      const hp = this.head.position, rp = this.cabin.radioPos;
      this.audio.update({
        rain: this.mix.rain,
        shut: this.myShutter.userData.t,
        engine: this.mix.engine,
        sf,
        rpm,
        bump: this.bumpV,
        rainPan: this.panFor(this.seat.side * 1.25, hp.z),
        enginePan: this.panFor(0, -5.2),
        radioPan: this.panFor(rp.x, rp.z),
      });
    }

    tm.snap += dt;
    if (tm.snap > 0.25) { tm.snap = 0; this.emit(); }
    this.post.composer.render(dt);
  }
}
