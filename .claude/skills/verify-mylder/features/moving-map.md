# The moving map

The map of Copenhagen fills the window, every vehicle in the snapshot drawn as a dot in its line's colour and its data state's glyph, moving between polls, with a top bar, a legend, map controls and a corner credit. It opens flat and north-up, and tilts and turns into the 3D view.

## Sub-features

- `map-draw` draws as many dots as the snapshot has trips.
- `map-card` shows a dot's line, destination and state label on hover.
- `map-filter` takes a mode's dots off with its chip, which keeps its count.
- `map-controls` zooms, resets the view and pauses the dots.
- `map-chrome` shows the Updated line, the legend, the source banner and the credit.
- `map-3d` tilts (up to 60°) and turns the map by Shift + the arrows and by a right-drag or Ctrl-drag, hides the scale bar while tilted, keeps every dot drawn, and reset brings it back flat and north-up.

## How to get to it (user POV)

- Open `/en` (or `/da`).
- Hover or tap a dot.
- Choose a mode chip in the top bar (Bus, Metro, S-tog, Train, Planes).
- Use the map controls, or + and − with the map focused.
- With the map focused, Shift + ↑ and ↓ tilt it and Shift + ← and → turn it; on a desktop a right-drag (or Ctrl-drag) tilts and turns it; Centre the map brings it back.

## Driving it with drive.ts

Preconditions:

- Baseline; the first minute's 17 vehicles.

- **Draw.** `page.goto('/en')`. `expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')` within the first minute, and `page.getByRole('region', { name: 'Live map of Copenhagen' })` is visible.
- **Chrome.** `page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)`, `page.getByRole('list', { name: 'Data states' })`, `page.getByRole('toolbar', { name: 'Map controls' })`, `page.getByRole('link', { name: 'Rejseplanen' })` and `page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })` are visible.
- **Filter.** `page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()`. `[data-vehicles]` drops by the bus count and the chip still shows its count; click again to bring them back.
- **Card.** Pause with `page.getByRole('button', { name: 'Pause' })`, read a trip's `position` from `await (await page.request.get('/api/snapshot')).json()`, open `/en?map=15.00/<lat>/<lon>`, and hover the viewport's middle until `page.getByRole('tooltip')` shows the line, the destination and a state label such as "Estimated from schedule".
- **Controls.** `page.getByRole('button', { name: 'Zoom in' }).click()`; the scale bar (`page.getByText(/\d+\s(m|km)$/)`) shows a shorter distance.
- **Tilt and turn by keys.** `page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()`, then `page.keyboard.press('Shift+ArrowUp')` three times and `'Shift+ArrowRight'` twice. The screenshot shows the map tilted and turned, the scale bar (`page.locator('.pn-ScaleBar')`) is hidden, and `[data-vehicles]` still equals the trips that aren't cancelled in `/api/snapshot`. `page.getByRole('button', { name: 'Centre the map' }).click()` brings it back flat and north-up, and the scale bar shows again.
- **Tilt by a right-drag.** On the canvas's middle, `page.mouse.down({ button: 'right' })`, `page.mouse.move(x, y - 60, { steps: 10 })`, `page.mouse.up({ button: 'right' })`: the map tilts and the scale bar hides. A sideways right-drag turns it; `page.keyboard.down('Control')` with a left-drag does the same. Shift + ↓ until the scale bar shows brings it flat.
- **Tilted, a dot on its line and a tap.** Open `/en?map=15.00/<lat>/<lon>` on a bus's `position` (`[lat, lon]` in `/api/snapshot`), pause, then tilt and turn by keys (four Shift + ↑, three Shift + ←): the map tilts and turns about its centre, and the dot sits on its line in the screenshot. It has moved on from its snapshot position, so hover points within 40 px of the viewport's middle, nearest first, until `page.getByRole('tooltip')` shows its line and state; a click there opens its panel with `?trip=` in the address.

## Gotchas

- Dots move between frames; pause first or retry the hover inside `expect(...).toPass()`.
- After a minute the next snapshot lands and counts can change; assert counts in the first minute or against `/api/snapshot` fetched at the same moment.
- The recording has no Live trips in some minutes (its position mode alternates); a journey that needs a Live dot reports which minute it looked in.
- The address doesn't carry the tilt or heading yet, so a reload opens flat and north-up.
- Each Shift + arrow press is 10° of tilt or 15° of turn, easing for 300 ms. Presses during an ease add up, but run at most two steps ahead of the map, so on a slow machine wait about 400 ms between presses. Under `breakpoint.phone`, two fingers don't tilt or turn the map; the keys and a mouse still do.
