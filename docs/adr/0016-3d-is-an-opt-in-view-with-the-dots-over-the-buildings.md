# 3D is an opt-in view, with the dots drawn over the buildings

Mylder's map can tilt and turn into a 3D view, with OpenFreeMap's buildings extruded from their OpenStreetMap heights. The map opens flat and north-up as before, and the rider turns 3D on with a control or a gesture. The vehicles, the aircraft, the line paths and the stops are drawn over the buildings, so a bus behind a block shows through it, and the buildings are drawn faint enough that this reads as intended. The vehicles stay in deck.gl's own canvas over the map, as ADR 0003 settled; this amends ADR 0003 only in that the map is no longer always flat and north-up.

## Considered Options

- **Dots hidden behind buildings**, by interleaving deck.gl into MapLibre's render so they share a depth buffer. The map-layer prototype (#14) measured interleaving at about half the frame rate, because the basemap repaints every frame, and with extrusions that repaint gets heavier still. A bus hidden behind a block is also a bus the rider can't see.
- **3D as the default view.** A flat map reads better for "where is my bus", and tilted far streets crowd the dots together, so 3D is the view a rider chooses.
- **Terrain**, draped over a raster elevation source. OpenFreeMap offers none, Copenhagen rises only a few tens of metres, and the overlaid dots are drawn at sea level, so they would drift off raised ground.
- **Tilt without turning.** A tilted map that can't be turned feels broken, and the same offset rework covers both.

## Consequences

- A dot's offset onto its strand is measured on the ground and then projected, rather than in screen pixels east and north, so it holds under tilt and turn and lines up with the strands MapLibre draws on the ground. The aircraft's glyphs turn by the map's heading as well as their track.
- The aircraft stay at their ground position; their altitude stays in their card. At a 45° tilt a jet at 10 km would be drawn about 300 px from the place it is over.
- Dots keep one size near and far, so every glyph stays readable and every tap target stays at 24 px.
- The most tilt is 60°. The address keeps the heading and tilt when the map isn't flat, so a shared link opens in 3D; reset view returns to flat and north-up; Follow and a highlight's fit keep the rider's tilt and heading.
- The scale bar hides while the map is tilted, since one bar can't be true across a tilted view.
- Building heights are approximate, as OpenStreetMap's are, and the About dialog says so.
- The building colours, the 3D toggle and the compass come from Perron (perron#184, #185, #186).
- On a phone, 3D waits for a measured frame rate with the buildings on.
