# Drawing thousands of moving vehicles on MapLibre

Research for issue #9, 25 October 2026. The question: how to draw about 1,500 vehicles that glide
along their routes, smoothly, on a mid-range phone, over an OpenFreeMap basemap in Perron's colours.

Points marked **(unconfirmed)** come from reasoning or from secondary sources, not from a measurement
or a primary document. The prototype ticket should measure them.

## Short answers

1. **Rendering approach.** Use deck.gl's `ScatterplotLayer` through `MapLibreOverlay` from the new
   `@deck.gl/maplibre` package, in **overlaid** mode, with positions computed on the CPU each frame
   and handed over as one typed array. Per-frame `setData` or `updateData` on a GeoJSON source is the
   wrong tool: every call goes through the worker, gets re-tiled and comes back frames later, so
   on a slow phone updates merge and dots step (unconfirmed at 1,500 points). A custom WebGL layer is the leanest at runtime but means writing
   shaders, picking and precision handling ourselves, and it forces a full basemap repaint every
   frame. No published benchmark covers 1,500 animated points on a phone, for any of the three.
2. **The five glyphs.** In deck.gl, one `ScatterplotLayer` draws all five: fill colour and alpha,
   stroke colour and width per vehicle, and a dashed outline from `PathStyleExtension` (since deck.gl
   9.3). A second layer underneath draws the land-coloured halo. MapLibre's own `circle` layer cannot
   dash a stroke, so a GeoJSON approach needs a symbol layer with an image for the dashed ring. A custom
   layer draws all five in one fragment shader. Every value comes from Perron's `vehicle-dot.*`,
   `color.transit.*` and `color.data-state.*` tokens.
3. **Basemap style.** Fork OpenFreeMap's Positron (55 layers, OpenMapTiles schema) once, as a
   skeleton for both themes. Write a build script that fills its colours from Perron's `color.map.*`
   tokens and emits a light and a dark style JSON; don't base dark on OpenFreeMap's Dark, which is
   unmaintained. Host the JSON ourselves. Switch themes at runtime with `setStyle(url, {diff: true})`,
   or with one style whose colours read a `global-state` value. Maputnik is for looking, not for the
   source of truth. Credit "© OpenMapTiles" and "© OpenStreetMap contributors", visible on phones too,
   plus OpenFreeMap; keep Positron's BSD and CC BY 4.0 notice with the forked style.
4. **Taps and accessibility.** deck.gl picks on the GPU, using the positions it just drew; set
   `pickingRadius` so the tap area is at least `size.target-min` (24 px). Resolve the tap against
   positions at `pointerdown`, not on release. Under `prefers-reduced-motion`, stop the glide (dots jump
   to each new report), the trails and the pulses, and let camera moves jump. Offer a pause control.
   Keep MapLibre's keyboard handler and name the canvas. The vehicle list is the map's text
   alternative, as Perron's accessibility page already says.
5. **Versions and sizes.** `maplibre-gl` 6.16.0 (published today; 6.15.0 is a week old),
   `deck.gl` 9.4.0 (likely the last 9.x), `@deck.gl/maplibre` 9.4.0, `@vis.gl/react-maplibre` 8.1.3
   and `react-map-gl` 8.1.3, whose `react-map-gl/maplibre` entry re-exports the former. Gzipped:
   MapLibre about 287 KB plus a 147 KB worker loaded separately, deck.gl (core, layers, overlay) about
   228 KB more, the React wrapper about 4 KB.

## Recommendation for the prototype ticket

Build the moving vehicles as a deck.gl overlay and measure it against the alternatives on a real
mid-range Android phone.

- **Stack.** Next.js client component, `@vis.gl/react-maplibre` `<Map>`, `MapLibreOverlay`
  (`interleaved: false`) attached with `useControl`, `@deck.gl/layers` `ScatterplotLayer` and
  `@deck.gl/extensions` `PathStyleExtension`.
- **Layers.** One halo layer and one glyph layer. Only the glyph layer is pickable.
  Route lines and stations stay as static MapLibre line and circle layers in the style, so the
  basemap only repaints when the camera moves.
