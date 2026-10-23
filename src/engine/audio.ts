import { rand } from './util';

/**
 * Every bus sound is synthesised here, so the app ships no audio files.
 * Songs come from the listener's own device and are routed through the bus radio.
 */
export interface AudioFrame {
  rain: number;        // 0..1 slider
  shut: number;        // 0 open .. 1 shutter down at your window
  engine: number;      // 0..1 slider
  sf: number;          // speed fraction 0..1
  rpm: number;         // 0 idle .. 1 top of the current gear
  bump: number;        // suspension jolt
  rainPan: number;     // -1..1, where rain is relative to your head
  enginePan: number;
  radioPan: number;
}

type Pan = StereoPannerNode | GainNode;

export class AudioEngine {
  readonly ac: AudioContext;
  private master: GainNode;
  private white: AudioBuffer;
  private brown: AudioBuffer;
  private rLP: BiquadFilterNode;
  private rGain: GainNode;
  private rPan: Pan;
  private roofGain: GainNode;
  private eGain: GainNode;
  private ePan: Pan;
  private osc: OscillatorNode;
  private oLP: BiquadFilterNode;
  private ratGain: GainNode;
  private fxPan: Pan;

  // radio chain
  private musicIn: GainNode | null = null;
  private sources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private staticGain!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private musicGain!: GainNode;
  private duckGain!: GainNode;
  private musicPan!: Pan;
  private crackle!: GainNode;
  private radioFx = true;
  // voices inside the cabin
  private voiceIn: GainNode | null = null;
  private clips = new Map<string, Promise<AudioBuffer>>();
  private musicVol = 0.8;
  musicPlaying = false;

  static create(): AudioEngine | null {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { return new AudioEngine(new AC()); } catch { return null; }
  }

  private constructor(ac: AudioContext) {
    this.ac = ac;
    this.white = this.noise('white');
    this.brown = this.noise('brown');
    this.master = this.gain(0.9);
    this.master.connect(ac.destination);

    this.rLP = this.filter('lowpass', 6500);
    this.rGain = this.gain(0);
    this.rPan = this.pan();
    this.loop(this.white).connect(this.filter('highpass', 500)).connect(this.rLP).connect(this.rGain).connect(this.rPan).connect(this.master);

    this.roofGain = this.gain(0);
    this.loop(this.brown).connect(this.filter('lowpass', 750)).connect(this.roofGain).connect(this.master);

    this.eGain = this.gain(0);
    this.ePan = this.pan();
    this.loop(this.brown).connect(this.filter('lowpass', 170)).connect(this.eGain);
    this.osc = ac.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 40;
    this.oLP = this.filter('lowpass', 200);
    this.osc.connect(this.oLP).connect(this.gain(0.22)).connect(this.eGain);
    this.osc.start();
    this.eGain.connect(this.ePan).connect(this.master);

    this.ratGain = this.gain(0);
    this.loop(this.white).connect(this.filter('bandpass', 2300, 4)).connect(this.ratGain).connect(this.master);

    this.fxPan = this.pan();
    this.fxPan.connect(this.master);
  }

