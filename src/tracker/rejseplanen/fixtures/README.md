# Contract fixtures

Hand-written Rejseplanen API 2.0 answers, one per service and case, modelled on the saved live answers and the HAFAS ReST specification the API research read (`docs/researches/2026-10-25-rejseplanen-api-2.md` on branch `research/rejseplanen-api-2`), not copied from them. `answers.test.ts` decodes each with its schema, so a schema change that breaks a known answer fails.

- `journey-pos.json`: two journeys, one with `Stops` and `JourneyPath`, one without. No saved `journeyPos` answer exists, so this follows the specification.
- `journey-pos-empty.json`: an answer with no journeys, which leaves out the list.
- `departure-board.json`: an S-tog departure running late, a cancelled one, and a Metro departure with no prognosis.
- `journey-detail.json`: three calls, one cancelled, a last position and the trip's own message with its call range.
- `him-search.json`: an active message whose note holds a note (the 2026-11-25 change) and a later one.
- `error-refused-key.json`, `error-quota.json`: **best guesses.** A client reports `API_AUTH` for a refused key; the quota error is invented. Both are corrected from the first real error answers.

The data in them is made up. Stop ids are real, so the shapes line up with the timetable.
