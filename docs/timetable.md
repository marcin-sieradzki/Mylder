# The timetable

Mylder's realtime comes from Rejseplanen API 2.0 alone, on a budget of about one call a minute. The timetable is what lets one answer a minute become a moving city: it holds every line's paths and stops, every trip the API never mentions, and the planned times that departures and Metro intervals are read from. This page says where it comes from, how a scheduled job prepares it, what the prepared files hold, how the server and the browser load them, how the tracker joins them to the API, and what happens when something fails. The words are the glossary's.

## Why there is one

| Use                                                       | Could the API alone do it within the budget?                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Draw line paths and move dots along them between polls    | No. `journeyPos` gives a point and a progress between two stops, not geometry; `journeyDetail` gives one trip's polyline per call.   |
| Name and place stops                                      | No. Stop lookups cost a call each.                                                                                                   |
| Show Timetable only trips, including the Metro            | No. `CALC` mode would place them for a call a minute, which the position poll already spends, and a computed position is never Live. |
| Show Waiting trips from 5 min before departure            | No. No call reports a trip that hasn't started.                                                                                      |
| Fill a stop's departures without a call                   | No. `multiDepartureBoard` costs a call per opening; the timetable plus the snapshot's delay costs nothing.                           |
| Give the Metro its "every 3 min" text                     | No. Worked out from the planned times for that hour.                                                                                 |
| Keep a stable key for a trip across polls and deployments | No. The API's `ZI@DA` is stable for a day; Mylder's key is built from the timetable.                                                 |

So Mylder has a timetable. It is read-only data, prepared outside the app.

## The source

**Rejseplan Labs GTFS**, the static feed Rejseplanen publishes about every 14 days, free on request for non-commercial use, under CC BY 4.0. Access is requested through the Labs contact form; an approved request gets an account. The download is one file, `GTFS.zip`, about 64 MB zipped and 437 MB unzipped, covering all of Denmark plus the trains into Sweden and Germany, about twelve weeks ahead from its release date.

What it holds that Mylder needs:

- Every line and trip of Movia (buses, S-buses and harbour buses), DSB S-tog, DSB and Lokaltog trains, the Metro, and Hovedstadens Letbane. The Metro is single trips with clock times, every 3 to 6 minutes, not a frequency table.
- A shape for every trip, about 500 points each, from which patterns get their paths.
- Stop ids that match the API's once the leading zeros are stripped: `000008600626` is the API's `8600626`.
- Train numbers in `trip_short_name` for S-tog and DSB trips.

What it lacks, which the job supplies:

- **Stops as places.** The feed has no parent stations. Nørreport is seven rows: one for trains, one for the Metro, five bus stands. The job groups rows into one Stop per place, using the name without its bracketed part, the feed's transfer links between rows, and distance.
- **Line colours.** Every `route_color` is empty. Colours come from Perron's tokens by mode and line, never from the feed.
- **A version.** There is no `feed_info.txt`. The job names a version from the file's hash and the date it was prepared.
- **Trip ids that last.** `trip_id` changes between releases. Mylder never stores one.

NeTEx is not an option: it is delivered only through Dataudveksleren, which Mylder has dropped, and its licence has carried a no-derivatives clause. The GTFS has shapes and everything else Mylder needs.

## The job

A scheduled workflow in the repository's GitHub Actions, `.github/workflows/timetable.yml`, run once a day at 03:41 UTC (an off-hour minute, since GitHub's schedules queue on the hour), and on demand. It runs `npm run timetable -- --zip GTFS.zip`, the TypeScript job in `scripts/timetable/`, which shares its types with the readers in `src/timetable/`. On a pull request that changes the job, the same workflow runs on the real feed as a dry run and commits nothing.

