# SIRI-ET from Dataudveksleren brings delays and cancellations, through one always-on listener

Rejseplanen's SIRI-ET datasets on Dataudveksleren, the national access point, bring every trip's expected times and cancellations for Movia (788), DSB (785), the S-tog (801) and Lokaltog (799), from about an hour before each departure (spec #146). They are pushed over AMQP 1.0 to a subscription on Azure Service Bus and can be read no other way, so one small always-on **listener**, outside Vercel, holds the connection. It feeds each message to the SIRI-ET reader (`src/siri-et/`), which merges each journey's calls across messages and keeps the **update table**: the journeys that call inside the box and haven't finished, with their delays as steps, their cancelled calls and whether they are cancelled whole. The store carries the table from the listener to the tracker, which reads it on each run and joins each journey to its trip. How much of it the listener writes each minute is for the listener's ticket (#217) to settle against the table's measured size: about 112 KB gzipped for 1,282 journeys on a Saturday morning, four times the 15 to 25 KB spec #146 budgeted for a weekday peak, so writing the whole table every minute would spend most of the store's free transfer (`docs/live-data.md`, "SIRI-ET"). The listener runs on one Fly.io machine paid from prepaid credits, about $2.20 a month, which the account can't overspend.

This supersedes ADR 0002 where that ADR makes the Rejseplanen API the only realtime source and drops SIRI-ET, as ADR 0018 began. It amends ADR 0001: Mylder gains one always-on process, for this push feed only. The app stays one Next.js app on Vercel, the tracker stays pull-driven, browsers still poll one cached snapshot, and the listener has no inbound port.

## Considered Options

- **Drain the subscription from the tracker, over AMQP on WebSockets, on each run.** No new host, and the reader would run inside the tracker. Ruled out for now by size: the subscription keeps messages while nobody reads them, so a night with nobody watching leaves hours of Movia's backlog, about 140 MB of XML an hour on a Saturday morning, for the first poll of the morning to read. The reader is one module that runs anywhere, so this can replace the listener without touching the reader or the table.
- **The listener serves its table over HTTPS and the tracker fetches it.** Saves the store's commands, but needs an inbound port, a secret, TLS on the host and a second call inside the tracker's run. Kept as the fallback if the store's budget gets tight.
- **Hetzner Cloud.** Was the choice at €4 a month; over €4 since its 2026 price rises, with no hard cap.

## Consequences

- A trip with an update this service day is Estimated, placed from its timetable plus its delay; a cancelled trip is not drawn. SIRI-ET carries no positions, so nothing it brings is Live or Ageing (ADR 0005), and the Metro and light rail have no dataset, so they stay Timetable only (ADR 0006).
- The update table is the contract between the listener and the tracker: versioned and checked with one schema (`src/siri-et/table.ts`) on both sides.
- A listener that restarts catches up from the subscription's backlog within seconds; no snapshot is sent on subscribe, so a new subscription starts blank.
- The listener's credentials live only in the host's secrets. No recording holds a credential or a subscription id.
- The listener writes less than the whole table each minute, as spec #146 allows: only the journeys that changed since its last write, or the table fetched from the listener over HTTPS (the second option above) if the store can't carry even that. #217 chooses, on the measured size.
- Rejseplanen's licence for the datasets is unsettled: each dataset page says "None". Mylder credits Rejsekort & Rejseplan A/S, under CC BY 4.0 as the Labs guidelines give for its data, until Rejseplanen says otherwise.
