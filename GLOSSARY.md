# Mylder

Mylder shows Copenhagen's public transport moving on one map, and says how fresh each position is. These are the words it uses for that.

## Network

**Mode**:
The kind of transport a line belongs to: Bus, Metro, S-tog, Train or Light rail. Harbour buses count as Bus; regional, intercity and Øresund trains count as Train.
_Avoid_: Transport type, product

**Line**:
A service known to passengers by one public name, such as 5C, M2, A or Re.
_Avoid_: Route, service

**Interval line**:
A line that runs to an interval rather than to its clock times, such as the Metro. Its timetable's trips show the planned rhythm, not real trains.
_Avoid_: Headway line, frequency-based line, headway trip, turn-up-and-go

**Interval**:
How often an interval line's trips leave a stop, worked out from its planned times for the hour, such as "every 3 min".
_Avoid_: Headway, frequency

**Pattern**:
One ordered sequence of stops that a line's trips follow in one direction, with the path between them.
_Avoid_: Route, variant, shape

**Stop**:
A place a passenger picks to board or leave, such as Nørreport. One stop can serve several modes.
_Avoid_: Station, stop place, stop point

**Platform**:
One spot within a stop where trips call, such as a metro platform or bus stand B.
_Avoid_: Quay, stand, stop point

**Operator**:
The company that runs a trip, such as Arriva, DSB or Metro Service.
_Avoid_: Agency, carrier

**Authority**:
The body that orders and brands a network, such as Movia, whose buses other operators run.
_Avoid_: Operator, agency

## Trips

**Trip**:
One run of a line along a pattern, from its first stop to its last, on one service day. The thing Mylder tracks.
_Avoid_: Journey, run, service journey

**Vehicle**:
A trip on the map, waiting or underway, as passengers see it. Its fleet number is known only when a source reports one.
_Avoid_: Bus (for the general case), unit

**Extra trip**:
A trip an answer adds that the timetable doesn't have.
_Avoid_: Unplanned trip, added trip

**Cancelled trip**:
A trip an update has called off. A trip can also have single cancelled calls and still run.
_Avoid_: Removed trip, dropped trip

**Waiting**:
A trip standing at its first stop in the minutes before its first departure.
_Avoid_: Layover, parked

**Service day**:
The operating day a trip belongs to, which can run past midnight into the next calendar date.
_Avoid_: Operating day, date

**Call**:
One trip's visit to one stop, with its scheduled, expected and recorded times.
_Avoid_: Stop time, visit, passing

**Departure**:
A call seen from the stop's side, as a stop's departure list shows it.
_Avoid_: Arrival (for the list), next bus

## Realtime

**Answer**:
One reply from Rejseplanen to one call Mylder makes: the whole city's positions, one stop's departures, or one trip's calls. Everything realtime carries the time of the answer that last brought it.
_Avoid_: Response, feed, message

**Update**:
An answer, or the part of one, that revises a trip's calls: expected times, platforms or a cancellation.
_Avoid_: Report, prediction, event

**Report**:
A trip's position at a moment, as its vehicle sent it, from an answer that holds reports only. A computed position is not one.
_Avoid_: Ping, fix, update, GPS

**Computed position**:
A position Rejseplanen works out for a trip from its timetable and realtime, rather than one its vehicle sent. An answer never says which positions are computed; the kind of call does.
_Avoid_: Calculated position, last position, estimate

**Delay**:
How far a trip runs behind its timetable: expected minus scheduled time at its latest updated call. Negative when early.
_Avoid_: Lateness, deviation

**Position**:
Where a trip is at a moment, as a point on its pattern's path.
_Avoid_: Location, coordinates

## Data states

**Data state**:
How much Mylder knows about a trip right now, one of Live, Ageing, Estimated, Timetable only and No signal. A departure shows its trip's data state.
_Avoid_: Status, freshness, quality

**Live**:
The trip's position is a report no older than about two polls, so the vehicle itself said where it is.
_Avoid_: Real-time, GPS

**Ageing**:
The trip's latest report is older than about two polls and under five minutes, carried forward along its path.
_Avoid_: Old, delayed

**Estimated**:
The trip's position is worked out, by Rejseplanen or by Mylder, from its timetable and its realtime, with no fresh report.
_Avoid_: Predicted, calculated

**Timetable only**:
The trip has had no realtime this service day, so it is placed where its timetable says it should be. Every trip of an interval line is one.
_Avoid_: Scheduled, scheduled only, static

**No signal**:
The trip had realtime, and it stopped: the trip has been missing from the answers for five minutes, or no answers have come for five minutes.
_Avoid_: Stale, lost, offline

## Page conditions

**Paused**:
Mylder gets no answers from Rejseplanen, because calls fail or the month's calls are spent. The page says so and why, dots keep moving on what Mylder has, and data states age by the clock. A condition of the page, not a data state.
_Avoid_: Outage, down, No signal (for the page)

**Disconnected**:
The browser's own polls of Mylder fail. The page says so at once, dots keep moving on what the browser has, and data states age by the clock. A condition of the page, not a data state.
_Avoid_: Offline, No signal (for the page)