1. **Fetch.** Download `GTFS.zip` from the source setting (below). Hash it. If the hash and the files' format (`FORMAT` in `src/timetable/format.ts`) equal the deployed manifest's, stop: nothing changed. A change to the format prepares the same feed again on the next run, and `--force` does so on demand, as the pull-request dry run does. This is the usual outcome; about two runs a month go on.
2. **Check the input.** The zip has the expected files, `calendar` covers at least the next 14 days, row counts are within a third of the last release's. A failed check fails the run and changes nothing.
3. **Cut to the box.** Keep every trip with at least one call inside the Copenhagen box (the same box the position poll uses, from the browser contract), and every stop those trips call at. Keep each trip's calls outside the box too, so a train to Roskilde still has its whole run, but the server never places a trip outside the box.
4. **Build stops.** Group stop rows into Stops as above: two rows are one Stop when their names match without the bracketed part and they are within 400 m of each other or linked by a transfer. A transfer alone never joins two names, because the feed also links neighbouring stops, such as Nørreport and Nørre Farimagsgade. Each Stop keeps its rows' ids, so a Platform's id from the API resolves to its Stop.
5. **Build patterns.** One Pattern per line, direction and ordered stop sequence. The box has about 1,200 over a twelve-week window, about 600 in use on a weekday.
6. **Build paths.** Each pattern's path is its trips' shape (no pattern in the feed uses more than one), simplified to about 5 m, which keeps a third of the points without a visible change at city zoom, and cut at each stop so the browser can place a dot between two calls by time. Each pattern is cut where its own shape passes the stop's platform, never at the platform's point: a platform row can stand for a whole station, as København H's one row does for every train, while the tracks through it lie tens of metres apart. Patterns whose shapes pass a platform within 5 m of each other meet it at one point, and patterns on the same street share stop-to-stop segments. A pattern without a shape, such as a rail-replacement bus, runs straight from stop to stop and meets each platform where the nearest path does.
7. **Build trips.** Every trip in the window, as a pattern reference, a first departure, a run profile (the offsets of its calls from the first departure, deduplicated) and a service (the days it runs, from `calendar` and `calendar_dates`). Mode comes from `route_type` and the operator: 109 is S-tog, 1 Metro, 0 Light rail, 2 Train, 3 and 700 Bus, 4 run by Movia Bus (the harbour buses).
8. **Check the output.** Every trip has a pattern, every pattern a path and stops, every stop a position; the trip count on the first Tuesday from the prepared date is within a third of the last release's; the window reaches at least 14 days ahead.
9. **Publish.** Write the files and the manifest, run `npm run check` on the result, and commit them to the default branch with the workflow's identity, in one commit named after the version (`Timetable 2026-06-02-4f2b8119`). GitHub starts no other workflow for a push made with the workflow's own token, so the app's CI does not run on that commit; the workflow's own `npm run check` stands in for it. Vercel's Git integration builds and deploys the commit. Nothing else is needed: no token for Vercel, no API key, no second store.

A failed check stops the run with a message naming the check, such as `Input check failed: the calendar runs to 2026-08-26, short of 14 days ahead (2026-09-03)`; GitHub emails the maintainer.

### The source setting

Where the job downloads from is one setting, the repository variable `TIMETABLE_GTFS_URL` (Settings, Secrets and variables, Actions, Variables). Unset, the workflow uses the Mobility Database's public copy of the latest Labs download, `https://files.mobilitydatabase.org/mdb-1292/latest.zip`: the same file, under the same CC BY 4.0 licence, fetched by the Mobility Database on its own schedule, with no account. The catalogue's older copy at `storage.googleapis.com/.../mdb-latest/...` stopped updating in June 2026, so its calendar fails the 14-day check.

