# The overview sheet

A side sheet (a bottom sheet on a phone) named Overview, with three tabs: City pulse, Vehicles and Disruptions, each tab with its count. City pulse holds the key figures, a meter per mode, the day's profile and the five states with their counts; the Vehicles list has a row per vehicle on the map.

## Sub-features

- `pulse-figures` shows On the move, Reported this minute or Reporting live, the meters and the day's profile.
- `list-rows` has a row for every vehicle the map draws, with line, destination, position and delay.
- `list-search` filters rows by line or destination, and says "No vehicles match." when none do.
- `list-sort` sorts by Line, Destination, Delay or Position.
- `sheet-tabs` keeps the open tab in the address as `?tab=`.
- `overview-timetable` on the timetable source: City pulse counts the vehicles by mode, reads "—" with "No live positions yet; placed from the timetable" where a figure needs live positions, has no average delay and names the timetable as its source; the Vehicles list's rows are all Timetable only, under "Timetable · placed <time>".

## How to get to it (user POV)

- Open `/en`; the sheet shows City pulse.
- Choose the Vehicles or Disruptions tab.
- Open a shared link with `?tab=vehicles`.
- On a launch on the timetable source (`launch.sh <run-id> <port> timetable`), the same.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Pulse.** `page.getByRole('dialog', { name: 'Overview' }).getByRole('group', { name: 'On the move' })` is visible with a number.
- **List.** `sheet.getByRole('tab', { name: /^Vehicles/ }).click()`; the address has `?tab=vehicles`; `sheet.getByRole('table', { name: 'Vehicles' })` has one row per `[data-vehicles]` plus the header (`expect.poll` until equal).
- **Search.** Fill `sheet.getByLabel('Search lines and destinations')` with `5C`; every row shows line 5C. Fill `zzz`; "No vehicles match." shows.
- **Row.** A row's destination link opens vehicle detail (see `vehicle-detail.md`).
- **On the timetable source.** On its own launch (`timetable` as the third argument), `page.goto('/en')`; in `getByRole('dialog', { name: 'Overview' })`'s City pulse: `getByRole('group', { name: 'On the move' })` reads a number and "of N in service", N the count of `/api/snapshot`'s `trips`; `getByRole('region', { name: 'On the map, by mode' })` holds a `dt` per mode on the map (`Bus`, `S-tog`, `Metro`, ...) with its count beside it, together N; `Reported this minute` and `Reporting live` each read "—" and "No live positions yet; placed from the timetable", and every meter but the Metro's has `aria-valuetext` "Unknown", `data-color` "neutral" and that line under it (the Metro's says "No realtime from the Metro; placed from the timetable"); no `Average delay` group; `getByRole('list', { name: 'How sure are we?' })`'s Timetable only item counts N with "No live positions yet; placed from the timetable."; the source line under the figures reads `Timetable · placed HH:MM:SS`, `/api/snapshot`'s `fetched` on the timetable's clock; the chart `Vehicles in service today Planned, from today's timetable` is there with its peak; nowhere "paused" or `Rejseplanen ·`. On `?tab=vehicles` the table has N rows, each reading `Timetable only`, no `Delay` column header, and above it `Timetable · placed HH:MM:SS`. On `/da`: "På kortet, efter transportform", "Ingen livepositioner endnu; placeret efter køreplanen", `Kun køreplan` and `Køreplan · placeret HH:MM:SS`. With `--phone` the same, each line wrapping inside the sheet with no sideways scroll.

## Gotchas

- On a phone the sheet starts as a peek; drag or tap its handle before the tabs are in view.
- The rows re-render when a snapshot lands; take counts with `expect.poll`.
- On the timetable source the counts are whatever the deployed timetable plans at the real time: read them from `/api/snapshot` at drive time, never the weekday's 18. A snapshot can land between two reads, so compare them inside `expect.poll` or `toPass()`.
