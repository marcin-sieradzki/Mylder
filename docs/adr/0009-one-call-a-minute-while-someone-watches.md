# One Rejseplanen call a minute, only while someone watches

> Superseded by [ADR 0018](0018-mylder-runs-on-the-timetable-and-siri-et-without-the-rejseplanen-api.md): with no API calls, there is no budget.

The free key allows 50,000 calls a calendar month, which is one call a minute around the clock with 5,360 to spare. Mylder spends the minute on one `journeyPos` call for one Greater Copenhagen box and the spare on `himsearch` every 15 minutes, on stops and vehicles a person opens, and on retries. Polling is pull-driven: the tracker runs only when a browser's poll misses the CDN, a browser polls only while its page is visible, so an evening with no viewers costs nothing and needs no scheduler or watcher count. A pacing rule compares the month's spend with a straight line to 50,000 and degrades in order: on-demand calls stop first, then the poll stretches to 90 and 120 s, then disruptions refresh less often; at 49,500 calls no more are made, and the page says live data is paused until the 1st.

## Considered Options

- Two boxes or two position modes a minute: 89,000 calls a month.
- A fixed daily allowance: wastes quiet days and cannot lend to busy ones.
- Stopping polling to save calls: hours of dead map; stretching keeps every viewer live at a lower rate.
- A cron-driven poll: the host's free plan runs cron once a day, and it would call the API with nobody watching.

## Consequences

Every request with the key is counted before it is sent, in the server store, including failures and retries. The data states depend on the poll interval (Live is judged relative to it), so the snapshot carries the interval and the browser reads it from there. The first day with the key decides which position mode the one call uses; that decision changes which states the map can show at all, and is recorded in `docs/live-data.md`.
