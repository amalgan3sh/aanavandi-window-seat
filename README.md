# Aanavandi Window Seat

A rainy Kerala bus ride in 3D, built as a focus timer. Each stop is one focus session; the bus slows beside a shelter, the conductor calls the stop, and that is your break.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run preview:build   # one self-contained HTML file in preview/
```

Requires Node 18.17+.

## Features

- **3D cabin** modelled on a KSRTC ordinary: teal seats with yellow rails, louvered shutters, luggage racks, chequer-plate floor, bell cord.
- **Journeys**: Kannur → Kozhikode, Thrissur → Ernakulam, Thiruvananthapuram → Kollam. 25/5, 50/10 or a 1-minute demo.
- **Change seat**: seat map with every seat; tap a free one and you stand up and walk there. Window, rain and shutter follow your side.
- **Weather**: Sunny, Cloudy, Drizzle, Monsoon or Storm. Clouds roll in over a few seconds, storms bring more lightning, and the road stays wet for a while after the rain stops.
- **Live FM**: Malayalam and Kerala stations (AIR, local FM, song channels) from the open [radio-browser.info](https://www.radio-browser.info) directory, plus search for any station in the world. Stations that allow it play through the bus speaker; the rest play direct.
- **Conductor**: calls each stop, "Right, right! Potte!" on departure, and works the aisle between stops (tickets, fares, "move to the back"), in Malayalam with captions. See *Conductor voice* below.
- **Bus radio**: add songs from your phone (file picker or drag and drop). They play from the speaker above the windscreen, panned by where you sit, with an optional old-radio sound. The radio dips when the conductor calls a stop. Lock-screen controls via Media Session. Songs never leave the device.
- **Sounds**: rain, engine, rattle, thunder with lightning, horns, bell. All synthesised with the Web Audio API; no audio files ship with the app.
- **Day / Dusk / Night**, look around by drag, arrow keys or moving the phone.

## Conductor voice

Every line lives in `src/engine/voiceLines.ts`. Generate the Malayalam clips once with Azure's neural voices (Midhun for the conductor, Sobhana for passengers); a free F0 Speech resource is enough:

```bash
AZURE_SPEECH_KEY=xxxx AZURE_SPEECH_REGION=centralindia npm run voice
```

Clips land in `public/voice/` with a `manifest.json`; rerunning only makes new or changed lines (`-- --force` redoes all). Without clips the app uses the device's own Malayalam voice if it has one (most Android phones), otherwise it shows the captions only.

## Code map

```
src/
  app/                 Next.js app router (layout, page, globals.css)
  components/          React UI: ticket, seat map, radio, sounds, dialogs
  engine/
    Engine.ts          renderer, loop, input, journey state machine, public API
    cabin.ts           bus interior, seats + who sits where, the radio
    conductor.ts       who says what and when; plays the voice clips
    voiceLines.ts      every Malayalam line (source for `npm run voice`)
    post.ts            ambient occlusion, bloom, film grade
    weather.ts         grime / wetness shader patch shared by materials
    world.ts           road, trees, houses, traffic, shelter, rain
    audio.ts           synthesised bus sounds + radio chain for the user's songs
    materials.ts       textures.ts  routes.ts  util.ts
  preview-entry.tsx    entry for the single-file preview build
```

The engine is plain Three.js (0.160) behind a small class API, loaded with a dynamic import in a client component so it never runs on the server.

## Before launch

- Run `npm run voice` so the conductor speaks real Malayalam on every device.
- Replace synthesised sounds with real recordings from a bus ride for the biggest jump in realism.
- Keep the name and art clear of KSRTC's logo and trademarks.
