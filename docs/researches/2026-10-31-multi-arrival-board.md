# Rejseplanen's arrival board: is `multiArrivalBoard` offered, and what does it answer?

Research for Mylder, 2026-10-31. Ticket: Take a stop's arrivals from Rejseplanen's arrival board (#170), spec #149.

Question: does Rejseplanen API 2.0 offer `multiArrivalBoard` beside `multiDepartureBoard`, and what does its answer look like?

Research caveat: labs.rejseplanen.dk, where the API's documentation lives, could not be reached from the research environment, so its pages were read only through a web search's snippets, and no saved answer of the service was found. Nothing here was called with a key.

## Short answer

Yes. Rejseplanen Labs' documentation of API 2.0 lists the service: "Arrival boards for multiple stations can be retrieved by a call to the multiArrivalBoard service. This method will return the next arrivals from a given point in time within a duration-covered period" (Confirmed snippet [1]). Labs' notice of the breaking change on 2026-11-25 names "Multi Arrival Board" among the services it touches, for XML answers only (Confirmed snippet [2]).

Its answer is taken to be HAFAS's arrival board, as the departure board is HAFAS's departure board: an `Arrival` list, each with a departure's fields (`JourneyDetailRef`, `ProductAtStop`, `stop`, `stopExtId`, `date`, `time`, `rtDate`, `rtTime`, `track`, `rtTrack`, `prognosisType`, `cancelled`, `reachable`, `Notes`, `Messages`) and `origin`, where the trip comes from, in place of `direction` (Unconfirmed: the HAFAS ReST specification's shape, which no saved Rejseplanen answer has shown). It is asked as the departure board is, with `idList` and `duration`.

## What Mylder does with it

- `src/tracker/rejseplanen/answers.ts` decodes it with `ArrivalBoardAnswer`, every field but the ones a departure needs optional, and the contract fixture `fixtures/arrival-board.json` follows that shape.
- The first day with the key confirms the shape, as it does every other service's (`docs/live-data.md`, "First day with the key"). Should the answer differ, the schema and the fixture change; should the service be refused, a stop's arrivals keep coming from the timetable plus the snapshot's delays, which is what a failed call already gives.

## Sources

1. Rejseplanen Labs, API 2.0 documentation (search snippet): https://labs.rejseplanen.dk/hc/articles/21554723926557
2. Rejseplanen Labs, "Breaking change to Rejseplanen API Wednesday 2026-11-25" (search snippet): https://labs.rejseplanen.dk/hc/da/articles/38992766513565-Current-Breaking-change-to-Rejseplanen-API-Wednesday-2026-11-25
