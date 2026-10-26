# Recordings

Rejseplanen answers the tracker replays with `MYLDER_SOURCE=recording:<name>`, one folder each: the answers per service in call order, the `timetable/` they belong to, `clock.json` with the moment they start, `snapshots/` with the tracker's snapshot of each minute, which screen tests use, and `answers/` with the route answers they use beside it: the disruption list of each minute in `answers/disruptions/` and the stop and trip answers a plan saves.

Until the key arrives, every recording is frozen from the simulation by `npm run recordings`, from the plans in `src/tracker/recording/plans.ts`; edit the plans, not the files. `docs/testing-seams.md` describes the format and the hand-made cases.

## Aircraft

A recording may hold the aircraft feed's answers too, replayed with `MYLDER_AIRCRAFT_SOURCE=recording:<name>` (`docs/aircraft.md`): `aircraft/`, one answer per 10 s call in call order, which `npm run recordings` keeps as it is, and `answers/aircraft/`, the aircraft snapshot of each call, which it saves from them. An `aircraft/` folder may hold its own `clock.json` when its answers were recorded on another day than the rest. `weekday/aircraft/` is three minutes of real adsb.lol answers over Copenhagen, recorded on 26 October 2026 from 19:53:13 Copenhagen time, one every 10 s, each cut to the aircraft round the transit box and three outside it, with every other field kept (`docs/aircraft.md`, "Recordings"). The demo bundles whatever `weekday/aircraft/` holds and replays it in a loop (`docs/aircraft.md`, "The demo"). They are adsb.lol's data, © adsb.lol contributors under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), and stay open here under the same licence.
