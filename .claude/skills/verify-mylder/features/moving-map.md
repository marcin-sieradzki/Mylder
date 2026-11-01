# The moving map

The map of Copenhagen fills the window, every vehicle in the snapshot drawn as a dot in its line's colour and its data state's glyph, moving between polls, with a top bar, a legend, map controls and a corner credit. It opens flat and north-up, and tilts and turns into the 3D view.

## Sub-features

- `map-draw` draws as many dots as the snapshot has trips.
- `map-card` shows a dot's line, destination and state label on hover.
- `map-filter` takes a mode's dots off with its chip, which keeps its count.
- `map-controls` zooms, resets the view and pauses the dots.
- `map-chrome` shows the Updated line, the legend, the source banner and the credit.
- `map-timetable` on the timetable source: the banner says every vehicle is placed from its timetable, the legend says every vehicle is Timetable only for now, and no Paused notice shows.
- `map-3d` tilts (up to 60°) and turns the map by Shift + the arrows and, wider than a phone, by a right-drag or Ctrl-drag and the 3D toggle, hides the scale bar while tilted, keeps every dot drawn, raises the buildings from zoom 14, see-through, in Perron's building colour under the lines, stops and dots, the compass turns it back to north, and reset brings it back flat and north-up. The address keeps the angle as `map=zoom/lat/lon/bearing/pitch` while the map isn't flat and north-up, so a link or a reload opens at it, on a phone too.

## How to get to it (user POV)

- Open `/en` (or `/da`).
- Open it on a launch on the timetable source (`launch.sh <run-id> <port> timetable`).
- Hover or tap a dot.
- Choose a mode chip in the top bar (Bus, Metro, S-tog, Train, Planes).
- Use the map controls, or + and − with the map focused.
- With the map focused, Shift + ↑ and ↓ tilt it and Shift + ← and → turn it; on a desktop a right-drag (or Ctrl-drag) tilts and turns it, the 3D view toggle in the map controls tilts it and lays it flat, and Reset to north (the compass) turns it back to north; Centre the map brings it back.
- Open a link with a heading and tilt, such as `/en?map=14.00/55.67600/12.56800/-30.0/50.0`, or reload a tilted map.

## Driving it with drive.ts

Preconditions:

- Baseline; the first minute's 17 vehicles.

