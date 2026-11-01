# Mylder goes public on the timetable and SIRI-ET, and adds the Rejseplanen API when the key arrives

Mylder's first public version no longer waits for the Rejseplanen API 2.0 key (#23). It runs on what needs no key: the Labs GTFS timetable, which the daily job prepares from the Mobility Database's public copy (ADR 0010), as the default source (#144), and Rejseplanen's SIRI-ET datasets on Dataudveksleren, which bring every trip's expected times and cancellations for Movia, DSB, the S-tog and Lokaltog about an hour ahead (#146). When the key arrives, the API joins on top as #35 describes: `journeyPos` brings reported positions, so Live and Ageing dots, and `himsearch` brings disruption messages, under the call budget of ADR 0009. This amends ADR 0002: the API is no longer the only realtime source, and SIRI-ET is no longer dropped.

## Considered Options

- **Keep waiting for the key before going public.** The deployment (#40), the store (#56) and every API ticket stay blocked on a manual approval with no date.
- **Drop the API for good.** Simpler, with no budget and no second realtime path, but Mylder would never show a reported position, which is what the data states were built around.

## Consequences

- Until the key, no trip is Live or Ageing: SIRI-ET carries no positions, and no Danish SIRI-VM feed exists. A trip with a SIRI-ET update this service day is Estimated, placed from its timetable plus its delay; every other trip, and every Metro and light rail trip, is Timetable only (ADR 0005 and ADR 0006 stand). The Disruptions screen has no messages until `himsearch`.
- The deployment and the store no longer wait for the key: #40 and #56 belong to the first public version (#26), not to going live on the API (#35).
- The API code (`src/tracker/rejseplanen/`, the budget, the on-demand calls, the position mode and `MYLDER_SOURCE=rejseplanen`) stays, as do the simulation and recordings that speak the API's answers. `docs/live-data.md`, `docs/data-states.md` and `docs/screens.md` keep describing it.
- With the key, SIRI-ET still brings delays and cancellations city-wide, so the on-demand `departureBoard` and `journeyDetail` calls matter less than the budget assumed.
