// Entry for the single-file preview build (scripts/build-preview.mjs). Not used by Next.js.
import { createRoot } from 'react-dom/client';
import WindowSeatApp from './components/WindowSeatApp';

const el = document.getElementById('root');
if (el) createRoot(el).render(<WindowSeatApp />);
