# Mylder

A live map of Copenhagen's buses, S-tog, metro and trains, honest about how fresh its data is
(reported, estimated or stale). Rejseplanen is the core data source.

## Stack

- [React 19](https://react.dev) + TypeScript, built with [Vite](https://vite.dev)
- [Vitest](https://vitest.dev) + Testing Library for unit and component tests
- [Playwright](https://playwright.dev) for end-to-end tests
- [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting, [Prettier](https://prettier.io) for formatting

The map layer (MapLibre GL, deck.gl) is not added yet.

## Getting started

Requires Node 22 or newer.

```sh
npm install
npm run dev
```

## Scripts

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

Before the first e2e run, install a browser with `npx playwright install chromium`.

## Layout

```
src/
  app/     App shell
  test/    Test setup
e2e/       Playwright tests
```
