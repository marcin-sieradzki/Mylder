# Map layer

Runs in the browser only. Every module here starts with `import 'client-only'`, so importing one from a server module fails `next build`.

- `live.ts`, `poll.ts`, `ticking.ts`: a store for each kind of snapshot, its poll, and values read from it at its server's time. The transit snapshot's is `liveSnapshot`; the aircraft's, `liveAircraft` in `aircraft.ts`, polls `/api/aircraft` while the Planes filter shows them, and stops for good at its 404, when the server has the aircraft off (`docs/aircraft.md`).
- `overlay.ts`: deck.gl's canvas over the map, composing the kinds it draws, the vehicles (`vehicles.ts`, `VehicleGlyphLayer.ts`) and above them the aircraft (`AircraftGlyphLayer.ts`, in Perron's glyph from `aircraft-glyphs.ts`), in one render a frame. Each kind is a `DrawnKind` (`picking.ts`): its layers, the layer whose dots pick, and the key of the dot at each index, so a pick carries its kind.
- `frames.ts`: the one frame driver. It owns the animation frames and the stillness (the pause control, the system's reduced motion) for every kind that moves, ticks each kind's movers each frame and renders once. The vehicles move by `loop.ts` and `motion.ts`, the aircraft by `aircraft-loop.ts` and `aircraft-motion.ts`.
- `states.ts`, `aircraft-states.ts`: each trip's and each aircraft's data state now, by the domain's rule run again at its own server's time, ticking through `ticking.ts`.
- `view.ts`, `panels.ts`: what the viewer has made of the map, kept in the address, with one panel open at a time: a stop's departures and a trip's detail, asked for from their routes, or an aircraft's card, read from the aircraft snapshot.
