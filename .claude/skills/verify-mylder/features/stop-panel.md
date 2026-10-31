# Stop panel

A panel for one stop: its name, its lines as badges, "At the platforms now" with the trips standing at its platforms (on a phone, a row of cards that scrolls sideways), and below them two tabs, Departures and Arrivals, each listing the next 30 minutes with a countdown and its data state, Metro rows as intervals, its messages and a source line. It is kept in the address as `?stop=<id>`, and its Arrivals tab as `&board=arrivals`.

## Sub-features

- `stop-open` opens from a stop on the map, a disruption's ringed stop, or a shared link.
- `stop-list` lists departures with countdowns; the Metro as "every N min".
- `stop-standing` lists the trips standing at the stop's platforms above the departures, each opening its vehicle, or says none stands.
- `stop-standing-phone` shows the same trips on a phone as one row of cards that scrolls sideways above the tabs, every one of them with no "Show all".
- `stop-arrivals` switches to the Arrivals tab, which lists the trips arriving, each from where it comes, the Metro as an interval, or says none arrives; the address keeps the tab.
- `stop-language` keeps the panel open across the language switch.
- `stop-missing` opens a not-found panel for an unknown stop.

## How to get to it (user POV)

- Tap a stop's marker on the map. On a phone, close the Overview first (its `Close` button at the peek): a stop's sheet opens under the Overview's until #175 is fixed, link or tap alike.
- Tap a ringed stop after Show on map on a disruption.
- Open a shared link with `?stop=<id>`, or `?stop=<id>&board=arrivals` for its Arrivals.
- Choose the Arrivals tab in an open stop's panel, by a tap or the arrow keys and Enter.

## Driving it with drive.ts

Preconditions:

- Baseline. Østerport St. has no dot within 60 px of it at the opening view; its id and position are in the timetable's stops file (`/api/timetable` names the files, or `recordings/weekday/timetable/`).

- **From the map.** Open `/en?map=15.00/<lat>/<lon>` centred on Østerport St. and tap the middle until `page.getByRole('dialog', { name: 'Østerport St.' })` is visible; the address has `?stop=`.
- **List.** `panel.getByRole('tablist', { name: 'Departures and arrivals' })` has `Departures` selected (`aria-selected="true"`), and `panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()` is visible, with a line, a destination and a countdown or "Now".
- **Standing.** Within the run's first three minutes, `page.goto('/en?stop=48645')` (Refshaleøen); from five minutes in, `page.goto('/en?stop=54307')` (Orientkaj St.). `panel.getByRole('region', { name: 'At the platforms now' })` holds a row with `991`, `Teglholmen`, a state word, a countdown or "Now" and a time, above `panel.getByRole('tablist', { name: 'Departures and arrivals' })`. Its `getByRole('button', { name: 'Bus 991 to Teglholmen' })` opens `getByRole('dialog', { name: /991 to Teglholmen/ })` and the address swaps `?stop=` for `?trip=`.
- **Track.** The recording keeps one departure board, København Syd St.'s, and the RE to Næstved stands there only from 07:22:00 to 07:23:00 on the recording's clock, the run's third minute. Wait until `/api/snapshot`'s `fetched` reaches `2026-06-16T05:22:00Z` (`expect.poll`), then `page.goto('/en?stop=8600783')` (København Syd St.): the source line reads `Rejseplanen` and `departures <time>`, and the standing region holds a row with `RE`, `Næstved St.` and `Track 8`, leaving about 07:23.
- **Standing on a phone.** Run with `--phone`. Within the run's first three minutes, open `/en?hide=bus&map=17.00/55.69105/12.60675` (Refshaleøen, buses hidden: the 991's dot sits on the stop's marker, and a tap on a dot opens the vehicle). Click `page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' })`, then tap the middle of the viewport inside `toPass()` until `getByRole('dialog', { name: 'Refshaleøen' })` is visible, its `data-anchor` `bottom`; its standing region says "No vehicle of the types shown is standing at the platforms now.", since the buses are hidden. Click `getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })`: the region's `getByRole('list', { name: 'At the platforms now' })` has `overflow-x: auto` and holds one card with `991`, `Teglholmen`, `Estimated`, a countdown and `~07:23`, narrower than the list, above the `Departures and arrivals` tablist, all at the sheet's peek. Its `Bus 991 to Teglholmen` button opens the vehicle and the address swaps `?stop=` for `?trip=`. For a train with a track, wait until `fetched` reaches `2026-06-16T05:22:00Z`, open `/en?map=17.00/55.65263/12.51685` (København Syd St.; the RE to Næstved stands 33 m off the marker, about 50 px at zoom 17, so no filter is needed), close the Overview and tap the middle: the row holds `RE`, `Næstved St.` and `Track 8` until 07:23.
- **None standing.** `page.goto('/en?stop=27532')` (Nørreport St.): the region says "No vehicle of the types shown is standing at the platforms now." and holds no list; in Danish the region is `Ved perronerne nu`.
- **Arrivals.** Collect the routes asked (`page.on('request', (r) => urls.push(r.url()))`), then `page.goto('/en?stop=27532')` (Nørreport St.): no URL ends in `/arrivals`. `panel.getByRole('tab', { name: 'Arrivals' }).click()`: the address reads `?stop=27532&board=arrivals`, one `/api/stops/27532/arrivals` is asked, and `panel.getByRole('tabpanel', { name: 'Arrivals' })` holds `getByRole('list', { name: 'Arrivals' })`. From 07:21 to 07:28 on the recording's clock its first row is `E`, `From Holte St.`, `Live`, a countdown, `+2` or `+1`, `07:27` struck and `07:29` or `07:28` (Estimated in the run's first minute); until about 07:36 rows read `From Sundbyvester Plads` and `From Herlev Hospital, Sløjfen`, `Estimated`, a time after `~`. Under the list: the note, `From the timetable` and `Timetable and positions <time>`. `panel.getByRole('tab', { name: 'Departures' }).click()` drops `board` from the address and shows the `Departures` list again.
- **Arrivals by link and keys.** `page.goto('/en?stop=48645&board=arrivals')` (Refshaleøen) opens on Arrivals: until 07:26 a row `991`, `From Orientkaj St.`, `Timetable only`, `07:47` and `—`, its button named `Bus 991 from Orientkaj St.` (the 991 from 07:00 standing above under "At the platforms now" until 07:23); from 07:27, once that trip is on the map, the same row `Live`, `07:47` struck, `07:49` and `+2`. Focus the `Arrivals` tab, press `ArrowLeft`: focus moves to `Departures`; `Enter` selects it and the address drops `board`.
- **Arrivals of the Metro.** Until 07:26, `page.goto('/en?stop=8603313&board=arrivals')` (Bella Center St.); until 07:30, `page.goto('/en?stop=8603317&board=arrivals')` (Vestamager St.): a row `M1`, `From Vanløse St.`, `Every 4 min` and `Metro: planned times`, with no clock time.
- **No arrivals.** `page.goto('/en?stop=8600683&board=arrivals')` (Hillerød St.): the Arrivals panel says "No arrivals in the next 30 minutes for the vehicle types shown." and its source line `Timetable and positions <time>`.
- **Language.** `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the panel stays and its list is named `Afgange`; on `/da?stop=27532&board=arrivals` the tabs read `Afgange` and `Ankomster`, the list is named `Ankomster` and its rows read `Fra Holte St.`; Hillerød St.'s says "Ingen ankomster de næste 30 minutter for de viste transportformer."
- **Missing.** `page.goto('/en?stop=nowhere')` opens `getByRole('dialog', { name: 'Stop not found' })`.

