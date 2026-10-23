// Bundles the app into one self-contained HTML file at preview/window-seat.html
// (handy for sharing a demo link without deploying). Run: npm run preview:build
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/preview-entry.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/app/globals.css', 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@500;700;800&family=Courier+Prime:wght@400;700&family=Sora:wght@400;600;700&display=swap';

const html = `<title>Aanavandi Window Seat</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fonts}" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
await mkdir('preview', { recursive: true });
await writeFile('preview/window-seat.html', html);
console.log(`preview/window-seat.html  ${(html.length / 1024).toFixed(0)} KB`);