To switch to Labs once the account answers (Get the Rejseplanen API 2.0 key, #23): set `TIMETABLE_GTFS_URL` to the Labs download URL (`https://www.rejseplanen.info/labs/GTFS.zip` as the catalogues record it) and, if the download asks for the account's credentials, add them as the repository secrets `TIMETABLE_GTFS_USER` and `TIMETABLE_GTFS_PASSWORD`, which the workflow passes to `curl --user`. Nothing else changes. If the next run's hash differs only because the copy is byte-for-byte different, the job prepares a new version and the trip keys stay the same.

The whole run is a few minutes on a standard runner; the daily no-change run is about one minute. That is well inside GitHub Free's 2,000 minutes a month for a private repository, and free in a public one.

## The prepared files

All plain JSON in `public/timetable/`: `manifest.json`, and the version's files in a folder named after it, such as `2026-06-02-4f2b8119/stops.json`, so caches can keep them for ever. A new release replaces the folder of the one before; the history keeps it. The job alone writes them, and Prettier leaves them alone. Sizes are from the 2026-06-01 release, cut to the position poll's box, 55.45 to 56.05 N, 12.05 to 12.70 E (the whole S-tog network, the Kystbanen to Helsingør, Roskilde and the airport; `docs/live-data.md`), gzipped. A narrower inner box (55.55 to 55.85 N, 12.20 to 12.70 E) was measured first; its figures and the sources for this page are in [`researches/2026-10-25-labs-gtfs.md`](researches/2026-10-25-labs-gtfs.md).

| File           | Holds                                                                                                                      | Size       | Who loads it                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------- |
| `manifest`     | Version, source hash, prepared date, service window, box, counts                                                           | under 1 KB | Server at start, browser at start |
| `stops`        | Stops as places: id, name, position, mode set, the row ids that belong to it (about 8,500 rows)                            | ~130 KB    | Browser, server                   |
| `patterns`     | Per pattern: line, mode, direction, headsign, stop indexes, path (about 1,700)                                             | ~50 KB     | Browser, server                   |
| `paths`        | Stop-to-stop segments as encoded polylines, shared between patterns (about 10,700)                                         | ~220 KB    | Browser                           |
| `trips`        | Every trip in the window: pattern, first departure, run profile, service; plus profiles and services (about 114,000 trips) | ~430 KB    | Server (the tracker)              |
| `day profiles` | Planned trips underway per quarter hour, for each service day in the window, for City pulse's day chart                    | ~20 KB     | Browser                           |

The shapes of the files are in `src/timetable/format.ts`. Patterns refer to platforms (rows) by index, and to segments by index; the trips are stored as columns (pattern, first departure, run profile, service, train number), and each run profile as steps from the value before, which gzip packs far tighter than a record per trip. The day profiles count trips underway at each quarter hour of the clock from 00:00, with a few more or fewer quarters on the two days a year the clocks change.

The browser's start load is about 0.4 MB gzipped, smaller than the map library. It is fetched once per version and then comes from the browser's cache; against Vercel Hobby's 100 GB a month it is a rounding error next to the minute-by-minute snapshots.

## How they are served and loaded

The files are baked into the deployment. A new timetable is a new commit, so a new deployment; the version the app serves is the version it was built with, and a preview deployment carries the same files as its branch. The server does not fetch them from anywhere at run time: the tracker reads `trips`, `stops` and `patterns` once per instance when it starts, expands the current service day (about 20,000 trips on a weekday and 13,600 on a Sunday, at most about 1,010 underway at once), and keeps them in memory. The manifest's version goes into every snapshot. The readers in `src/timetable/` parse each file, and `expandServiceDay` turns the trips into one service day's trips with every call's planned time and key. Files in `public/` are not in a server function's bundle on Vercel by default, so the tracker names `public/timetable/**` in Next's `outputFileTracingIncludes` for its routes, or imports the files, when the tracker is built.

The browser loads `manifest`, `stops`, `patterns` and `paths` at start, `dayProfiles` for City pulse's chart, and never `trips`, from the tracker's own timetable (the deployed one, or a recording's): `GET /api/timetable` answers the current manifest, kept for a minute, and `GET /api/timetable/<version>/<file>` each file, kept for good since a version never changes, so a reload takes them from the browser's cache. Both sides parse them with one reader, `src/timetable/network.ts`. The browser loads only these files: every trip it needs to draw arrives in the snapshot with its pattern, its position and its next few calls with expected times, which is enough to move the dot along the pattern's path until the next snapshot. The stop panel and vehicle detail are built on the server from the timetable plus the snapshot's delays, so the browser needs nothing more there either. When a snapshot names a version the browser hasn't loaded, it fetches that version's files and carries on; trip keys do not depend on the version, so dots don't jump.

Rejected homes for the files: Vercel Blob (10 GB transfer a month on Hobby and access stops for 30 days when a limit is crossed), a GitHub release asset fetched at build time (needs a token on Vercel for a private repository and a deploy hook to notice a new release), a separate static host (one more account). Committing a megabyte every two weeks costs the repository about 25 MB of history a year, which is fine for years; if it ever isn't, the release-asset route is the fallback.

## The join

The tracker joins each journey (the API's word for a trip) in a `journeyPos` answer to a trip of the current service day. It runs on the server only.

- **Stops:** strip the leading zeros from the GTFS id, or pad the API's id to twelve digits. A Platform's id resolves to its Stop through the stops file.
- **Trips:** the API has no GTFS `trip_id`, and Mylder wants none. The journey's reference carries its first stop and departure time, its last stop and arrival time, and its line; `journeyPos` also gives the direction. The tracker keeps an index of the service day's trips by (line, first stop, first departure minute) and resolves the rest with the direction and the last stop. On the measured weekday this leaves only exact duplicates unresolved (two trips in 20,000): the one case the key alone cannot split is the Metro M3 ring, whose two directions leave København H at the same minute, and the direction settles it. For trains, the API's train number should equal `trip_short_name`; the first day with the key confirms it and, if so, it becomes the first key for trains. When `journeyDetail` is fetched for a trip, its full call list is matched stop by stop on planned times, as the GTFS-Realtime bridge does, and corrects a wrong first guess.
- **SIRI-ET's journeys** (spec #146) carry only some of their calls, often not the first, so they join on what they do carry: a train or S-tog journey by its `TrainNumberRef`, which is the timetable's train number without its leading zeros (DSB's `050118` is `50118`); any other by its line, its `OriginRef` and `DestinationRef` resolved to their Stops, and a held call at a stop of the trip's pattern at that call's planned time. On the SIRI-ET recording every train and S-tog journey joins by number. `docs/live-data.md`, "The tracker's use of the table", has the rest.
- **Unmatched:** a journey no trip fits (an Extra trip, or a timetable that has since changed) is not drawn, because a position is always a point on a pattern's path (`docs/data-states.md`); an Extra trip still shows in departure lists. It is counted, and the count is watched after every new timetable.
- **Keys:** Mylder's trip key is content-derived: mode, line, pattern, service day and first departure, written `train.RE.<pattern key>.20260616.0717`, where the pattern key is a hash of the line, direction and stop sequence and the time is the service day's (`2411` for 00:11 the next morning). Two trips alike in all of that, which the measured weekday has twice, are told apart by their order (`.2`). A new GTFS release that renumbers its trip ids changes nothing in Mylder unless the trip itself changed, and the state the server keeps between polls survives a deployment.

What the join needs from the prepared files: per trip, its line, mode, direction, pattern (so its ordered stop rows), first departure, run profile (so every call's planned time) and train number; per stop, its row ids. All of it is in `trips`, `patterns` and `stops`.

## When things fail

| Event                                                                        | What happens                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Download fails, or the credentials stop working                              | The run fails, GitHub emails the maintainer, nothing is committed. The deployed timetable stays valid to the end of its window, at least two months from its release.                                                                                                            |
| The input or output checks fail                                              | Same. The checks exist so a half-written release never reaches the map.                                                                                                                                                                                                          |
| The window is about to run out                                               | The manifest holds the last covered day. With under 7 days left the server marks every snapshot, and the page shows a notice. Past the end, trips come only from the API: reported positions without paths, no Timetable only dots, departures only from calls that cost budget. |
| GitHub disables the schedule (public repositories, 60 days without activity) | The job's own commits are activity, and a changed feed lands about every two weeks. If the manifest's prepared date is older than 30 days, the server logs a warning; the workflow can also be run by hand.                                                                      |
| A new release changes trip ids                                               | Nothing. Mylder's keys and the join never use them.                                                                                                                                                                                                                              |
| A new release changes a trip's times or stops                                | That trip gets a new key after the deployment; its dot restarts once. The Redis state for the old key ages out.                                                                                                                                                                  |
| The join rate drops after a release                                          | The unmatched counter is on the server's log and in City pulse's coverage figures. A drop means the feed and the API disagree on a line; the first-day test's checks are run again.                                                                                              |

## Deploy, previews and secrets

- **Production** deploys from the default branch through Vercel's Git integration. A timetable commit is a production deployment like any other.
- **Previews** build for every pushed branch and pull request, behind Vercel Authentication (on by default for the Hobby plan) unless the maintainer opens them. A preview has no API key and no Redis: the tracker runs on recorded answers, a set of saved `journeyPos`, `departureBoard`, `journeyDetail` and `himsearch` answers checked in for tests, with the state store in memory and a banner that says the data is recorded. Previews spend no budget, and a screen can be reviewed on a phone from the preview link.
- **CI** (GitHub Actions) runs the checks, the unit tests and Playwright against a production build in the same recorded mode, with a small frozen timetable fixture (a few lines) so tests don't change when the timetable does. The real prepared files are validated by the job, not by the test suite.
- **The API key** lives in Vercel's environment variables as a sensitive variable in the Production environment only. It is never in the repository, never in a preview, and never in the browser: no `NEXT_PUBLIC_` prefix, and the browser only ever calls Mylder's own routes. A developer who holds a key keeps it in an ignored local file; without one, local runs use the recorded answers.
- **Redis** credentials come from the Upstash integration on the Vercel Marketplace, Production only.
- **The timetable job's secrets** are the Labs GTFS credentials, `TIMETABLE_GTFS_USER` and `TIMETABLE_GTFS_PASSWORD`, as repository secrets in GitHub Actions, used by that workflow alone, and only once the source is switched to Labs. The job needs no API key and no Vercel token; on the Mobility Database's copy it has no secrets at all.
- **Attribution:** the app's data notice credits "Rejseplanen (Rejsekort & Rejseplan A/S), CC BY 4.0" for both the timetable and the realtime data.