- **Animation.** One `requestAnimationFrame` loop outside React. Each frame it computes every visible
  vehicle's position along its route shape and writes them into one `Float32Array`. It then calls
  `overlay.setProps({layers})` with layers whose `data.attributes.getPosition` points at that array.
  Colours, radii and states are typed arrays too, rebuilt only when a report arrives or the theme
  changes. React state holds selection and the list, never positions.
- **Measure.** Over 60 seconds of panning and of standing still, on one mid-range phone and with
  1,500 vehicles: main-thread time per frame, p95 frame time, dropped frames, and tap accuracy at
  zoom 13 and 17. Compare with two baselines: per-frame `GeoJSONSource.updateData` with a `circle`
  layer, and the existing canvas 2D `drawGlyph` drawn on an overlay canvas. Write the numbers back
  into this file.
- **Fall back** to a custom layer only if deck.gl's 228 KB or its frame cost fails that test.

## The approaches in detail

|                            | GeoJSON source, `setData`/`updateData` per frame                                              | Custom layer (`CustomLayerInterface`)                                      | deck.gl overlaid                      | deck.gl interleaved                        |
| -------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Per-frame work             | Diff or full data posted to the worker, re-indexed by geojson-vt, tiles rebuilt and sent back | One buffer upload (about 12 KB for 1,500 positions) and one instanced draw | Same as custom layer, done by deck.gl | Same, plus MapLibre repaints the whole map |
| Basemap repaint each frame | Yes                                                                                           | Yes (`triggerRepaint`)                                                     | No, only deck.gl's own canvas         | Yes                                        |
| Smoothness                 | Updates are queued and merged; positions land frames later (unconfirmed for 1,500 points)     | Full control                                                               | Full control                          | Full control                               |
| Hit-testing                | `queryRenderedFeatures`, built in                                                             | None; write our own                                                        | GPU picking, built in                 | GPU picking, built in                      |
| Dots under labels          | Yes                                                                                           | Yes                                                                        | No, always on top                     | Yes, with `beforeId`                       |
| Extra bundle               | None                                                                                          | None                                                                       | About 228 KB gzipped                  | About 228 KB gzipped                       |
| Effort                     | Low                                                                                           | High                                                                       | Low                                   | Low                                        |

### GeoJSON source updated each frame

- MapLibre's own "Animate a point" example calls `setData` inside `requestAnimationFrame`, for one
  point.
- In 6.x, `setData` replaces a queued worker update and `updateData` merges diffs into the waiting
  one. So when calls come faster than the worker finishes, MapLibre drops the in-between states
  instead of drawing them. That keeps memory flat (6.12.0 fixed a crash when `setData` outran the
  worker) but means the dot advances in jumps on a slow phone.
- `updateData` needs a unique id per feature, set on the feature or through `promoteId`. Older
  releases made it faster for small diffs (5.11.0, 5.13.0, 5.14.0).
- Each update travels main thread → worker → geojson-vt index → tile buckets → main thread. A
  2021 report measured about 200 ms of main-thread `JSON.stringify` per `setData` for 900,000
  coordinates. That path has changed since; 1,500 points is far smaller. No current number exists.
- Two source options lower the cost: `maxzoom` (default 18) sets how deep geojson-vt tiles, and
  `buffer` (default 128) can go to 0 for points. Fewer tiles mean fewer worker round trips per update.
- Every change repaints the whole map, symbol layers included. 6.7.0 skips symbol re-placement when
  nothing it depends on changed, which helps.

### Custom WebGL layer

- `render(gl, args)` runs inside MapLibre's frame with its WebGL2 context. `args` has
  `defaultProjectionData` and a shader prelude, so `projectTile()` maps Mercator 0..1 coordinates to
  clip space, including globe.
- MapLibre 6 needs WebGL2, so instancing and GLSL ES 3.00 are always there.
- What we would have to write: shaders, buffers, context-loss handling, HiDPI sizing, picking, and
  precision. Float32 Mercator coordinates are only good to about 2 m, which shows as jitter at street
  zoom, so positions need a local origin near Copenhagen (unconfirmed estimate: 1/2²⁴ of the world).
