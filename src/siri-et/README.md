# SIRI-ET

Runs in plain Node, outside Next.js. The SIRI-ET reader (spec #146, ADR 0019), apart from the tracker so that the listener, a plain Node process on Fly.io, and the tracker's recording mode can both run it. Nothing here imports `server-only`, which throws in Node without the `react-server` condition, and nothing here is imported by the browser: `table.ts` uses Effect's `Schema` (ADR 0011).

- `siri.ts` reads one message body's journeys in one pass over its tags.
- `reader.ts` merges each journey's calls across messages and gives the update table at a moment, dropping finished journeys and those of a service day that has ended, and holding to its caps.
- `table.ts` is the update table's versioned schema, the listener's and the tracker's contract.
- `recording.ts` reads a recorded folder's messages and the box's stops from its timetable.

Its tests replay `fixtures/sample.jsonl.gz`, eight journeys of `recordings/siri-et/`, and `fixtures/round-trip.jsonl.gz`, bus 118's round trip, (`docs/testing-seams.md`, "3. The SIRI-ET message stream").
