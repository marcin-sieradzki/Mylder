# SIRI-ET

The SIRI-ET reader (spec #146, ADR 0019), apart from the tracker so that the listener, a plain Node process on Fly.io, and the tracker's recording mode can both run it. Nothing here imports `server-only`, which throws in Node without the `react-server` condition, and nothing here is imported by the browser: `table.ts` uses Effect's `Schema` (ADR 0011), so `.oxlintrc.json` keeps `app/`, `src/i18n/`, `src/map/` and `src/screens/` from importing this folder, in place of `server-only`.

- `siri.ts` reads one message body's journeys in one pass over its tags.
- `reader.ts` merges each journey's calls across messages and gives the update table at a moment, dropping finished journeys and those of a service day that has ended, and holding to its caps.
- `table.ts` is the update table's versioned schema, the listener's and the tracker's contract.
- `box.ts` gives the box's stops from a timetable's manifest and stops file, whether read from a folder or fetched from the app, as the listener's are.
- `recording.ts` reads a recorded folder's messages, all at once or as a clock reaches each, and the box's stops from its timetable.

The listener (`src/listener/`) serves the table to the tracker over HTTPS (ADR 0019, amended); the tracker fetches and decodes it in `src/tracker/updates.ts`.

Its tests replay `fixtures/sample.jsonl.gz`, eight journeys of `recordings/siri-et/`, and `fixtures/round-trip.jsonl.gz`, bus 118's round trip (`docs/testing-seams.md`, "3. The SIRI-ET message stream").
