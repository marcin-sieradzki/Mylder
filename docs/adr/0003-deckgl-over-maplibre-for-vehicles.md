# Vehicles are drawn by deck.gl over MapLibre

The basemap is MapLibre with one forked OpenFreeMap Positron style, recoloured from Perron's map tokens into light and dark. The vehicles are a deck.gl `ScatterplotLayer` in its own canvas over the map, fed one typed array of positions computed on the CPU each frame. We chose this over MapLibre's own GeoJSON layers, whose per-frame updates go through a worker and re-tiling so dots step, and over a custom WebGL layer, which would leave picking and precision for us to write. Overlaid rather than interleaved, the basemap stays idle while the vehicles move.

## Consequences

- Glyphs, picking and accessibility (reduced motion, a pause control, a 24 px tap target) are built on deck.gl, and every glyph value comes from Perron's tokens.
- deck.gl adds about 228 KB gzipped on top of MapLibre's 287 KB and its worker.
