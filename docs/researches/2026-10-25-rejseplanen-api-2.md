# What Rejseplanen API 2.0 returns for positions, departures and disruptions

Research for Mylder, 2026-10-25. Ticket: issue #22.

Research caveat: this environment could not open labs.rejseplanen.dk, labs.rejseplan.dk, www.rejseplanen.dk, www.rejseplan.dk or rkrp.hafas.cloud. So no WADL, XSD or Labs article was read in full. Facts from those pages come from quoted search snippets, marked "(snippet)". Public GitHub files, including live API responses that other projects saved, were read in full. Each claim carries a label:

- **Confirmed**: in Rejseplanen's own words (a snippet of a Labs page), or seen in a live Rejseplanen response saved by another project.
- **Confirmed (HAFAS)**: in HaCon's generic HAFAS ReST specification (an OpenAPI file from another deployment, version 2.45.2). Rejseplanen runs version 2.53 with its own dialect, so this is likely but not proven for Rejseplanen.
- **Reported**: from a secondary source, such as another project's notes, code or hand-written test data.
- **Unconfirmed**: no source found, or sources disagree.

## Short answers

**`journeyPos`.** The required parameters are the bounding box only: `llLat`, `llLon`, `urLat`, `urLon` (Confirmed (HAFAS) [6]; the same names in a Rejseplanen client [12]). `products` (a bitmask), `lines`, `operators` and `jid` are optional filters (Confirmed (HAFAS) [6]; Labs says it filters by operator, product and line, Confirmed snippet [1]). `maxJny` caps the answer at 1,000 journeys, which is also the default (Confirmed (HAFAS) [6]). No position carries a "reported" or "calculated" flag, and none carries its own timestamp. Instead the request picks the kind with `positionMode`: `REPORT_ONLY` (the default), `CALC_REPORT` or `CALC` (Confirmed (HAFAS) [6]; Rejseplanen's WADL says the same, Reported [8]). The only time is the response's `planRtTs`, when the realtime data was last updated (Confirmed in `journeyDetail` and `departureBoard` responses [10]). Which modes it covers is Unconfirmed: no saved Rejseplanen `journeyPos` response was found. Each journey carries a `JourneyDetailRef` (Confirmed (HAFAS) [6]). Its journey number and day (`ZI` and `DA`) stay the same across calls during a day (Reported [9]).

**`departureBoard` and `journeyDetail`.** Both carry realtime times (`rtTime`, `rtArrTime`, `rtDepTime`), a `prognosisType` (`PROGNOSED` or `CALCULATED` seen), cancellations (`cancelled`, `reachable: false`; per stop `cancelledArrival` and `cancelledDeparture`) and realtime tracks (`rtTrack`, `rtPlatform`) (Confirmed [10]). `rtTime` is left out when the prediction equals the timetable (Reported [9]). `journeyDetail` carries `lastPos`, a latitude and longitude with no time and no "reported" flag (Confirmed [10]). The Metro appears in departure boards as single departures with clock times, product class 1024, category `MET` (Reported [13][15]). It does not appear as a frequency. Whether Metro departures carry realtime is Unconfirmed.

**`himsearch`.** A message has an `id`, `head`, `lead`, `text`, `company`, `category`, `priority`, a `products` bitmask, start and end times, and the stops it affects (`affectedStops`, `validFromStop`, `validToStop`) (Confirmed [10]). The live answer named no lines and no trips, and held at most 100 messages (Reported [9]). The generic service can return lines and trips (`affectedProduct`, `affectedJourney`) and filter by line, stop or bounding box (Confirmed (HAFAS) [6]), but no one has tested that on Rejseplanen (Unconfirmed). `journeyDetail` links messages to one trip directly: it embeds them, with the stop range they cover (Confirmed [10]).

**Budget.** The free tier is 50,000 calls a month for non-commercial use. More is commercial use (Confirmed snippet [1]). Every request with the key counts as one call, whatever the service (Reported [5][15]). One `multiDepartureBoard` call covers several stops (Reported [13][15]). No per-minute limit was found (Unconfirmed). Nothing found allows or forbids caching one answer and showing it to many viewers (Unconfirmed). The guidelines ask you not to alter data so it can be misread (Confirmed snippet [3]).

**Change on 2026-11-25.** Labs announced a breaking change to the API for Wednesday 2026-11-25 (Confirmed snippet [4]). Its text, as an earlier search quoted it, says XML `Note` elements may now nest inside each other (Confirmed snippet [4][21]). A client's documentation says JSON answers are not affected (Reported [16]).

**Join to Labs GTFS.** Stop ids match after padding: the API says `8600626`, the GTFS says `000008600626` (Reported [9]). Trip ids do not match. The API has no GTFS `trip_id`; one bridge matched 44,276 of 44,319 trips in a day by stop sequence and timetable times, with none wrong (Reported [9]).

**Why `journeyPos` returned nothing.** The October 2026 report is a GTFS-Realtime bridge's notes, observed 2026-10-08/09. They say: "`journeyPos` returned no data with a Labs key" [9]. The notes give no request, and the bridge's code has no `journeyPos` call, so its parameters are unknown. The likeliest explanation: `positionMode` defaults to `REPORT_ONLY`, which returns only positions that vehicles reported (Confirmed (HAFAS) [6]). If few vehicles report GPS to Rejseplanen, that answer is empty, while `journeyDetail`'s `lastPos` can still be computed. This is an inference (Unconfirmed). Rejseplanen's own live map colours each vehicle by delay, which fits computed positions (Reported [18]). No source mentions per-key permissions for `journeyPos` (Unconfirmed). A refused key gets an `API_AUTH` error such as "access denied for …" (Reported [15]), so a key without access would likely see an error, not an empty list (Unconfirmed).

## What this means for poll-only-while-watching

**Calls per viewer-minute: zero.** Browsers call Mylder's cached route, never the API. API calls depend on the cache time, not on viewers.

**The budget is one call a minute.** A 31-day month watched around the clock at one call a minute uses 44,640 calls. That leaves 5,360. `himsearch` every 15 minutes uses 2,976 of them. So the steady state is one position call a minute plus `himsearch` every 15 minutes, about 47,600 calls (arithmetic on [1]). Any second call each minute breaks the budget. Hours with no viewers save calls, which can pay for calls on demand (below).

**Which call carries which data state:**

| State          | Source call                                                                                                                                                                                                          | Cost                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Live           | `journeyPos`, `positionMode=REPORT_ONLY`, one fixed Copenhagen bounding box. A position here was reported by the vehicle. Its age is not given, so the server counts age from when it first saw the position change. | 1 call a minute                 |
| Ageing         | The server keeps the last reported position of each journey and its first-seen time. No extra call.                                                                                                                  | 0                               |
| Estimated      | `journeyPos` with `CALC_REPORT` returns computed positions too, but without saying which are which. Or the browser computes positions from GTFS plus a delay from `departureBoard` or `journeyDetail`.               | 1 more call, or calls on demand |
| Timetable only | Labs GTFS alone. A departure with no `prognosisType` has no realtime data [9].                                                                                                                                       | 0                               |
| No signal      | A journey that left the `journeyPos` answer, an API error, or a spent budget.                                                                                                                                        | 0                               |

**Use `journeyDetail` and `departureBoard` on demand only.** `journeyDetail` gives one trip per call: full stop times, cancellations and `lastPos`. It suits a viewer tapping a vehicle, cached per trip ref. `multiDepartureBoard` suits the stop view. Neither scales to a whole-city map: tracking every running trip with `journeyDetail` takes 30 to 60 calls a second at peak (Reported [9]).

**Treat `lastPos` as Estimated, not Live.** It has no time and no source flag. In one saved answer, an S-tog sat about 70 m from København H five seconds before its timetabled, on-time arrival there (Confirmed [10]). That fits a computed position, though one sample cannot prove it.

**Tests for the first day the key works** (one call each):

1. `journeypos` over Copenhagen with `REPORT_ONLY`. Count journeys per product class.
2. The same with `CALC_REPORT`. The journeys only in this answer are computed. If this count is near 1,000, the cap bites; split the box or the products.
3. Read every field of one journey in the answer, especially anything like a time, `Stops` or `JourneyPath`.
4. `journeyDetail` on a journey from step 1. Compare its `lastPos` with the `journeyPos` position.
5. `himsearch` with `affectedJourneyMode=ALL` and with `lines=` set, to see if lines and trips come back.
6. Fetch `journeypos?wadl=` and the XSDs linked from the "Om API 2.0" page. Save them in the repo.

**Ask Labs in writing** whether a public, free site may show one cached answer to many viewers. Keep their reply.

**Other risks:**

- On 2026-10-07 the API's host name moved from www.rejseplanen.dk to www.rejseplan.dk, and the old one redirects (Reported [17]). A redirect to another host can drop an `Authorization` header (Reported [17]). Passing `accessId` in the query avoids that.
- Full journey refs encode the timetable version. They stop working when a new timetable loads, with HTTP 400 `SVC_PARAM` (Reported [9]). Key journeys by `ZI@DA`, not the full ref.
- Vercel's CDN may cache per region, so two regions could each call the API once a minute (Unconfirmed). Count calls on the server too.

## Detail

### The server

Rejseplanen's answers on 2026-10-08/09 said `serverVersion` 2.53.1.2 and `dialectVersion` "2.53-Rejseplanen". The backend reported HAFAS release 2026.4.0.3 (Confirmed [10]). The API base is `https://www.rejseplanen.dk/api/<service>` with `accessId` and `format=json` in the query (Reported [9][12][15]). Some clients send the key as `Authorization: Bearer` instead (Reported [13]). The "Om API 2.0" page links a WADL for each service and XSDs for all responses (Confirmed snippet [1]). Rejseplanen's WADL for `journeypos` is at `journeypos?wadl=` (Reported [8]).

### `journeyPos`

Labs: "the journey position service delivers real-time position information for given journeys inside a map region". It can be filtered by operators, products and lines (Confirmed snippet [1]).

Parameters in the generic specification (Confirmed (HAFAS) [6]):

| Parameter                          | Required | Meaning                                                                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `llLat`, `llLon`, `urLat`, `urLon` | yes      | Lower-left and upper-right corners of the box.                                                                                  |
| `positionMode`                     | no       | `REPORT_ONLY` (default): only reported positions. `CALC_REPORT`: reported if there is one, else computed. `CALC`: all computed. |
| `maxJny`                           | no       | Most journeys in the answer. Default 1,000, range 1 to 1,000.                                                                   |
| `products`                         | no       | Bitmask of product classes.                                                                                                     |
| `lines`, `operators`, `jid`        | no       | Comma-separated filters. `jid` picks journeys by id.                                                                            |
| `attributes`, `infotexts`          | no       | Filters on journey attributes and texts.                                                                                        |
| `date`, `time`                     | no       | Day and time of operation. Without them, every matching train of the timetable is considered, which is much slower [7].         |
| `periodSize`, `periodStep`         | no       | A time window (default 30,000 ms) and step (default 2,000 ms) for positions, since version 2.24.                                |

A Rejseplanen client sends the box, `positionMode`, `jid`, `lines`, `operators` and `products` under these names (Reported [12]). A comment that read Rejseplanen's WADL gives the same three modes and the same default (Reported [8]).

Each journey in the answer has, in the generic specification: `lat`, `lon`, `name`, `direction`, `trainNumber`, `trainCategory`, `Product`, `JourneyDetailRef`, `JourneyOrigin`, `JourneyDestination`, `Stops`, `Notes`, `Messages` and `JourneyPath` (Confirmed (HAFAS) [6]). `JourneyPath` holds progress items (`progressInTime`, `progressInPercent`, from and to stop ids, heading `dirGeo`, a `state`). There is no per-journey time and no reported-or-computed field (Confirmed (HAFAS) [6]). The fields `pos`, `calculated` and `PositionType` named in the ticket belong to HAFAS's other interface, not to this one (Unconfirmed; none of them is in the ReST specification [6]). The answer's envelope has `planRtTs` (Confirmed (HAFAS) [6]).

So the only way to tell reported from computed is to call with `REPORT_ONLY`, or to compare it with `CALC_REPORT`. A client in the wild guesses at flags such as `reported` or `calc` in the answer, which suggests its author had none either (Reported [12]).

Product classes in Rejseplanen's bitmask: 1 IC, 2 ICL, 4 regional, 8 other trains, 16 S-tog, 32 bus, 64 express bus, 128 night bus, 256 flexible, 512 ferry, 1024 Metro, 2048 light rail, 4096 flight (Reported [13]). S-tog shows as class 16 in live answers (Confirmed [10]).

### Journey refs

A live ref looks like `2|#VN#1#ST#1791273300#PI#0#ZI#58845#TA#0#DA#91026#1S#8600798#1T#950#LS#8600696#LT#1055#PU#86#RT#3#CA#006#ZE#B#ZB#B#PC#4#FR#8600798#FT#950#TO#8600696#TT#1055#` (Confirmed [10]). `ZI` is the journey number, `DA` the day (`91026` is 9 October 2026), `ST` the timetable version, and `FR`/`TO` the first and last stops with times. A bridge keys journeys by `ZI@DA`, because the full ref changes with the timetable version (Reported [9]). The product's `num` (for example `622130`) is a train number; whether it equals GTFS `trip_short_name` is Unconfirmed.

### `departureBoard`

Parameters in the generic specification: `id` (stop), `date`, `time`, `duration` (default 60 minutes), `maxJourneys` (default all), `products`, `operators`, `lines`, `platforms`, `passlist`, `rtMode` and `type` (Confirmed (HAFAS) [6]). `multiDepartureBoard` takes `idList`, stop ids joined by `|` (Reported [13][15]).

Realtime fields seen in live answers (Confirmed [10]):

- `time`/`date` and `rtTime`/`rtDate`: timetable and expected times.
- `prognosisType`: `PROGNOSED` or `CALCULATED`. The specification also lists `MANUAL`, `REPORTED` and `CORRECTED` [6]. What each means at Rejseplanen is Unconfirmed. In one S-tog `journeyDetail`, stops up to København H were `PROGNOSED` and stops after were `CALCULATED`.
- `rtTime` is left out when the prediction equals the timetable; a row with a `prognosisType` and no `rtTime` is on time. A row with no `prognosisType` has no realtime data (Reported [9]).
- Cancelled: `"cancelled": true, "reachable": false`, with no prognosis. `partCancelled` exists too [6].
- Tracks: `rtTrack` and `rtPlatform`. S-tog rows at København H had only realtime tracks, no timetable `track`. So a platform change cannot be found by comparing the two there.
- `JourneyStatus`: `P` planned; the specification adds `R` replacement, `A` additional and `S` special [6][13].
- `JourneyDetailRef`, `ProductAtStop` (line, `lineId`, `num`, `cls`, operator) and `Notes`.

Metro: Rejseplanen's departure answers include Metro lines as single departures with clock times, `cls` 1024 and `catOut` `MET` (Reported [13][15]; the second is hand-written test data). The Labs GTFS's `frequencies.txt` has been empty in every archived version, so Metro runs as single trips there too (Reported [20]). A news story says the Metro does not run to the times Rejseplanen shows (Reported [19]). Whether the Metro has realtime in the API is Unconfirmed.

### `journeyDetail`

Parameters: `id` (the ref, required), `date`, `poly`, `showPassingPoints`, `rtMode`, and partial-trip bounds (Confirmed (HAFAS) [6]).

A live answer (S-tog B, 2026-10-09) held (Confirmed [10]):

- `Stops`, with each stop's `arrTime`, `depTime`, `rtArrTime`, `rtDepTime`, `arrPrognosisType`, `depPrognosisType`, `rtArrTrack`, `rtDepTrack`, `rtArrPlatform`, `rtDepPlatform`, `routeIdx`, `extId`, `lat` and `lon`.
- `lastPos`: `{"lon": 12.564502, "lat": 55.672991}`. No time, no flag.
- `Messages`: disruption messages for this trip, each with `routeIdxFrom` and `routeIdxTo`.
- `Product`, `Directions`, `Notes`, `ServiceDays`, `JourneyStatus`, `reachable`, `dayOfOperation`, `ref` and `planRtTs`.

The generic specification also has `lastPosReported`, `lastPassRouteIdx`, `rtLastPassRouteIdx`, `cancelled` and `partCancelled` (Confirmed (HAFAS) [6]). The live answer had none of the `lastPos…` or `…LastPass…` fields (Confirmed [10]). Whole-journey and per-stop cancellations appear as `cancelled`, `cancelledArrival` and `cancelledDeparture` (Reported [9][11]).

### `himsearch`

A live message holds `id`, `act`, `head`, `lead`, `text`, `company` (for example "Movia H"), `category`, `priority`, `products`, `icon`, `sDate`/`sTime`, `eDate`/`eTime`, `affectedStops` (each stop's `extId`, name and position), `validFromStop`, `validToStop`, `event` (start and end stop and times), `edge` (an icon position), `channel` and `messageCategory` (Confirmed [10]). The text names lines in prose, for example "Linje 2A kører en anden rute" (Confirmed [10]).

The bridge got at most 100 messages; `maxNum` and `products` did not change that (Reported [9]). The generic service also has `affectedProduct` and `affectedJourney` in a message, filters `lines`, `lineids`, `stations`, a bounding box, `minprio`, and `affectedJourneyMode` (`ALL` or `OFF`) (Confirmed (HAFAS) [6]). It has `hierarchicalView=1` for parent messages with children, and a message can hold `Note` elements and child messages [6]. Whether Rejseplanen fills lines or trips is Unconfirmed.

### Budget and terms

- 50,000 calls a month free for non-commercial use. Above that counts as commercial. Paid tiers: 100,000 calls a day for 5,000 EUR a year, or 200,000 a day for 8,500 EUR, plus a fee (Confirmed snippet [1]; the same in Rejseplanen's 2024 email [5]).
- "Commercial use of the API is defined as selling data from the API or selling a service using data from the API" (Reported, Rejseplanen's 2024 email as quoted [5]). The API may be used commercially only with an agreement and payment (Confirmed snippet [3]).
- Data is under CC BY 4.0 (Confirmed snippet [3]). Third-party data, such as map data, may not be passed on (Confirmed snippet [3]).
- The guidelines: "Use it – don't abuse it". Don't alter data so it differs from the original, or show it so it can be misread (Confirmed snippet [3]).
- Counting: projects count every request as one call, and one `multiDepartureBoard` call for many stops as one (Reported [15]). Home Assistant polls every 5 minutes to stay inside the quota (Reported [14]).
- No per-minute limit, no 429 behaviour and no over-quota behaviour were found (Unconfirmed). Clients treat 429 as "retry later" defensively (Reported [11]).
- Caching and showing one answer to many viewers: not addressed in any source found (Unconfirmed). The bridges and home dashboards found all share one server-side poll across users [9][15].

### The 2026-11-25 change

The Labs notice is titled "Current: Breaking change to Rejseplanen API, Wednesday 2026-11-25" (Confirmed snippet [4]). An earlier search's snippet of its text said XML `Note` elements may nest (Confirmed snippet [4][21]). A timetable card's maintainers added a note on 2026-10-15 that `format=json` is required, and that JSON is not affected (Reported [16]). One client parses XML `Note` as flat elements with attributes and text, and would break on nesting (Reported [13]). Mylder should request JSON and accept a `Note` that holds notes.

### Join to Labs GTFS

- Stops: the API's `extId` is the GTFS `stop_id` without leading zeros. A station id should also match its platforms through `parent_station` (Reported [9]).
- Trips: no shared id. Match on an anchor stop and minute, then align stop by stop on timetable times; drop ties. This worked for every mode, because line names differ between the API and GTFS for many trains (Reported [9]).
- The GTFS is updated about every 14 days (Confirmed snippet [2]), and its trip ids can change with it. Keep raw observations and re-match after a reload (Reported [9]).

## Sources

1. Rejseplan Labs, "Om API 2.0" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/21554723926557-Om-API-2-0
2. Rejseplan Labs, "Oversigt over udstillede data" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/24750139021341-Oversigt-over-udstillede-data
3. Rejseplan Labs, "Retningslinjer for Labs" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/21553298043165-Retningslinjer-for-Labs
4. Rejseplan Labs, breaking change notice for 2026-11-25 (snippet): https://labs.rejseplanen.dk/hc/da/articles/38992766513565-Current-Breaking-change-to-Rejseplanen-API-Wednesday-2026-11-25
5. Rejseplanen's email of 2024-10-09 on API 2.0, quoted in a client's issue (read): https://github.com/thomaspasser/python-rejseplanen/issues/2
6. HAFAS ReST OpenAPI specification, version 2.45.2, from another deployment (read in full): https://github.com/sa-/bln-departures-go/blob/main/hafasClient/gen/vbb-hafas-test-api.json
7. A Go HAFAS ReST client generated from that specification, quoting the HAFAS manual on `journeyPos` (read): https://github.com/xnacly/go-hafas/blob/main/hafas.go
8. A home-dashboard project's issue, comment of 2026-10-14 summarising Rejseplanen's `journeypos` WADL (read via summary): https://github.com/patrickhaahr/openhome/issues/79
9. rp-gtfsrt, a Rejseplanen API to GTFS-Realtime bridge: README, architecture notes, operator guide and native-implementation guide, observed 2026-10-08/09 (read): https://github.com/CoffeeIO/rp-gtfsrt and https://github.com/CoffeeIO/rp-gtfsrt/blob/main/docs/architecture.md
10. rp-gtfsrt's saved live API answers: `journeydetail_live_20261009.json`, `departureboard_live_20261008.json`, `departureboard_live_cancelled_20261008.json`, `himsearch_live_20261009.json` (read in full): https://github.com/CoffeeIO/rp-gtfsrt/tree/main/internal/rejseplanen/testdata
11. rp-gtfsrt's API client and parsers (read): https://github.com/CoffeeIO/rp-gtfsrt/tree/main/internal/rejseplanen
12. An iOS app's Rejseplanen client with a `journeypos` call (read): https://github.com/isjiajia01/Nu/blob/main/Nu/Services/RejseplanenAPIService.swift and https://github.com/isjiajia01/Nu/blob/main/Nu/Models/JourneyDetailModel.swift
13. pyrejseplan 1.0.9, the library Home Assistant uses (read): https://pypi.org/project/pyrejseplan/
14. Home Assistant's Rejseplanen integration (read): https://github.com/home-assistant/core/tree/dev/homeassistant/components/rejseplanen
15. A home-automation departure board on API 2.0, README, client and test data (read): https://github.com/magnusdunker/homewrighthq-rejseplanen
16. A timetable card's pull request #6, 2026-10-15 (read via summary): https://github.com/FHallengreen/rejseplanen-timetable-card/pull/6
17. A display project's issue on the 2026-10-07 host name change (read via summary): https://github.com/os2display/display-api-service/issues/580
18. Rejseplanen Livemap and its help text (snippet): https://www.rejseplan.dk/bin/help.exe/mn?L=vs_livemap&tpl=fullscreenmap
19. TV 2 Kosmopol, why the Metro never runs as Rejseplanen says (snippet): https://www.tv2kosmopol.dk/spoerg-os/hvorfor-korer-metroen-aldrig-ligesom-der-star-i-rejseplanen
20. Transitland, archived versions of the Rejseplanen GTFS, `frequencies.txt` with 0 rows (snippet): https://www.transit.land/feeds/f-rejseplanen~dk~gtfs/versions/535c9041c03635bfc48e0449377b002c738a0a48
21. Earlier Mylder research, "How SIRI-ET and NeTEx are delivered and joined" (read): branch `research/siri-et-netex-delivery`, `docs/researches/2026-10-25-siri-et-netex-delivery.md`