## Gotchas

- A stop marker sits under passing dots at times; tap again inside `toPass()` until the stop's panel, not a vehicle's, opens.
- Every stop but København Syd St. answers from the timetable on the recording, its source line "From the timetable" and its rows without a track; only København Syd St. has a recorded board, which answers it whenever it is opened, so its trains show a track (8, made up by the simulation, one per platform). The 991 standing at Refshaleøen and Orientkaj St. is a bus with no board and shows no track or stand.
- A standing trip's dot sits on its stop's marker, or within a tap of it at zoom 15, and a dot wins over a stop: hide its mode with the filter for the tap and show it again once the panel is open, or zoom in until the dot is more than 24 px off the marker.
- On a phone the stop's sheet opens at its peek, which shows the header, the standing row and the top of the tabs; dragging its header up raises it full height, under the top bar and the recorded-data notice, which then cover the row's top. Drive the row at the peek: Playwright's click scrolls the sheet's body as it needs.
- A phone's row of more than one card can't be driven on any recording, for the reason below; `src/screens/StopPanel.test.tsx` lists six on a phone, by hand.
- "Show all N" (shown past four standing) can't be driven on any recording: the fixture timetable's twenty trips never put more than one non-Metro trip at one stop's platforms at once, at any minute of the day. `src/screens/StopPanel.test.tsx` covers it with a standing list made by hand.
- Arrivals ask Rejseplanen for no board: every stop's Arrivals, København Syd St.'s too, come from the timetable plus the snapshot's delays, so their source line reads `Timetable and positions <time>`, never `Rejseplanen`, no row shows a track, and the note reads "Countdowns use the timetable, moved by the delay…". Asking for them still makes the server's snapshot run when one is due, as any route does, so they are not free of calls in the budget.
- "Now" under 45 s on an arrival follows the departures' rule but is hard to time on a recording: Nørreport St.'s E from Holte reads it only from about 07:27:15 to 07:29, as its expected arrival moves between 07:28 and 07:29 with each minute's positions. `src/screens/StopPanel.test.tsx` covers it.
- A Metro stop's arrivals interval lasts only while a planned arrival is ahead in the window: Bella Center St.'s last is at 07:26, Vestamager St.'s at 07:30; after that their Arrivals say none arrives. Vestamager St. has arrivals but no departures interval, since M1 ends there and its trips that leave it left before 07:20.
- A standing trip stands only for minutes: Refshaleøen's bus leaves about 07:24 on the recording's clock, and Orientkaj St.'s stands from 07:25 until 07:32. The Metro is never listed.
