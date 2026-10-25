# Mylder

**Watch Copenhagen move.** A live map of the city's buses, S-tog, metro and regional trains, and honest about how fresh each position is.

_Mylder_ is Danish for a teeming crowd, and it echoes _myldretid_, rush hour.

> **Status: early.** The app shell, tests and CI are set up. The live map comes next, once the Rejseplanen API access arrives. See the [roadmap](#roadmap).

<!-- Add a screenshot or GIF of the moving map here as soon as there is one. It's the first thing a visitor should see. -->

## Why

Trip planners like Rejseplanen, Citymapper and Google Maps tell you how to get somewhere. None of them shows the whole city moving at once. Mylder is for that view first, with useful info (departures, delays, disruptions) one tap away.

## Honest data states

Live transit data is patchy: some vehicles report GPS, some are estimated from the timetable, and feeds drop out. Mylder never hides which is which. Every vehicle, departure and road carries one of these states:

| State          | Meaning                                               | Example label             |
| -------------- | ----------------------------------------------------- | ------------------------- |
| Live           | Reported position, under 60 s old                     | "Reported 20 s ago"       |
| Ageing         | Reported, but 1 to 5 min old                          | "Last seen 3 min ago"     |
| Estimated      | Worked out from the timetable and the latest realtime | "Estimated from schedule" |
| Timetable only | No realtime data for this trip                        | "Timetable only"          |
| No signal      | Had realtime, but its source has been quiet for 5 min | "No signal since 10:42"   |

On the map, reported positions are solid dots and estimated ones are hollow. Thresholds are first guesses until real coverage is known. The full rules are in [`docs/data-states.md`](docs/data-states.md), and the words in [`GLOSSARY.md`](GLOSSARY.md).

## How it works (planned)

```
Rejseplanen API ──▶ one small Node server ──SSE──▶ browsers
 (positions,         polls on a fixed budget,        animate vehicles
  departures,        keeps live state in memory      between updates
  disruptions)
```

The free Rejseplanen tier allows about one call a minute, so browsers never call the API. One server polls, shares the result with everyone over Server-Sent Events, and the browser animates vehicles along their routes between updates.

## Roadmap

**First public version**

- [x] App shell: React 19, TypeScript, Vite, Vitest, Playwright, CI
- [ ] Live map with every vehicle moving along its route (MapLibre GL + deck.gl)
- [ ] City pulse: vehicles moving now, average delay, share reporting per operator
- [ ] Stop view: next departures, each with its data state
- [ ] Vehicle list: a virtualised table sortable by line, delay and data age
- [ ] Disruptions on one screen
- [ ] English first, Danish second, mobile first

**Later:** harbour ships from AIS, car traffic flow, replay of a past rush hour, a full-screen kiosk mode, more cities.

## Stack

- [React 19](https://react.dev) + TypeScript, built with [Vite](https://vite.dev)
- [Vitest](https://vitest.dev) + Testing Library for unit and component tests
- [Playwright](https://playwright.dev) for end-to-end tests
- [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting, [Prettier](https://prettier.io) for formatting
- Agent skills in `.claude/skills/`: `grill-me`, `grilling` and `software-factory` from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT)
- Planned: MapLibre GL and deck.gl for the map, TanStack Virtual for the list, Node + Hono for the server

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
