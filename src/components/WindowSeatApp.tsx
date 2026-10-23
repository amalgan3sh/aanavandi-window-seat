'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine, Line, Mix, SeatSpot, Snapshot, TimeKey, WeatherKey } from '@/engine/Engine';
import { CONDUCTOR_VOICE } from '@/engine/flags';
import type { RouteKey } from '@/engine/routes';
import { Ticket } from './Ticket';
import { SoundPanel } from './SoundPanel';
import { SeatPanel } from './SeatPanel';
import { RadioPanel } from './RadioPanel';
import { WeatherPanel } from './WeatherPanel';
import { DoneDialog, StartDialog } from './Dialogs';

type PanelKey = 'seat' | 'weather' | 'radio' | 'sounds';
const WEATHER_KEYS: WeatherKey[] = ['clear', 'cloudy', 'drizzle', 'rain', 'storm'];
const BUY_URL = 'https://buymeacoffee.com/amalganesh';

function readTime(): TimeKey {
  try {
    const t = localStorage.getItem('ws-time');
    if (t === 'day' || t === 'evening' || t === 'night') return t;
  } catch { /* storage blocked */ }
  return 'day';
}
function readWeather(): WeatherKey {
  try {
    const w = localStorage.getItem('ws-weather') as WeatherKey | null;
    if (w && WEATHER_KEYS.includes(w)) return w;
  } catch { /* storage blocked */ }
  return 'rain';
}

