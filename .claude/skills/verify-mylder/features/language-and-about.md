# Language and About

The page reads in English at `/en` and Danish at `/da`; the language switch keeps the rest of the address (map view, filters, open panel). The About dialog holds the sources and licences, the data states, the page's status and the keys.

## Sub-features

- `lang-switch` moves between `/en` and `/da` and keeps the query.
- `lang-root` sends `/` to the browser's language.
- `about-open` opens About from the top bar's button or the corner credit, and Esc closes it.
- `about-timetable` names the timetable as the source on the timetable source, and credits it.

## How to get to it (user POV)

- Choose Dansk or English in the top bar.
- Choose the About button (ⓘ) or the Rejseplanen link in the corner credit.
- The same, on a launch on the timetable source.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Switch.** `page.goto('/en?line=5C')`, `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the address is `/da?line=5C` and `html[lang]` is `da`; back with the `Sprog` navigation's `English` link.
- **About.** `page.getByRole('button', { name: 'About Mylder' }).click()` (`Om Mylder` in Danish) opens `getByRole('dialog', { name: 'About Mylder' })` with the data states and the keys; Esc closes it.
- **About on the timetable source.** On a launch with `timetable` as the third argument, open About: the `Source` fact reads "Rejseplanen's timetable, no live positions yet", the dialog says "The positions on this page are the timetable's plan, not reports from the vehicles." and not "not real", credits "Timetable data: Rejseplanen, under CC BY 4.0. Timetable of <date>." with the deployed timetable's prepared date (`/api/snapshot`'s `status.timetable.prepared`), and under the data states says "Every vehicle is Timetable only for now: live positions aren't connected yet."; `Positions` reads "No position calls" and `Calls this month` "0". In Danish (`Om Mylder`): "Rejseplanens køreplan, endnu ingen livepositioner", "Positionerne på denne side er køreplanens plan, ikke meldinger fra køretøjerne." and "Køreplansdata: Rejseplanen, under CC BY 4.0. Køreplan fra <date>.".
- **From the credit.** With `--phone`, `page.getByRole('link', { name: 'Rejseplanen' }).click()` opens the same dialog.

## Gotchas

- `/` redirects by the browser's `Accept-Language`; set the context's locale to test it.
