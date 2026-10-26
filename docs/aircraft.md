# Aircraft

How the planes over Copenhagen get from adsb.lol to the map, beside the transit snapshot and on their own rhythm (ADR 0014). This page covers the plumbing, as [`live-data.md`](live-data.md) does for transit; the words are in [`GLOSSARY.md`](../GLOSSARY.md), and the research behind it is in [`researches/2026-10-26-planes-over-copenhagen.md`](researches/2026-10-26-planes-over-copenhagen.md).

## The shape in one paragraph

Browsers never call adsb.lol. Each browser polls `/api/aircraft`, which answers with one snapshot of every aircraft in the transit box. The CDN keeps that snapshot until the next one is due, 10 s after it was fetched, so a thousand browsers cost one call every 10 s, and nobody watching costs nothing. When a poll misses the CDN, the aircraft source asks adsb.lol once, or adsb.fi when adsb.lol fails or rests, keeps the aircraft it may show, and returns the snapshot. There is no store, lease or budget: each aircraft carries its own position's age, and the feed needs no key.

## The feed

- **Call**: adsb.lol's circle query, `GET https://api.adsb.lol/v2/point/55.75/12.38/25`, 25 nm round 55.75 N, 12.38 E, which covers the transit box. No key.
- **Fallback**: adsb.fi answers the same query at `GET https://opendata.adsb.fi/api/v3/lat/55.75/lon/12.38/dist/25`, its v3 API behind Cloudflare, in the same format, with no key. A call adsb.lol fails, by a timeout, a network error, a status of 400 or more or an answer the schema rejects, goes to adsb.fi at once, and the snapshot names whichever answered. The next call asks adsb.lol again, unless it answered 429 ("Limits").
- **Answer**: readsb's aircraft list (`now`, `ac[]`), decoded with one Effect Schema, `ReadsbAnswer` in `src/tracker/aircraft/answers.ts`, for every source. Its hand-made contract fixture, from the fields readsb documents in `README-json.md`, is in `src/tracker/aircraft/fixtures/`; the real recording (#135) corrects both.
- **Timeout**: 4 s for each feed, so a call adsb.lol times out is answered within 4 s plus adsb.fi's own call. A failed call is not tried again: the next poll asks again 10 s later.

## Limits

Neither host sends CORS headers, which doesn't matter: only the server calls them.

- **adsb.lol** limits each address, by its `x-ratelimit-limit: 4, 4;w=1, 60;w=60, 500;w=86400`: 4 calls a second, 60 a minute and **500 a day**. At one call every 10 s, a day's calls run out after about 83 minutes of someone watching, and the app's functions share cloud addresses with others. Once adsb.lol answers 429, the source stops asking it until its window turns: when its `Retry-After` says, in seconds or as a date, or else at the next midnight UTC. Meanwhile adsb.fi answers every call, and the snapshot names it. The time it rests until is kept in memory by each instance, on Effect's `Clock`, so `TestClock` moves it in the tests; there is no store, and a new instance asks adsb.lol once and learns again.
- **adsb.fi** allows 1 call a second, for personal and non-commercial use with a credit and a link to its home page. One call every 10 s within an instance keeps well under it.
- **Kept and dropped**: an aircraft is kept when it has a position of its own inside the box, 55.45 to 56.05 N and 12.05 to 12.70 E: its current one (`lat`, `lon`, `seen_pos`) or, once readsb has let that go, its `lastPosition`. Dropped: an aircraft placed only by its receiver's rough location (`rr_lat`, `rr_lon`), a ground vehicle's transponder (`type` `adsb_icao_nt`), the surface categories `C1` to `C3`, and an aircraft whose owner asked not to be shown, by the feed's PIA (`dbFlags & 4`) or LADD (`dbFlags & 8`) flag.

## One call every 10 s

`Aircraft.getSnapshot` (`src/tracker/aircraft/aircraft.ts`) serves the latest snapshot while it holds, and otherwise calls the feed. Calls go one at a time within an instance, so the requests that come while one is on its way wait for it and are served the snapshot it made. Two instances may each call once in the same 10 s; the CDN in front of them makes that rare.

