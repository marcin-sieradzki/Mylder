# Mylder verification map

The maintained source for verifying what a rider sees in Mylder. Read this index before driving, then use the matching feature file as the recipe. Launch, Doctor, Drive and Cleanup are in [`../SKILL.md`](../SKILL.md).

## Baseline preconditions

- A run launched with `launch.sh <run-id>` on the `weekday` recording, `doctor.sh <run-id>` healthy, and under nine minutes since launch. A recipe that names another recording runs on a launch of its own, as [`../SKILL.md`](../SKILL.md)'s Launch says; the rest of this baseline is the weekday's.
- The recording's first minute has 17 vehicles (6 bus, 4 Metro, 6 S-tog, 1 train), 3 disruption messages, and planes from the aircraft recording; later minutes move them on.
- English at `/en`, Danish at `/da`; the source banner reads "Recorded data from 16 June 2026." on every page.
- A recipe on the timetable source runs on a launch of its own with `timetable` as the third argument, at the real time, or `timetable:<folder>` on a saved folder's timetable and moment (`timetable-ending` for the timetable's last week): every vehicle is Timetable only, the snapshot's source is `timetable`, and the counts are whatever the deployed timetable plans at that moment; its source banner reads "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be." and no Paused notice shows.

## Driving conventions

- Start each journey from `/en` with nothing open, unless its preconditions say otherwise.
- Find things by ARIA role and accessible name; the names are the rider's words, in the page's language.
- The canvas has no handles inside it: centre the map on the thing with `?map=15.00/<lat>/<lon>` and tap the viewport's middle, retrying inside `expect(...).toPass()`, as the feature files show.
- A desktop journey runs at Desktop Chrome's size; a phone journey adds `--phone`, where the sheet is a bottom sheet and panels open from the bottom.

## Proof

- A `step()` before and after every action that changes what is shown.
- Assert the visible words and the address; a panel's `?trip=`, `?stop=` or `?aircraft=` is part of the proof.
- Name the feature id and the entry point in the verdict for every journey; an entry point not driven is not verified.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on what the rider sees, then exactly four H2s in this order: `Sub-features` (short ids, one line each), `How to get to it (user POV)` (every entry point), `Driving it with drive.ts` (starting with `Preconditions:`, then labelled bullets pairing an action with its code and the result to see) and `Gotchas`. The map holds rider paths, handles, required state and proof, and leaves implementation out.

## Features

- [The moving map](./moving-map.md): dots, the hover card, the legend, the controls, the mode filters, the banner and the credit, and the 3D view that tilts and turns it.
- [Vehicle detail](./vehicle-detail.md): one trip's panel, from a dot or a Vehicles list row, with Follow and Show whole line.
- [Stop panel](./stop-panel.md): a stop's panel with the trips standing at its platforms, and its departures and arrivals as two tabs.
- [The overview sheet](./overview-sheet.md): City pulse and the Vehicles list.
- [Disruptions](./disruptions.md): the messages, Show on map and the highlight chip.
- [Planes](./planes.md): the aircraft, their card and the Planes filter.
- [Language and About](./language-and-about.md): the language switch, `/da`, and the About dialog.
