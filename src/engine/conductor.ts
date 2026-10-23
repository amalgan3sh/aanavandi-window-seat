import type { AudioEngine } from './audio';
import type { Stop } from './routes';
import { pick } from './util';
import { LINE, slug, type Line } from './voiceLines';

export type { Line };

/**
 * The conductor (and the odd passenger) talking, in Malayalam.
 *
 * Each line plays its recorded clip from public/voice/ (made by `npm run voice`), from where
 * the speaker stands in the cabin. Without a clip it falls back to the device's own Malayalam
 * voice, and without one of those the line is only shown as a caption.
 */
const BASE = '/voice/';

interface Hooks {
  audio(): AudioEngine | null;
  pan(who: Line['who']): number;
  onLine?(l: Line): void;
  onDone?(): void;
  onTicket?(): void;
}

export class Conductor {
  private clips: Record<string, { file: string }> | null = null;
  private clipList: Promise<void> | null = null;
  private mlVoice: SpeechSynthesisVoice | null | undefined;
  private token = 0;
  private current: { stop(): void } | null = null;
  busy = false;

  constructor(private hooks: Hooks) {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => { this.mlVoice = undefined; });
  }

  private deviceVoice() {
    if (this.mlVoice === undefined) this.mlVoice = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().find((v) => /^ml/i.test(v.lang)) ?? null : null;
    return this.mlVoice;
  }

  /** Say one line and resolve when it is finished. */
  private async one(l: Line, my: number) {
    this.hooks.onLine?.(l);
    const a = this.hooks.audio(), clip = this.clips?.[l.id];
    if (a && clip) {
      try {
        const buf = await a.loadClip(BASE + clip.file);
        if (my !== this.token) return;
        a.duck(buf.duration + 0.8);
        const h = a.playVoice(buf, this.hooks.pan(l.who), l.who === 'p' ? 0.75 : 1);
        this.current = h;
        await h.done;
        return;
      } catch { /* fall through */ }
    }
    const v = this.deviceVoice();
    if (v) {
      a?.duck(3);
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(l.ml);
        u.voice = v; u.lang = v.lang;
        u.pitch = l.who === 'p' ? 1.15 : 0.8;
        u.rate = l.who === 'p' ? 0.95 : 1.08;
        u.onend = u.onerror = () => resolve();
        this.current = { stop: () => speechSynthesis.cancel() };
        speechSynthesis.speak(u);
      });
      return;
    }
    await sleep(900 + l.ml.length * 55);   // caption only: leave it up long enough to read
  }

  /** Speak lines in turn. An interrupting call cuts off whatever is being said. */
  async say(ids: string[], opts: { interrupt?: boolean; ticket?: boolean } = {}) {
    if (this.busy && !opts.interrupt) return;
    const lines = ids.map((id) => LINE.get(id)).filter((l): l is Line => !!l);
    if (!lines.length) return;
    this.clipList ??= fetch(`${BASE}manifest.json`).then((r) => (r.ok ? r.json() : null)).then((m) => { this.clips = m; }, () => {});
    await this.clipList;
    const my = ++this.token;
    this.current?.stop();
    this.busy = true;
    for (const l of lines) {
      await this.one(l, my);
      if (my !== this.token) return;
      await sleep(l.who === 'p' ? 450 : 300);   // a beat between speakers
    }
    if (opts.ticket) this.hooks.onTicket?.();
    this.busy = false;
    this.hooks.onDone?.();
  }

  boarding() { void this.say(['c-boarding'], { interrupt: true }); }

  arrive(stop: Stop, last: boolean, breakSeconds: number) {
    const ids = [`c-stop-${slug(stop[1])}`, last ? 'c-last' : 'c-alight'];
    if (!last && breakSeconds === 300) ids.push('c-break');
    void this.say(ids, { interrupt: true });
  }

  depart() { void this.say(['c-depart'], { interrupt: true }); }

  /** A bit of on-board talk between stops. */
  chat(next: Stop, raining: boolean) {
    if (this.busy) return;
    const k = slug(next[1]);
    const scenes: [string[], boolean?][] = [
      [['c-noticket']],
      [['c-where', `p-one-${k}`, pick(['c-fare-18', 'c-fare-25', 'c-fare-32'])], true],
      [['c-change']],
      [['c-moveback']],
      [[`c-next-${k}`]],
      [['c-bags']],
      [[`p-tellme-${k}`, 'c-tellyou']],
    ];
    if (raining) scenes.push([['c-shutter']]);
    const [ids, ticket] = pick(scenes);
    void this.say(ids, { ticket });
  }

  stop() {
    this.token++;
    this.current?.stop();
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    this.busy = false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
