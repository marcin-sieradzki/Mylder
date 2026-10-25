# Data states

The rules that turn what the feeds say about a trip into its position on the map and one of the five data states. The words are defined in [`GLOSSARY.md`](../GLOSSARY.md). Every threshold here is provisional until a recording of the realtime feed measures real coverage and update rates.

## The states

| Data state     | When                                                                         | Label                     | Map glyph           |
| -------------- | ---------------------------------------------------------------------------- | ------------------------- | ------------------- |
| Live           | The latest report is under 60 s old                                          | "Reported 20 s ago"       | Solid dot           |
| Ageing         | The latest report is 60 s to 5 min old                                       | "Last seen 3 min ago"     | Faint dot, outlined |
| Estimated      | No fresh report, but the trip has had updates and its feed is healthy        | "Estimated from schedule" | Hollow dot          |
| Timetable only | The trip has had no realtime at all                                          | "Timetable only"          | Dashed hollow dot   |
| No signal      | The trip had realtime, and every source that had it has been quiet for 5 min | "No signal since 10:42"   | Grey dot            |

## Choosing the state

Check in this order and take the first that holds:

1. A report under 60 s old: **Live**.
2. A report 60 s to 5 min old: **Ageing**.
3. The trip has had at least one update this service day, and its operator's realtime feed has sent something in the last 5 min: **Estimated**. This covers a trip whose reports went quiet while updates still arrive: it falls back to Estimated, not No signal.
4. The trip has had no update and no report: **Timetable only**.
5. Otherwise, the trip had realtime and all of it went quiet: **No signal**, since the time of the last update or report.

Silence is judged per feed, not per trip. An on-time trip can go many minutes without an update, so a quiet trip on a healthy feed stays Estimated.

A departure shows its trip's data state: an expected time marked "~" when Estimated, the scheduled time when Timetable only, and "Unknown" beside the scheduled time when No signal.

## Times for each call

- A call's expected time comes from the latest update that gives one.
- Where an update gives expected times for some later calls but not others, the gaps take the scheduled time plus the latest delay.
- A trip with no update uses scheduled times throughout.

## Where a trip is drawn

- A position is always a point on the trip's pattern path.
- **Live and Ageing:** the latest report, carried forward along the path at the trip's expected times.
- **Estimated and Timetable only:** placed between the call it last left and the next one, interpolated by time along the path, using the call times above.
- **No signal:** keeps moving along its path on the timetable plus its last known delay, drawn in the No signal style. It isn't frozen where last seen, so a feed outage doesn't look like the city stopped.

## Which trips are on the map

- **Waiting:** from 5 min before its first departure, a trip stands at its first stop, labelled "Departs 10:42". Without a report this is a timetable guess, so the label never says the vehicle is there.
- **Underway:** from its first departure until it arrives at its last stop, using expected times when it has them. Follow ends when the trip reaches its last stop.
- **Cancelled trip:** not drawn. Its departures stay in stop lists, marked Cancelled.
- **Cancelled calls:** a trip that skips some stops is drawn, and those calls are marked Cancelled.
- **Extra trip:** a trip an update adds that the timetable lacks. It shows in departure lists, and on the map only if its stops match a known pattern.
