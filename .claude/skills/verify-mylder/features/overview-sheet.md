# The overview sheet

A side sheet (a bottom sheet on a phone) named Overview, with three tabs: City pulse, Vehicles and Disruptions, each tab with its count. City pulse holds the key figures, a meter per mode, the day's profile and the five states with their counts; the Vehicles list has a row per vehicle on the map.

## Sub-features

- `pulse-figures` shows On the move, Reported this minute or Reporting live, the meters and the day's profile.
- `list-rows` has a row for every vehicle the map draws, with line, destination, position and delay.
- `list-search` filters rows by line or destination, and says "No vehicles match." when none do.
- `list-sort` sorts by Line, Destination, Delay or Position.
- `sheet-tabs` keeps the open tab in the address as `?tab=`.

## How to get to it (user POV)

- Open `/en`; the sheet shows City pulse.
- Choose the Vehicles or Disruptions tab.
- Open a shared link with `?tab=vehicles`.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Pulse.** `page.getByRole('dialog', { name: 'Overview' }).getByRole('group', { name: 'On the move' })` is visible with a number.
- **List.** `sheet.getByRole('tab', { name: /^Vehicles/ }).click()`; the address has `?tab=vehicles`; `sheet.getByRole('table', { name: 'Vehicles' })` has one row per `[data-vehicles]` plus the header (`expect.poll` until equal).
- **Search.** Fill `sheet.getByLabel('Search lines and destinations')` with `5C`; every row shows line 5C. Fill `zzz`; "No vehicles match." shows.
- **Row.** A row's destination link opens vehicle detail (see `vehicle-detail.md`).

## Gotchas

- On a phone the sheet starts as a peek; drag or tap its handle before the tabs are in view.
- The rows re-render when a snapshot lands; take counts with `expect.poll`.
