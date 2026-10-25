# Mylder

Mylder shows Copenhagen's public transport moving on one map, and says how fresh each position is. These are the words it uses for that.

## Network

**Mode**:
The kind of transport a line belongs to: Bus, Metro, S-tog, Train or Light rail. Harbour buses count as Bus; regional, intercity and Øresund trains count as Train.
_Avoid_: Transport type, product

**Line**:
A service known to passengers by one public name, such as 5C, M2, A or Re.
_Avoid_: Route, service

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

**Headway trip**:
A trip Mylder infers from a line's published frequency, because no timetable lists it.
_Avoid_: Virtual trip, synthetic trip

**Extra trip**:
A trip an update adds that the timetable doesn't have.
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

**Update**:
A message from the realtime feed that revises a trip: new expected or recorded times, or a cancellation.
_Avoid_: Report, prediction, event

**Report**:
A message giving a trip's position at a moment, from a position source.
_Avoid_: Ping, fix, update

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
The trip's position comes from a report under a minute old.
_Avoid_: Real-time, GPS

**Ageing**:
The trip's latest report is one to five minutes old.
_Avoid_: Old, delayed

**Estimated**:
The trip's position is worked out from its timetable and its updates, with no fresh report.
_Avoid_: Predicted, calculated

**Timetable only**:
The trip has had no realtime at all, so it is placed where its timetable says it should be.
_Avoid_: Scheduled, scheduled only, static

**No signal**:
The trip had realtime, and its source has gone quiet.
_Avoid_: Stale, lost, offline
