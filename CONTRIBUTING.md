# Contributing

Thanks for wanting to make the ride better. Bug fixes, new routes, better sounds, visuals and translations are all welcome.

## Getting started

```bash
git clone https://github.com/<you>/aanavandi-window-seat.git
cd aanavandi-window-seat
npm install
npm run dev        # http://localhost:3000
```

Node 18.17 or newer. Before opening a PR, run:

```bash
npm run typecheck
npm run build
```

CI runs the same two commands on every pull request.

## How changes get in

`main` is protected: nobody pushes to it directly.

1. Fork the repo and create a branch from `main` (`fix-shutter-sound`, `route-kottayam`, …).
2. Make your change. Keep each PR to one idea; small PRs get reviewed faster.
3. Open a pull request and fill in the template. Add a screenshot or short clip for anything visual.
4. CI must pass and a maintainer approves before it is merged.

## Where things live

See the code map in the [README](README.md#code-map). In short: `src/engine/` is plain Three.js and Web Audio with no React; `src/components/` is the UI around it.

## House rules

- **Performance matters.** Most riders are on phones. Check new visuals on a mid-range phone, keep per-frame allocations out of the render loop, and put heavy effects behind the existing `high` quality path.
- **Sounds are synthesised.** The bus, rain and bells are made with the Web Audio API. If you add recorded audio, keep it small and say where it came from.
- **Only add assets you have the rights to.** No film songs, no KSRTC logos or trademarks, nothing ripped from other games or apps. Openly licensed assets (CC0, CC BY, CC BY-SA) are fine; credit them in the PR and in the README.
- **Malayalam first.** UI text has a Malayalam label alongside English where it fits. Native speakers fixing wording or spelling is very welcome.
- **Match the surrounding code**: naming, comment style, small functions, no new dependency without a reason in the PR.

## Ideas to pick up

- Conductor voice clips with a free, open model ([AI4Bharat Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts)) or real recordings. Lines are in `src/engine/voiceLines.ts`; the feature flag is in `src/engine/flags.ts`.
- More routes (Kottayam, Palakkad, Kasaragod…) in `src/engine/routes.ts`.
- Real recordings of a bus ride to replace synthesised sounds.
- Tea shops, temples, backwaters and more roadside variety in `src/engine/world.ts`.
- Accessibility: keyboard navigation of the seat map, screen-reader announcements for stops.

Found a bug or have an idea? Open an issue first if it is a big change, so we can agree on the approach before you spend time on it.

By contributing you agree that your work is released under the [MIT License](LICENSE).
