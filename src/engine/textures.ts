import * as THREE from 'three';
import { pick, rand } from './util';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTex(w: number, h: number, draw: Draw, aniso: number, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function speckle(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, n: number, colors: string[], s = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(colors);
    g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, s * rand(0.5, 1.6), s * rand(0.5, 1.6));
  }
}

/** Aluminium chequer plate, like the floor in the reference photo. */
const drawFloor: Draw = (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#8e9398');
  gr.addColorStop(1, '#7c8186');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  speckle(g, 0, 0, w, h, 2200, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.05)', 'rgba(60,50,30,.06)'], 2);
  const st = 32;
  for (let y = 0; y < h; y += st)
    for (let x = 0; x < w; x += st) {
      const odd = (x / st + y / st) % 2;
      g.save();
      g.translate(x + st / 2, y + st / 2);
      g.rotate(odd ? Math.PI / 4 : -Math.PI / 4);
      g.beginPath(); g.ellipse(0, 0, 11, 2.8, 0, 0, Math.PI * 2); g.fillStyle = '#a6abb0'; g.fill();
      g.beginPath(); g.ellipse(0, -0.9, 10, 1.1, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.4)'; g.fill();
      g.beginPath(); g.ellipse(0, 1.5, 10, 1, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
      g.restore();
    }
};

/** 11.8 m of road: laterite shoulders, asphalt, edge lines, centre dashes. One tile = 10 m. */
const drawRoad: Draw = (g, w, h) => {
  const sh = Math.round((w * 1.3) / 11.8);
  g.fillStyle = '#8a5438';
  g.fillRect(0, 0, w, h);
  speckle(g, 0, 0, w, h, 1400, ['#7a4630', '#9b6446', '#6c3f2a', '#5d7a3a'], 2.4);
  g.fillStyle = '#3a3c3f';
  g.fillRect(sh, 0, w - 2 * sh, h);
  speckle(g, sh, 0, w - 2 * sh, h, 3000, ['#2f3134', '#45474a', '#4f5154', '#34363a'], 1.6);
  g.fillStyle = 'rgba(30,32,36,.5)';
  g.fillRect(sh + 30, 0, 22, h);
  g.fillRect(w - sh - 52, 0, 22, h);
  g.fillStyle = 'rgba(235,235,225,.7)';
  g.fillRect(sh + 3, 0, 3, h);
  g.fillRect(w - sh - 6, 0, 3, h);
  g.fillStyle = 'rgba(240,236,220,.92)';
  g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  // patch repairs, oil down the middle of each lane, worn paint
  for (let i = 0; i < 6; i++) {
    g.fillStyle = pick(['rgba(25,26,28,.45)', 'rgba(70,72,74,.35)']);
    g.fillRect(rand(sh, w - sh - 40), rand(0, h), rand(14, 50), rand(10, 40));
  }
  g.fillStyle = 'rgba(15,15,18,.18)';
  g.fillRect(w * 0.3, 0, w * 0.05, h);
  g.fillRect(w * 0.68, 0, w * 0.05, h);
  // broken tarmac edges crumbling into the laterite
  speckle(g, sh - 2, 0, 9, h, 260, ['#7a4630', '#8a5438', '#5a3a28'], 2.2);
  speckle(g, w - sh - 7, 0, 9, h, 260, ['#7a4630', '#8a5438', '#5a3a28'], 2.2);
};

/** Wet monsoon grass: dark, uneven, with mud showing through and blade-sized strokes. */
const drawGrass: Draw = (g, w, h) => {
  g.fillStyle = '#3c5428';
  g.fillRect(0, 0, w, h);
  const blob = (n: number, cols: string[], r0: number, r1: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = pick(cols);
      const x = rand(0, w), y = rand(0, h), rx = rand(r0, r1), ry = rx * rand(0.4, 1);
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {   // wrap so the tile has no seams
        g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill();
      }
    }
  };
  blob(40, ['rgba(70,100,40,.25)', 'rgba(30,48,22,.3)', 'rgba(88,110,52,.22)'], 20, 80);
  blob(18, ['rgba(80,62,40,.22)', 'rgba(60,50,34,.25)'], 6, 22);
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, w), y = rand(0, h), l = rand(2, 6);
    g.strokeStyle = pick(['#2f4720', '#486a2e', '#557837', '#3a5426', '#62803e', '#2a3c1c']);
    g.globalAlpha = rand(0.35, 0.8);
    g.lineWidth = rand(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-1.5, 1.5), y - l); g.stroke();
  }
  g.globalAlpha = 1;
};

