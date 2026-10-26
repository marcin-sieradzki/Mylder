# Aircraft

How the planes over Copenhagen get from adsb.lol to the map, beside the transit snapshot and on their own rhythm (ADR 0014). This page covers the plumbing, as [`live-data.md`](live-data.md) does for transit; the words are in [`GLOSSARY.md`](../GLOSSARY.md), and the research behind it is in [`researches/2026-10-26-planes-over-copenhagen.md`](researches/2026-10-26-planes-over-copenhagen.md).

## The shape in one paragraph

Browsers never call adsb.lol. Each browser polls `/api/aircraft`, which answers with one snapshot of every aircraft in the transit box. The CDN keeps that snapshot until the next one is due, 10 s after it was fetched, so a thousand browsers cost one call every 10 s, and nobody watching costs nothing. When a poll misses the CDN, the aircraft source asks adsb.lol once, keeps the aircraft it may show, and returns the snapshot. There is no store, lease or budget: each aircraft carries its own position's age, and the feed needs no key.

## The feed

- **Call**: adsb.lol's circle query, `GET https://api.adsb.lol/v2/point/55.75/12.38/25`, 25 nm round 55.75 N, 12.38 E, which covers the transit box. No key. adsb.fi answers the same query at `/api/v3/lat/55.75/lon/12.38/dist/25` in the same format and becomes the fallback in #132.
- **Answer**: readsb's aircraft list (`now`, `ac[]`), decoded with one Effect Schema, `ReadsbAnswer` in `src/tracker/aircraft/answers.ts`, for every source. Its hand-made contract fixture, from the fields readsb documents in `README-json.md`, is in `src/tracker/aircraft/fixtures/`; the real recording (#135) corrects both.
- **Timeout**: 4 s, and a failed call is not tried again: the next poll asks again 10 s later.
- **Kept and dropped**: an aircraft is kept when it has a position of its own inside the box, 55.45 to 56.05 N and 12.05 to 12.70 E: its current one (`lat`, `lon`, `seen_pos`) or, once readsb has let that go, its `lastPosition`. Dropped: an aircraft placed only by its receiver's rough location (`rr_lat`, `rr_lon`), a ground vehicle's transponder (`type` `adsb_icao_nt`), the surface categories `C1` to `C3`, and an aircraft whose owner asked not to be shown, by the feed's PIA (`dbFlags & 4`) or LADD (`dbFlags & 8`) flag.

## One call every 10 s

`Aircraft.getSnapshot` (`src/tracker/aircraft/aircraft.ts`) serves the latest snapshot while it holds, and otherwise calls the feed. Calls go one at a time within an instance, so the requests that come while one is on its way wait for it and are served the snapshot it made. Two instances may each call once in the same 10 s; the CDN in front of them makes that rare.

A failed call (a timeout, a network error, a status of 400 or more, or an answer the schema rejects) still answers 200: a snapshot with health `error`, its kind and since when, the last answer's aircraft with their ages counted on to now and their states decided again, or none before the first answer. Once the feed has failed for over 60 s, every aircraft is No signal at its last fix. The route answers 503 only when the source can't be built at all.

## The snapshot

Codes and numbers only, in the feed's units, which the browser converts. Its schema is `AircraftSnapshot` in `src/tracker/aircraft/snapshot.ts`; the browser imports its types from `src/tracker/aircraft/index.ts`.

