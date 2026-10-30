# Planes

Aircraft over Copenhagen drawn with the plane glyph, each with its data state, a card on hover and a panel on tap kept as `?aircraft=<hex>`, a Planes chip that takes them off the map, and the aircraft credit.

## Sub-features

- `planes-draw` draws as many planes as the aircraft snapshot holds.
- `planes-card` opens a plane's card in a panel named by its callsign, or its hex without one.
- `planes-filter` takes every plane off with the Planes chip and stops asking for them.
- `planes-credit` credits adsb.lol (or adsb.fi) in the corner and in About.

## How to get to it (user POV)

- Open `/en`; planes appear with the vehicles.
- Tap a plane.
- Choose the Planes chip in the top bar.

## Driving it with drive.ts

Preconditions:

- Baseline; the aircraft recording, one answer every 10 s from launch.

- **Draw.** `expect.poll(() => page.locator('[data-aircraft]').getAttribute('data-aircraft'))` is above 0, and the Planes chip `/^Planes/` shows a count.
- **Card.** Read a plane's `lat` and `lon` from `await (await page.request.get('/api/aircraft')).json()`, open `/en?map=15.00/<lat>/<lon>`, and tap the middle until a dialog named by its callsign or hex is visible; the address has `?aircraft=`.
- **Filter.** `page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Planes/ }).click()`; `[data-aircraft]` reads 0, and a second click brings them back.
- **Credit.** `page.getByRole('link', { name: '© adsb.lol contributors' })` is visible.

## Gotchas

- Planes move fast: read the position and open the page right away, and tap inside `toPass()`.
- Aircraft answers come every 10 s, apart from the transit minute; the banner says "Planes: recorded adsb.lol data."