- Animating means calling `triggerRepaint` every frame, which redraws the basemap. An old MapLibre
  issue reports that this full repaint, not the custom layer, is what loads the CPU and GPU.

### deck.gl

- `@deck.gl/maplibre` is new in deck.gl 9.4. It is forked from `@deck.gl/mapbox`, and the docs
  recommend it for MapLibre 4.5.1, 5 and 6.
- **Overlaid** (`interleaved: false`, the default) draws to its own canvas over the map and redraws
  on MapLibre's `render` event or when its layers change. The basemap stays idle while only vehicles
  move. Dots sit above labels, as in the prototype.
- **Interleaved** shares MapLibre's WebGL2 context. Its `_customRender` calls `map.triggerRepaint()`,
  so every vehicle frame redraws the whole map. Use it only if dots must go under labels. MapLibre's
  context has `antialias: false`, so set `antialiasing: true` on the layers.
- The performance guide says rebuilding attributes is the most expensive thing a layer does, and that
  `data` changes in an animation can stutter "even for layers with just a few thousand items". The fix
  is to supply binary attributes directly (`data.attributes.getPosition` as a typed array), which
  skips the per-object accessors.
- 9.4 picks with `instance_index` in the shader instead of picking colour buffers, which saves GPU
  memory.
- deck.gl shifts positions to a viewport-local origin to keep precision, so street-zoom jitter is
  handled.
- **TripsLayer** animates paths on the GPU from per-vertex timestamps (`currentTime`,
  `trailLength`). It draws trails, not dots, and needs each trip's full timed path in advance. It
  could draw the live-vehicle trail but not the glyphs, and our positions change with each report.
  Not recommended for the dots.

### What the frame costs, as far as we know

- No published benchmark measures 1,500 animated points on a phone with any of these approaches.
- deck.gl's guide: a basic layer like `ScatterplotLayer` holds 60 fps with about 1 million points
  while panning, on a 2015 laptop. It warns that phones are more sensitive to memory than to drawing.
- Overdraw is small: a 5 px radius is about 100 pixels per point. At a device pixel ratio of 2.5 and a
  6 px radius, that is about 1,500 × 700 ≈ 1 million fragments a frame (unconfirmed estimate).
- The CPU side is a binary search along each route's cumulative distances and a lerp: about 1,500 ×
  log₂(shape length) steps a frame, well under a millisecond in JavaScript (unconfirmed estimate).
- Phones run at 60 to 120 Hz. Capping the vehicle loop at 60 fps, or 30 fps on low battery, saves
  power without visible loss at these speeds (unconfirmed).

## Drawing the five glyphs

Geometry and colours come from Perron tokens (`packages/perron/tokens`, see `docs/foundations/data-states.md`):

| State          | Fill                                                                                     | Stroke                                                                             | Tokens                                         |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| Live           | Line colour                                                                              | Hairline `color.data-state.outline` when the line colour is light on the light map | `color.transit.line.*`, `color.transit.mode.*` |
| Ageing         | Line colour at `vehicle-dot.ageing.fill-opacity` (0.42)                                  | Line colour, 1.3 px, inset 0.6 px                                                  | `vehicle-dot.ageing.*`                         |
| Estimated      | None                                                                                     | Line colour, 1.8 px, inset 0.9 px                                                  | `vehicle-dot.estimated.*`                      |
| Timetable only | None                                                                                     | Line colour, 1.6 px, inset 0.9 px, dash 2.1 px gap 1.7 px                          | `vehicle-dot.timetable.*`                      |
| No signal      | `color.data-state.no-signal`                                                             | None                                                                               |                                                |
| All            | A halo of `color.data-state.halo` (land), `vehicle-dot.halo` (1.6 px) wider than the dot |                                                                                    |                                                |

Dot radius per mode comes from `map.dot-radius.*`. The dimmed state of a vehicle outside a focused line uses `opacity.map-dim-vehicle`.

