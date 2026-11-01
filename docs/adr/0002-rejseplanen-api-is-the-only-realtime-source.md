# Rejseplanen API 2.0 is the only realtime source

> Amended by [ADR 0018](0018-mylder-goes-public-on-the-timetable-and-siri-et-and-adds-the-api-with-the-key.md): until the key arrives, Mylder runs on the timetable and SIRI-ET, and SIRI-ET stays after it.

All of Mylder's realtime data comes from Rejseplanen API 2.0, polled by the app's server on the free key's 50,000 calls a month: `journeyPos` for positions, `departureBoard` and `journeyDetail` for call times and cancellations, `himsearch` for disruption messages. We dropped SIRI-ET and NeTEx from the national access point (Dataudveksleren), although SIRI-ET is the richer feed, because it is pushed over AMQP and needs an always-on consumer or a store, which ADR 0001 rules out on cost. No other official live source covers Copenhagen: there is no GTFS-Realtime for Denmark, the operators publish no live APIs of their own, and the only other live endpoints found are undocumented.

## Consequences

- Nothing live works until the key arrives, and the whole app shares one call a minute.
- Positions carry no timestamp and no reported-or-computed flag, so the data-state rules lean on how each answer was requested (see `docs/data-states.md`).
- Using the data commercially would need a paid agreement with Rejseplanen; Mylder stays non-commercial.
