# Vehicles are drawn by deck.gl over MapLibre

The basemap is MapLibre with one forked OpenFreeMap Positron style, recoloured from Perron's map tokens into light and dark. The vehicles are a deck.gl `ScatterplotLayer` in its own canvas over the map, fed one typed array of positions computed on the CPU each frame. We chose this over MapLibre's own GeoJSON layers, whose per-frame updates go through a worker and re-tiling so dots step, and over a custom WebGL layer, which would leave picking and precision for us to write. Overlaid rather than interleaved, the basemap stays idle while the vehicles move.

## Consequences

- Glyphs, picking and accessibility (reduced motion, a pause control, a 24 px tap target) are built on deck.gl, and every glyph value comes from Perron's tokens.
- deck.gl adds about 228 KB gzipped on top of MapLibre's 287 KB and its worker.
- The map layer prototype (#14) confirmed it with `MapLibreOverlay` from `@deck.gl/maplibre` 9.4.0 on MapLibre 6.16.0 under Turbopack: computing 1,500 positions and handing them to deck.gl takes under 2 ms a frame even with the CPU throttled 6×, and interleaving roughly halves the frame rate because the basemap repaints every frame.
- The Timetable only dashed ring is `PathStyleExtension` on the `ScatterplotLayer`, whose dash is in full stroke widths in 9.4; the No signal cut is a small fragment-shader injection in a `ScatterplotLayer` subclass, since no stock prop cuts a circle.
