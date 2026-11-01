# The listener

The always-on SIRI-ET listener (spec #146, #217, ADR 0019): the package's second entry point, run on its own host in plain Node, which `.oxlintrc.json` keeps from importing the tracker, the page or `server-only`. How it runs, its settings, its route and its minute line are in `docs/live-data.md`, "The listener".

- `main.ts` is the entry point: it reads the settings, starts the loop and serves the route.
- `config.ts` reads the settings from the environment, stopping with an error that names each variable missing or wrong.
- `run.ts` is the loop: one link a dataset, its token renewed, reconnected with backoff and when the feed goes quiet, the minute line and the box's stops.
- `amqp.ts` is the AMQP shell, with `rhea`. No test reaches it; the loop's tests run on a fake link.
- `body.ts` turns a message's bytes into its text, unzipping a gzipped one no further than the reader's limit, and skips a body over it.
- `listener.ts` is the core, with no IO: the reader, the table built at most once a minute, and the route's handler.
- `stops.ts` learns the box's stops from the app's timetable routes.
- `server.ts` puts Node's HTTP server in front of the handler.
- `log.ts` writes one JSON line a log.
