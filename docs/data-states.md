# Data states

The rules that turn Rejseplanen's answers and the timetable into each trip's position on the map and one of the five data states. The words are defined in [`GLOSSARY.md`](../GLOSSARY.md). Every threshold here is provisional until the morning-rush recording (Record an hour of journeyPos at morning rush, #12) measures real coverage, drop-outs and position ages.

## What realtime is

Rejseplanen API 2.0 is the only realtime source. Browsers never call it; they poll Mylder, which polls Rejseplanen while anyone is watching.

- **Positions** come from `journeyPos`: one call for one box around Copenhagen, about once a minute, answering with every trip Rejseplanen has a position for. The request's mode decides what a position is. In `REPORT_ONLY`, every position is a **report**, sent by the vehicle. In `CALC_REPORT`, a position is a report where the vehicle sent one and a **computed position** otherwise, and the answer does not say which is which. So a position from a `CALC_REPORT` answer is treated as computed, always.
- **Call times, platforms and cancellations** come from `departureBoard` or `multiDepartureBoard` when a viewer opens a stop, `multiArrivalBoard` when they open its Arrivals, and from `journeyDetail` when a viewer opens a vehicle. Each is an **update** for the trips it names. `journeyDetail` also carries a last position with no time and no flag; it is a computed position.
- **Disruptions** come from `himsearch` every 15 minutes. They name stops and products, not trips, so they never change a trip's data state.

No position carries a time. A report's or a computed position's **age** is counted from the time of the answer that last carried it, which is when Mylder's server received that answer; the same holds for an expected time. Ages run on by the clock between answers, on the server and in the browser alike, so the browser counts from the snapshot's own time rather than trusting its clock.

The **poll interval** is the time between position answers. It is about 60 s, and stretches to 90 or 120 s when the month's budget is tight (How the API's call budget is spent, #18). If the first day with the key makes Mylder alternate `REPORT_ONLY` and `CALC_REPORT` calls, the interval for reports is two polls, about 120 s. Every snapshot says when the next one is due, so the thresholds below can follow the interval.

## The states

| Data state     | When                                                                                                        | Label                     | Map glyph           |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------- |
| Live           | The trip's latest report is younger than the Live limit: about two polls                                    | "Reported 20 s ago"       | Solid dot           |
| Ageing         | The trip's latest report is older than the Live limit and under 5 min                                       | "Last seen 3 min ago"     | Faint dot, outlined |
| Estimated      | No report under 5 min, but Rejseplanen's realtime still has the trip: a computed position or expected times | "Estimated from schedule" | Hollow dot          |
| Timetable only | No realtime for the trip this service day; placed from the timetable. Every Metro trip                      | "Timetable only"          | Dashed hollow dot   |
| No signal      | The trip had realtime, and it stopped: missing from the position answers for 5 min, or no answers for 5 min | "No signal since 10:42"   | Grey dot, cut       |

Only `REPORT_ONLY` answers can make a trip Live or Ageing. A computed position never counts as Live, however fresh: it is Rejseplanen's estimate, not the vehicle's word. If the first day shows that `REPORT_ONLY` returns nothing useful and Mylder runs on `CALC_REPORT` alone, no trip is ever Live, and the map says so in its legend rather than pretending.

## Choosing the state

Check in this order and take the first that holds. "Position answer" means a `journeyPos` answer of either mode.

1. The trip's latest report is younger than the Live limit: **Live**. One answer it is missing from does not end Live; two do. _An S-tog that appears in answers only every other minute stays Live throughout, labelled with its true age, instead of flickering between Live and Ageing._ _A bus stopped at a red light, whose reported position is the same in three answers running, is Live: each answer carried the report again, so its age is that of the latest answer. Whether Rejseplanen keeps repeating a dead fix for a vehicle that has stopped reporting is for the recording (#12) to show; if it does, an unchanged report gets an age limit._
2. The trip's latest report is under 5 min old: **Ageing**. Its last report is carried forward along the path. _A bus that reported, then dropped out of `REPORT_ONLY` answers while staying in `CALC_REPORT` ones, is Live until the Live limit, then Ageing, then (rule 3) Estimated from its computed position. Its last real fix is worth more than Rejseplanen's guess for those few minutes, and the label says how old it is._
3. A position answer under 5 min old carries a computed position for the trip; or the trip has an expected time, platform or cancellation from an update newer than its last position (or it has never had a position), and a position answer has arrived in the last 5 min: **Estimated**. Mylder works out the position from the computed position or from the timetable plus the trip's delay. _A Timetable only bus whose stop a viewer opens, and whose row carries a prognosis, becomes Estimated and stays so on the timetable plus that delay; Mylder does not ask about it again until someone opens it, so it does not turn No signal for want of asking._
4. The trip has had no realtime this service day: no report, no computed position, no update: **Timetable only**. _Every Metro trip. A bus on a line with no realtime at all._
5. Otherwise: **No signal**, since the time of the last position answer that carried the trip. The trip had realtime, and it stopped. _With `REPORT_ONLY` alone in use, the dropped-out bus of rule 2 is No signal 5 min after its last report, unless a viewer opens it or its stop, which brings an update and makes it Estimated. During an API outage, every trip with realtime is No signal after 5 min; Timetable only trips stay as they are._

Silence is judged per trip against the position answers, because every position answer is a snapshot of the whole city: a trip that should be in it and is not has gone quiet. Updates from opened stops and vehicles are asked for only on demand, so a trip is never No signal because nobody asked about it.

A cancelled trip has no data state on the map: it is not drawn. Its departures show Cancelled.

A departure shows its trip's data state: the expected time when Live or Ageing (the scheduled time when no update gives one), the expected time marked "~" when Estimated, and the scheduled time with the delay unknown, "—", when Timetable only or No signal. A Metro departure shows an interval instead (see The Metro).

## Thresholds

| Threshold      | Rule                                                                                           | At 60 s polls | At 90 s | At 120 s, or alternating modes at 60 s |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------- | ------- | -------------------------------------- |
| Live limit     | 2.5 × the interval between report answers, and never more than 4 min                           | 150 s         | 225 s   | 4 min                                  |
| Ageing ends    | 5 min since the latest report                                                                  | 5 min         | 5 min   | 5 min                                  |
| Fresh realtime | 5 min since the position answer that carried the trip, for Estimated                           | 5 min         | 5 min   | 5 min                                  |
| No signal      | 5 min missing from position answers, or 5 min without any position answer                      | 5 min         | 5 min   | 5 min                                  |
| Waiting        | From 5 min before the trip's first departure                                                   | 5 min         | 5 min   | 5 min                                  |
| Paused notice  | When the latest position answer is older than the Live limit; at once when the budget is spent | 150 s         | 225 s   | 4 min                                  |

The Live limit follows the poll so that one missed answer, whether the trip skipped an answer or a poll failed, does not change a dot's state, while two do. The 5 min bounds are absolute: at 120 s polls, Ageing lasts from 4 to 5 min. All of these are first guesses; the recording (#12) sets them.

Perron's `vehicle-dot.live-threshold` token is 60 s, which suits a feed that reports every few seconds. Mylder's position answers come once a minute at best, so a 60 s limit would turn every dot Ageing between two polls; Mylder computes its Live limit from the poll interval as above, and keeps Perron's 5 min `vehicle-dot.ageing-threshold`. The glyphs themselves are Perron's, as its data-states page draws them: No signal is the grey dot cut by a diagonal slash.

## Times for each call

- A call's expected time comes from the latest update that gives one. A `journeyDetail` gives every call; a departure board gives one.
- Where an update gives expected times for some calls but not later ones, the gaps take the scheduled time plus the latest delay.
- A trip with a report or a computed position but no update moves on its scheduled times, shifted to where its position sits on the path, so the dot doesn't jump back at the next answer. That shift only moves the dot: it is never shown as a delay or an expected time, because dwell at stops and path matching make it a guess. Its departures show scheduled times until an update gives expected ones. If the first day shows that `journeyPos` journeys carry their own call times, those are updates and are shown.
- A trip with no realtime uses scheduled times throughout.
- A trip's delay is kept for the rest of its service day: a No signal trip keeps its last known delay.

## Where a trip is drawn

- A position is always a point on the trip's pattern path. A report or computed position is snapped to the path (How the API's call budget is spent, #18, covers snapping).
- **Live and Ageing:** the latest report, carried forward along the path at the pace of the trip's expected times.
- **Estimated with a computed position:** that position, carried forward the same way. **Estimated without one, and Timetable only:** placed between the call it last left and the next one, interpolated by time along the path, using the call times above.
- **No signal:** keeps moving along its path on the timetable plus its last known delay, drawn in the No signal style. It isn't frozen where last seen, so an outage doesn't look like the city stopped.
- Between snapshots the browser moves every dot along its path on these times, and eases each dot into its new position when the next snapshot lands (What the browser receives and how often, #16).

## Which trips are on the map

- **Waiting:** from 5 min before its first departure, a trip stands at its first stop, labelled "Departs 10:42". With a report there, it is Live at the stop. Without one it is Timetable only or Estimated, and the label never says the vehicle is there. _A Waiting trip at a terminus that shows in a position answer is Live and shows "Departs 10:42"; one that does not is placed at the platform from the timetable._
- **Underway:** from its first departure until it arrives at its last stop, using expected times when it has them. Follow ends when the trip reaches its last stop.
- **Cancelled trip:** not drawn. Its departures stay in stop lists, marked Cancelled. Mylder learns a cancellation only from an update that names the trip, so a cancelled trip can stay on the map as Timetable only or Estimated until a viewer opens its stop or the trip itself. Whether position answers leave cancelled trips out, which would end this sooner, is for the recording (#12).
- **Cancelled calls:** a trip that skips some stops is drawn, and those calls are marked Cancelled.
- **Extra trip:** a trip an answer adds that the timetable lacks. It shows in departure lists, and on the map only if its stops match a known pattern.
- **Inside the box only:** Mylder asks for positions in one box around Greater Copenhagen (`docs/live-data.md`), and the timetable is cut to the same box. A trip whose path leaves the box leaves the map at its edge, and while its timetable puts it outside the box, its absence from position answers means nothing.
- **Beyond the cap:** a position answer that holds exactly as many trips as it may hold (1,000) is incomplete. A trip missing from such an answer is not treated as missing: it keeps its last position and state, aged by the clock, as if that answer had not come. The server records that the cap bit, so the box can be split into halves polled on alternate minutes (#18).

## The Metro

Rejseplanen lists the Metro as single trips with clock times, in departure boards and in the timetable, but the Metro runs to intervals, not to those times: about every 2 to 4 min at rush hour and 3 to 6 min otherwise. Whether Rejseplanen has any Metro positions or realtime is unconfirmed until the first calls with the key. Until they show otherwise, the Metro is an **interval line**:

- **On the map:** every planned Metro trip is drawn as Timetable only, placed from its planned times. The dots show the line's rhythm at the right rate; none of them claims to be a particular train. _At Nørreport at rush hour, M1 and M2 dots pass every 2 to 4 min as planned; each is labelled Timetable only._
- **In departures:** a Metro platform shows an interval, "every 3 min", not countdowns or clock times. The interval is the typical gap between the planned departures in the current hour, in that direction: the middle half of the gaps, so one short or long gap does not widen it. When the ends of that middle half round to different minutes, it shows a range, "every 3 to 4 min". It never says "Timetable only" beside a time it knows the train won't keep.
- **In vehicle detail:** a Metro train's calls are listed without times, with the interval instead. Follow works as for any dot.
- **In City pulse:** Metro trips count among the vehicles on the map, as Timetable only. They are left out of the average delay, which covers Live, Ageing and Estimated trips. In the share reporting per operator, the Metro's row says "Timetable only" rather than a percentage.

If the first calls with the key return Metro positions, or Metro departures with a prognosis, Metro trips get the normal states and departures, and Metro leaves the interval-line rule. The Metro's disruption messages from `himsearch` show as for any product.

## Aircraft

The aircraft over Copenhagen (`docs/aircraft.md`) carry the same words, but never Timetable only: an aircraft has no timetable. Each one arrives with its own position's age and how the position was found, so its state needs no history, and one pure rule, `aircraftState` in `src/domain/aircraft-state.ts`, decides it on the server at fetch time and again in the browser by the clock. Its thresholds hold against the feed as recorded on 26 October 2026 (`docs/aircraft.md`, "Measured"): a tenth of broadcast positions were over 20 s old, and none over readsb's own 60 s.

| Data state | When                                                                       | Label                                | Map glyph           |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------ | ------------------- |
| Live       | A broadcast position younger than the Live limit: two poll intervals, 20 s | "Reported 4 s ago"                   | Solid dot           |
| Ageing     | A broadcast position from 20 to 60 s old                                   | "Last seen 40 s ago"                 | Faint dot, outlined |
| Estimated  | A position from multilateration, TIS-B or any other way, under 60 s old    | "Placed by ground receivers 6 s ago" | Hollow dot          |
| No signal  | A position 60 s old or more, or the feed has failed for over 60 s          | "No signal since 15:42"              | Grey dot, cut       |

A **broadcast** position is one the aircraft sent itself: ADS-B, ADS-R or ADS-C (`adsb_icao`, `adsb_other`, `adsr_icao`, `adsr_other`, `adsc`). A position the ground network worked out by multilateration (`mlat`), relayed as TIS-B (`tisb_icao`, `tisb_other`, `tisb_trackfile`) or found any other way (`other`, `mode_s`) is never Live, however fresh, as a computed position never is (ADR 0005). Check in this order and take the first that holds:

1. The position is 5 min old: the aircraft is dropped, from the snapshot and from the map.
2. The feed has failed for over 60 s, or the position is 60 s old: **No signal**, drawn at its last fix.
3. The position was not broadcast: **Estimated**.
4. It is younger than two poll intervals: **Live**; otherwise **Ageing**.

A position's age is the feed's own (`seen_pos`) at the snapshot's fetch, counted on by the clock, so a stale answer from the CDN and a browser whose polls stop both age truly. _A plane that broadcast its position 12 s before a fetch is Live, turns Ageing 8 s later without a poll, No signal at 60 s, and leaves the map at 5 min. When adsb.lol and adsb.fi both stop answering, each plane keeps the state its age gives it for 60 s, and then every plane is No signal where it was last placed._

## When the answers stop

Two conditions sit above the data states. Neither is a data state; both are notices on the page.

**Paused** is when Mylder's server gets no position answers from Rejseplanen. It shows with its reason: "Rejseplanen hasn't answered since 10:42" when calls fail, the moment the latest answer is older than the Live limit; or "Live data is paused until 1 November: this month's calls are used up" at once when the budget is spent, since the server knows. Meanwhile Mylder serves the last snapshot it has, dots keep moving, and states age by the clock: Live turns Ageing at the Live limit, and every trip that had realtime turns No signal at 5 min. Timetable only trips are unchanged. The first good answer lifts the notice and restores every state at once.

- _The API answers HTTP 500 for 7 min:_ the notice appears after about 2.5 min; at 5 min every bus and train with realtime is No signal, still moving on timetable plus last delay; at 7 min one good answer brings them all back to Live or Estimated.
- _The budget runs out at 18:00:_ the notice names the date; within 5 min every trip with realtime that day is No signal. From the next service day, no trip has had realtime, so the whole city is Timetable only until the 1st. Opening a stop or a vehicle spends no calls either; departures come from the timetable and say so.

**Disconnected** is when the browser's own polls of Mylder fail: a tunnel, a dead network, Mylder itself down. The notice shows at once, "Connection lost, reconnecting", because the browser knows at once. Dots keep moving on what the browser has, and states age by the clock under the same rules the server runs, so the browser needs nothing new to be honest.

- _A tunnel for 2 min at 60 s polls:_ the notice, ages in the labels growing, nothing else; the next good poll clears it and the dots ease into fresh positions.
- _A tunnel for 8 min:_ Live dots turn Ageing at 150 s and, with every other trip that had realtime, No signal at 5 min, each labelled "No signal since" the time of the last snapshot that carried it. Timetable only dots are unchanged. Back online, one snapshot restores everything.

When both hold, Disconnected is the notice shown: the browser cannot learn anything else until it reconnects. A Paused notice that arrived in the last snapshot is kept beneath it.
