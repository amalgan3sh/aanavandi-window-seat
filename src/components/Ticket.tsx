import { Fragment } from 'react';
import type { Snapshot } from '@/engine/Engine';

export const fmt = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

const STATE: Record<string, string> = { running: 'Next stop', arriving: 'Arriving at', break: 'Break at · bus leaves in', done: 'Reached' };

export function Ticket({ snap, onPause, onEnd }: { snap: Snapshot; onPause: () => void; onEnd: () => void }) {
  const s = snap.stops;
  const idx = snap.mode === 'break' || snap.mode === 'done' ? snap.leg : snap.leg + 1;
  const next = s[Math.min(idx, s.length - 1)];
  const label = snap.paused && snap.mode === 'running' ? 'Paused · next stop' : STATE[snap.mode] ?? 'Next stop';
  return (
    <aside className="ticket" aria-label="Bus ticket and focus timer">
      <div className="t-head"><span className="ml">ആനവണ്ടി</span><span>ORDINARY</span></div>
      <div className="t-row"><span className="lbl">From</span><b>{s[0][1]}</b></div>
      <div className="t-row"><span className="lbl">To</span><b>{s[s.length - 1][1]}</b></div>
      <div className="t-gap" />
      <div className="lbl">{label}</div>
      <div className="t-next"><span className="ml">{next[0]}</span><span>{next[1]}</span></div>
      <div className="t-time" aria-live="off">{snap.mode === 'done' ? '00:00' : fmt(snap.left)}</div>
      <div className="t-dots" aria-label={`${snap.leg} of ${s.length - 1} stops done`}>
        {s.map((st, i) => (
          <Fragment key={st[1]}>
            {i > 0 && <s />}
            <i className={i === snap.leg + 1 && (snap.mode === 'running' || snap.mode === 'arriving') ? 'now' : i <= snap.leg ? 'on' : ''} />
          </Fragment>
        ))}
      </div>
      <div className="t-foot">
        <span>{snap.ticketNo}</span>
        <button onClick={onPause} disabled={snap.mode === 'arriving' || snap.mode === 'done'}>{snap.paused ? 'Resume' : 'Pause'}</button>
        <button onClick={onEnd}>End</button>
      </div>
    </aside>
  );
}
