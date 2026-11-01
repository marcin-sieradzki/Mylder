# SIRI-ET as Mylder's source of delays and cancellations before the key

Research for Mylder, 2026-10-31. Question: can Rejseplanen's SIRI-ET, from the national access point Dataudveksleren, give the map delays and cancellations while the Rejseplanen API key (#23) is still missing, and what would it take to receive it on a budget of at most €4 a month? This reverses the decision of ADR 0002 to drop SIRI-ET, at the maintainer's request, and builds on the timetable source of spec #144.

It builds on the delivery research of 2026-10-25, [`2026-10-25-siri-et-netex-delivery.md`](2026-10-25-siri-et-netex-delivery.md) (issue #5), and does not repeat its sources. Labels as there:

- **Confirmed**: in the owner's own words (a quoted snippet of the primary page, or a primary file read in full).
- **Reported**: from a secondary source, such as another project's notes or code, or a pricing aggregator.
- **Unconfirmed**: no source found, sources disagree, or an estimate.
- **Estimate**: worked out here from other figures; the working is shown.

Research caveat: this environment still cannot open labs.rejseplanen.dk, any dataudveksler.app.vd.dk host (including the anonymous catalogue API) or vejdirektoratet.atlassian.net; they are refused by the sandbox's proxy. Facts about the broker rest on the earlier research, a public example client read in full [1] and a public survey note read in full [2]. The dataset list, address format and guides were then checked on the maintainer's logged-in account ([Seen on the portal after login](#seen-on-the-portal-after-login)). The facts no page gives were then measured with a short recording ([Measured on 2026-10-31](#measured-on-2026-10-31)).

## Short answers

**Protocol.** Push only. Each operator's SIRI-ET is an event dataset; a subscriber links a service account to it and receives XML over AMQP 1.0 from Azure Service Bus at `sb-duvproddistribution.servicebus.windows.net:5671`, as a subscription on a topic, authorised by an Entra ID client-credentials token (scope `https://servicebus.azure.net/.default`) put on the connection with a CBS `put-token` and renewed every 15 minutes (Reported, example client read in full [1]; Confirmed for the mechanism in the earlier research). The access point offers no SIRI request/response, no SIRI-Lite and no HTTP push to a subscriber's endpoint: the survey note calls it "the only publicly accessible SIRI-over-AMQP endpoint in Europe", every other access point serving SIRI over HTTP (Reported [2]). So there is no way for the feed to post to a Vercel route.

**Could Vercel pull it instead?** Possibly, but not proven. Azure Service Bus can also be read over AMQP on WebSockets (port 443) and over HTTPS, one message per request, so a Vercel function could drain the subscription each time the tracker runs, as it already does for Rejseplanen, with no always-on process (Unconfirmed: general Service Bus behaviour, not tested against this broker). Whether that is sane depends on things only the account shows: how long the subscription keeps messages while nobody reads them, how big it may grow, and how many messages arrive. A subscription that holds hours of messages turns the first poll of the morning into a backlog of thousands; a full one may be disabled by the access point. And parsing every message inside the tracker's runs spends Vercel Hobby's 4 hours of active CPU a month [6]. See [Where the listener runs](#where-the-listener-runs).

**Which datasets cover Copenhagen.**

| Mode                       | Dataset                                     | Status                                                                                                                  |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bus (Movia, all operators) | Realtime data for Movia, #788               | Reported; 20 subscribers in May 2026 [2]                                                                                |
| S-tog                      | Realtime data for DSB S-trains, #801        | Confirmed: seen in the catalogue after login, 2026-10-31                                                                |
| Train (DSB)                | Realtime data for DSB, #785                 | Confirmed (earlier research)                                                                                            |
| Train (complete)           | Banedanmark Journeys                        | Not in the catalogue on 2026-10-31: the DSB and Lokaltog pages name it, but no dataset by that name exists              |
| Train (Lokaltog)           | Realtime data for Lokaltog on Zealand, #799 | Reported [2]                                                                                                            |
| Metro                      | none                                        | Confirmed absent: no Metroselskabet dataset in the catalogue on 2026-10-31. The Metro stays an interval line (ADR 0006) |
| Light rail (Letbane)       | none                                        | Confirmed absent: no Hovedstadens Letbane dataset on 2026-10-31 (only Aarhus Letbane, inside Midttrafik's #783)         |

Arriva and the other bus operators on Zealand run under contract to Movia, so their trips should be in #788 (Unconfirmed, inference). The datasets carry expected arrival and departure times and cancellations (the SIRI `EstimatedVehicleJourney` with its `EstimatedCalls` and `Cancellation`), and no positions: the access point's records exclude vehicle monitoring (Reported [2]). Updates for a trip start about 1 hour before its first departure (Confirmed, earlier research).

**Volume.** Not published. An estimate, to be replaced on the first day:

- Movia runs about 20,000 trips a day with 700,000 calls in all (Reported, 2020 [3]). The S-tog, DSB and Lokaltog add perhaps 3,000 trips and 60,000 calls on Zealand (Estimate, from the timetable's 20,000 trips a weekday inside Mylder's box, of which buses are most).
- "One message per journey update", and "a message can contain updates to one or several journeys" (Confirmed, earlier research). If a trip gets an update at most once per call, that is about 0.8 million messages a day, an average of 11 a second over a 20-hour service day and perhaps 30 to 40 a second at the morning peak (Estimate). If prognoses are revised between calls, it is more.
- A message holds the trip's calls, each with stop, aimed and expected times: perhaps 2 to 15 KB of XML (Estimate, from the SIRI schema's element sizes and 20 to 40 calls a trip). That is about 2 to 12 GB of XML a day, received and never stored.

**Listener memory.** Small. What must be held is the latest state of each trip with an update this service day: about 25,000 trips at most, of which only those inside Mylder's box and not yet finished matter, about 3,000 at the peak. A compact record per trip (journey reference, line, first stop and aimed first departure, latest delay and its call, cancelled calls) is under 200 bytes, so a few megabytes (Estimate). A Node process with a streaming XML parser and an AMQP client sits around 60 to 100 MB, which fits a 256 MB machine. CPU: at 40 messages a second of 15 KB, about 0.6 MB/s of XML, a few percent of one core (Estimate). Measure both on the first day.

**Join to Mylder's trips.** The tracker already joins a Rejseplanen journey to a trip of the current service day by (line, first stop, first departure minute), resolving the rest by direction and last stop (`docs/timetable.md`, "The join"). A SIRI journey carries the same pieces: `LineRef`, its first `EstimatedCall`'s `StopPointRef` and `AimedDepartureTime`, its last call, and its `DataFrameRef`, the operating day (Confirmed for the schema, earlier research). The Danish feeds are matched to Rejseplanen's plan data before they are sent (Confirmed), and the survey note expects `LineRef`, `StopPointRef` and `OperatorRef` to line up with the Labs GTFS (Reported [2]). So the join reuses the existing index, with stop ids compared without leading zeros, and does not depend on `DatedVehicleJourneyRef` equalling a GTFS `trip_id`. Whether `LineRef` is the public line name (5C) or an internal id, and whether trains carry the train number, is for the first day to log.

**Cost.** One always-on listener on the smallest machine:

| Host                          | Monthly                             | Hard cap                                                                                         | Notes                                                                                          |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Fly.io, shared-cpu-1x 256 MB  | about $1.94 to $2.19 [4]            | Yes, with prepaid credits: the account is suspended at zero, never billed further (Reported [9]) | Outbound only, so no dedicated IPv4 ($2 more) is needed. $25 of credits lasts about 11 months. |
| Hetzner Cloud, CX23           | about €5.49, or €5.99 with IPv4 [5] | Flat price                                                                                       | Over the €4 limit since Hetzner's 2026 price rises, and reported as often unorderable [5].     |
| Oracle Cloud Always Free      | €0                                  | Free tier                                                                                        | Fiddly sign-up; idle free instances can be reclaimed.                                          |
| Vercel only (drain on demand) | €0                                  | Hobby limits                                                                                     | Unproven; see above.                                                                           |

The store adds nothing if it stays inside the free Redis tier ([The store's budget](#the-stores-budget)). So Fly.io with prepaid credits, about $2.20 a month, is the one host under €4 with a hard cap. Hetzner was the preferred host when the price was €4; it no longer is.

**Licence.** Every Rejseplan SIRI dataset page shows "Licence: None" after login (Confirmed, 2026-10-31), although an earlier catalogue capture recorded Movia and Lokaltog as CC BY 4.0 (Reported [2]) and the Labs guidelines put Rejseplan data under CC BY 4.0. Ask Rejseplanen which applies before launch. Until then, credit "Rejsekort & Rejseplan A/S" in the About dialog and the map's credits, as for the timetable.

## Where the listener runs

Three shapes were weighed.

1. **An always-on listener that writes a compact table of delays to the server store every minute; the tracker reads it on each run.** The listener holds one AMQP connection all day and keeps each trip's latest state in memory. Nothing in the app changes shape: the tracker stays pull-driven, the browser still polls one cached snapshot, and the listener has no inbound port. Costs about $2.20 a month on Fly.io. The listener is the tracker's "move to an always-on service later" that ADR 0001 left room for, but only for this one feed.
2. **The tracker drains the subscription itself, over AMQP on WebSockets, each time it runs.** No new host. Rejected for now, not ruled out: it depends on the subscription's message lifetime and size limits, which only the account shows, and on the message rate, which only a recording shows. If both turn out small (messages expire within minutes, a few hundred a minute), the same reader can run inside the tracker and the listener can be turned off. Keeping the reader one module, with the AMQP connection a thin shell around it, keeps this door open.
3. **The listener serves its table over HTTPS and the tracker fetches it.** Saves the store's commands, but needs an inbound port, a shared secret, TLS on the host and a second network call inside the tracker's run, and fails harder when the listener is down. Kept as the fallback if the store's budget gets tight.

### The store's budget

Spec #56 puts the server store on Upstash's free Redis: 500,000 commands and 10 GB of transfer a month [7], of which the tracker, watched around the clock, would use about 310,000 commands and 7 GB (`docs/live-data.md`). Shape 1 adds one write a minute from the listener and one read per tracker run: at most 86,400 commands a month, 396,000 in all. The table, filtered to trips that call inside Mylder's box and have not finished, is about 3,000 records at the peak; written compactly and gzipped it should be 15 to 25 KB, so about 0.6 to 1.1 GB written and the same read in a month around the clock, 8.2 to 9.2 GB in all (Estimate). That fits, with little room. If the first day measures more, the listener writes only the trips whose state changed since the last write and the tracker keeps the rest from its history, or shape 3 takes over.

## What this means for the data states

- A trip with a SIRI-ET update this service day is **Estimated**: Mylder places it from its timetable plus its delay, as `docs/data-states.md` rule 3 already allows for a trip with an update and no position. Its departures show expected times marked "~".
- A **cancelled trip** is not drawn, and its departures say Cancelled. A cancelled call is marked so. Until now a cancellation was only learnt from an opened stop or vehicle; SIRI-ET brings every one, about an hour ahead.
- A trip with no update stays **Timetable only**. Every Metro trip stays Timetable only, as an interval line.
- **No signal** has to be judged on the feed, not the trip: SIRI-ET sends a trip's update when something changes, so a trip with no new message for five minutes may simply be on time. Per-trip silence is not judged until the first day shows how often an active trip is updated. The feed as a whole going quiet for five minutes (the listener's heartbeat in the store stops, or it has received nothing) turns every trip with realtime No signal, as a missing position answer does today.
- No trip is ever **Live** or **Ageing** from SIRI-ET: it carries no positions (ADR 0005).
- When the key arrives, positions from `journeyPos` sit on top: a trip with a report is Live or Ageing, and SIRI-ET still gives its expected times and cancellations, saving the on-demand `departureBoard` and `journeyDetail` calls the budget now pays for.

## Seen on the portal after login

Checked on 2026-10-31 on the maintainer's account (Confirmed):

- Each subscription's AMQP address has the form `amqps://sb-duvproddistribution.servicebus.windows.net/t-distribution-<dataset>/<subscription id>`: one Azure Service Bus topic per dataset, and a subscription of the subscriber's own on it. Authentication uses the service account's id (an Entra client id), the tenant id and the service account's password.
- The Rejsekort & Rejseplan realtime datasets are 783 Midttrafik and Aarhus Letbane, 785 DSB, 786 Sydtrafik, 787 NT, 788 Movia, 789 DSB Vores Tog, 790 Fynbus, 799 Lokaltog on Zealand, 800 Öresundståg and Skånetrafiken, 801 DSB S-trains and 808 BAT; 242 is the NeTEx timetable. For Copenhagen: 788, 801, 785 and 799, and 800 for the Øresund trains.
- The guides describe the feed as SIRI-ET for the current day, split by operator, reachable only by linking a service account to each event dataset. The HTTP download with a client-credentials token covers static, dynamic and geodata datasets only, never event datasets. So there is no HTTP way to the feed beyond what Azure Service Bus itself offers.
- No guide or dataset page says anything about message lifetime, subscription size, a snapshot on subscribe or the update rate.
- A lost service account password cannot be reset; a new account has to be made and subscribed again.

## Measured on 2026-10-31

A probe (`scripts/siri-et/`) ran on the maintainer's Mac on Saturday 31 October 2026, 09:40 to 09:56 Copenhagen time: 5 minutes connected to all four subscriptions, 10 minutes disconnected, then 1 minute reconnected. Sign-in worked first time on all four. Saturday morning is quiet, so the rates are a floor, not the weekday peak. Everything below is Confirmed by that run.

**Messages are kept while the subscriber is away.** Nothing was lost across the 10-minute gap: on reconnecting, every subscription delivered all its messages from the moment of the disconnect, within the first 30 seconds. The first connection also received everything since each subscription was made, 40 to 55 minutes earlier. So there is no snapshot on subscribe, but a backlog: a restarted listener catches up rather than starting blank. How long a subscription keeps messages, and how many, is still unknown beyond about an hour.

**Rates and sizes,** counting only messages sent after connecting:

| Dataset      | Messages a second | XML a second | Median message      | Journeys a message | Calls a journey |
| ------------ | ----------------- | ------------ | ------------------- | ------------------ | --------------- |
| 785 DSB      | 0.4 to 0.6        | about 2 KB   | 3 KB                | 1.6                | 3.3             |
| 788 Movia    | 0.2 to 0.3        | about 39 KB  | 125 KB (max 930 KB) | 35                 | 11              |
| 799 Lokaltog | 0.1 to 0.2        | about 0.5 KB | 3.5 KB              | 1.1                | 5.4             |
| 801 S-tog    | 0.2 to 0.3        | about 1 KB   | 2 KB                | 1.4                | 4.3             |

Movia batches about 35 journeys a message and is 95 % of the volume. In all, about 45 KB of XML a second on a Saturday morning, so perhaps 100 to 150 KB/s at a weekday peak and 4 to 8 GB a day: an always-on listener on a small machine handles it easily. From sent to received took under 25 ms at the median and 1.9 s at most. Bodies are plain, single-line SIRI 2.0 XML, not compressed; `ProducerRef` `RKRP_RTH`, one `SubscriptionRef` per operator (`dsb-et`, `movia-et`, `sj-et`, `dsb-s-tog-et`).

**What a journey carries.** `RecordedAtTime`, `LineRef`, `DirectionRef`, `FramedVehicleJourneyRef` (`DataFrameRef` the service day, `DatedVehicleJourneyRef` such as `2727-8600351300000`), `PublishedLineName`, `OriginRef`, `DestinationRef`, `OperatorRef`, `ProductCategoryRef`, `Monitored`, `PredictionInaccurate`, `TrainNumbers`, and `RecordedCalls` and `EstimatedCalls` with `StopPointRef` and aimed and expected arrival and departure times (local time with offset). Cancellations come as `Cancellation` (94 Movia journey updates in 5 minutes). No positions.

**`IsCompleteStopSequence` is false.** A message carries only the calls that changed or are near, not the whole trip: 3 to 11 calls a journey. A journey's first call in a message is often not its first stop. This changes the join (below) and means the listener must merge each message's calls into what it already holds for the journey.

**Identifiers.**

- `LineRef` is the public line name for buses, S-tog and Lokaltog (`5C`-style: `365R`, `68`, `C`, `210R`). For DSB trains it is the train number (`2727`); `PublishedLineName` then reads `Re 2727` or `IC 4128`, so the GTFS route name comes from its product prefix.
- `TrainNumberRef` is present on every journey, trains and buses alike (`36500016` for a Movia trip); for trains it should equal GTFS `trip_short_name`.
- Train and S-tog stops are seven-digit `86xxxxx` numbers, as in the API; Movia's are its own stop numbers (`6120`, `45880`). Both should equal the Labs GTFS `stop_id` with its leading zeros removed; the timetable job's stops confirm it.
- `OriginRef` and `DestinationRef` name the trip's first and last stops even when those calls are not in the message.

**What it changes.**

- **The join** cannot rely on the first call's aimed departure. It keys on (line, origin, destination, service day) and then on any call in the message: the trip whose pattern has that stop at that aimed time. For trains, the train number first.
- **Draining from Vercel (shape 2)** is no longer ruled out by lost messages, since they are kept. It is still ruled out for now by size: an evening with nobody watching leaves hours of Movia backlog, about 140 MB of XML an hour, for the first poll of the morning to read. The listener stays the plan.
- **The listener restarts cheaply:** it reconnects and reads what it missed.

## Still unknown

1. **How long a subscription keeps messages, and how many**, beyond the hour measured. Decides how long the listener may be down before it loses updates, and whether draining from Vercel could ever work.
2. **The weekday peak rate**, which the listener's minute log line measures once it runs.
3. **How often an active trip is updated** when nothing changes. Decides whether silence can ever be judged per trip.
4. **Whether every Movia `StopPointRef` is a Labs GTFS `stop_id`**, which the reader's tests check against the timetable.

## Sources

Read in full for this note, beyond those of the 2026-10-25 research:

1. Example AMQP client for Dataudveksleren, README and `getData.js` (read): https://github.com/NPRA/DataudvekslerenAMQP
2. Survey note on the Danish access point's SIRI over AMQP, with records #788 and #799 captured in May 2026 (read, secondary): https://github.com/clemensv/real-time-sources/blob/main/tools/candidates/transit/dk-nap-siri-amqp.md

From search results:

3. Trafikdage, Aalborg University, 2020, "Data i Movias busser": 20,000 trips and 700,000 departures a day (snippet): https://journals.aau.dk/index.php/td/article/download/6208/5470/19273
4. Fly.io resource pricing, shared-cpu-1x 256 MB at $1.94 a month (snippet), and reports of a rise to $2.19 from 1 October 2026 (Reported): https://fly.io/docs/about/pricing/ and https://www.buildmvpfast.com/blog/fly-io-pricing-2026-ram-increase-vs-hetzner
5. Hetzner Cloud prices and availability in October 2026 (Reported): https://dev.to/hostingsift/is-hetzner-still-the-cheapest-vps-we-priced-24-alternatives-october-2026-271g and https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/
6. Vercel fluid compute pricing, 4 hours of active CPU on Hobby (snippet): https://vercel.com/docs/fluid-compute/pricing
7. Upstash free tier, 500,000 commands a month (Reported): https://upstash.com/blog/upstash-vs-aws-elasticache-serverless-redis-pricing-and-performance-2026
8. Azure Service Bus topic size and message lifetime, and the failure when a subscriber stops reading (Reported, older Microsoft docs): https://learn.microsoft.com/en-us/rest/api/servicebus/create-topic and https://learn.microsoft.com/en-us/archive/blogs/cie/service-bus-error-the-maximum-entity-size-has-been-reached-or-exceeded-for-topic
9. Fly.io prepaid credits, and staff on its forum saying there is no spending cap other than them (Reported): https://fly.io/docs/about/credit-cards/ and https://community.fly.io/t/set-a-billing-cap/24810
