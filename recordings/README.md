# Recordings

Rejseplanen answers the tracker replays with `MYLDER_SOURCE=recording:<name>`, one folder each: the answers per service in call order, the `timetable/` they belong to, `clock.json` with the moment they start, `snapshots/` with the tracker's snapshot of each minute, which screen tests use, and `answers/` with the route answers they use beside it: the disruption list of each minute in `answers/disruptions/` and the stop and trip answers a plan saves.

Until the key arrives, every recording is frozen from the simulation by `npm run recordings`, from the plans in `src/tracker/recording/plans.ts`; edit the plans, not the files. `docs/testing-seams.md` describes the format and the hand-made cases.

## Aircraft

A recording may hold the aircraft feed's answers too, replayed with `MYLDER_AIRCRAFT_SOURCE=recording:<name>` (`docs/aircraft.md`): `aircraft/`, one answer per 10 s call in call order, which `npm run recordings` keeps as it is, and `answers/aircraft/`, the aircraft snapshot of each call, which it saves from them. `weekday/aircraft/` is three minutes of hand-made answers round Kastrup, shaped as adsb.lol's from the fields readsb documents, with an aircraft outside the box, PIA- and LADD-flagged ones, ground vehicles and one placed only by its receiver's location, so every rule that drops one shows; #135 replaces them with real answers. Real answers are adsb.lol's data, © adsb.lol contributors under the [ODbL](https://opendatacommons.org/licenses/odbl/), and a recording of them stays open here under the same licence.