- **deck.gl.** A halo `ScatterplotLayer` (fill = land colour, radius = dot radius + 1.6 px,
  `radiusUnits: 'pixels'`) under a glyph `ScatterplotLayer` with `stroked: true` and `filled: true`.
  Per vehicle: `getFillColor` (alpha 0 for rings, 107 for ageing), `getLineColor`, `getLineWidth`
  and `getRadius`. deck.gl centres the stroke on the radius (outer edge = radius + width/2), so set
  the radius to dot radius − inset. Add `PathStyleExtension({dash: true})` and give `getDashArray`
  `[0, 0]` (solid) for every state but timetable only. Scatterplot dashes are always measured in
  half stroke widths, so the 2.1 px dash and 1.7 px gap on a 1.6 px stroke become `[2.625, 2.125]`.
  Dimming changes alpha; theme changes rebuild the colour arrays.
- **GeoJSON source.** Two `circle` layers: halo, then glyph, with `circle-color`, `circle-opacity`,
  `circle-stroke-width` and `circle-stroke-color` driven by `["get", "state"]` and
  `["get", "color"]`. The style spec has no dash for `circle-stroke`. Draw timetable-only vehicles in
  a `symbol` layer with a dashed-ring image added by `addImage(…, {sdf: true})`, `icon-color` from
  the line colour, and `icon-allow-overlap` and `icon-ignore-placement` set to true.
- **Custom layer.** One instanced quad per vehicle; the fragment shader computes the distance from
  the centre and draws fill, rim and dash (by angle) from per-instance state, colour and radius.
  Antialias with `fwidth`.
- **Any approach, as a fallback.** Pre-draw a glyph atlas with the prototype's `drawGlyph` canvas
  code: about 12 colours × 5 states × a few sizes. Use it with deck.gl's `IconLayer` (no `mask`) or a
  MapLibre symbol layer. It matches the prototype pixel for pixel, but it blurs when scaled between
  sizes.

## The basemap in Perron's colours

### Which style to start from

- OpenFreeMap serves Positron, Bright, Liberty, Dark and Fiord. Dark and Fiord are unmodified copies
  of abandoned upstream styles; Bright, Liberty and Positron get the active fixes.
- Positron is already quiet: no POIs, few road labels. Its 55 layers cover everything the prototype
  draws (water, park, building, aeroway, road classes, rail, labels).
- Use Positron's layer list as the skeleton for **both** themes and swap only colours, so the two
  themes share filters, zoom ranges and widths. Drop the Natural Earth raster (`ne2_shaded`), which
  only matters below zoom 6.

### Building it

- Keep the fork as `positron.base.json` in the app repo. Add a script that reads Perron's
  `tokens.ts` and writes `style-light.json` and `style-dark.json`, so a token change reaches the map
  through `npm run tokens` like everything else. A first mapping:

| Positron layers                                    | Perron token            |
| -------------------------------------------------- | ----------------------- |
| `background`, label halos                          | `color.map.land`        |
| `water`                                            | `color.map.water`       |
| `waterway_line_label`, `water_name_*`              | `color.map.water-label` |
| `park`, `landcover_wood`                           | `color.map.park`        |
| `building`                                         | `color.map.building`    |
| `highway_*_inner`, `highway_minor`, `highway_path` | `color.map.street`      |
| `aeroway-area`                                     | `color.map.airport`     |
| `aeroway-runway`, `aeroway-taxiway`                | `color.map.runway`      |
| `railway*`                                         | `color.map.rail`        |
| `label_*`, `highway-name-*`                        | `color.map.label`       |

- Casings and boundaries have no token yet. Map them to land, rail or a transparent value, or ask
  the `design-tokens` skill in Perron for a new token.
