# Stop departures

A panel for one stop: its name, its lines as badges, and its departures for the next 30 minutes, each with a countdown and its data state, with Metro rows as intervals, and a source line. It is kept in the address as `?stop=<id>`.

## Sub-features

- `stop-open` opens from a stop on the map, a disruption's ringed stop, or a shared link.
- `stop-list` lists departures with countdowns; the Metro as "every N min".
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
- **Language.** `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the panel stays and its list is named `Afgange`.
- **Missing.** `page.goto('/en?stop=nowhere')` opens `getByRole('dialog', { name: 'Stop not found' })`.

## Gotchas

- A stop marker sits under passing dots at times; tap again inside `toPass()` until the stop's panel, not a vehicle's, opens.
- Departures come from the recording's stop answers or the timetable; the source line says which.
