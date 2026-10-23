import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine } from '@/engine/Engine';
import { fmt } from './Ticket';
import { FmPlayer, keralaStations, searchStations, type FmState, type Station } from './fm';

interface Track { id: string; name: string; url: string }
interface Props { open: boolean; getEngine: () => Engine | null; onPlayingChange: (on: boolean) => void }

/** "01 - Thamasamenthe Varuvan (1960).mp3" → "Thamasamenthe Varuvan (1960)" */
const cleanName = (file: string) => file.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/^[\d\s._-]+(?=\D)/, '').replace(/[_]+/g, ' ').trim() || file;

export function RadioPanel({ open, getEngine, onPlayingChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [shuffle, setShuffle] = useState(false);
  const [radioFx, setRadioFx] = useState(true);
  const [vol, setVol] = useState(0.8);
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState<'fm' | 'songs'>('fm');
  const [stations, setStations] = useState<Station[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Station[] | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [fm, setFm] = useState<{ state: FmState; routed: boolean }>({ state: 'idle', routed: false });
  const fmRef = useRef<FmPlayer | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const fmOn = fm.state === 'playing' || fm.state === 'tuning';

  const player = useCallback(() => {
    if (!fmRef.current) fmRef.current = new FmPlayer(() => getEngine()?.ensureAudio() ?? null, (state, routed) => setFm({ state, routed }));
    return fmRef.current;
  }, [getEngine]);
  useEffect(() => () => fmRef.current?.stop(false), []);

  // load the Kerala list the first time the radio is opened
  useEffect(() => {
    if (!open || stations || listErr) return;
    keralaStations().then(setStations, () => setListErr(true));
  }, [open, stations, listErr]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound(null); return; }
    const id = window.setTimeout(() => { searchStations(q).then(setFound, () => setFound([])); }, 400);
    return () => window.clearTimeout(id);
  }, [query]);

  const tune = (st: Station) => {
    audioRef.current?.pause();
    setStation(st);
    const a = getEngine()?.ensureAudio();
    a?.setRadioFx(radioFx);
    a?.setMusicVolume(vol);
    void player().tune(st, vol);
  };
  const stopFm = () => { fmRef.current?.stop(); };

  // release object URLs when the component goes away
  useEffect(() => () => tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url)), []);
  useEffect(() => onPlayingChange(playing || fmOn), [playing, fmOn, onPlayingChange]);

  const route = useCallback(() => {
    const el = audioRef.current, eng = getEngine();
    if (!el || !eng) return;
    const a = eng.ensureAudio();
    if (a && !a.isRouted(el)) a.attachMusic(el);
    fmRef.current?.stop();
    a?.setRadioFx(radioFx);
    a?.setMusicVolume(vol);
  }, [getEngine, radioFx, vol]);

  const playAt = useCallback(async (i: number) => {
    const el = audioRef.current, list = tracksRef.current;
    if (!el || !list[i]) return;
    route();
    if (idx !== i || !el.src) { el.src = list[i].url; setIdx(i); }
    try { await el.play(); } catch { setPlaying(false); }
  }, [idx, route]);

  const step = useCallback((dir: 1 | -1) => {
    const n = tracksRef.current.length;
    if (!n) return;
    let next: number;
    if (shuffle && n > 1) { do next = (Math.random() * n) | 0; while (next === idx); }
    else next = (idx + dir + n) % n;
    void playAt(next);
  }, [idx, shuffle, playAt]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (idx < 0) { void playAt(0); return; }
    if (el.paused) { route(); void el.play().catch(() => setPlaying(false)); } else el.pause();
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.name));
    if (!list.length) return;
    const added = list.map((f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName(f.name), url: URL.createObjectURL(f) }));
    setTracks((cur) => [...cur, ...added]);
  };

  const remove = (i: number) => {
    const t = tracks[i];
    if (!t) return;
    if (i === idx) { audioRef.current?.pause(); if (audioRef.current) audioRef.current.removeAttribute('src'); setIdx(-1); setPos({ t: 0, d: 0 }); }
    else if (i < idx) setIdx(idx - 1);
    URL.revokeObjectURL(t.url);
    setTracks(tracks.filter((_, j) => j !== i));
  };

  // keep effect + volume in sync
  useEffect(() => { getEngine()?.audioEngine?.setRadioFx(radioFx); }, [radioFx, getEngine]);
  useEffect(() => {
    const a = getEngine()?.audioEngine;
    if (a?.hasMusicRoute) a.setMusicVolume(vol);
    if (audioRef.current && !a?.isRouted(audioRef.current)) audioRef.current.volume = vol;
    fmRef.current?.setVolume(vol);
  }, [vol, getEngine]);
  useEffect(() => { getEngine()?.setMusicPlaying(playing || fm.state === 'playing'); }, [playing, fm.state, getEngine]);

  // lock-screen / headset controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const t = tracks[idx];
    if (fmOn && station) navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: 'Live radio', album: 'Aanavandi Window Seat' });
    else if (t) navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: 'Bus radio', album: 'Aanavandi Window Seat' });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => { if (station && !playing && idx < 0) tune(station); else togglePlay(); });
    ms.setActionHandler('pause', () => { audioRef.current?.pause(); stopFm(); });
    ms.setActionHandler('nexttrack', () => step(1));
    ms.setActionHandler('previoustrack', () => step(-1));
  });

  const cur = tracks[idx];
  return (
    <section id="panel-radio" className="panel glass" hidden={!open} aria-label="Bus radio">
      <h2><span>Bus radio</span><span className="ml">റേഡിയോ</span></h2>
      <div className="seg tabs" role="tablist" aria-label="Radio source">
        <button role="tab" aria-selected={tab === 'fm'} onClick={() => setTab('fm')}>📡 Live FM</button>
        <button role="tab" aria-selected={tab === 'songs'} onClick={() => setTab('songs')}>🎵 My songs</button>
      </div>
      <audio ref={audioRef} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => step(1)}
        onTimeUpdate={(e) => setPos({ t: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 })}
        onLoadedMetadata={(e) => setPos({ t: 0, d: e.currentTarget.duration || 0 })} />

      {tab === 'fm' && (
        <>
          <div className="now">
            <div className={`dial${fm.state === 'playing' ? ' on' : ''}${fm.state === 'tuning' ? ' tuning' : ''}`} aria-hidden="true">📻</div>
            <div>
              <b>{station && fm.state !== 'idle' ? station.name : 'Radio off'}</b>
              <small>{fm.state === 'tuning' ? 'Tuning in…' : fm.state === 'playing' ? `On air${fm.routed ? '' : ' · direct (no speaker effect)'}` : fm.state === 'error' ? 'No signal. Try another station.' : 'Pick a station to tune in.'}</small>
            </div>
          </div>
          {fmOn && <div className="transport"><button className="play" onClick={stopFm} aria-label="Turn radio off">⏹</button></div>}
          <input className="search" type="search" placeholder="Search any station in the world" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search stations" />
          {found ? (
            <StationList title={found.length ? 'Results' : 'No stations found'} list={found} current={fmOn ? station?.id : undefined} onPick={tune} />
          ) : stations ? (
            <>
              <StationList title="Kerala FM" list={stations.filter((s) => s.kind === 'fm')} current={fmOn ? station?.id : undefined} onPick={tune} />
              <StationList title="Song channels" list={stations.filter((s) => s.kind === 'songs')} current={fmOn ? station?.id : undefined} onPick={tune} />
            </>
          ) : (
            <p className="fine">{listErr ? 'Could not load stations. Check your connection.' : 'Finding stations…'}</p>
          )}
        </>
      )}

      {tab === 'songs' && (<>
      <div className="now">
        <div className={`dial${playing ? ' on' : ''}`} aria-hidden="true">📻</div>
        <div>
          <b>{cur ? cur.name : 'No song playing'}</b>
          <small>{cur ? `${fmt(pos.t)} / ${fmt(pos.d)}` : 'Add songs from your phone to play them on the bus radio.'}</small>
        </div>
      </div>

      {tracks.length > 0 && (
        <>
          <input className="seek" type="range" min={0} max={Math.max(1, pos.d)} step={0.5} value={Math.min(pos.t, pos.d || 0)} aria-label="Seek"
            onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = +e.target.value; }} />
          <div className="transport">
            <button onClick={() => step(-1)} aria-label="Previous song">⏮</button>
            <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
            <button onClick={() => step(1)} aria-label="Next song">⏭</button>
            <button onClick={() => setShuffle(!shuffle)} aria-pressed={shuffle} aria-label="Shuffle">🔀</button>
          </div>
        </>
      )}

      </>)}

      <label className="sl" htmlFor="vMusic"><span>Radio volume <small>ശബ്ദം</small></span>
        <input id="vMusic" type="range" min={0} max={100} value={Math.round(vol * 100)} onChange={(e) => setVol(+e.target.value / 100)} /></label>
      <div className="toggles">
        <label htmlFor="cRadioFx"><input id="cRadioFx" type="checkbox" checked={radioFx} onChange={(e) => setRadioFx(e.target.checked)} /> Old radio sound</label>
      </div>

      {tab === 'songs' && (<>
      <label className={`add${over ? ' over' : ''}`} htmlFor="songFiles"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <input ref={inputRef} id="songFiles" type="file" accept="audio/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <span>＋ Add songs from your phone</span>
        <small>MP3, M4A, AAC, WAV or OGG. Your songs stay on your device and are never uploaded.</small>
      </label>

      {tracks.length > 0 && (
        <ul className="playlist" aria-label="Playlist">
          {tracks.map((t, i) => (
            <li key={t.id}>
              <button className="track" aria-current={i === idx} onClick={() => void playAt(i)} title={t.name}>{i === idx && playing ? '♪ ' : ''}{t.name}</button>
              <button className="rm" onClick={() => remove(i)} aria-label={`Remove ${t.name}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      </>)}
      <p className="fine">{tab === 'fm'
        ? <>Live stations stream straight from each broadcaster. Station list from <a href="https://www.radio-browser.info" target="_blank" rel="noopener noreferrer">radio-browser.info</a>.</>
        : 'The radio plays from the speaker above the windscreen, so it sounds different from every seat. It dips when the conductor calls a stop.'}</p>
    </section>
  );
}

function StationList({ title, list, current, onPick }: { title: string; list: Station[]; current?: string; onPick: (s: Station) => void }) {
  if (!list.length && title !== 'No stations found') return null;
  return (
    <div className="stations">
      <h3>{title}</h3>
      {list.length > 0 && (
        <ul className="playlist" aria-label={title}>
          {list.map((s) => (
            <li key={s.id}>
              <button className="track station" aria-current={s.id === current} onClick={() => onPick(s)} title={s.name}>
                <span>{s.id === current ? '♪ ' : ''}{s.name}</span><small>{s.meta}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
