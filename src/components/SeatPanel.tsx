import type { SeatSpot } from '@/engine/Engine';

interface Props { open: boolean; seats: SeatSpot[]; current: string; onPick: (id: string) => void }

const QUICK: [string, string][] = [['r6-L1', 'Left window'], ['r5-R2', 'Right window'], ['r0-L1', 'Front row'], ['rear-3', 'Back bench']];

function Seat({ s, current, onPick }: { s: SeatSpot; current: string; onPick: (id: string) => void }) {
  const me = s.id === current;
  return (
    <button className={`sm-seat${me ? ' me' : ''}`} disabled={s.occupied} onClick={() => onPick(s.id)}
      aria-label={`${s.label}${s.occupied ? ', taken' : me ? ', your seat' : ''}`} aria-pressed={me} title={s.label}>
      {me ? 'You' : s.window ? '▮' : ''}
    </button>
  );
}

export function SeatPanel({ open, seats, current, onPick }: Props) {
  const rows = Array.from({ length: 11 }, (_, i) => seats.filter((s) => s.row === i));
  const rear = seats.filter((s) => s.group === 'rear');
  const cur = seats.find((s) => s.id === current);
  return (
    <section id="panel-seat" className="panel glass" hidden={!open} aria-label="Change seat">
      <h2><span>Change seat</span><span className="ml">സീറ്റ് മാറുക</span></h2>
      <p className="fine">You are in <b>{cur?.label ?? '—'}</b>. Tap any empty seat to walk there.</p>
      <div className="quick">
        {QUICK.map(([id, label]) => {
          const s = seats.find((x) => x.id === id);
          return <button key={id} disabled={!s || s.occupied || id === current} onClick={() => onPick(id)}>{label}</button>;
        })}
      </div>
      <div className="seatmap" role="group" aria-label="Seat map, front of the bus at the top">
        <div className="sm-front"><span>Door</span><span>Front · driver ▸</span></div>
        {rows.map((r, i) => (
          <div className="sm-row" key={i}>
            {r.filter((s) => s.group === 'left').map((s) => <Seat key={s.id} s={s} current={current} onPick={onPick} />)}
            <span aria-hidden="true" />
            {r.filter((s) => s.group === 'right').map((s) => <Seat key={s.id} s={s} current={current} onPick={onPick} />)}
          </div>
        ))}
        <div className="sm-row rear">{rear.map((s) => <Seat key={s.id} s={s} current={current} onPick={onPick} />)}</div>
      </div>
      <div className="sm-legend">
        <span><i style={{ background: 'var(--red)' }} />You</span>
        <span><i style={{ background: 'var(--seat-free)' }} />Free</span>
        <span><i style={{ background: 'var(--seat-taken)' }} />Taken</span>
        <span>▮ window</span>
      </div>
    </section>
  );
}