/** One coconut frond seen flat: a rachis down the middle, long drooping leaflets either side. */
const drawFrond: Draw = (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2;
  for (let i = 0; i < 70; i++) {
    const t = i / 70, y = h * (0.04 + t * 0.94);
    const len = w * 0.48 * Math.sin(Math.PI * (0.12 + t * 0.85)) * rand(0.85, 1.05);
    for (const s of [-1, 1]) {
      if (Math.random() < 0.06) continue;   // torn leaflets
      const ang = (0.5 + t * 0.35) * rand(0.9, 1.1);
      const ex = cx + s * Math.cos(ang) * len, ey = y + Math.sin(ang) * len * 0.9;
      const gr = g.createLinearGradient(cx, y, ex, ey);
      const base = pick(['#3f6a24', '#4a7428', '#56802e', '#3a6020']);
      gr.addColorStop(0, base);
      gr.addColorStop(0.75, base);
      gr.addColorStop(1, Math.random() < 0.3 ? '#8a8a3a' : '#5e7d30');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx, y - 1.5);
      g.quadraticCurveTo(cx + s * len * 0.5, y + len * 0.12 - 3, ex, ey);
      g.quadraticCurveTo(cx + s * len * 0.5, y + len * 0.12 + 3, cx, y + 2.5);
      g.fill();
    }
  }
  g.strokeStyle = '#7a7a3a';
  g.lineWidth = w * 0.012;
  g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
};

const drawGlow: Draw = (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,230,170,1)');
  r.addColorStop(0.35, 'rgba(255,200,120,.35)');
  r.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
};

export function makeTextures(aniso: number) {
  return {
    floor: canvasTex(256, 256, drawFloor, aniso, [5, 22]),
    road: canvasTex(256, 256, drawRoad, aniso, [1, 40]),
    grass: canvasTex(512, 512, drawGrass, aniso, [60, 40]),
    frond: canvasTex(256, 512, drawFrond, aniso),
    glow: canvasTex(64, 64, drawGlow, aniso),
    board: canvasTex(1024, 128, () => {}, aniso),
    shelter: canvasTex(512, 128, () => {}, aniso),
    kada: canvasTex(512, 128, () => {}, aniso),
  };
}
export type Textures = ReturnType<typeof makeTextures>;

export const ML_FONT = '"Noto Sans Malayalam", "Kartika", "Manjari", sans-serif';
export const UI_FONT = '"Sora", system-ui, sans-serif';

interface SignStyle { bg?: string; fg?: string; sub?: string; border?: string }
export function drawSign(tex: THREE.CanvasTexture, ml: string, en: string, s: SignStyle = {}) {
  const { bg = '#f2d64b', fg = '#1d1a14', sub = '#4a3f22', border = '#1d1a14' } = s;
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext('2d');
  if (!g) return;
  const w = c.width, h = c.height;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = border;
  g.lineWidth = h * 0.05;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(h * 0.42)}px ${ML_FONT}`;
  g.fillText(ml, w / 2, h * 0.42, w * 0.92);
  g.fillStyle = sub;
  g.font = `700 ${Math.round(h * 0.2)}px ${UI_FONT}`;
  g.fillText(en.toUpperCase(), w / 2, h * 0.8, w * 0.9);
  tex.needsUpdate = true;
}

/** Amber LED destination board above the windscreen. */
export function drawBoard(tex: THREE.CanvasTexture, fromMl: string, toMl: string) {
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext('2d');
  if (!g) return;
  const w = c.width, h = c.height;
  g.fillStyle = '#0d0d0c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffb227';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,170,40,.8)';
  g.shadowBlur = 12;
  g.textAlign = 'center';
  g.font = `800 ${Math.round(h * 0.5)}px ${ML_FONT}`;
  g.fillText(`${fromMl}  →  ${toMl}`, w * 0.6, h * 0.5, w * 0.74);
  g.textAlign = 'left';
  g.font = `700 ${Math.round(h * 0.26)}px ${UI_FONT}`;
  g.fillText('FAST', w * 0.03, h * 0.5);
  g.shadowBlur = 0;
  tex.needsUpdate = true;
}
