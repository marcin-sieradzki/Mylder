# Language and About

The page reads in English at `/en` and Danish at `/da`; the language switch keeps the rest of the address (map view, filters, open panel). The About dialog holds the sources and licences, the data states, the page's status and the keys.

## Sub-features

- `lang-switch` moves between `/en` and `/da` and keeps the query.
- `lang-root` sends `/` to the browser's language.
- `about-open` opens About from the top bar's button or the corner credit, and Esc closes it.
- `about-timetable` names the timetable as the source on the timetable source, and credits it.
- `about-delays` with SIRI-ET's delays: About names them as a source with their latest update and credits Rejsekort & Rejseplan A/S, as the corner credit does.

## How to get to it (user POV)

- Choose Dansk or English in the top bar.
- Choose the About button (ⓘ) or the Rejseplanen link in the corner credit.
- The same, on a launch on the timetable source, or with SIRI-ET's delays (`launch.sh <run-id> <port> updates:siri-et`).

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Switch.** `page.goto('/en?line=5C')`, `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the address is `/da?line=5C` and `html[lang]` is `da`; back with the `Sprog` navigation's `English` link.
- **About.** `page.getByRole('button', { name: 'About Mylder' }).click()` (`Om Mylder` in Danish) opens `getByRole('dialog', { name: 'About Mylder' })` with the data states and the keys; Esc closes it.
- **About on the timetable source.** On a launch with `timetable` as the third argument, open About: the `Source` fact reads "Rejseplanen's timetable, no live positions yet", the dialog says "The positions on this page are the timetable's plan, not reports from the vehicles." and not "not real", credits "Timetable data: Rejseplanen, under CC BY 4.0. Timetable of <date>." with the deployed timetable's prepared date (`/api/snapshot`'s `status.timetable.prepared`), and under the data states says "Every vehicle is Timetable only for now: live positions aren't connected yet."; `Positions` reads "No position calls", `Rejseplanen's realtime` "Not connected yet" (never "—" or "Unknown"), and `Calls this month` "0". In Danish (`Om Mylder`): "Rejseplanens køreplan, endnu ingen livepositioner", `Rejseplanens realtid` "Ikke koblet på endnu", "Positionerne på denne side er køreplanens plan, ikke meldinger fra køretøjerne." and "Køreplansdata: Rejseplanen, under CC BY 4.0. Køreplan fra <date>.".
- **About with SIRI-ET's delays.** On a launch with `updates:siri-et` as the third argument, wait a minute for the table to fill: the corner credit reads "Transit data: Rejseplanen (CC BY 4.0) · Delays: Rejsekort & Rejseplan A/S · © OpenStreetMap contributors · …", the company unlinked. Open About: its `Delays` fact reads "Rejseplanen's SIRI-ET, updated HH:MM:SS", `/api/snapshot`'s `updates.lastMessage` on Copenhagen's clock, and the credits say "Delays and cancellations: Rejsekort & Rejseplan A/S, through Rejseplanen's SIRI-ET.", with no licence named. In Danish: `Forsinkelser` "Rejseplanens SIRI-ET, opdateret HH:MM:SS", "Forsinkelser og aflysninger: Rejsekort & Rejseplan A/S, via Rejseplanens SIRI-ET." and the credit's "Forsinkelser: Rejsekort & Rejseplan A/S". On a launch without delays, none of these. With `--phone` the same, the credit wrapping above the sheet's peek.
- **From the credit.** With `--phone`, `page.getByRole('link', { name: 'Rejseplanen' }).click()` opens the same dialog.

## Gotchas

- `/` redirects by the browser's `Accept-Language`; set the context's locale to test it.
