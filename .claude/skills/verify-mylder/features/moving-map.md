# The moving map

The map of Copenhagen fills the window, every vehicle in the snapshot drawn as a dot in its line's colour and its data state's glyph, moving between polls, with a top bar, a legend, map controls and a corner credit.

## Sub-features

- `map-draw` draws as many dots as the snapshot has trips.
- `map-card` shows a dot's line, destination and state label on hover.
- `map-filter` takes a mode's dots off with its chip, which keeps its count.
- `map-controls` zooms, resets the view and pauses the dots.
- `map-chrome` shows the Updated line, the legend, the source banner and the credit.

## How to get to it (user POV)

- Open `/en` (or `/da`).
- Hover or tap a dot.
- Choose a mode chip in the top bar (Bus, Metro, S-tog, Train, Planes).
- Use the map controls, or + and − with the map focused.

## Driving it with drive.ts

Preconditions:

- Baseline; the first minute's 17 vehicles.

- **Draw.** `page.goto('/en')`. `expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')` within the first minute, and `page.getByRole('region', { name: 'Live map of Copenhagen' })` is visible.
- **Chrome.** `page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)`, `page.getByRole('list', { name: 'Data states' })`, `page.getByRole('toolbar', { name: 'Map controls' })`, `page.getByRole('link', { name: 'Rejseplanen' })` and `page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })` are visible.
- **Filter.** `page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()`. `[data-vehicles]` drops by the bus count and the chip still shows its count; click again to bring them back.
- **Card.** Pause with `page.getByRole('button', { name: 'Pause' })`, read a trip's `position` from `await (await page.request.get('/api/snapshot')).json()`, open `/en?map=15.00/<lat>/<lon>`, and hover the viewport's middle until `page.getByRole('tooltip')` shows the line, the destination and a state label such as "Estimated from schedule".
- **Controls.** `page.getByRole('button', { name: 'Zoom in' }).click()`; the scale bar (`page.getByText(/\d+\s(m|km)$/)`) shows a shorter distance.

## Gotchas

- Dots move between frames; pause first or retry the hover inside `expect(...).toPass()`.
- After a minute the next snapshot lands and counts can change; assert counts in the first minute or against `/api/snapshot` fetched at the same moment.
- The recording has no Live trips in some minutes (its position mode alternates); a journey that needs a Live dot reports which minute it looked in.
