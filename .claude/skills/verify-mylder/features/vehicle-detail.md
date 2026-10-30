# Vehicle detail

A panel for one trip: line badge and destination, its data state with one line of explanation, delay, last seen and next stop, where it is, its next stops, Follow and Show whole line, and a source line. It is kept in the address as `?trip=<key>`.

## Sub-features

- `trip-open` opens from a dot, a Vehicles list row, or a shared link.
- `trip-facts` shows state, delay, last seen, next stop and the next stops.
- `trip-follow` keeps the camera on the dot until the rider pans.
- `trip-line` shows the whole line and raises the highlight chip.
- `trip-close` closes with Esc or the close button and drops `?trip=`.
- `trip-missing` opens a not-found panel for an unknown trip.

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
- **Close.** `page.keyboard.press('Escape')`; the panel is hidden and `?trip=` gone.
- **Missing.** `page.goto('/en?trip=nothing')` opens `getByRole('dialog', { name: 'Trip not found' })`.

## Gotchas

- The Metro runs to an interval: its delay reads "Runs to an interval" and its stops have no times.
- A reload keeps the panel; the list loads again after the reload.