- The source stays `https://tiles.openfreemap.org/planet`, with glyphs from
  `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (Noto Sans). The repo copy uses
  `__TILEJSON_DOMAIN__` as a placeholder. MapLibre's `font-faces` support (6.7.0) could draw labels
  in Perron's typeface instead (unconfirmed for Latin text).
- OpenFreeMap says a customised style must be hosted by us. Serve both files from the Next.js app.
- Maputnik (linked from OpenFreeMap's quick start) is good for inspecting Positron's layers and trying
  values. Copy what we keep back into the script; don't hand-edit the generated files.

### Switching themes at runtime

- **Two files.** `map.setStyle(nextUrl, {diff: true})` diffs the styles and applies only the changed
  paint values, keeping sources and tiles. `transformStyle` can carry our own runtime layers across.
- **One file.** Write each colour as `["match", ["global-state", "theme"], "dark", <dark>, <light>]`
  and call `map.setGlobalStateProperty("theme", "dark")`. `global-state` works in the JS library since
  5.6.0, and 6.x transitions paint properties that read it. No style reload. (Unconfirmed: check that
  every colour property we use accepts `global-state`.)
- Either way, follow `matchMedia('(prefers-color-scheme: dark)')` and the app's own theme setting,
  and rebuild the deck.gl colour arrays from the same tokens at the same moment.

### Attribution and licences

- OpenFreeMap's public instance is free, with no keys, no limits and no registration. Attribution is
  required: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", each linked. The OpenFreeMap part is
  optional but requested. With MapLibre, the attribution control shows it from the TileJSON.
- Map data is OpenStreetMap under the ODbL. The OSMF guideline covers collapsed attribution (such as
  an "i" button) but we could not read its exact limits (unconfirmed). Keep the credit visible in the
  map corner on phones too, as the prototype does: `attributionControl: {compact: false}` or our own
  credit line.
- The Positron style's code is BSD 3-Clause and its design CC BY 4.0 (it derives from CARTO's
  basemaps, CC BY 3.0). Keep its `LICENSE.md` next to the fork. The "© OpenMapTiles" credit is the
  usual way to meet the CC BY part (unconfirmed for the CARTO line).

## Tapping a moving dot

- **deck.gl.** Picking redraws the pickable layers into an off-screen buffer at the pointer, on
  click and on hover. It reads the positions of the frame on screen, so a tap hits what the person
  saw. `pickingRadius` adds pixels around the pointer; its docs name "small moving circles or
  interaction by touch". Set it so the target reaches `size.target-min` (24 px) and keep only the
  glyph layer pickable. `onClick` gets the vehicle's index.
- **GeoJSON source.** `map.on('click', layerId, …)` or `queryRenderedFeatures` with a box around the
  point. It answers from the tiles on screen, which match the drawn dots even when updates lag.
- **Custom layer.** No built-in picking. Keep each vehicle's screen position from the last frame and
  take the nearest one within dot radius + 9 px, as the prototype's `hitTest` does.
- **For all three.**
  - Resolve against positions at `pointerdown`. A bus at 50 km/h moves about 2 m during a 150 ms tap,
    several pixels at street zoom.
  - When two or more dots fall inside the target, pick the nearest, or open a short chooser.
  - On select, ring the vehicle and keep following it; the detail panel has `aria-live="polite"`,
    as in the prototype.

## Keeping a moving map accessible

Perron targets WCAG 2.2 AA (`docs/foundations/accessibility.md`).

- **Reduced motion (2.3.3).** Under `prefers-reduced-motion: reduce`: no glide (each dot jumps to
  its new position when a report or estimate changes), no trails, no report or selection pulses.
  MapLibre's `easeTo` and `flyTo` already jump under reduced motion unless `essential: true`; 6.14.0
  fixed `flyTo` dropping `offset` and `around` when it does.
- **Pause (2.2.2).** Auto-moving content that runs longer than five seconds next to other content
  needs a way to pause it. A "Pause movement" toggle freezes interpolation; dots still show their
  latest state.
- **Keyboard.** MapLibre's canvas gets `tabindex="0"`, `role="region"` and the label "Map". Set the
  label through the `locale` option (`"Map.Title"`), for example "Live map of Copenhagen". Its
  keyboard handler pans with the arrows, zooms with `+` and `-`, and rotates and tilts with Shift.
- **Screen readers.** Dots on a canvas can't be focused. The vehicle list is the text alternative:
  line, destination, delay and data state in words, sortable and searchable. Choosing a row flies to
  the vehicle and opens its detail. Never announce position changes.
- **Targets (2.5.8).** A 24 px tap area around each dot. The list also counts as the equivalent
  control for crowded spots.

## Versions, wrappers and sizes

Checked with `npm view` on 25 October 2026.

| Package                                                                       | Version | Published  | Note                                                                        |
| ----------------------------------------------------------------------------- | ------- | ---------- | --------------------------------------------------------------------------- |
| `maplibre-gl`                                                                 | 6.16.0  | 2026-10-25 | 6.0.0 came out 2026-07-22. ESM only, WebGL2 only, worker as a separate file |
| `@maplibre/maplibre-gl-style-spec`                                            | 26.4.4  | 2026-10-23 |                                                                             |
| `deck.gl`, `@deck.gl/core`, `/layers`, `/geo-layers`, `/extensions`, `/react` | 9.4.0   | 2026-09-05 | 9.4 is "expected to be the final release in the v9 series"                  |
| `@deck.gl/maplibre`                                                           | 9.4.0   | 2026-09-05 | Peer `maplibre-gl` `^4.5.1 \|\| ^5.0.0 \|\| ^6.0.0`                         |
| `@vis.gl/react-maplibre`                                                      | 8.1.3   | 2026-09-02 | Peer `maplibre-gl >=4`, `react >=16.3`                                      |
| `react-map-gl`                                                                | 8.1.3   | 2026-09-02 | `react-map-gl/maplibre` re-exports `@vis.gl/react-maplibre`                 |

`maplibre-gl` 6.16.0 is hours old. Perron's artifact rule wants versions at least two weeks old; for
that, 6.14.0 (11 October) qualifies.

Sizes, minified with esbuild 0.28.2 and `gzip -9`, `maplibre-gl`, `react` and `react-dom` external
where marked:

| Entry                                                        | Minified | Gzipped |
| ------------------------------------------------------------ | -------- | ------- |
| `maplibre-gl` `Map`                                          | 1,058 KB | 287 KB  |
| `maplibre-gl-worker.mjs` (loaded by the worker)              | 519 KB   | 147 KB  |
| `maplibre-gl.css`                                            | 72 KB    | 10 KB   |
| `MapLibreOverlay` + `ScatterplotLayer` (MapLibre external)   | 805 KB   | 228 KB  |
| … + `IconLayer`                                              | 822 KB   | 232 KB  |
| `MapLibreOverlay` + `TripsLayer`                             | 835 KB   | 236 KB  |
| `@vis.gl/react-maplibre` `Map` (MapLibre and React external) | 11 KB    | 4 KB    |
| Full `deck.gl` bundle (`dist.min.js`), for comparison        | 2,073 KB | 575 KB  |

`PathStyleExtension` was not measured.

### Next.js notes

- MapLibre needs the browser. Put the map in a `'use client'` component and load it with
  `next/dynamic` and `ssr: false`.
- MapLibre 6 needs its worker URL set before the first map:
  `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())`.
  This works under Turbopack and `next build --webpack` from Next.js 15.
- MapLibre 6 has no default export: `import * as maplibregl from 'maplibre-gl'` or named imports.
- deck.gl's React example attaches the overlay with `useControl(() => new MapLibreOverlay(props))`
  and calls `overlay.setProps(props)` on each render. For animation, call `setProps` from the frame
  loop instead of re-rendering React.

## Open questions

- Real frame times on a mid-range phone for all three approaches (the prototype ticket).
- Whether `PathStyleExtension`'s dash on a 1.6 px scatterplot outline matches the prototype's
  canvas dash on a phone.
- Whether `global-state` covers every colour property in the forked style.
- The exact OSMF rule for collapsed attribution on phones.

## Sources

- MapLibre GL JS changelog (6.0.0 to 6.16.0, `setData`, `updateData`, custom layer, `font-faces`,
  reduced-motion entries): <https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md>
- MapLibre v5 to v6 migration guide: <https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md>
- MapLibre installation, worker setup per bundler (Turbopack, webpack): <https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md>
- `GeoJSONSource.setData` and `updateData`: <https://github.com/maplibre/maplibre-gl-js/blob/v6.16.0/src/source/geojson_source.ts>,
  <https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/>
- `CustomLayerInterface`: <https://github.com/maplibre/maplibre-gl-js/blob/v6.16.0/src/style/style_layer/custom_style_layer.ts>,
  <https://maplibre.org/maplibre-gl-js/docs/examples/add-a-custom-style-layer/>
- Keyboard handler: <https://github.com/maplibre/maplibre-gl-js/blob/v6.16.0/src/ui/handler/keyboard.ts>
- "Animate a point" example: <https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-point/>
- Large GeoJSON guide: <https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/large-data.md>
- Map repaint cost with animated layers: <https://github.com/maplibre/maplibre-gl-js/issues/96>
- `setData` stringify cost (2021): <https://github.com/maplibre/maplibre-gl-js/issues/106>
- Style spec 26.4.4 (`circle` paint properties, `icon-color` SDF only, GeoJSON `maxzoom` and
  `buffer`, `global-state`, `font-faces`): <https://github.com/maplibre/maplibre-style-spec/blob/main/src/reference/v8.json>
- `@deck.gl/maplibre` overview: <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/maplibre/overview.md>
- Using deck.gl with MapLibre: <https://github.com/visgl/deck.gl/blob/master/docs/developer-guide/base-maps/using-with-maplibre.md>
- Overlay redraw code (interleaved `triggerRepaint`, overlaid `redraw`): <https://github.com/visgl/deck.gl/blob/v9.4.0/modules/maplibre/src/deck-utils.ts>,
  <https://github.com/visgl/deck.gl/blob/v9.4.0/modules/maplibre/src/overlay.ts>
- deck.gl performance guide: <https://github.com/visgl/deck.gl/blob/master/docs/developer-guide/performance.md>
- deck.gl what's new (9.3 scatterplot dashes, 9.4 picking, `@deck.gl/maplibre`): <https://github.com/visgl/deck.gl/blob/master/docs/whats-new.md>
- `ScatterplotLayer`: <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/layers/scatterplot-layer.md>,
  stroke placement: <https://github.com/visgl/deck.gl/blob/v9.4.0/modules/layers/src/scatterplot-layer/scatterplot-layer-vertex.glsl.ts>
- `PathStyleExtension` (scatterplot dashes, `[0, 0]` for solid, units in half widths): <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/extensions/path-style-extension.md>
- `IconLayer`: <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/layers/icon-layer.md>
- `TripsLayer`: <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/geo-layers/trips-layer.md>
- `Deck` (`pickingRadius`): <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/core/deck.md>
- deck.gl coordinate systems (precision offset): <https://github.com/visgl/deck.gl/blob/v9.4.0/docs/developer-guide/coordinate-systems.md>
- deck.gl binary `data.attributes`: <https://github.com/visgl/deck.gl/blob/v9.4.0/docs/api-reference/core/layer.md>
- react-map-gl what's new (8.1 and MapLibre 6) and get started: <https://github.com/visgl/react-map-gl/blob/master/docs/whats-new.md>,
  <https://github.com/visgl/react-map-gl/blob/master/docs/get-started/get-started.md>
- OpenFreeMap quick start (styles, Maputnik, self-hosting a custom style): <https://openfreemap.org/quick_start/>
- OpenFreeMap README (free use, attribution text): <https://github.com/hyperknot/openfreemap/blob/main/README.md>
- OpenFreeMap licences: <https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md>
- OpenFreeMap styles (forks, Dark and Fiord unmodified, Positron layers): <https://github.com/hyperknot/openfreemap-styles>
- Positron licence: <https://github.com/openmaptiles/positron-gl-style/blob/master/LICENSE.md>
- OSMF attribution guideline: <https://osmfoundation.org/wiki/Licence/Attribution_Guidelines>
- npm registry: `npm view <package> version time peerDependencies` for every package above.
- Perron tokens and foundations: `packages/perron/tokens/*.tokens.json`,
  `docs/foundations/data-states.md`, `map.md`, `motion.md`, `accessibility.md`.
- Mylder prototype: `basemap/README.md` and `basemap/page/src.html` (`drawGlyph`, `hitTest`, reduced
  motion handling).
