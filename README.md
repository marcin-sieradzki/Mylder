# Mylder

**Watch Copenhagen move.** A live map of the city's buses, S-tog, metro and regional trains, and honest about how fresh each position is.

_Mylder_ is Danish for a teeming crowd, and it echoes _myldretid_, rush hour.

> **Status: early.** The app shell, tests and CI are set up. The live map comes next, once the Rejseplanen API access arrives. See the [roadmap](#roadmap).

<!-- Add a screenshot or GIF of the moving map here as soon as there is one. It's the first thing a visitor should see. -->

## Why

Trip planners like Rejseplanen, Citymapper and Google Maps tell you how to get somewhere. None of them shows the whole city moving at once. Mylder is for that view first, with useful info (departures, delays, disruptions) one tap away.

## Honest data states

Live transit data is patchy: some vehicles report their position, some are only estimated, some have no realtime at all, and answers stop coming. Mylder never hides which is which. Every vehicle and departure carries one of these states:

| State          | Meaning                                                                          | Example label             |
| -------------- | -------------------------------------------------------------------------------- | ------------------------- |
| Live           | Reported by the vehicle, within about two polls                                  | "Reported 20 s ago"       |
| Ageing         | Reported, but older than that and under 5 min                                    | "Last seen 3 min ago"     |
| Estimated      | Computed by Rejseplanen, or worked out by Mylder from the timetable and realtime | "Estimated from schedule" |
| Timetable only | No realtime for this trip today, like every Metro train                          | "Timetable only"          |
| No signal      | Had realtime, then missing for 5 min                                             | "No signal since 10:42"   |

On the map, reported positions are solid dots and estimated ones are hollow. A position Rejseplanen computes is never shown as Live. Thresholds are first guesses until real coverage is measured. The full rules are in [`docs/data-states.md`](docs/data-states.md), and the words in [`GLOSSARY.md`](GLOSSARY.md).

## How it works (planned)

```
Rejseplanen API ──▶ one Next.js app on Vercel ──CDN──▶ browsers
 (positions,         one call a minute while        poll one snapshot,
  departures,        someone watches; joins it      animate vehicles
  disruptions)       to the Labs GTFS timetable     along their paths
```

The free Rejseplanen key allows about one call a minute, so browsers never call the API. The app's server makes that call only while someone is watching, joins the answer to a timetable prepared from Rejseplan Labs GTFS, decides each trip's data state, and serves one snapshot of the whole city through the CDN. Every browser polls that snapshot and moves each vehicle along its path until the next one. The decisions and their reasons are in [`docs/adr/`](docs/adr/); the plumbing in [`docs/live-data.md`](docs/live-data.md), [`docs/timetable.md`](docs/timetable.md) and [`docs/screens.md`](docs/screens.md).

## Roadmap

**First public version**

- [x] App shell: React 19, TypeScript, Vite, Vitest, Playwright, CI
- [ ] Live map with every vehicle moving along its route (MapLibre GL + deck.gl)
- [ ] City pulse: vehicles moving now, share reporting per mode, and average delay if the data can back it
- [ ] Stop view: next departures, each with its data state
- [ ] Vehicle list: every vehicle on the map in a table, sortable by line, destination and data state
- [ ] Disruptions on one screen
- [ ] English first, Danish second, mobile first

**Later:** harbour ships from AIS, car traffic flow, replay of a past rush hour, a full-screen kiosk mode, more cities.

## Stack

- [React 19](https://react.dev) + TypeScript, built with [Vite](https://vite.dev)
- [Vitest](https://vitest.dev) + Testing Library for unit and component tests
- [Playwright](https://playwright.dev) for end-to-end tests
- [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting, [Prettier](https://prettier.io) for formatting
- Agent skills in `.claude/skills/`: `grill-me`, `grilling` and `software-factory` from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT)
- Planned: Next.js on Vercel in place of Vite, Effect for the server's tracker, MapLibre GL and deck.gl for the map, and Perron for every component and token

## Getting started

Requires Node 22 or newer.

```sh
npm install
npm run dev
```

Before the first e2e run, install a browser with `npx playwright install chromium`.

| Script                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Start the dev server                             |
| `npm run build`         | Type-check and build for production into `dist/` |
| `npm run preview`       | Serve the production build                       |
| `npm run check`         | Type-check, lint, format check and unit tests    |
| `npm run test`          | Run unit tests once                              |
| `npm run test:watch`    | Run unit tests in watch mode                     |
| `npm run test:coverage` | Run unit tests with coverage                     |
| `npm run test:e2e`      | Build, serve and run Playwright tests            |
| `npm run lint`          | Lint with oxlint                                 |
| `npm run format`        | Format everything with Prettier                  |

```
src/
  app/     App shell
  test/    Test setup
e2e/       Playwright tests
```

## Data

Transit data from [Rejseplanen Labs](https://labs.rejseplanen.dk), used under its non-commercial guidelines. API keys stay on the server and are never committed.

## About

Built by [Marcin Sieradzki](https://github.com/marcin-sieradzki), a frontend and AI engineer in Copenhagen.
