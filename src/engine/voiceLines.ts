import { ROUTES, type Stop } from './routes';

/**
 * Every line the conductor ('c') and passengers ('p') can say. `npm run voice` turns each one
 * into a Malayalam clip in public/voice/, keyed by id; the app plays the clip for the id.
 */
export interface Line { id: string; ml: string; en: string; who: 'c' | 'p' }

export const slug = (en: string) => en.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const c = (id: string, ml: string, en: string): Line => ({ id: `c-${id}`, ml, en, who: 'c' });
const p = (id: string, ml: string, en: string): Line => ({ id: `p-${id}`, ml, en, who: 'p' });

const FIXED: Line[] = [
  c('boarding', 'ടിക്കറ്റ്, ടിക്കറ്റ്! എവിടേക്കാ?', 'Ticket, ticket! Where to?'),
  c('alight', 'ഇറങ്ങാനുള്ളവർ വേഗം ഇറങ്ങിക്കോ!', 'Getting down? Quickly now!'),
  c('last', 'ലാസ്റ്റ് സ്റ്റോപ്പ്! എല്ലാവരും ഇറങ്ങിക്കോ!', 'Last stop! Everybody down!'),
  c('depart', 'റൈറ്റ്, റൈറ്റ്! പോട്ടെ!', 'Right, right! Let\'s go!'),
  c('break', 'അഞ്ച് മിനിറ്റ് ഉണ്ട്, ചായ കുടിക്കുന്നവർ കുടിച്ചോ.', 'Five minutes here. Have your tea if you want.'),
  c('noticket', 'ടിക്കറ്റ് എടുക്കാത്തവർ ആരെങ്കിലും ഉണ്ടോ?', 'Anyone still without a ticket?'),
  c('where', 'എവിടേക്കാ ചേട്ടാ?', 'Where to, chetta?'),
  c('fare-18', 'പതിനെട്ട് രൂപ.', 'Eighteen rupees.'),
  c('fare-25', 'ഇരുപത്തഞ്ച് രൂപ.', 'Twenty-five rupees.'),
  c('fare-32', 'മുപ്പത്തിരണ്ട് രൂപ.', 'Thirty-two rupees.'),
  c('change', 'ചില്ലറ ഉണ്ടോ? ബാക്കി പിന്നെ തരാം.', 'Got change? I\'ll give the balance later.'),
  c('moveback', 'പുറകോട്ട് നീങ്ങി നിൽക്ക്, പുറകിൽ സ്ഥലം ഉണ്ട്.', 'Move to the back, there\'s room at the back.'),
  c('bags', 'സീറ്റിൽ ബാഗ് വെക്കല്ലേ, ആള് നിൽക്കുന്നുണ്ട്.', 'No bags on the seat, people are standing.'),
  c('tellyou', 'പറയാം, പറയാം.', 'I\'ll tell you, don\'t worry.'),
  c('shutter', 'ഷട്ടർ താഴ്ത്തിക്കോ, മഴവെള്ളം കേറും.', 'Pull the shutter down, the rain will come in.'),
];

/** Lines that name a stop, one per stop. */
function perStop(s: Stop): Line[] {
  const [ml, en] = s, k = slug(en);
  return [
    c(`stop-${k}`, `${ml}! ${ml}!`, `${en}! ${en}!`),
    c(`next-${k}`, `അടുത്ത സ്റ്റോപ്പ് ${ml}!`, `Next stop, ${en}!`),
    p(`one-${k}`, `ഒരു ${ml}.`, `One to ${en}.`),
    p(`tellme-${k}`, `ചേട്ടാ, ${ml} എത്തുമ്പോ ഒന്ന് പറയണേ.`, `Chetta, tell me when we reach ${en}.`),
  ];
}

const stops = new Map<string, Stop>();
for (const r of Object.values(ROUTES)) for (const s of r.stops) stops.set(s[1], s);

export const VOICE_LINES: Line[] = [...FIXED, ...[...stops.values()].flatMap(perStop)];
export const LINE = new Map(VOICE_LINES.map((l) => [l.id, l]));
