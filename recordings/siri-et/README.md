# SIRI-ET recording

56 minutes of Rejseplanen's SIRI-ET from Dataudveksleren, the four datasets that cover Copenhagen, cut to the journeys that call inside a box round the transit box. For the SIRI-ET reader's tests and the verifier (#212).

## How it was recorded

By the probe of the 2026-10-31 research (`docs/researches/2026-10-31-siri-et-listener.md`, "Measured on 2026-10-31"), run with `scripts/siri-et/record-siri-et.mjs` on the maintainer's Mac on Saturday 31 October 2026. Its first connection, at 09:40:15 Copenhagen time, received each subscription's backlog since it was made and then 5 minutes live; after 10 minutes away, a 1-minute reconnection received everything sent meanwhile. Nothing was lost or delivered twice, so the messages form one unbroken stream.

The cut keeps the window from 09:00:00 to 09:56:08 Copenhagen time (08:00:00Z to 08:56:08Z), the same for every dataset. Each message's `receivedAt` is its enqueued time at the access point's broker: a connected listener receives it within 25 ms of that (1.9 s at most, as measured live), while the probe received the backlog part all at once on connecting.

Made with:

```sh
node scripts/siri-et/cut-siri-et.mjs <probe>/out public/timetable recordings/siri-et 2026-10-31T08:00:00Z
```

## What it holds

- `messages.jsonl.gz`: one message a line, in order of `receivedAt`, as `{ "dataset": "788", "receivedAt": "<ISO>", "body": "<SIRI XML>" }`. A body is the message as sent, single-line SIRI 2.0 XML, minus the `EstimatedVehicleJourney` elements of journeys outside the box. A message left with none is dropped.
- `timetable/`: `public/timetable/` as it was on 1 November 2026, version `2026-11-01-6495dcc6`, whose window (2026-10-19 to 2027-01-13) covers 31 October.
- `clock.json`: the first message's `receivedAt`.

| Dataset           | Messages kept / received | Journey updates kept / received | Journeys | Cancelled journeys | Cancelled call tags |
| ----------------- | ------------------------ | ------------------------------- | -------- | ------------------ | ------------------- |
| 788 Movia         | 664 / 667                | 20,619 / 23,290                 | 1,472    | 2                  | 138                 |
| 785 DSB           | 653 / 947                | 838 / 1,488                     | 69       | 0                  | 0                   |
| 801 DSB S-tog     | 545 / 545                | 723 / 723                       | 111      | 0                  | 7                   |
| 799 Lokaltog      | 228 / 297                | 251 / 337                       | 50       | 7                  | 79                  |

Every journey's `DataFrameRef` is 2026-10-31. Unzipped, the messages are 114 MB, 108 MB of them Movia's; its largest message is 867 KB.

## The box and the join

A journey is kept when any call of it, in any message of the window, is at a stop inside south 55.40, west 11.95, north 56.10, east 12.80 (the timetable's box widened by about 0.05° on each side). Every message about a kept journey is kept, including ones whose calls all lie outside the box, so its calls can be merged from the start.

A `StopPointRef` is looked up among the timetable's platforms (GTFS `stop_id`s with leading zeros removed) and stops. They match as they are: no ref has a leading zero, train and S-tog refs are the seven-digit `86xxxxx` numbers, and Movia's are its own two- to five-digit stop numbers. Of the refs in kept journeys, every DSB, S-tog and Lokaltog ref and 6,969 of Movia's 7,120 distinct refs are in the timetable. The other 151 are Movia's: 98 nine-digit refs starting `980` (`980175804`), on lines 102A, 216, 315, 215, 318, 254, 848 and 847, which no timetable id resembles (its ids have at most seven digits), and 53 ordinary stop numbers, 46 of them on line 327 and the rest on 303, 223, 19 and 350S. The timetable holds only stops on patterns that reach its own box, so a journey that calls only in the widened margin, or only at stops it does not know, is not kept.

## Whose data

Rejsekort & Rejseplan A/S's realtime data, delivered by Dataudveksleren, the Danish national access point. Its licence is not settled: the dataset pages say "None" after login, while the Labs guidelines put Rejseplan data under CC BY 4.0 (see the research above). The recording holds no credential, token or subscription id; `SubscriberRef` (`DK-NAP-SIRI`) and `SubscriptionRef` (`dsb-et`, `movia-et`, `sj-et`, `dsb-s-tog-et`) are the access point's names for each operator's feed, not the account's subscription ids.
