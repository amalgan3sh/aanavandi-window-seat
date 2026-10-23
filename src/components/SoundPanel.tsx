import { useEffect, useState } from 'react';
import type { Engine, Mix } from '@/engine/Engine';

interface Props {
  open: boolean;
  mix: Mix;
  onChange: (m: Partial<Mix>) => void;
  shutterDown: boolean;
  onShutter: () => void;
  getEngine: () => Engine | null;
  showVoice: boolean;
}

export function SoundPanel({ open, mix, onChange, shutterDown, onShutter, getEngine, showVoice }: Props) {
  const [canGyro, setCanGyro] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  useEffect(() => { setCanGyro('DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches); }, []);

  return (
    <section id="panel-sounds" className="panel glass" hidden={!open} aria-label="Sounds">
      <h2><span>Sounds</span><span className="ml">ശബ്ദം</span></h2>
      <label className="sl" htmlFor="vRain"><span>Rain <small>മഴ</small></span>
        <input id="vRain" type="range" min={0} max={100} value={Math.round(mix.rain * 100)} onChange={(e) => onChange({ rain: +e.target.value / 100 })} /></label>
      <label className="sl" htmlFor="vEngine"><span>Engine &amp; rattle <small>എഞ്ചിൻ</small></span>
        <input id="vEngine" type="range" min={0} max={100} value={Math.round(mix.engine * 100)} onChange={(e) => onChange({ engine: +e.target.value / 100 })} /></label>
      <label className="sl" htmlFor="vThunder"><span>Thunder <small>ഇടി</small></span>
        <input id="vThunder" type="range" min={0} max={100} value={Math.round(mix.thunder * 100)} onChange={(e) => onChange({ thunder: +e.target.value / 100 })} /></label>
      <div className="toggles">
        <label htmlFor="cHorn"><input id="cHorn" type="checkbox" checked={mix.horn} onChange={(e) => onChange({ horn: e.target.checked })} /> Horns</label>
        {showVoice && <label htmlFor="cVoice"><input id="cVoice" type="checkbox" checked={mix.voice} onChange={(e) => onChange({ voice: e.target.checked })} /> Conductor voice</label>}
      </div>
      <button className="mbtn" onClick={onShutter}>{shutterDown ? 'Raise my shutter' : 'Lower my shutter'}</button>
      {canGyro && (
        <button className="mbtn" onClick={async () => { const e = getEngine(); if (e) setGyroOn(await e.toggleGyro()); }}>
          {gyroOn ? 'Stop moving-phone look' : 'Look by moving phone'}
        </button>
      )}
    </section>
  );
}
