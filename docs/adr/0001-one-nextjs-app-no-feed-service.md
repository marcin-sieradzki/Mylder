# One Next.js app on Vercel Hobby, with no feed service

> Amended by [ADR 0019](0019-siri-et-brings-delays-and-cancellations-through-one-always-on-listener.md): one always-on listener, outside Vercel, receives SIRI-ET's push feed and writes a table of delays to the store. The app and the tracker keep this shape.

Mylder is one Next.js app on Vercel's free Hobby plan. Its server calls Rejseplanen from one route whose answer the CDN caches, and browsers poll that route instead of holding a stream. We chose this because the first public version should cost nothing to run: polling a cached route needs no machine that never sleeps, and the problems an always-on service brings (one consumer per feed subscription, state lost on restart, a second host and CORS) don't arise. The tracker logic sits in its own module, so it can move to an always-on service later without a rewrite.

## Considered Options

- An always-on feed service streaming to browsers over SSE or WebSockets, on one Fly.io machine in Stockholm (about $10 a month), a Hetzner VPS (about €6) or a free sandbox tier. Next.js route handlers can't accept WebSockets, and Vercel cuts SSE at 300 s, so streaming needs that second host.
- A scheduled worker writing one snapshot file to object storage, a hosted database with cron and realtime push, or a tracker on a home machine behind a tunnel.

## Consequences

- Positions reach the browser at most about once a minute, set by the API's call budget, so the browser moves every dot along its path between polls.
- Vercel Hobby is for non-commercial use only, which matches the API's free tier.