A call both feeds fail (each by a timeout, a network error, a status of 400 or more, or an answer the schema rejects) still answers 200: a snapshot with health `error`, the kind of adsb.fi's failure and since when, the last answer's aircraft, named for the provider that gave them, with their ages counted on to now and their states decided again, or none before the first answer. Once the feed has failed for over 60 s, every aircraft is No signal at its last fix. The route answers 503 only when the source can't be built at all.

## The snapshot

Codes and numbers only, in the feed's units, which the browser converts. Its schema is `AircraftSnapshot` in `src/tracker/aircraft/snapshot.ts`; the browser imports its types from `src/tracker/aircraft/index.ts`.

| Field          | What it holds                                                                              |
| -------------- | ------------------------------------------------------------------------------------------ |
| `fetched`      | When the server received the answer, or gave up on it                                      |
| `nextDue`      | `fetched` plus 10 s                                                                        |
| `pollInterval` | 10, in seconds                                                                             |
| `provider`     | `adsb.lol`, `adsb.fi` or `recording`: who answered                                         |
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

The aircraft have their own runtime (`src/tracker/aircraft/runtime.ts`), apart from the tracker's, so a timetable that can't be read never stops the aircraft answering. It is built once per instance, its layers with it, and forgotten when its build fails, such as on a recording that can't be read, so the next request builds it again (`rememberRuntime` in `src/tracker/remember.ts`). Under a recording both runtimes take one clock offset per process (`sharedStartingAt` in `src/tracker/recording/clock.ts`), so they read the same time whichever was built first. The end-to-end tests run the recording server with `recording:weekday` and the simulated one with `off`, so no test calls adsb.lol.

## The browser