  // ---------- building blocks ----------
  private gain(v: number) { const g = this.ac.createGain(); g.gain.value = v; return g; }
  private filter(type: BiquadFilterType, f: number, q?: number) {
    const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b;
  }
  private pan(): Pan { return this.ac.createStereoPanner ? this.ac.createStereoPanner() : this.gain(1); }
  private noise(kind: 'white' | 'brown' | 'crackle') {
    const sr = this.ac.sampleRate, b = this.ac.createBuffer(2, sr * 4, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (kind === 'crackle') d[i] = Math.random() < 0.0009 ? w : w * 0.015;
        else d[i] = w;
      }
    }
    return b;
  }
  private loop(buf: AudioBuffer) { const s = this.ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  private set(p: AudioParam, v: number, tc = 0.12) { p.setTargetAtTime(v, this.ac.currentTime, tc); }
  private setPan(p: Pan, v: number) { if ('pan' in p) this.set(p.pan, v); }

  resume() { if (this.ac.state === 'suspended') void this.ac.resume(); }

  /** Called every frame with the scene state. */
  update(f: AudioFrame) {
    this.set(this.rGain.gain, f.rain * 0.5 * (1 - 0.55 * f.shut));
    this.set(this.rLP.frequency, 6500 - 4600 * f.shut);
    this.set(this.roofGain.gain, f.rain * 0.35);
    this.set(this.eGain.gain, f.engine * (0.35 + 0.65 * f.sf));
    this.set(this.osc.frequency, 32 + f.rpm * 30);
    this.set(this.oLP.frequency, 150 + f.rpm * 170);
    this.set(this.ratGain.gain, f.engine * f.sf * (0.03 + Math.min(0.25, Math.abs(f.bump) * 0.25)), 0.05);
    this.setPan(this.rPan, f.rainPan);
    this.setPan(this.ePan, f.enginePan);
    this.setPan(this.fxPan, f.enginePan);
    if (this.musicIn) {
      this.setPan(this.musicPan, f.radioPan);
      this.set(this.crackle.gain, this.radioFx && this.musicPlaying ? 0.35 * this.musicVol : 0);
    }
  }

  // ---------- one-shots ----------
  bell(delay = 0) {
    const t0 = this.ac.currentTime + delay, out = this.gain(0.55);
    out.connect(this.fxPan);
    ([[1, 0.35], [2.0, 0.1], [2.76, 0.18], [5.4, 0.06]] as const).forEach(([m, amp], i) => {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.frequency.value = 1040 * m;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5 / (1 + i * 0.6));
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 1.7);
    });
  }
  doubleBell() { this.bell(0); this.bell(0.28); }

  thunder(level: number) {
    if (level <= 0.01) return;
    const t0 = this.ac.currentTime, s = this.ac.createBufferSource(), g = this.gain(0), lv = level * 1.6;
    s.buffer = this.brown;
    s.connect(this.filter('lowpass', 260)).connect(g).connect(this.master);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(lv, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(lv * 0.45, t0 + 1.1);
    g.gain.linearRampToValueAtTime(lv * 0.7, t0 + 1.6);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 6);
    s.start(t0, rand(0, 2));
    s.stop(t0 + 6.2);
  }

  horn() {
    const t0 = this.ac.currentTime, out = this.gain(0), p = this.pan();
    if ('pan' in p) p.pan.value = 0.45;
    out.connect(this.filter('lowpass', 1800)).connect(p).connect(this.master);
    for (const f of [345, 435]) {
      const o = this.ac.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(out); o.start(t0); o.stop(t0 + 0.75);
    }
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(0.05, t0 + 0.04);
    out.gain.setValueAtTime(0.05, t0 + 0.5);
    out.gain.linearRampToValueAtTime(0, t0 + 0.7);
  }

  /** Fetch and decode a voice clip once; later calls share the result. */
  loadClip(url: string) {
    let p = this.clips.get(url);
    if (!p) {
      p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); }).then((b) => this.ac.decodeAudioData(b));
      p.catch(() => this.clips.delete(url));
      this.clips.set(url, p);
    }
    return p;
  }

  /** Someone speaking inside the bus: a little boxy, with the short ring of a steel cabin. */
  playVoice(buf: AudioBuffer, pan: number, level = 1) {
    if (!this.voiceIn) {
      this.voiceIn = this.gain(1);
      const tone = this.filter('peaking', 2400); tone.gain.value = 3; tone.Q.value = 0.9;
      const body = this.voiceIn.connect(this.filter('highpass', 130)).connect(tone);
      body.connect(this.master);
      const verb = this.ac.createConvolver();
      verb.buffer = this.cabinIR();
      body.connect(verb).connect(this.gain(0.32)).connect(this.master);
    }
    const src = this.ac.createBufferSource(), g = this.gain(level), p = this.pan();
    src.buffer = buf;
    if ('pan' in p) p.pan.value = pan;
    src.connect(g).connect(p).connect(this.voiceIn);
    src.start();
    return { done: new Promise<void>((r) => (src.onended = () => r())), stop: () => { try { src.stop(); } catch { /* already ended */ } } };
  }

  /** Impulse response of a bus interior: dense early reflections off steel and glass, ~0.4 s tail. */
  private cabinIR() {
    const sr = this.ac.sampleRate, n = Math.floor(sr * 0.45), b = this.ac.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.09)) * 0.5;
      for (let k = 0; k < 6; k++) d[Math.floor(sr * rand(0.004, 0.03))] += rand(-0.6, 0.6);
    }
    return b;
  }

  /** The conductor's handheld ticket machine: two beeps and the printer. */
  ticketMachine() {
    const t0 = this.ac.currentTime + 0.15, out = this.gain(0.06);
    out.connect(this.fxPan);
    for (const [t, f] of [[0, 2600], [0.14, 2600]] as const) {
      const o = this.ac.createOscillator(), g = this.gain(0);
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(1, t0 + t);
      g.gain.setValueAtTime(0, t0 + t + 0.08);
      o.connect(g).connect(out); o.start(t0 + t); o.stop(t0 + t + 0.1);
    }
    const s = this.ac.createBufferSource(), g = this.gain(0);
    s.buffer = this.white;
    s.connect(this.filter('bandpass', 3200, 3)).connect(g).connect(this.fxPan);
    for (let i = 0; i < 9; i++) {   // the stepper motor feeding paper in little jerks
      const t = t0 + 0.4 + i * 0.07;
      g.gain.setValueAtTime(0.18, t);
      g.gain.setValueAtTime(0.04, t + 0.04);
    }
    g.gain.setValueAtTime(0, t0 + 1.05);
    s.start(t0 + 0.4); s.stop(t0 + 1.1);
  }

  clack() {
    const t0 = this.ac.currentTime, s = this.ac.createBufferSource(), g = this.gain(0);
    s.buffer = this.white;
    s.connect(this.filter('bandpass', 900, 2)).connect(g).connect(this.master);
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    s.start(t0);
    s.stop(t0 + 0.3);
  }

  // ---------- the bus radio ----------
  /** The speaker chain, built once and shared by every source (your songs, each FM station). */
  private buildRadio() {
    if (this.musicIn) return;
    const input = (this.musicIn = this.gain(1));
    this.dry = this.gain(0);
    this.wet = this.gain(1);
    this.musicGain = this.gain(this.musicVol);
    this.duckGain = this.gain(1);
    this.musicPan = this.pan();
    // a small cabin speaker: no deep bass, no sparkle, a little grit
    const shaper = this.ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
    shaper.curve = curve;
    const mid = this.filter('peaking', 1400); mid.gain.value = 4; mid.Q.value = 0.8;
    input.connect(this.filter('highpass', 280)).connect(this.filter('lowpass', 3800)).connect(mid).connect(shaper).connect(this.wet);
    input.connect(this.dry);
    this.dry.connect(this.musicGain);
    this.wet.connect(this.musicGain);
    this.musicGain.connect(this.duckGain).connect(this.musicPan).connect(this.master);
    this.crackle = this.gain(0);
    this.loop(this.noise('crackle')).connect(this.filter('highpass', 1200)).connect(this.crackle).connect(this.musicPan);
    // the hiss between stations while the radio tunes in
    this.staticGain = this.gain(0);
    this.loop(this.white).connect(this.filter('bandpass', 1800, 0.6)).connect(this.staticGain).connect(this.musicGain);
    this.setRadioFx(this.radioFx);
  }

  /**
   * Route a media element through the radio speaker. Safe to call more than once.
   * Only call this for same-origin or CORS-enabled media: anything else would play as silence.
   */
  attachMusic(el: HTMLMediaElement): boolean {
    this.buildRadio();
    if (this.sources.has(el)) return true;
    try {
      const src = this.ac.createMediaElementSource(el);
      src.connect(this.musicIn!);
      this.sources.set(el, src);
      return true;
    } catch {
      return false;
    }
  }
  detachMusic(el: HTMLMediaElement) {
    this.sources.get(el)?.disconnect();
    this.sources.delete(el);
  }
  isRouted(el: HTMLMediaElement) { return this.sources.has(el); }
  /** Tuning hiss, 0..1. */
  setStatic(level: number) {
    this.buildRadio();
    this.set(this.staticGain.gain, level * 0.12, 0.08);
  }
  get hasMusicRoute() { return !!this.musicIn; }
  setRadioFx(on: boolean) {
    this.radioFx = on;
    if (!this.musicIn) return;
    this.set(this.wet.gain, on ? 1 : 0, 0.08);
    this.set(this.dry.gain, on ? 0 : 1, 0.08);
  }
  setMusicVolume(v: number) {
    this.musicVol = v;
    if (this.musicIn) this.set(this.musicGain.gain, v, 0.05);
  }
  /** Lower the radio while the conductor calls the stop. */
  duck(seconds: number) {
    if (!this.musicIn) return;
    const t = this.ac.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(0.3, t, 0.15);
    this.duckGain.gain.setTargetAtTime(1, t + seconds, 0.6);
  }

  close() { void this.ac.close().catch(() => {}); }
}