- **Draw.** `page.goto('/en')`. `expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')` within the first minute, and `page.getByRole('region', { name: 'Live map of Copenhagen' })` is visible.
- **Chrome.** `page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)`, `page.getByRole('list', { name: 'Data states' })`, `page.getByRole('toolbar', { name: 'Map controls' })`, `page.getByRole('link', { name: 'Rejseplanen' })` and `page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })` are visible.
- **On the timetable source.** On its own launch (`timetable` as the third argument), `page.goto('/en')`: `[data-vehicles]` above 0, and the only `page.getByRole('status')` outside a dialog reads "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be.", followed by "Planes: live from adsb.lol." (or adsb.fi) once the planes have answered; no "paused" or "hasn't answered" anywhere, and the Updated line reads `Updated HH:MM:SS` with `/api/snapshot`'s `fetched` time. The legend (`page.getByRole('list', { name: 'Data states' })`'s surface) ends with "Every vehicle is Timetable only for now: live positions aren't connected yet." At `/da` the banner reads "Kun køreplan: der er endnu ingen livepositioner, så hvert køretøj er placeret, hvor køreplanen siger, det skal være." and the legend line "Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.". With `--phone` the banner wraps inside the viewport, no wider than the simulated source's, with no horizontal scroll.
- **Filter.** `page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()`. `[data-vehicles]` drops by the bus count and the chip still shows its count; click again to bring them back.
- **Card.** Pause with `page.getByRole('button', { name: 'Pause' })`, read a trip's `position` from `await (await page.request.get('/api/snapshot')).json()`, open `/en?map=15.00/<lat>/<lon>`, and hover the viewport's middle until `page.getByRole('tooltip')` shows the line, the destination and a state label such as "Estimated from schedule".
- **Controls.** `page.getByRole('button', { name: 'Zoom in' }).click()`; the scale bar (`page.getByText(/\d+\s(m|km)$/)`) shows a shorter distance.
- **Tilt and turn by keys.** `page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()`, then `page.keyboard.press('Shift+ArrowUp')` three times and `'Shift+ArrowRight'` twice. The screenshot shows the map tilted and turned, the scale bar (`page.getByText(/\d+\s(m|km)$/)`) is hidden, `[data-vehicles]` has `data-tilt="30"` and `data-heading="30"`, and it still equals the trips that aren't cancelled in `/api/snapshot`. `page.getByRole('button', { name: 'Centre the map' }).click()` brings it back flat and north-up, and the scale bar shows again. Holding Shift + → for 3 s (see Gotchas) leaves `data-heading` well past 60 once it comes to rest.
- **3D toggle and compass.** `page.getByRole('button', { name: '3D view' }).click()`: it shows `aria-pressed="true"`, the scale bar hides and `[data-vehicles]` has `data-tilt="50"`, the screenshot showing the map tilted. Focus the map and press `Shift+ArrowRight`: `data-heading="15"`, and `page.getByRole('button', { name: 'Reset to north' })` has the description "Map turned away from north" and its needle turned. Click it: `data-heading="0"`, the tilt stays 50 and the description goes. Click the toggle again: it eases flat, `aria-pressed="false"`, and the scale bar shows. A right-drag or Shift + ↑ also shows the toggle pressed. In Danish they are "3D-visning" and "Drej mod nord". Both sit between Centre the map and Pause in the controls' arrow-key order. At `--phone` size neither shows.
- **Turn and tilt by a right-drag.** On the canvas's middle, `page.mouse.down({ button: 'right' })`, `page.mouse.move(x + 150, y, { steps: 10 })`, `page.mouse.up({ button: 'right' })`: the map turns, `[data-vehicles]`'s `data-heading` leaves `0` while `data-tilt` stays `0`, and the scale bar stays. The same drag to `(x, y - 60)` tilts it: `data-tilt` leaves `0`, the heading stays, and the scale bar hides. `page.keyboard.down('Control')` with a left-drag does the same. Shift + ↓ until the scale bar shows brings it flat. At `--phone` size neither drag tilts or turns the map.
- **Tilted, a dot on its line and a tap.** Open `/en?map=15.00/<lat>/<lon>` on a bus's `position` (`[lat, lon]` in `/api/snapshot`), pause, then tilt and turn by keys (four Shift + ↑, three Shift + ←): the map tilts and turns about its centre, and the dot sits on its line in the screenshot. It has moved on from its snapshot position, so hover points within 40 px of the viewport's middle, nearest first, until `page.getByRole('tooltip')` shows its line and state; a click there opens its panel with `?trip=` in the address.
- **Buildings.** Open `/en?map=16.00/55.68100/12.57000/-20.0/60.0` once under `page.emulateMedia({ colorScheme: 'light' })` and once under `'dark'`, wait for `data-tilt="60"` and a few seconds for the tiles: the screenshot shows the blocks standing in one pale grey-green (light, `#D3D9D4`) or slate (dark, `#2A3338`), their walls darker than their roofs, the streets reading between them, and the line paths, stops, place names and dots drawn over them. At `/en?map=13.50/55.68100/12.57000/-20.0/60.0` they lie flat as footprints.
- **A tilted link and a reload.** Open `/en?map=14.00/55.67600/12.56800/-30.0/50.0`, once at the default size and once at `--phone` size: `[data-vehicles]` has `data-tilt="50"` and `data-heading="-30"`, the scale bar is hidden, the screenshot shows the map tilted and turned, and `data-vehicles` equals the trips that aren't cancelled in `/api/snapshot`. Then open `/en?map=13.00/55.67600/12.56800`, focus the map, and tilt and turn it by quick key presses (three Shift + ↑, three Shift + →): once `data-tilt="30"` and `data-heading="45"`, the address ends `map=13.00/55.67600/12.56800/45.0/30.0`, and `page.reload()` opens at the same `data-tilt` and `data-heading`. Centre the map brings the address back to three parts. `/en?map=14.00/55.67600/12.56800/-30.0/75.0`, a tilt out of range, opens the map at `data-heading="-30"`, flat, with every dot drawn.

## Gotchas

- Dots move between frames; pause first or retry the hover inside `expect(...).toPass()`.
- On the timetable source the counts and lines are the deployed timetable's plan at the real time, so assert against `/api/snapshot`, not the weekday's 17; the Disruptions screen and the panels' words there are other tickets' (#196, #197).
- After a minute the next snapshot lands and counts can change; assert counts in the first minute or against `/api/snapshot` fetched at the same moment.
- The recording has no Live trips in some minutes (its position mode alternates); a journey that needs a Live dot reports which minute it looked in.
- The address takes the heading and tilt, to the tenth of a degree, only once the map comes to rest, and drops either when out of range (heading -180 to 180, tilt 0 to 60). `data-tilt` and `data-heading` are written when the map comes to rest, so wait for them after a move.
- Each Shift + arrow press is 10° of tilt or 15° of turn, easing for 300 ms. Quick presses during an ease all count, however slowly the map draws, so three `page.keyboard.press` calls in a row tilt it 30°. A held key keeps turning or tilting the map at a steady pace, some 30° to 45° a second even on a slow software renderer, at most two steps ahead of it, and stops within two steps of the release; hold it as a keyboard does with CDP `Input.dispatchKeyEvent` `rawKeyDown` and `autoRepeat: true` every 33 ms, sent without awaiting each, as `e2e/tilt-and-turn.spec.ts` does; quick presses never take the turn more than 165° ahead. Under `breakpoint.phone`, neither a right-drag, a Ctrl-drag nor two fingers tilts or turns the map; the Shift + arrow keys still do.
