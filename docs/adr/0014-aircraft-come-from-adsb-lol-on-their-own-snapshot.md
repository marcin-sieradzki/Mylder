# Aircraft come from adsb.lol on their own snapshot

The map draws Copenhagen Airport, and the sky above it is full of planes that have the one free, open live feed in the city while transit waits for the Rejseplanen key. Mylder takes them from adsb.lol, a community network of ADS-B receivers whose API and data are open under the ODbL, with adsb.fi, which answers the same query in the same readsb format, as its fallback. One circle query, 25 nm round 55.75 N, 12.38 E, covers the transit box, and the server cuts the answer to the box. The aircraft have their own snapshot route, `/api/aircraft`, on their own rhythm of one call every 10 s, held by the CDN until its next due, because a plane on approach covers about 700 m in 10 s and a minute's rhythm would make it jump 4 km. Each aircraft arrives with its own position's age and how the position was found, so the data states need no history between calls: there is no store, no lease and no budget for the aircraft, and ADR 0008 and ADR 0009 are untouched. A 10 s lease alone would cost about 260,000 Upstash commands a month, more than the free tier has left.

This narrows ADR 0002: Rejseplanen stays the only realtime source for transit, and the aircraft feed is the one other realtime source, for aircraft only. It narrows ADR 0007: the browser polls one snapshot per kind of data, the transit snapshot once a minute and the aircraft snapshot every 10 s, each one cache key for every viewer, each with codes and numbers only. A computed position is still never Live (ADR 0005): a position placed by multilateration or TIS-B is Estimated.

## Considered Options

- Aircraft in the transit snapshot: one route, but a 10 s rhythm for transit would spend the Rejseplanen budget six times over, and a one-minute rhythm for planes makes them jump.
- OpenSky Network: OAuth since March 2026, a credit budget of about one call every 22 s, and terms for non-profit research that are murkier for a public site.
- Paid feeds (Flightradar24, FlightAware, ADS-B Exchange, Aviationstack): a cost and display terms Mylder, which is non-commercial, can't meet; airplanes.live is for its feeders only since September 2026.
- The browser calling adsb.lol itself: no shared cache, so the feed's load grows with viewers, and its CORS is unmeasured.

## Consequences

- `MYLDER_AIRCRAFT_SOURCE` picks the aircraft's source apart from `MYLDER_SOURCE`, so the planes can be live while transit is simulated, and the source banner says which is which.
- Volunteer feeds have no SLA, and the app's functions call from shared cloud addresses; the adsb.fi fallback and the No signal rule cover a feed that stops answering.
- adsb.lol limits each address to 4 calls a second, 60 a minute and 500 a day (its `x-ratelimit-limit` header, measured from home in October 2026): at one call every 10 s the day's calls run out after about 83 minutes of viewing. After a 429 the server stops asking adsb.lol until its `Retry-After`, or else the next midnight UTC, and adsb.fi, which allows 1 call a second, answers meanwhile; the snapshot and the credit name it. That rest is kept in memory per instance, so it needs no store, and ADR 0008 and ADR 0009 stay untouched. A day of steady viewing is therefore mostly adsb.fi's, and Mylder relies on its non-commercial terms as much as adsb.lol's.
- The map credit and the About dialog credit adsb.lol's contributors under the ODbL, and a recording of its answers stays open in the repository, as the basemap extract does.
- The plumbing is in `docs/aircraft.md`.
