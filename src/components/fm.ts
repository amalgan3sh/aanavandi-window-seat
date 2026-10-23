import type { AudioEngine } from '@/engine/audio';

/**
 * Live radio for the bus speaker. Stations come from radio-browser.info, a free, open
 * directory of public internet radio streams; audio plays straight from each station.
 */
export interface Station {
  id: string;
  name: string;
  url: string;
  hls: boolean;
  meta: string;        // "AAC · 128 kbps"
  kind: 'fm' | 'songs';
}
interface RawStation {
  stationuuid: string; name: string; url_resolved: string; codec: string; bitrate: number;
  hls: number; tags: string; lastcheckok: number;
}

const HOSTS = ['all', 'de1', 'de2'];
const FM_NAME = /\b(fm|air|akashvani|all india radio|radio mango|club|suno|mirchi|red)\b|\d{2,3}\.\d/i;

async function api<T>(path: string): Promise<T> {
  let last: unknown;
  for (const h of HOSTS) {
    try {
      const r = await fetch(`https://${h}.api.radio-browser.info${path}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return (await r.json()) as T;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last;
}

function clean(list: RawStation[]): Station[] {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  const seenUrl = new Set<string>(), seenName = new Set<string>();
  const out: Station[] = [];
  for (const s of list) {
    const url = s.url_resolved?.trim();
    const name = s.name?.trim().replace(/\s+/g, ' ');
    if (!url || !name || s.lastcheckok === 0) continue;
    if (secure && !url.startsWith('https:')) continue;   // browsers block http audio on https pages
    const hls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url);
    if (!hls && !/^(MP3|AAC|AAC\+|OGG|OPUS)$/i.test(s.codec)) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenUrl.has(url) || seenName.has(key)) continue;
    seenUrl.add(url); seenName.add(key);
    const codec = hls ? 'HLS' : s.codec.toUpperCase();
    out.push({
      id: s.stationuuid, name, url, hls,
      meta: s.bitrate ? `${codec} · ${s.bitrate} kbps` : codec,
      kind: FM_NAME.test(name) || /\b(fm|all india radio)\b/i.test(s.tags) ? 'fm' : 'songs',
    });
  }
  return out;
}

const Q = 'hidebroken=true&order=clickcount&reverse=true';
/** Malayalam and Kerala stations, most listened first. */
export async function keralaStations(): Promise<Station[]> {
  const [ml, kl] = await Promise.all([
    api<RawStation[]>(`/json/stations/search?language=malayalam&${Q}&limit=80`).catch(() => []),
    api<RawStation[]>(`/json/stations/search?tag=kerala&${Q}&limit=40`).catch(() => []),
  ]);
  if (!ml.length && !kl.length) throw new Error('Station list unavailable');
  return clean([...ml, ...kl]);
}
export async function searchStations(q: string): Promise<Station[]> {
  return clean(await api<RawStation[]>(`/json/stations/search?name=${encodeURIComponent(q)}&${Q}&limit=50`));
}
/** radio-browser counts listens through this endpoint; it is how they rank stations. */
export function countListen(id: string) { void api(`/json/url/${id}`).catch(() => {}); }

export type FmState = 'idle' | 'tuning' | 'playing' | 'error';
interface HlsLike { loadSource(u: string): void; attachMedia(m: HTMLMediaElement): void; destroy(): void; on(ev: string, fn: (e: string, d: { fatal?: boolean }) => void): void }

/** Plays one station at a time, through the bus speaker when the station allows it. */
export class FmPlayer {
  el: HTMLAudioElement | null = null;
  routed = false;
  private hls: HlsLike | null = null;
  private token = 0;

  constructor(private audio: () => AudioEngine | null, private onState: (s: FmState, routed: boolean) => void) {}

  async tune(st: Station, volume: number) {
    this.stop(false);   // bumps the token, so take ours after it
    const my = ++this.token;
    const a = this.audio();
    a?.setStatic(1);
    this.onState('tuning', false);
    const nativeHls = !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl');
    // first try through the bus speaker (needs CORS); otherwise play the stream directly
    const attempts: boolean[] = st.hls && nativeHls ? [false] : [true, false];
    for (const viaSpeaker of attempts) {
      if (my !== this.token) return;
      try {
        const el = new Audio();
        el.preload = 'none';
        if (viaSpeaker) el.crossOrigin = 'anonymous';
        this.el = el;
        if (st.hls && !nativeHls) {
          const { default: Hls } = await import('hls.js');
          if (!Hls.isSupported()) throw new Error('HLS unsupported');
          const h = new Hls({ enableWorker: true }) as unknown as HlsLike;
          this.hls = h;
          h.loadSource(st.url);
          h.attachMedia(el);
        } else el.src = st.url;
        this.routed = viaSpeaker && !!a?.attachMusic(el);
        if (!this.routed) el.volume = volume;
        this.watch(el, my);
        await started(el, this.hls);
        if (my !== this.token) { this.release(el); return; }
        a?.setStatic(0);
        this.onState('playing', this.routed);
        countListen(st.id);
        return;
      } catch {
        if (this.el) this.release(this.el);
      }
    }
    if (my !== this.token) return;
    a?.setStatic(0);
    this.onState('error', false);
  }

  setVolume(v: number) { if (this.el && !this.routed) this.el.volume = v; }

  stop(report = true) {
    this.token++;
    if (this.el) this.release(this.el);
    this.audio()?.setStatic(0);
    if (report) this.onState('idle', false);
  }

  private release(el: HTMLAudioElement) {
    this.hls?.destroy();
    this.hls = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
    this.audio()?.detachMusic(el);
    if (this.el === el) { this.el = null; this.routed = false; }
  }

  /** Stalls on a live stream sound like a weak signal. */
  private watch(el: HTMLAudioElement, my: number) {
    el.addEventListener('waiting', () => { if (my === this.token) { this.audio()?.setStatic(0.5); this.onState('tuning', this.routed); } });
    el.addEventListener('playing', () => { if (my === this.token) { this.audio()?.setStatic(0); this.onState('playing', this.routed); } });
  }
}

function started(el: HTMLAudioElement, hls: HlsLike | null) {
  return new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), 15000);
    const fail = () => { window.clearTimeout(t); reject(new Error('error')); };
    el.addEventListener('error', fail, { once: true });
    hls?.on('hlsError', (_e, d) => { if (d.fatal) fail(); });
    el.play().then(() => { window.clearTimeout(t); resolve(); }, fail);
  });
}
