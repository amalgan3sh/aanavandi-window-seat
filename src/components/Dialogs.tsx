import { useState, type FormEvent } from 'react';
import type { Snapshot } from '@/engine/Engine';
import { ROUTES, ROUTE_KEYS, type RouteKey } from '@/engine/routes';

export function StartDialog({ onStart }: { onStart: (route: RouteKey, minutes: number, ride: boolean) => void }) {
  const [route, setRoute] = useState<RouteKey>('north');
  const [len, setLen] = useState(25);
  const submit = (e: FormEvent) => { e.preventDefault(); onStart(route, len, false); };
  return (
    <div className="overlay">
      <form className="card glass" onSubmit={submit} aria-labelledby="startTitle">
        <p className="eyebrow"><span className="ml">ആനവണ്ടി</span> · Window Seat</p>
        <h1 id="startTitle">Take the window seat</h1>
        <p className="lede">A rainy bus ride across Kerala. Each stop is one focus session, and the conductor calls your break.</p>
        <fieldset>
          <legend>Route</legend>
          {ROUTE_KEYS.map((k) => {
            const r = ROUTES[k];
            const s = r.stops;
            return (
              <label className="route" key={k} htmlFor={`r-${k}`}>
                <input type="radio" name="route" id={`r-${k}`} checked={route === k} onChange={() => setRoute(k)} />
                <span><b>{r.name}</b><small>{s[0][0]} → {s[s.length - 1][0]}</small></span>
                <em>{s.length - 1} stops</em>
              </label>
            );
          })}
        </fieldset>
        <fieldset>
          <legend>Between stops</legend>
          <div className="lenseg">
            {([[25, '25 min', '5 min break'], [50, '50 min', '10 min break'], [1, '1 min', 'demo']] as const).map(([v, a, b]) => (
              <label key={v} htmlFor={`l-${v}`}><input type="radio" name="len" id={`l-${v}`} checked={len === v} onChange={() => setLen(v)} />{a}<small>{b}</small></label>
            ))}
          </div>
        </fieldset>
        <div className="cta">
          <button type="submit" className="btn primary">Start journey</button>
          <button type="button" className="btn ghost" onClick={() => onStart(route, len, true)}>Just ride</button>
        </div>
        <p className="fine">🎧 Best with earphones. Sound starts when you tap a button.</p>
      </form>
    </div>
  );
}

export function DoneDialog({ snap, buyUrl, onAgain }: { snap: Snapshot; buyUrl: string; onAgain: () => void }) {
  const s = snap.stops, last = s[s.length - 1], mins = Math.round(snap.focused / 60);
  const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  return (
    <div className="overlay">
      <div className="card glass" role="dialog" aria-labelledby="doneTitle">
        <p className="eyebrow">Journey complete</p>
        <h1 id="doneTitle" className="ml">{last[0]} എത്തി!</h1>
        <p className="lede">You reached {last[1]}. {s.length - 1} stops, {time} of focus.</p>
        <div className="cta">
          <button className="btn primary" onClick={onAgain}>Ride again</button>
          <a className="btn ghost" href={buyUrl} target="_blank" rel="noopener noreferrer">🎫 Buy the conductor a chai</a>
        </div>
      </div>
    </div>
  );
}
