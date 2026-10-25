# Map layer prototype

A throwaway prototype on the branch `prototype/map-layer`, built to answer "Prototype the map layer with Perron (#14)": how the real map should look and perform. It is not the app. Nothing here is meant to merge.

```sh
npm install
npm run dev
```

Then open <http://localhost:3000/prototype/map>. The bottom bar flips between the three glyph variants (or press ← and →). Everything is in the URL, so any state has a link:

| Param     | Values                    | Default    |
| --------- | ------------------------- | ---------- |
| `variant` | `a`, `b`, `c`             | `a`        |
| `theme`   | `light`, `dark`           | `light`    |
| `overlay` | `overlaid`, `interleaved` | `overlaid` |
| `n`       | vehicles, 1 to 20000      | `1500`     |
| `z`       | zoom                      | by width   |
| `lon`     | centre                    | `12.565`   |
| `lat`     | centre                    | `55.68`    |

Tap a dot to see its line, mode and data state. The readout at the top right shows the median FPS of the last two seconds, the p95 frame interval, and the JS time per frame spent on positions and on handing deck.gl its layers.

To measure, use a production build, since the dev server and React's development build cost frames:

```sh
npm run build && npm run start
npm run measure        # headless Chromium: phone 390x844 at 3x with CPU throttled 4x and 6x, and desktop 1440x900
npm run screenshots    # every variant, light and dark, city and Nørreport, into prototype-screenshots/
```

In a production build the bottom bar is hidden, as the prototype skill asks; switch with `?variant=`.

## What is in it

- Next.js 16 app router. The route is `app/prototype/map/`; `app/page.tsx` only redirects there. Server components hold nothing but the shell; the map is a client component loaded with `ssr: false`.
- MapLibre GL 6 with OpenFreeMap's Positron style (`public/positron.base.json`), recoloured at load from Perron's `color.map.*` tokens into a light and a dark theme (`style.ts`). Metro, S-tog and regional lines are drawn as static MapLibre line layers from `data/routes.json`, the design prototype's paths snapped to real streets and tracks, in their line colours at `map.line-width.*` and `opacity.map-line*`.
- About 1,500 simulated vehicles (`sim.ts`) spread over the 23 lines by length and mode, moving along the paths at mode speeds, with data states in the shares 30% Live, 10% Ageing, 35% Estimated, 20% Timetable only, 5% No signal. Positions are computed on the CPU each frame into one `Float64Array`.
- deck.gl 9.4 through `MapLibreOverlay` from `@deck.gl/maplibre`, overlaid by default (its own canvas; the basemap stays idle while the dots move). `?overlay=interleaved` draws into MapLibre's context under the labels, which repaints the whole map every frame.
- The glyphs are `ScatterplotLayer`s fed binary attributes (`glyphs.ts`). The dashed Timetable only ring comes from `PathStyleExtension`, which dashes scatterplot strokes since deck.gl 9.3. The No signal cut is a four-line fragment shader injection in `VehicleGlyphLayer.ts`, since no stock prop cuts a circle.
- The three variants: **A** Perron's glyphs as specified on its data-states page; **B** an ink core carrying the state inside a thin ring in the line colour; **C** Perron's shapes a third larger on a surface-coloured halo, with a trail behind each Live vehicle.

## Perron tokens used

`color.map.*` for the basemap, `color.transit.line.*` and `color.transit.mode.*` for vehicle colour, `color.data-state.*` for the grey, the halo and the hairline, `map.dot-radius.*`, `map.line-width.*`, `map.track-spacing.*`, `opacity.map-line*` and `opacity.map-trail`, all read from `@mylder/perron/tokens.ts` (0.1.0 on npm). The `vehicle-dot.*` geometry is in Perron 0.2.0, which is not published yet, so `perron.ts` carries a copy of those values.

Positron layers with no token of their own: road casings and building outlines take `color.map.runway`, boundaries take `color.map.rail`, the gaps in dashed rail take `color.map.land`.

## Measured in the cloud

Headless Chromium, 1,500 vehicles, 15 s after the tiles loaded and the map went idle, at city zoom. Phone: 390×844 at 3× (a 1170×2532 canvas), CPU throttled 4× and 6× through CDP. Desktop: 1440×900 at 1×, unthrottled.

| Profile    | Variant | Overlay     | FPS (median) | Frame p50 ms | Frame p95 ms | Positions mean ms | Positions p95 ms | deck.gl setProps mean ms | setProps p95 ms |
| ---------- | ------- | ----------- | ------------ | ------------ | ------------ | ----------------- | ---------------- | ------------------------ | --------------- |
| phone-cpu4 | A       | overlaid    | 6            | 183.3        | 216.7        | 0.38              | 1.40             | 0.85                     | 1.70            |
| phone-cpu4 | B       | overlaid    | 4            | 266.7        | 366.6        | 0.66              | 1.80             | 0.84                     | 1.90            |
| phone-cpu4 | C       | overlaid    | 4            | 283.3        | 316.7        | 1.03              | 2.10             | 0.69                     | 1.60            |
| phone-cpu6 | A       | overlaid    | 5            | 200.0        | 233.3        | 0.64              | 3.00             | 1.24                     | 3.10            |
| phone-cpu6 | B       | overlaid    | 3            | 333.3        | 483.3        | 0.48              | 1.40             | 1.20                     | 2.70            |
| phone-cpu6 | C       | overlaid    | 3            | 316.7        | 383.3        | 1.66              | 3.60             | 1.36                     | 2.50            |
| desktop    | A       | overlaid    | 13           | 83.3         | 83.4         | 0.08              | 0.20             | 0.21                     | 0.30            |
| desktop    | B       | overlaid    | 10           | 100.0        | 116.7        | 0.11              | 0.20             | 0.26                     | 0.40            |
| desktop    | C       | overlaid    | 7            | 133.3        | 150.1        | 0.35              | 0.50             | 0.19                     | 0.30            |
| phone-cpu4 | A       | interleaved | 3            | 283.4        | 333.4        | 0.48              | 2.00             | 1.43                     | 2.60            |
| desktop    | A       | interleaved | 6            | 166.6        | 183.4        | 0.10              | 0.20             | 0.33                     | 0.50            |

Headless Chromium renders WebGL through SwiftShader, in software, so the fps and frame times above are the cost of rasterising the canvas on a CPU and are far more pessimistic than a phone. The CPU-side numbers carry over: positions (the simulation loop) and deck.gl `setProps` (building the layers and handing over the arrays) stay under 2 ms per frame even throttled 6×. Interleaved roughly halves the frame rate because every vehicle frame repaints the basemap. The real phone number waits on a real phone: open the production build over the LAN and read the on-screen readout. `prototype-screenshots/measurements.json` holds the raw results.
