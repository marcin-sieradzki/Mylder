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
_Avoid_: Journey (that is a feed's record of a trip), run, service journey

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

**Standing**:
A trip at one of a stop's platforms now, between its shown arrival and its shown departure there. A Waiting trip stands at its first stop, and a trip that ends at a stop stands there for 2 minutes after it arrives. The Metro is never listed as standing.
_Avoid_: Dwelling, at the platform, berthed

**Service day**:
The operating day a trip belongs to, which can run past midnight into the next calendar date.
_Avoid_: Operating day, date

**Call**:
One trip's visit to one stop, with its scheduled, expected and recorded times.
_Avoid_: Stop time, visit, passing

**Departure**:
A call seen from the stop's side as its trip leaves, as a stop's Departures list shows it.
_Avoid_: Next bus

**Arrival**:
A call seen from the stop's side as its trip comes in, as a stop's Arrivals list shows it: where the trip comes from, its platform or track, and when it arrives. A trip's first call has no arrival, and its last call has no departure.
_Avoid_: Incoming, inbound, next arrival

**Aircraft**:
A plane or helicopter on the map, from the aircraft feed; not a Vehicle or a Trip, and not a Mode. It carries the same data states as a trip, but never Timetable only.
_Avoid_: Flight, plane (in code)

## Realtime

**Answer**:
One reply from Rejseplanen to one call Mylder makes: the whole city's positions, one stop's departures, or one trip's calls. Everything realtime carries the time of the answer that last brought it.
_Avoid_: Response, feed, message (that is SIRI-ET's)

**Update**:
An answer, or the part of one, that revises a trip's calls: expected times, platforms or a cancellation. An update also comes from SIRI-ET, as journeys in SIRI-ET messages: a message carries only some of a journey's calls, so a trip's update is every message about its journey merged.
_Avoid_: Report, prediction, event

**SIRI-ET message**:
One delivery of Rejseplanen's SIRI-ET push feed from Dataudveksleren to the listener: one dataset's XML, received at a moment, carrying one or more journeys. Mylder never asks for it, so it is not an answer.
_Avoid_: Answer, event, push

**Journey**:
A feed's record of one trip, before the tracker joins it to a trip of the timetable: in SIRI-ET, an `EstimatedVehicleJourney`, named by its service day and `DatedVehicleJourneyRef`, with its line, first and last stops, train number and the calls its messages carried; in Rejseplanen's answers, the journey a position or a `journeyDetail` answer names by its reference. A journey that joins no trip stays a journey.
_Avoid_: Trip (before the join), vehicle journey

**Update table**:
The journeys with an update from SIRI-ET that call inside Mylder's box and haven't finished, each with its delays, its cancelled calls and whether it is cancelled, as the listener keeps it for the tracker to read and join to its trips.
_Avoid_: Delay feed, delay cache

**Listener**:
The one always-on process, outside the app, that receives SIRI-ET messages, keeps the update table and serves it over HTTPS, behind a token, for the tracker to fetch on each run.
_Avoid_: Consumer, worker, daemon

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
The trip had realtime, and it stopped: the trip has been missing from the answers for five minutes, or no answers have come for five minutes, or, for a trip with an update from SIRI-ET, its feed has sent no message for five minutes.
_Avoid_: Stale, lost, offline

## Page conditions

**Paused**:
Mylder gets no answers from Rejseplanen, because calls fail or the month's calls are spent. The page says so and why, dots keep moving on what Mylder has, and data states age by the clock. A condition of the page, not a data state.
_Avoid_: Outage, down, No signal (for the page)

**Disconnected**:
The browser's own polls of Mylder fail. The page says so at once, dots keep moving on what the browser has, and data states age by the clock. A condition of the page, not a data state.
_Avoid_: Offline, No signal (for the page)

## Disruptions

**Disruption**:
One of Rejseplanen's messages about the network that belongs to Copenhagen, shown in its own words and language. It is active from its start until its end, and listed under Later when it starts within the next 7 days.
_Avoid_: Alert, incident, notice

**Data card**:
Mylder's own card in the Disruptions list for a gap in its data, such as no answer from Rejseplanen, no positions for a mode or no delays from SIRI-ET's feed for five minutes, shown first and marked as Mylder's.
_Avoid_: System alert, status card
