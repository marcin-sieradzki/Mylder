# Vehicle detail

A panel for one trip: line badge and destination, its data state with one line of explanation, delay, last seen and next stop, where it is, its next stops, Follow and Show whole line, and a source line. It is kept in the address as `?trip=<key>`.

## Sub-features

- `trip-open` opens from a dot, a Vehicles list row, or a shared link.
- `trip-facts` shows state, delay, last seen, next stop and the next stops.
- `trip-follow` keeps the camera on the dot until the rider pans, at the map's tilt and heading.
- `trip-line` fits the whole line clear of the top bar, the notices and the legend, at the map's tilt and heading, and raises the highlight chip.
- `trip-close` closes with Esc or the close button and drops `?trip=`.
- `trip-missing` opens a not-found panel for an unknown trip.
- `trip-timetable` on the timetable source lists the stops at their planned times with no delay or expected time, and names the timetable as the source: "Timetable · placed 08:14:05".

## How to get to it (user POV)

- Tap a dot on the map.
- Choose a row's destination link in the Vehicles list.
- Open a shared link with `?trip=<key>`.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **From the list.** `page.goto('/en')`, `page.getByRole('dialog', { name: 'Overview' }).getByRole('tab', { name: /^Vehicles/ }).click()`, then the first row's link in `getByRole('table', { name: 'Vehicles' })`. A dialog named `/ to <destination>/` opens and the address has `?trip=`.
- **From a dot.** Centre the map on a trip's `position` from `/api/snapshot` with `?map=15.00/<lat>/<lon>` and tap the middle until the dialog named `/to <headsign>/` is visible.
- **Facts.** The panel shows the mode, the state word, `Delay`, `Last seen`, `Next stop`, and `getByRole('list', { name: 'Stops' })`; its source line ends "times from the timetable" or names a times clock.
- **Follow and line.** `panel.getByRole('button', { name: 'Follow' })`; `panel.getByRole('button', { name: 'Show whole line' })` raises `page.getByRole('button', { name: /^Showing: line .* · Clear$/ })`, whose click takes it down.
- **Follow and line, tilted.** Open `/en?map=14.00/<lat>/<lon>/-30.0/50.0&trip=<key>` on a trip's `position` from `/api/snapshot`. After Follow, hovering the viewport's middle shows the trip's card for seconds while `[data-vehicles]` keeps `data-tilt="50"` and `data-heading="-30"`. After Show whole line, once the address's zoom has dropped, it still ends `/-30.0/50.0`, and the screenshot shows the whole line between the top bar's chip and the legend, clear of the sheet and the panel.
- **Close.** `page.keyboard.press('Escape')`; the panel is hidden and `?trip=` gone.
- **Missing.** `page.goto('/en?trip=nothing')` opens `getByRole('dialog', { name: 'Trip not found' })`.
- **On the timetable source.** On a launch with `timetable` as the third argument, take a bus underway from `/api/snapshot` (`mode` `bus`, no `waiting`), open `/en?map=15.00/<lat>/<lon>` on its `position` and tap the middle inside `toPass()` until `getByRole('dialog', { name: /to <headsign>/ })` opens, the address with `?trip=`. It shows `Timetable only` and "No live positions yet; placed from the timetable.", `Delay` and `Last seen` read `—`, every item of `getByRole('list', { name: 'Stops' })` has a clock time with no `~` before it and no `+N` or `−N` after it, and the source line reads `Timetable · placed <time>`, the snapshot's minute with seconds; nowhere `Rejseplanen`, `position`, `times from the timetable` or `From the timetable`. Follow keeps the camera on the dot as on the recording. A Metro trip's (`mode` `metro`) `Delay` reads `Runs to an interval`, its stops have no times, and its source line is the same. On `/da` the line reads `Køreplan · placeret <time>` and the state "Ingen livepositioner endnu; placeret efter køreplanen." With `--phone` the same, the source line wrapping inside the sheet with no sideways scroll.

## Gotchas

- The Metro runs to an interval: its delay reads "Runs to an interval" and its stops have no times.
- A reload keeps the panel; the list loads again after the reload.
- The timetable source runs at the real time on the deployed timetable, so which trips are underway, and where, is whatever the plan says at that moment: read them from `/api/snapshot` at drive time, never from the recording's keys. Late at night few buses run.
