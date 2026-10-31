# Stop panel

A panel for one stop: its name, its lines as badges, "At the platforms now" with the trips standing at its platforms, and its departures for the next 30 minutes under their own title, each with a countdown and its data state, with Metro rows as intervals, and a source line. It is kept in the address as `?stop=<id>`.

## Sub-features

- `stop-open` opens from a stop on the map, a disruption's ringed stop, or a shared link.
- `stop-list` lists departures with countdowns; the Metro as "every N min".
- `stop-standing` lists the trips standing at the stop's platforms above the departures, each opening its vehicle, or says none stands.
- `stop-language` keeps the panel open across the language switch.
- `stop-missing` opens a not-found panel for an unknown stop.

## How to get to it (user POV)

- Tap a stop's marker on the map.
- Tap a ringed stop after Show on map on a disruption.
- Open a shared link with `?stop=<id>`.

## Driving it with drive.ts

Preconditions:

- Baseline. Østerport St. has no dot within 60 px of it at the opening view; its id and position are in the timetable's stops file (`/api/timetable` names the files, or `recordings/weekday/timetable/`).

- **From the map.** Open `/en?map=15.00/<lat>/<lon>` centred on Østerport St. and tap the middle until `page.getByRole('dialog', { name: 'Østerport St.' })` is visible; the address has `?stop=`.
- **List.** `panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()` is visible, with a line, a destination and a countdown or "Now".
- **Standing.** Within the run's first three minutes, `page.goto('/en?stop=48645')` (Refshaleøen); from five minutes in, `page.goto('/en?stop=54307')` (Orientkaj St.). `panel.getByRole('region', { name: 'At the platforms now' })` holds a row with `991`, `Teglholmen`, a state word, a countdown or "Now" and a time, above `panel.getByRole('region', { name: 'Departures' })`. Its `getByRole('button', { name: 'Bus 991 to Teglholmen' })` opens `getByRole('dialog', { name: /991 to Teglholmen/ })` and the address swaps `?stop=` for `?trip=`.
- **Track.** The recording keeps one departure board, København Syd St.'s, and the RE to Næstved stands there only from 07:22:00 to 07:23:00 on the recording's clock, the run's third minute. Wait until `/api/snapshot`'s `fetched` reaches `2026-06-16T05:22:00Z` (`expect.poll`), then `page.goto('/en?stop=8600783')` (København Syd St.): the source line reads `Rejseplanen` and `departures <time>`, and the standing region holds a row with `RE`, `Næstved St.` and `Track 8`, leaving about 07:23.
- **None standing.** `page.goto('/en?stop=27532')` (Nørreport St.): the region says "No vehicle of the types shown is standing at the platforms now." and holds no list; in Danish the region is `Ved perronerne nu`.
- **Language.** `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the panel stays and its list is named `Afgange`.
- **Missing.** `page.goto('/en?stop=nowhere')` opens `getByRole('dialog', { name: 'Stop not found' })`.

## Gotchas

- A stop marker sits under passing dots at times; tap again inside `toPass()` until the stop's panel, not a vehicle's, opens.
- Every stop but København Syd St. answers from the timetable on the recording, its source line "From the timetable" and its rows without a track; only København Syd St. has a recorded board, which answers it whenever it is opened, so its trains show a track (8, made up by the simulation, one per platform). The 991 standing at Refshaleøen and Orientkaj St. is a bus with no board and shows no track or stand.
- "Show all N" (shown past four standing) can't be driven on any recording: the fixture timetable's twenty trips never put more than one non-Metro trip at one stop's platforms at once, at any minute of the day. `src/screens/StopPanel.test.tsx` covers it with a standing list made by hand.
- A standing trip stands only for minutes: Refshaleøen's bus leaves about 07:24 on the recording's clock, and Orientkaj St.'s stands from 07:25 until 07:32. The Metro is never listed.