- **Poll**: `pollAircraft` (`src/map/aircraft.ts`) polls `/api/aircraft` with the transit snapshot's poll machinery (`src/map/poll.ts`), into its own store, `liveAircraft`, on its own server's clock: at each snapshot's next due plus the page's jitter, only while the page is visible and the Planes filter shows the aircraft. The overlay starts and stops it with the filter: turned off, the poll stops and drops one on its way; turned on, it starts again and asks at once if a poll fell due meanwhile, while the snapshot it holds is drawn straight away. A poll gives up after 12 s, past the server's worst, adsb.lol's 4 s and then adsb.fi's, so a snapshot of both failing still lands. The route may be off: its 404 stops the poll and marks the store `off`, until something on the page needs the aircraft again and starts it: an answer then clears `off`.
- **The Planes filter**: a FilterChip after the mode chips in the top bar, counting the aircraft of the latest snapshot, before filtering. It is kept with the mode filters in the address's `hide=`, as `aircraft` after the modes (`?hide=bus,aircraft`): `MapFilter` in `src/map/view.ts` is a mode or the aircraft, and the view keeps the aircraft apart from the modes, `aircraftHidden` beside `hidden`, so City pulse, the Vehicles list and the other screens that filter by mode never see it. The chip shows once a snapshot has landed, so a server with the aircraft off never names them, or while the address hides them, so they can be turned on again; it leaves out its count while off, since the page no longer asks. With the store `off` it never shows.
- **States by the clock**: each aircraft's data state ages between polls by the same rule the server ran, `aircraftStates` (`src/map/aircraft-states.ts`), ticking on the whole seconds of the aircraft server's own clock, so a Live plane turns Ageing when its position is 20 s old with no poll, and an aircraft leaves the map once its position is 5 min old.
- **Motion**: each aircraft moves from its position along its track at its ground speed (knots to metres a second), for at most one poll interval past its position's time, `fetched` less its `age`, and then stands until the next answer (`src/map/aircraft-motion.ts`). An aircraft on the ground, one with no track or speed, and a No signal one stand at their fix. When an answer lands, a dot drawn under 1 km from its new place glides there in a second, and jumps from farther. The one frame driver (`src/map/frames.ts`) runs the aircraft's frames and the vehicles', one render a frame for both, and stills both under the pause control or the system's reduced motion: they then step to their new places once per answer.
- **Drawing**: the overlay (`src/map/overlay.ts`) composes the kinds it draws, the vehicles and, above them, the aircraft, each a `DrawnKind` (`src/map/picking.ts`) with its layers, the layer whose dots pick and the key of the dot at each index, in one render a frame. Until Perron has the plane glyph (#134), an aircraft is the vehicle dot in a neutral colour, `perron-color-text-secondary`, styled by its data state as a vehicle's is (solid, faint outlined, hollow, grey cut), on the land-coloured halo, with a short tick along its track (`src/map/AircraftGlyphLayer.ts`); on the ground it is the size of a bus's dot. The number drawn is on the map's container as `data-aircraft`, for tests; with the Planes filter off none is drawn, and the attribute is gone, as with the aircraft off on the server.
- **The legend**: while the latest aircraft snapshot's health is `error` and the Planes filter shows the aircraft, the map's legend says since when the feed has given no data, "Planes: no data since 15:42", on Copenhagen's clock: its `lastAnswer`, or its health's `since` before it has ever answered. It goes when an answer lands.
- **Picks**: a pick carries its kind, `trip` or `aircraft`, so a hover over an aircraft opens its own card and a tap on one its own panel, never a trip's. A tap on a dot of either kind wins over a stop under it.
- **The card and the panel** (`docs/screens.md`, "The plane's card"): the hover card is `AircraftCard` (`src/screens/AircraftCard.tsx`), Perron's MapTooltip against the dot, and a tap opens the same text in a DetailPanel, `AircraftPanel`, kept in the address as `?aircraft=<hex>`, one panel at a time with a stop's and a trip's, so it closes as they do. The address's panel kinds are `stop`, `trip` and `aircraft`; only the first two have a route (`RoutedKind` in `src/map/panels.ts`), and an aircraft's panel reads the aircraft snapshot instead. Both read the aircraft's state by the clock (`useAircraftState` in `src/map/aircraft-states.ts`) and say what `src/screens/aircraftLabel.ts` words: the units converted (feet × 0.3048 to the nearest 10 m, knots × 1.852 to the km/h) and the state's label aged from the position's time, `fetched` less its `age`. A panel whose aircraft has left the snapshot, or whose position is old enough to drop, says it is no longer on the map.

## Credits and the banner

Once an aircraft snapshot has landed, the corner credit and the About dialog credit "Aircraft: © adsb.lol contributors under the ODbL" beside the transit and map credits, or "Aircraft: © adsb.fi", linked to adsb.fi's home page as its terms ask, when adsb.fi answered, from one function by provider, `aircraftCredit` in `src/screens/credits.ts`; a recording is credited as adsb.lol's answers, and the About dialog adds that the planes are recorded adsb.lol data, open under the same licence in the repository's `recordings/`, linked. The banner names the provider that answered too. The source banner names the transit's source, then says "Planes: live from adsb.lol." or "Planes: recorded adsb.lol data.". Recorded planes beside Rejseplanen's own transit get a banner of their own. With the aircraft off, none of this shows.

## The demo

The GitHub Pages demo (ADR 0013) has no server, so its worker answers `/api/aircraft` itself (`src/demo/routes.ts`): the aircraft source as the server runs it, on the weekday recording's `aircraft/` folder, which the worker's build bundles into its script, whatever the folder holds (`import.meta.glob` in `src/demo/worker.ts`, read through the recorded layer's `bundledFiles`). The recorded layer replays the answers in call order, one a call every 10 s, as on the server, but starts again from the first once they run out, where the server repeats the last (`whenDone: 'loop'`). Each aircraft's age is its recorded `seen_pos`, counted from the snapshot's fetch on the demo's clock, so every pass is as fresh as the first: no age carries over from one pass to the next, and the states repeat with the answers. The planes jump back once a pass, to where the recording starts. The banner and the About dialog say they are recorded adsb.lol data.

## Recordings

A recording's `aircraft/` folder holds the feeds' answers in call order, adsb.lol's and adsb.fi's alike, replayed at seam 1 (`docs/testing-seams.md`) by `RECORDED_AIRCRAFT`: a call adsb.lol failed is followed by adsb.fi's answer to the same call, so a test writes `0001.json` as `{ "status": 503 }` and `0002.json` as adsb.fi's answer. A failure may carry the headers that came with it, as a 429's `{ "status": 429, "headers": { "retry-after": "120" } }`. A recording's source runs the same fallback and names every answer `recording`. It is never frozen from the simulation: `npm run recordings` keeps it as it is and saves the aircraft source's snapshot of each of its calls in `answers/aircraft/`, which the screen and end-to-end tests read. The `weekday` recording's folder is three minutes of hand-made answers around Kastrup until #135 replaces them with real ones; it is also the demo's.
