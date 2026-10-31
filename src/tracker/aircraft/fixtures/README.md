# Contract fixtures

A hand-written answer to adsb.lol's circle query, `/v2/point/<lat>/<lon>/<radius>`, from the fields readsb documents in its `README-json.md` and adsb.lol's API answers in, not copied from a real answer. `answers.test.ts` decodes it with the schema, so a schema change that breaks a known answer fails. It is corrected from the real recording (#135).

- `point.json`: eight aircraft: an airliner on approach broadcasting its own position, one placed by multilateration, a TIS-B target with a non-ICAO hex (`~`), one taxiing (`"ground"`), one with only an old `lastPosition`, one with only a receiver's rough position (`rr_lat`, `rr_lon`), one more broadcasting with `dbFlags` 0, and an airport vehicle (`adsb_icao_nt`, category `C2`). The answer's `now` is in milliseconds, as the APIs give it; readsb's own files give seconds.

The data in them is made up; the hexes and callsigns are shaped like real ones.
