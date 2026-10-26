# Map layer

Runs in the browser only. Every module here starts with `import 'client-only'`, so importing one from a server module fails `next build`.

- `live.ts`, `poll.ts`, `ticking.ts`: a store for each kind of snapshot, its poll, and values read from it at its server's time. The transit snapshot's is `liveSnapshot`; the aircraft's, `liveAircraft` in `aircraft.ts`, polls `/api/aircraft` and stops for good at its 404, when the server has the aircraft off (`docs/aircraft.md`).
- `overlay.ts`: deck.gl's canvas over the map, composing the kinds it draws, the vehicles (`vehicles.ts`, `VehicleGlyphLayer.ts`) and above them the aircraft (`AircraftGlyphLayer.ts`), in one render a frame. Each kind is a `DrawnKind` (`picking.ts`): its layers, the layer whose dots pick, and the key of the dot at each index, so a pick carries its kind.