export default function WindowSeatApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [seats, setSeats] = useState<SeatSpot[]>([]);
  const [toast, setToast] = useState<{ big: string; sub: string; ms: number; id: number } | null>(null);
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [startOpen, setStartOpen] = useState(true);
  const [done, setDone] = useState<Snapshot | null>(null);
  const [time, setTime] = useState<TimeKey>('day');
  const [weather, setWeather] = useState<WeatherKey>('rain');
  const [caption, setCaption] = useState<Line | null>(null);
  const [hintGone, setHintGone] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [mix, setMix] = useState<Mix>({ rain: 0.7, engine: 0.55, thunder: 0.45, horn: true, voice: CONDUCTOR_VOICE });

  useEffect(() => {
    let cancelled = false;
    let eng: Engine | null = null;
    void import('@/engine/Engine').then(({ Engine }) => {
      if (cancelled || !canvasRef.current) return;
      eng = new Engine(canvasRef.current, {
        onSnapshot: setSnap,
        onToast: (big, sub, ms = 4200) => setToast({ big, sub, ms, id: Date.now() + Math.random() }),
        onDone: setDone,
        onInteract: () => setHintGone(true),
        onCaption: setCaption,
      });
      engineRef.current = eng;
      setSeats(eng.seats.map((s) => ({ ...s })));
      const t = readTime();
      setTime(t);
      eng.setTime(t);
      const w = readWeather();
      setWeather(w);
      eng.setWeather(w, true);
      const { rain, thunder } = eng.mix;
      setMix((cur) => ({ ...cur, rain, thunder }));
    });
    return () => {
      cancelled = true;
      eng?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast((cur) => (cur && cur.id === toast.id ? null : cur)), toast.ms);
    return () => window.clearTimeout(id);
  }, [toast]);

  const chooseTime = (t: TimeKey) => {
    setTime(t);
    engineRef.current?.setTime(t);
    try { localStorage.setItem('ws-time', t); } catch { /* storage blocked */ }
  };
  const chooseWeather = (w: WeatherKey) => {
    const eng = engineRef.current;
    setWeather(w);
    if (eng) {
      eng.setWeather(w);
      eng.ensureAudio();
      setMix((cur) => ({ ...cur, rain: eng.mix.rain, thunder: eng.mix.thunder }));
    }
    try { localStorage.setItem('ws-weather', w); } catch { /* storage blocked */ }
  };
  const changeMix = (m: Partial<Mix>) => {
    setMix((cur) => ({ ...cur, ...m }));
    engineRef.current?.setMix(m);
  };
  const start = (route: RouteKey, minutes: number, ride: boolean) => {
    engineRef.current?.startJourney(route, minutes, ride);
    setStartOpen(false);
    setDone(null);
  };
  const getEngine = useCallback(() => engineRef.current, []);
  const toggle = (p: PanelKey) => setPanel((cur) => (cur === p ? null : p));
  const ticketVisible = !!snap && !startOpen && !done && ['running', 'arriving', 'break', 'done'].includes(snap.mode);

  return (
    <>
      <canvas ref={canvasRef} className="scene" aria-label="3D view from a seat in a Kerala bus. Drag to look around." />

      <header className="top">
        <div className="brand glass"><span className="ml">ആനവണ്ടി</span><span className="sub">Window Seat</span></div>
        <div className="actions">
          <div className="seg glass" role="group" aria-label="Time of day">
            {([['day', '☀', 'Day'], ['evening', '◐', 'Dusk'], ['night', '☾', 'Night']] as const).map(([k, icon, label]) => (
              <button key={k} aria-label={label} aria-pressed={time === k} onClick={() => chooseTime(k)}>{icon}<span className="lab"> {label}</span></button>
            ))}
          </div>
          <button className="chip glass" onClick={() => { setStartOpen(true); setDone(null); }}>Journey</button>
          <a className="chip glass buy" aria-label="Buy a ticket, ₹10 on Buy Me a Coffee" href={BUY_URL} target="_blank" rel="noopener noreferrer">🎫<span className="lab"> Buy a ticket ₹10</span></a>
        </div>
      </header>

      <div className={`hint glass${hintGone ? ' gone' : ''}`}>Drag to look around · tap a shutter · tap the bell cord</div>

      {ticketVisible && snap && <Ticket snap={snap} onPause={() => engineRef.current?.togglePause()} onEnd={() => engineRef.current?.endJourney()} />}

      <nav className="dock glass" aria-label="Controls">
        <button aria-label="Seat" aria-expanded={panel === 'seat'} aria-controls="panel-seat" onClick={() => toggle('seat')}>💺<span className="lab">Seat</span></button>
        <button aria-label="Weather" aria-expanded={panel === 'weather'} aria-controls="panel-weather" onClick={() => toggle('weather')}>🌦<span className="lab">Weather</span></button>
        <button aria-label={musicOn ? 'Radio, playing' : 'Radio'} aria-expanded={panel === 'radio'} aria-controls="panel-radio" onClick={() => toggle('radio')}>📻<span className="lab">Radio</span>{musicOn && <span className="dot" aria-hidden="true" />}</button>
        <button aria-label="Sounds" aria-expanded={panel === 'sounds'} aria-controls="panel-sounds" onClick={() => toggle('sounds')}>🎧<span className="lab">Sounds</span></button>
      </nav>

      <SeatPanel open={panel === 'seat'} seats={seats} current={snap?.seatId ?? 'r6-L1'} onPick={(id) => engineRef.current?.setSeat(id)} />
      <WeatherPanel open={panel === 'weather'} weather={weather} onPick={chooseWeather} />
      <RadioPanel open={panel === 'radio'} getEngine={getEngine} onPlayingChange={setMusicOn} />
      <SoundPanel open={panel === 'sounds'} mix={mix} onChange={changeMix} shutterDown={!!snap?.myShutterDown}
        onShutter={() => engineRef.current?.toggleMyShutter()} getEngine={getEngine} showVoice={CONDUCTOR_VOICE} />

      <div className={`caption${caption ? ' show' : ''}`} aria-live="polite">
        {caption && (<>
          <span className="who">{caption.who === 'p' ? 'Passenger' : 'Conductor'}</span>
          <span className="ml">{caption.ml}</span>
          <small>{caption.en}</small>
        </>)}
      </div>

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        <div className="big">{toast?.big}</div>
        <div className="sub">{toast?.sub}</div>
      </div>

      {startOpen && <StartDialog onStart={start} />}
      {done && <DoneDialog snap={done} buyUrl={BUY_URL} onAgain={() => { setDone(null); setStartOpen(true); }} />}
    </>
  );
}
