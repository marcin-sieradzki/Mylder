# Planes over Copenhagen: which live aircraft feed, and how it fits

Research for Mylder, 2026-10-26. Spec: Show the planes over Copenhagen on the map (#126).

Question: which live aircraft feed could put the planes round Kastrup on Mylder's map, and how it fits an app on Vercel Hobby that stays honest about how fresh each position is.

Research caveat: the sources are the providers' own documentation, terms and source code. The research environments could not reach any of the APIs, so coverage over Copenhagen and whether the APIs allow a browser's cross-origin call (CORS) are **not measured**. The recording ticket (#135) measured both the same day, from a Mac: see "Measured since", and `docs/aircraft.md`, "Measured", for the full figures.

## Short answer

adsb.lol, with adsb.fi as a drop-in fallback. adsb.lol is free, needs no key today, gives every aircraft inside a circle in one call, and is the only free feed with an open licence: the ODbL, the same as the OpenStreetMap basemap. Each aircraft carries its own position's age and how the position was found. adsb.fi answers in the same format.

- **Call**: `/v2/point/55.75/12.38/25`, 25 nm round 55.75 N, 12.38 E.
- **Cadence**: one call every 10 s, only while someone watches.
- **Cost**: nothing. No Redis, no key, no budget counter.
- **Credit**: "Aircraft: © adsb.lol contributors under the ODbL".

## The options

| Feed                         | Verdict  | Access                                                                     | Free tier and limits                                                                                                                       | Freshness                                                                     | Licence                                                                                                      |
| ---------------------------- | -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| adsb.lol (community, readsb) | Pick     | None today; a key "you can obtain by feeding" is announced, with no date   | Free; the rate limit is "dynamic based on the environment load", with no number published (but see "Measured since"); circles up to 250 nm | Per aircraft: `seen_pos`, seconds since its position, and `type`, how it came | ODbL 1.0 for the API and the data: attribution, and share-alike for a derived database; no commercial clause |
| adsb.fi (community, readsb)  | Fallback | None for the public endpoints                                              | 1 request a second per address; circles up to 250 nm (`/v3/lat/…/lon/…/dist/…`)                                                            | The same fields (ADS-B Exchange v2 compatible)                                | Personal, non-commercial use only; must cite adsb.fi and link its home page; public display not addressed    |
| OpenSky Network              | Possible | OAuth2 client credentials since 18 March 2026, tokens of about 30 min      | Credits a day: 400 anonymous, 4,000 registered, 8,000 for feeders; a city box costs about 1, so one call every 22 s                        | `time_position`, `last_contact`, `position_source`; 5 s resolution signed in  | Non-profit research and education; for-profit use needs permission; murkier for a public site                |
| airplanes.live               | Out      | Contributors only since September 2026 (addresses that don't feed get 403) | 1 request a second for feeders                                                                                                             | readsb                                                                        | Non-commercial, no SLA                                                                                       |
| ADS-B Exchange               | Out      | A RapidAPI key                                                             | About $10 a month for 10,000 requests                                                                                                      | Good                                                                          | Non-commercial; no redistribution                                                                            |
| Flightradar24 API            | Out      | A token                                                                    | Explorer, about $9 a month for 30,000 credits                                                                                              |                                                                               | Paid; display terms not found                                                                                |
| FlightAware AeroAPI          | Out      | A key                                                                      | $5 of free queries a month                                                                                                                 |                                                                               |                                                                                                              |
| Aviationstack                | Out      | A key                                                                      | 100 requests a month                                                                                                                       | Delayed 30 to 60 s                                                            |                                                                                                              |

ADS-B Exchange's and Flightradar24's prices are from their 2025 pages. airplanes.live's change is from a project issue of 20 October 2026 and a forum thread.

## How it plugs in

A plane on approach moves about 70 m a second, so a one-minute rhythm would make it jump 4 km. The planes get a small snapshot route of their own on a 10 s rhythm: the server asks once, the CDN serves everyone, and the browser never calls the provider. An aircraft source with two layers, adsb.lol and adsb.fi, decodes one schema, falling to adsb.fi on a failure or a 429. The 25 nm circle round 55.75 N, 12.38 E is cut to the transit box (55.45 to 56.05 N, 12.05 to 12.70 E). The snapshot carries codes only: the hex, the callsign, the type code, latitude and longitude, altitude or ground, ground speed, track, age and how the position was found. About 100 aircraft at a peak would be a few kilobytes gzipped (an estimate; the recording found far fewer, under "Measured since"). The source is pull-driven: the provider is called only when a poll misses the CDN.

No Redis: every aircraft arrives with its own age, and no key means no budget. A 10 s lease would cost about 260,000 Upstash commands a month, more than the about 190,000 left under the free 500,000.

## Data states

Ages are the answer's `now` less each aircraft's `seen_pos`.

- **Live**: the aircraft's own broadcast (`adsb_icao`, `adsr_icao`, `adsb_other`) under about 20 s, two polls, labelled "Reported 4 s ago".
- **Ageing**: its own broadcast from 20 to 60 s old; readsb itself stops calling a position current after 60 s.
- **Estimated**: `mlat` and `tisb_*`, as ADR 0005 has it: a computed position is never Live.
- **No signal**: only a `lastPosition` older than 60 s, or a feed that has failed for a minute: a grey cut glyph at the last fix, then gone.
- **Timetable only** never applies. Rough positions from a receiver's own location (`rr_lat`, `rr_lon`) are dropped.

## Risks

- Volunteer feeds have no SLA. adsb.lol may start asking for a key earned by feeding; a small receiver in Copenhagen would earn keys at adsb.lol, adsb.fi and OpenSky.
- Vercel's functions leave from shared cloud addresses, so a per-address limit may bite sooner than from home. The fallback and the No signal rule cover it.
- Vercel Hobby and adsb.fi are both for non-commercial use only, which matches how Mylder already runs on Rejseplanen's free key.

## To measure

From a machine that can reach the API: whether it allows a browser's cross-origin call, and how many aircraft it gives round Kastrup.

```sh
curl -sD - https://api.adsb.lol/v2/point/55.618/12.656/25 -o /tmp/cph.json | grep -i access-control
jq '.ac | length' /tmp/cph.json
```

## Measured since

The recording of 26 October 2026, 19:18 to 20:18 Copenhagen time (#135), puts the figures above right where it can:

- adsb.lol does publish its limits in its answers' headers: `x-ratelimit-limit: 4, 4;w=1, 60;w=60, 500;w=86400`, 4 calls a second, 60 a minute and 500 a day. 360 calls in the hour met no 429; 4 timed out.
- Neither adsb.lol nor adsb.fi sends `Access-Control-Allow-Origin`, so a browser can't call either: the server-side snapshot was needed anyway.
- 11 to 23 aircraft were in the circle at a time, 6 to 17 in the box with the ground transmitters, not 100; an answer was 7.5 to 12.4 KB.
- The ages fit the 20 s and 60 s limits: broadcast positions were 22.7 s old at the 90th percentile and 60.3 s at most.

## Sources

- adsb.lol: github.com/adsblol/api (`README`, `src/adsb_api/app.py`, `utils/api_v2.py`).
- readsb: github.com/wiedehopf/readsb/blob/dev/README-json.md (`seen_pos`, `type`, `lastPosition`, `rr_lat`, `dbFlags`).
- adsb.fi: github.com/adsbfi/opendata.
- OpenSky: github.com/openskynetwork/opensky-api, openskynetwork.github.io/opensky-api/rest.html, opensky-network.org/feed.
- airplanes.live: airplanes.live/api-guide, github.com/ColinWaddell/FlightTracker/issues/123.
- ADS-B Exchange: adsbexchange.com/api-lite. Flightradar24: its blog and terms. FlightAware: flightaware.com/commercial/aeroapi. Aviationstack: aviationstack.com/pricing.
