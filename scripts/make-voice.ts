// Generates the conductor and passenger clips in public/voice/ with Azure's Malayalam
// neural voices. Run: AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=centralindia npm run voice
// Only new or changed lines are generated; pass --force to redo everything.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { VOICE_LINES, type Line } from '../src/engine/voiceLines';

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION || 'centralindia';
const FORCE = process.argv.includes('--force');
const OUT = 'public/voice';

// a tired, loud conductor; a passenger speaking normally
const VOICE = {
  c: { name: 'ml-IN-MidhunNeural', rate: '+8%', pitch: '-6%', volume: '+10%' },
  p: { name: 'ml-IN-SobhanaNeural', rate: '0%', pitch: '0%', volume: '0%' },
} as const;

if (!KEY) {
  console.error('Set AZURE_SPEECH_KEY (and AZURE_SPEECH_REGION) first. A free F0 Speech resource is enough.');
  process.exit(1);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hash = (l: Line) => createHash('sha1').update(`${VOICE[l.who].name}|${JSON.stringify(VOICE[l.who])}|${l.ml}`).digest('hex').slice(0, 10);

async function synth(l: Line): Promise<Buffer> {
  const v = VOICE[l.who];
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ml-IN"><voice name="${v.name}"><prosody rate="${v.rate}" pitch="${v.pitch}" volume="${v.volume}">${esc(l.ml)}</prosody></voice></speak>`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY!,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'aanavandi-window-seat',
      },
      body: ssml,
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 && attempt < 5) { await sleep(5000 * (attempt + 1)); continue; }   // free tier rate limit
    throw new Error(`${l.id}: HTTP ${r.status} ${await r.text()}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const manifestPath = `${OUT}/manifest.json`;
const old: Record<string, { file: string; hash: string }> = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
const manifest: typeof old = {};
let made = 0;
for (const l of VOICE_LINES) {
  const h = hash(l), file = `${l.id}.mp3`;
  if (!FORCE && old[l.id]?.hash === h && existsSync(`${OUT}/${file}`)) { manifest[l.id] = old[l.id]; continue; }
  await writeFile(`${OUT}/${file}`, await synth(l));
  manifest[l.id] = { file, hash: h };
  made++;
  console.log(`✓ ${l.id}  ${l.ml}`);
  await sleep(350);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`${made} new clip(s), ${Object.keys(manifest).length} total in ${OUT}/`);
