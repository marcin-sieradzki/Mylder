# The server keeps its state in a free hosted Redis

The tracker needs four things that must outlive one request and be the same on every instance: the previous snapshot's history (to tell Ageing, No signal and Timetable only apart), the latest snapshot (so any instance can serve it), a one-minute lease (so only one instance calls Rejseplanen per minute) and the month's call counter (the budget). The app's host runs it as functions with no shared memory, and its own server cache is in memory per instance by default and, in its shared form, documents no collapsing of concurrent misses. So the state goes in a free hosted Redis from the host's marketplace, behind one small interface (get, set-if-absent with expiry, set with expiry, increment) with an in-memory implementation for tests and local runs. A month watched around the clock uses about 310,000 of the free tier's 500,000 commands and about 7 of its 10 GB.

## Considered Options

- Next.js's server cache alone: no lease, no counter, not shared across instances by default.
- Stateless server, history in the browser: viewers disagree about dropouts; the counter has nowhere to live.
- A database or a file: more than four keys need, and no free tier is closer to hand.

## Consequences

If the store is down, the tracker still runs from memory: no Ageing or No signal until it returns, polls stretch to 90 s to bound double calls, on-demand calls stop, and each instance tallies its calls to add back later. Nothing in the store is precious: losing it costs one minute of history and a counter that the logs can rebuild. If the tracker ever moves to an always-on service, the interface's in-memory implementation is enough and the Redis goes.
