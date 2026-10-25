# The Metro is an interval line, shown as Timetable only with intervals instead of times

Rejseplanen and the Labs GTFS list the Metro as planned trips with clock times, but the Metro runs to intervals and doesn't keep those times, and whether the API has any Metro realtime is unconfirmed. Mylder draws every planned Metro trip as a Timetable only dot, so the map shows the line's rhythm at the right rate without claiming any dot is a particular train, and shows an interval ("every 3 min", worked out from the planned departures in the hour) wherever it would otherwise show a Metro departure time. Metro trips are left out of delay figures. The rule lifts for any Metro line the API turns out to have positions or realtime for.

## Considered options

- Leave the Metro off the map until a source exists. Rejected: a Copenhagen map without the Metro looks wrong, and labelled planned trips are honest.
- A sixth data state for the Metro. Rejected: Timetable only already says what is known; running to an interval is a property of the line, not of a trip.
- Show the planned clock times, marked Timetable only. Rejected: a time the train is known not to keep misleads.

## Consequences

Departure lists, vehicle detail and City pulse each need one Metro branch. "Headway trip" leaves the glossary; "Interval line" and "Interval" replace it.
