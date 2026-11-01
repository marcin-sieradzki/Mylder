# The overview sheet

A side sheet (a bottom sheet on a phone) named Overview, with three tabs: City pulse, Vehicles and Disruptions, each tab with its count. City pulse holds the key figures, a meter per mode, the day's profile and the five states with their counts; the Vehicles list has a row per vehicle on the map.

## Sub-features

- `pulse-figures` shows On the move, Reported this minute or Reporting live, the meters and the day's profile.
- `list-rows` has a row for every vehicle the map draws, with line, destination, position and delay.
- `list-search` filters rows by line or destination, and says "No vehicles match." when none do.
- `list-sort` sorts by Line, Destination, Delay or Position.
- `sheet-tabs` keeps the open tab in the address as `?tab=`.
- `overview-timetable` on the timetable source: City pulse counts the vehicles on the move by mode, reads "—" with "No live positions yet; placed from the timetable" where a figure needs live positions, has no average delay and names the timetable as its source; the Vehicles list's rows are all Timetable only, under "Timetable · placed <time>".
- `overview-delays` with SIRI-ET's delays: City pulse gives the average delay of the Estimated vehicles, each at its next call as its panel gives it, and "With delays, by mode", a meter per mode of the share underway with a delay, while Reported this minute and the position meters still say no live positions are connected yet; the Vehicles list's Delay column gives the same delay as the vehicle's panel.

## How to get to it (user POV)

- Open `/en`; the sheet shows City pulse.
- Choose the Vehicles or Disruptions tab.
- Open a shared link with `?tab=vehicles`.
- On a launch on the timetable source (`launch.sh <run-id> <port> timetable`), the same.
- On a launch with SIRI-ET's delays (`launch.sh <run-id> <port> updates:siri-et`), the same.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Pulse.** `page.getByRole('dialog', { name: 'Overview' }).getByRole('group', { name: 'On the move' })` is visible with a number.
- **List.** `sheet.getByRole('tab', { name: /^Vehicles/ }).click()`; the address has `?tab=vehicles`; `sheet.getByRole('table', { name: 'Vehicles' })` has one row per `[data-vehicles]` plus the header (`expect.poll` until equal).
- **Search.** Fill `sheet.getByLabel('Search lines and destinations')` with `5C`; every row shows line 5C. Fill `zzz`; "No vehicles match." shows.
- **Row.** A row's destination link opens vehicle detail (see `vehicle-detail.md`).
- **On the timetable source.** On its own launch (`timetable` as the third argument), `page.goto('/en')`; in `getByRole('dialog', { name: 'Overview' })`'s City pulse: `getByRole('group', { name: 'On the move' })` reads a number and "of N in service", N the count of `/api/snapshot`'s `trips`; `getByRole('region', { name: 'On the move, by mode' })` holds a `dt` per mode on the map (`Bus`, `Metro`, `S-tog`, ...) with its count beside it, each the count on its mode's chip in the top bar and together the On the move figure; `Reported this minute` and `Reporting live` each read "—" and "No live positions yet; placed from the timetable", and every meter but the Metro's has `aria-valuetext` "Unknown", `data-color` "neutral" and that line under it (the Metro's says "No realtime from the Metro; placed from the timetable"); no `Average delay` group; `getByRole('list', { name: 'How sure are we?' })`'s Timetable only item counts N with "No live positions yet; placed from the timetable."; the source line under the figures reads `Timetable · placed HH:MM:SS`, `/api/snapshot`'s `fetched` on the timetable's clock (its time is a `<time>` of its own, so find it with `sheet.locator('time', { hasText: /^placed / })`, not `getByText`); the chart `Vehicles in service today Planned, from today's timetable` is there with its peak; nowhere "paused" or `Rejseplanen ·`. On `?tab=vehicles` the table has N rows, each reading `Timetable only`, no `Delay` column header, and above it `Timetable · placed HH:MM:SS`. On `/da`: "I bevægelse, efter transportform", "Ingen livepositioner endnu; placeret efter køreplanen", the Metro meter's "Ingen realtid fra Metroen; placeret efter køreplanen" (nowhere "placeret ud fra"), `Kun køreplan` and `Køreplan · placeret HH:MM:SS`. With `--phone` the same, each line wrapping inside the sheet with no sideways scroll.
- **With SIRI-ET's delays.** On a launch with `updates:siri-et` as the third argument (its timings are in [`../SKILL.md`](../SKILL.md), Launch, "SIRI-ET's delays"), wait a minute for the table to fill, then `page.goto('/en')`. In City pulse, `getByRole('group', { name: 'Average delay' })` reads a signed minute figure with one decimal and "min, vehicles with a known delay, Metro left out": the mean of `/api/snapshot`'s `delay` over its trips with `"state":"estimated"`, no `cancelled` and a mode other than `metro`, in minutes (`expect.poll`, as a snapshot can land between reads); no `Reporting live` group. `getByRole('region', { name: 'With delays, by mode' })` has a meter per mode on the map, each line `<count>/<total> · <operator>`, total the mode's trips with no `waiting` or `cancelled` and count those of them `estimated` with a `delay`; the Light rail's reads `0/N`, and the Metro's has `aria-valuetext` "Unknown" and "No realtime from the Metro; placed from the timetable". `Reported this minute` and every meter of `getByRole('region', { name: 'Reporting live, by mode' })` but the Metro's still read "—" with "No live positions yet; placed from the timetable". On `?tab=vehicles` the `Delay` column is there, and a row's delay, opened, is the panel's `Delay` fact. On `/da`: `Gennemsnitlig forsinkelse` with a decimal comma, "Med forsinkelser, efter transportform" and "Ingen livepositioner endnu; placeret efter køreplanen". With `--phone` the same, each line wrapping inside the sheet with no sideways scroll.

## Gotchas

- On a phone the sheet starts as a peek; drag or tap its handle before the tabs are in view.
- The rows re-render when a snapshot lands; take counts with `expect.poll`.
- On the timetable source the counts are whatever the deployed timetable plans at the real time: read them from `/api/snapshot` at drive time, never the weekday's 18. A snapshot can land between two reads, so compare them inside `expect.poll` or `toPass()`.
