# Labs GTFS, prepared by a scheduled job into static files, is Mylder's timetable

Rejseplanen API 2.0 is Mylder's only realtime source, on about one call a minute, and it gives positions without paths, stops without names and nothing at all for trips it doesn't report. So Mylder carries a timetable: the Rejseplan Labs GTFS (CC BY 4.0, about every 14 days, shapes for every trip, Metro and light rail included), cut to the Copenhagen box by a scheduled GitHub Actions job into under a megabyte of gzipped JSON (stops as places, patterns, stop-to-stop paths, the window's trips) that the job commits to the repository and every deployment ships as static files. The browser loads stops, patterns and paths at start; the tracker loads the trips once per instance and joins the API's journeys to them by line, first stop, first departure and direction, never by GTFS trip id, which changes with every release; Mylder's trip keys are built from the timetable's content instead.

## Considered options

- **The API alone.** Paths and Waiting trips are impossible; stops, departures and Timetable only trips cost calls per viewer action.
- **NeTEx.** Fresher, but delivered only through Dataudveksleren, which Mylder dropped, under a licence that has carried a no-derivatives clause.
- **Storing the prepared files outside the repository** (Vercel Blob, a release asset, a static host). Blob's Hobby limits cut access for 30 days when crossed; the others need a token, a deploy hook or an account. Committing a megabyte every two weeks keeps app and timetable one deployable unit, lets previews and tests see the same files, and costs about 25 MB of history a year. A release asset fetched at build time is the fallback if that ever grows uncomfortable.

## Consequences

- The job is the only writer of the prepared files; nobody edits them by hand, and the test suite uses a small frozen fixture instead.
- A new timetable is a production deployment. The deployed files stay valid to the end of their twelve-week window if the job fails, and the manifest's last covered day drives a notice.
- The GTFS credentials live in GitHub Actions secrets; the API key lives on Vercel; neither crosses to the other side.
