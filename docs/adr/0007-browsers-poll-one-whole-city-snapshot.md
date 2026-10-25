# Browsers poll one whole-city snapshot, and the server decides data states

Mylder's only realtime source allows about one call a minute, and its app runs as functions that share no memory and cannot hold a stream. So the server builds one snapshot of every trip in the city once a minute, with each trip's data state, position, delay and next calls already decided, and every browser polls that one snapshot through the CDN just after the time it says the next one is due. The browser never asks for a viewport, a line or a language: one cache key serves everyone, so the API cost does not grow with viewers, and City pulse and the Vehicles list have the whole city for free. Between polls the browser moves dots along timed path segments and ages states by the clock, using the same pure rules module the server used.

## Considered Options

- Viewport polls: one cache key per view, so no shared cache and no city-wide stats.
- A delta feed: smaller bytes, but a CDN cannot cache a delta per client state, and gzip makes the full snapshot about 50 to 70 KB.
- Browser-decided states: viewers would disagree about dropouts, and the server would still need history for the budget.

## Consequences

The snapshot is the app's one contract, defined once on the server (Effect Schema) with its type imported by the browser. Any new screen reads the snapshot; a new field means a new server release, not a new endpoint. The snapshot must stay small, so it carries codes and times, never text. The detail is in `docs/live-data.md`.
