# The crowded GTFS fixture

A timetable made by hand from the frozen fixture in `../gtfs`, so that more than four trains stand at one stop's platforms at once, which the real fixture never shows. The `crowded` recording is frozen on it (`src/tracker/recording/plans.ts`), so the stop panel's standing list can be driven past four rows ("Show all 6"). It is not Rejseplanen's timetable: its times are made up.

**Made from:** six of `../gtfs`'s trips, with their rows copied unchanged but for their times, and only the agencies, routes, stops, shapes, services and transfers they use. Each trip's times are moved so that the S-tog arrive at København H a minute apart from 07:15 on Tuesday 2026-06-16 and each stands there ten minutes, and the RE leaves from there at 07:24: every call up to a trip's arrival at København H moves by one amount, and its departure there and every call after it by another.

| Trip        | Line | To           | At København H              |
| ----------- | ---- | ------------ | --------------------------- |
| `162988660` | RE   | Næstved St.  | Starts there, leaves 07:24  |
| `162498623` | A    | Hundige St.  | Arrives 07:15, leaves 07:25 |
| `162498496` | A    | Hillerød St. | Arrives 07:16, leaves 07:26 |
| `162501682` | E    | Køge St.     | Arrives 07:17, leaves 07:27 |
| `162501493` | E    | Holte St.    | Arrives 07:18, leaves 07:28 |
| `162498461` | A    | Hillerød St. | Arrives 07:19, leaves 07:29 |

So from 07:20 to 07:24 six trains stand at København H: the RE Waiting at its first stop, the S-tog between their arrival and their departure. Its version is named by the SHA-256 of its files (`scripts/timetable/testing.ts`), so it never shares a version, or the browser's cached files, with the real fixture's.

**Source of the rows it was made from:** Rejseplanen (Rejsekort & Rejseplan A/S), [www.rejseplanen.dk](https://www.rejseplanen.dk), CC BY 4.0, as `../gtfs/README.md` says.