| Field          | What it holds                                                                              |
| -------------- | ------------------------------------------------------------------------------------------ |
| `fetched`      | When the server received the answer, or gave up on it                                      |
| `nextDue`      | `fetched` plus 10 s                                                                        |
| `pollInterval` | 10, in seconds                                                                             |
| `provider`     | `adsb.lol`, `adsb.fi` (#132) or `recording`                                                |
| `health`       | `ok` or `error`, since when, and an error's kind: `timeout`, `network`, `status` or `body` |
| `lastAnswer`   | When the feed last answered; absent until it has                                           |
| `aircraft`     | Every aircraft kept, by hex                                                                |

Each aircraft: `hex` (the ICAO address, the key), `callsign`, `type` (the type code), `lat`, `lon`, `altitude` (feet, or `ground`), `speed` (knots), `track` (degrees from north), `age` (seconds since the position at `fetched`, from the feed's `seen_pos`), `source`, how the position was found: `broadcast` (`adsb_icao`, `adsb_other`, `adsr_icao`, `adsr_other`, `adsc`), `multilateration` (`mlat`), `tisb` (`tisb_icao`, `tisb_other`, `tisb_trackfile`) or `other` (`other`, `mode_s`, anything else); and `state`, its data state at `fetched`: `live`, `ageing`, `estimated` or `no-signal`, by the one pure rule the server and the browser share (`aircraftState` in `src/domain/aircraft-state.ts`; `docs/data-states.md`, "Aircraft"). An aircraft whose position is 5 min old is dropped, so a feed that stays down empties the snapshot 5 min after its last answer.

## Caching

The route's answer carries the transit answers' CDN header with the aircraft's policy, `AIRCRAFT_CACHING` in `src/tracker/caching.ts`: held until `nextDue`, never under 5 s, stale for 10 s while a new one is fetched and for 60 s if the app fails, and asked again 10 s after a 503. Its date header is the source's own clock, which a recording sets. Ages count from `fetched`, so a stale answer still shows true ages.

## The switch: `MYLDER_AIRCRAFT_SOURCE`

Read at the first request, as `MYLDER_SOURCE` is, and independent of it, so the planes can be live while transit is simulated (`src/tracker/aircraft/source.ts`).

| Value                | The feed                                                                    | Clock                                                             |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `adsblol`            | adsb.lol over the network. The default.                                     | The runtime's                                                     |
| `recording:<folder>` | The recorded layer, replaying the recording's `aircraft/` folder            | Starts at `clock.json`'s moment, the same offset as the tracker's |
| `off`                | None: the route answers 404, and the page shows no aircraft or word of them |                                                                   |

The aircraft have their own runtime (`src/tracker/aircraft/runtime.ts`), built once per instance and forgotten when its build fails, apart from the tracker's, so a timetable that can't be read never stops the aircraft answering. Under a recording both runtimes take one clock offset per process (`sharedStartingAt` in `src/tracker/recording/clock.ts`), so they read the same time whichever was built first. The end-to-end tests run the recording server with `recording:weekday` and the simulated one with `off`, so no test calls adsb.lol. The demo's worker answers `/api/aircraft` 404 until #133.

## The browser

- **Poll**: `pollAircraft` (`src/map/aircraft.ts`) polls `/api/aircraft` with the transit snapshot's poll machinery (`src/map/poll.ts`), into its own store, `liveAircraft`, on its own server's clock: at each snapshot's next due plus the page's jitter, only while the page is visible. The Planes filter (#131) will start and stop it too. The route may be off: its 404 stops the poll for the page's life and marks the store `off`.
- **States by the clock**: each aircraft's data state ages between polls by the same rule the server ran, `aircraftStates` (`src/map/aircraft-states.ts`), ticking on the whole seconds of the aircraft server's own clock, so a Live plane turns Ageing when its position is 20 s old with no poll, and an aircraft leaves the map once its position is 5 min old.
- **Motion**: each aircraft moves from its position along its track at its ground speed (knots to metres a second), for at most one poll interval past its position's time, `fetched` less its `age`, and then stands until the next answer (`src/map/aircraft-motion.ts`). An aircraft on the ground, one with no track or speed, and a No signal one stand at their fix. When an answer lands, a dot drawn under 1 km from its new place glides there in a second, and jumps from farther. The one frame driver (`src/map/frames.ts`) runs the aircraft's frames and the vehicles', one render a frame for both, and stills both under the pause control or the system's reduced motion: they then step to their new places once per answer.
- **Drawing**: the overlay (`src/map/overlay.ts`) composes the kinds it draws, the vehicles and, above them, the aircraft, each a `DrawnKind` (`src/map/picking.ts`) with its layers, the layer whose dots pick and the key of the dot at each index, in one render a frame. Until Perron has the plane glyph (#134), an aircraft is the vehicle dot in a neutral colour, `perron-color-text-secondary`, styled by its data state as a vehicle's is (solid, faint outlined, hollow, grey cut), on the land-coloured halo, with a short tick along its track (`src/map/AircraftGlyphLayer.ts`); on the ground it is the size of a bus's dot. The number drawn is on the map's container as `data-aircraft`, for tests.
- **Picks**: a pick carries its kind, `trip` or `aircraft`, so a hover over an aircraft opens no vehicle card and a tap on one opens no trip; its own card comes with #130.

## Credits and the banner

Once an aircraft snapshot has landed, the corner credit and the About dialog credit "Aircraft: © adsb.lol contributors under the ODbL" beside the transit and map credits, from one function by provider, `aircraftCredit` in `src/screens/credits.ts`; a recording of adsb.lol's answers is credited the same way. The source banner names the transit's source, then says "Planes: live from adsb.lol." or "Planes: recorded.". Recorded planes beside Rejseplanen's own transit get a banner of their own. With the aircraft off, none of this shows.

## Recordings

A recording's `aircraft/` folder holds the feed's answers in call order, one per 10 s call, replayed at seam 1 (`docs/testing-seams.md`) by `RECORDED_AIRCRAFT`. It is never frozen from the simulation: `npm run recordings` keeps it as it is and saves the aircraft source's snapshot of each of its calls in `answers/aircraft/`, which the screen and end-to-end tests read. The `weekday` recording's folder is three minutes of hand-made answers around Kastrup until #135 replaces them with real ones.
