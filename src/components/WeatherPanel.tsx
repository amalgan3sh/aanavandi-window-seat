import type { WeatherKey } from '@/engine/Engine';

const OPTIONS: [WeatherKey, string, string, string][] = [
  ['clear', '☀️', 'Sunny', 'വെയിൽ'],
  ['cloudy', '☁️', 'Cloudy', 'മേഘം'],
  ['drizzle', '🌦️', 'Drizzle', 'ചാറ്റൽ'],
  ['rain', '🌧️', 'Monsoon', 'മഴ'],
  ['storm', '⛈️', 'Storm', 'ഇടിമഴ'],
];

interface Props { open: boolean; weather: WeatherKey; onPick: (w: WeatherKey) => void }

export function WeatherPanel({ open, weather, onPick }: Props) {
  return (
    <section id="panel-weather" className="panel glass" hidden={!open} aria-label="Weather">
      <h2><span>Weather</span><span className="ml">കാലാവസ്ഥ</span></h2>
      <div className="wx" role="group" aria-label="Weather">
        {OPTIONS.map(([k, icon, label, ml]) => (
          <button key={k} aria-pressed={weather === k} onClick={() => onPick(k)}>
            <i aria-hidden="true">{icon}</i>{label}<small>{ml}</small>
          </button>
        ))}
      </div>
      <p className="fine">Clouds roll in over a few seconds. After rain the road stays wet for a while, the way it does in Kerala.</p>
    </section>
  );
}
