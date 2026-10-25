# How SIRI-ET and NeTEx are delivered and joined

Research for Mylder, 2026-10-25. Ticket: issue #5.

Research caveat: this environment could not open labs.rejseplanen.dk, labs.rejseplan.dk, any dataudveksler.app.vd.dk host, vejdirektoratet.atlassian.net, trafikstyrelsen.dk, entur.atlassian.net or transit.land. Facts from those pages come from quoted search snippets, marked "(snippet)". Facts from public GitHub files were read in full. Each claim carries a label:

- **Confirmed**: seen in the owner's own words (a quoted snippet of the primary page, or a primary file read in full).
- **Reported**: from a secondary source, such as another project's notes or code, not checked against the owner.
- **Unconfirmed**: no source found, or sources disagree.

## Short answers

**Delivery.** SIRI-ET is pushed, not polled and not served as files. Each operator's feed is an "event dataset" on Dataudveksleren. You subscribe a service account to it and receive XML messages over AMQP 1.0 from an Azure Service Bus broker (Confirmed for the mechanism, Reported for the broker details). Updates arrive "on occurrence", from about 1 hour before each departure (Confirmed). There is no published volume for Zealand (Unconfirmed). NeTEx is a ZIP of XML files, downloaded after login, refreshed about 4 days a week (Confirmed).

**Coverage.** Found on the national access point: DSB (#785), Sydtrafik (#786), Movia (#788), Lokaltog on Zealand (#799) and DSB S-trains (number not found). DSB's dataset points to a separate "Banedanmark Journeys" dataset for complete train data (Confirmed). No Metro dataset was found, and a 2025 news report says the Metro has no timetable that Rejseplanen can show (Reported). No Arriva dataset was found (Unconfirmed).

**Join.** In SIRI, a journey is named by `FramedVehicleJourneyRef` (an operating day plus a `DatedVehicleJourneyRef`) (Confirmed, SIRI schema). The Danish feeds are "matched with Plandata in Rejseplanen" before they are sent (Confirmed). Which ID space the refs use, NeTEx or GTFS, is Unconfirmed. Evidence points to stop IDs that resolve against the GTFS, trip IDs that may not, and GTFS IDs that differ from NeTEx IDs (Reported). Plan to match on stops and times, not on trip ID alone.

**Terms.** Rejseplan's Labs guidelines say its data is under CC BY 4.0 (Confirmed). The Movia and Lokaltog SIRI datasets are recorded as CC BY 4.0 (Reported). The DSB SIRI dataset shows the licence "None" (snippet, Unconfirmed). The NeTEx dataset's licence was changed to CC BY-ND 3.0 in 2023, and its current value is Unconfirmed. No required credit line was found (Unconfirmed).

**SIRI-SX and SIRI-VM.** No SIRI-SX or SIRI-VM dataset for Denmark was found. The access point's record for the Movia feed exposes only ET-type data (Reported). Disruption texts are available through the Rejseplanen API's `himsearch` (Reported).

**Profile.** For NeTEx, Denmark uses the European Passenger Information Profile (EPIP), not the Nordic profile (Confirmed). No Danish SIRI profile was found (Unconfirmed). The Nordic profile is used in Norway, Finland and Sweden (Confirmed).

**For Mylder, beyond the ticket.** One open-source bridge found that the Rejseplanen API's `journeyPos` "returned no data with a Labs key" in October 2026. Vehicle positions came from `journeyDetail`'s `lastPos` instead (Reported). This bears on the README's plan. See [What this means for Mylder](#what-this-means-for-mylder).

## What we knew, checked

| Earlier claim                                               | Verdict                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIRI-ET is free after creating a Dataudveksleren account    | Confirmed [1][2]. Login uses MitID Erhverv, MitID or eIDAS, or a Vejdirektoratet user account (Reported [7]).                                                                                              |
| Per-operator datasets, for example DSB #785, Sydtrafik #786 | Confirmed [3][4]. Also Movia #788 and Lokaltog #799 (Reported [7]), and "DSB S-trains" (snippet [5]).                                                                                                      |
| DSB starts sending each departure 1 h before                | Confirmed [3]. The same wording is on the Movia, Sydtrafik and Lokaltog records [4][5].                                                                                                                    |
| NeTEx updated about 4 times a week                          | Confirmed: "Ca. 4 dage om ugen", with at least 2 months of timetable ahead [2].                                                                                                                            |
| GTFS free on request, refreshed about every 14 days         | Confirmed [2][6]. An archive goes back to 2025-12-15 [6]. One bridge describes the GTFS as weekly (Reported [12]).                                                                                         |
| GTFS licence CC BY 4.0, or the older CC BY-ND               | CC BY 4.0 is current per the Labs guidelines [8]. CC BY-ND was the 2017 wording [17].                                                                                                                      |
| No GTFS-Realtime in Denmark                                 | Confirmed as far as we can tell. No official feed is published (Reported [12]).                                                                                                                            |
| API 2.0 `journeyPos` is the only position source            | Corrected. `journeyPos` returned no data with a Labs key in one test, and `journeyDetail` `lastPos` did give positions (Reported [12]). SIRI-ET has no positions. Movia's own GPS stream is not open [21]. |

## Delivery

### SIRI-ET

- Rejseplanen offers "dynamisk realtidsdata i det europæiske standardformat SIRI-ET (Estimated Timetable)". Access goes through Vejdirektoratet's Dataudveksleren, the national access point (Confirmed, snippet [1]).
- The Labs overview lists SIRI-ET as XML, updated "Løbende" (continuously), "Gratis efter oprettelse på Dataudveksleren" (Confirmed, snippet [2]).
- Each dataset says updates "are sent as event-based messages in XML, one message per journey update", and that "a message can contain updates to one or several journeys" (Confirmed, snippets [3][4][5]).
- The access point records the feeds as `distributionServiceType: Events`, `adapterType: GenericAmqpEvent`, with update frequency `ON_OCCURENCE` (Reported [7][11]).
- Event datasets "can only be accessed by subscribing to events". You link a service account to the dataset, and creating that account "may take a few minutes" (Confirmed, snippet [9]).
- After subscribing, the dataset page shows a service account ID, a tenant ID and an AMQP URL. Vejdirektoratet's sample client is in C# with AMQPNetLite, Azure Service Bus and MSAL (Confirmed, snippet [10]).
- A public example client fetches a token from `login.microsoftonline.com/<tenant>/oauth2/v2.0/token` with scope `https://servicebus.azure.net/.default`. It then opens AMQP 1.0 over TLS on port 5671 to `sb-duvproddistribution.servicebus.windows.net`, sends the token with a CBS `put-token`, and renews it every 15 minutes (Reported [13]). That client was written for the access point in general, not for SIRI.
- The service account password is shown once and cannot be recovered (Reported [7]).
- The Movia record says data reaches the access point with under 3 seconds' delay (snippet of the catalogue [5], Unconfirmed wording).
- **Volume: Unconfirmed.** No source gives message counts. One bridge counted 44,319 trips in all of Denmark on one day in October 2026, all modes (Reported [12]). Zealand is a large share of that. Updates start 1 hour before departure and run through the service day. Measure the real rate on the first day of a subscription.
- **Unconfirmed:** whether a new subscriber gets a snapshot of current journeys, or only the changes from then on. Also how long messages are held while a consumer is offline. Plan for a long-running consumer that never drops its connection.

### NeTEx

- The NeTEx dataset is "a series of NeTEx xml files collected in a ZIP file", with a `CompositeFrame`, `ValidBetween`, codespaces, frame defaults and frames (Confirmed, catalogue snippet [5]).
- It is free after creating an account on Dataudveksleren, updated about 4 days a week, with at least 2 months of timetable ahead (Confirmed, snippet [2]).
- Downloading needs a login. A service account can also fetch datasets from your own system, using details on the dataset page (Confirmed, snippet [9]).
- The files appear to be one per line per operator, named like `NX-PI-01_DK_NAP_LINE_<operator>-<line>_<date>.xml` (Reported [16]). This matches the national file naming in Trafikstyrelsen's guide, which uses the prefix `NX-PI` and the codes `DK` and `NAP` (Confirmed, snippet [15]).

### GTFS

- Rejseplan offers a static GTFS dataset "som opdateres ca. hver 14. dag", with no realtime data (Confirmed, snippet [6]).
- Access is requested through a Labs contact form. Once approved, you get an account with a password (Confirmed, snippet [6]).
- The producer URL listed by the Mobility Database is `https://www.rejseplanen.info/labs/GTFS.zip` (Reported [18]).
- GTFS `trip_id`s change between releases, so realtime matches must be redone after each GTFS reload (Reported [12]).

## Coverage

- Rejseplanen is owned by DSB, Movia, Metroselskabet, NT, Midttrafik, Sydtrafik, FynBus and BAT (Confirmed, snippet [19]). The SIRI datasets hold "realtime updates on behalf of Rejsekort & Rejseplan A/S' owners", covering disruptions, time changes and cancellations (Confirmed, snippet [2]).
- Datasets found, all published by Rejsekort & Rejseplan A/S:

| Dataset                               | Number    | What it covers                                      | Status                       |
| ------------------------------------- | --------- | --------------------------------------------------- | ---------------------------- |
| Realtime data for DSB                 | 785       | DSB trains                                          | Confirmed [3]                |
| Realtime data for Sydtrafik           | 786       | Sydtrafik buses (South Jutland, not Zealand)        | Confirmed [4]                |
| Realtime data for Movia               | 788       | Movia buses across Zealand                          | Reported [7], snippet [5]    |
| Realtime data for Lokaltog on Zealand | 799       | Lokaltog local railways                             | Reported [7], snippet [5]    |
| Realtime data for DSB S-trains        | not found | S-tog                                               | Snippet [5], Reported [11]   |
| Banedanmark Journeys                  | not found | Named by #785 as needed for complete train realtime | Confirmed as a reference [3] |

- **Metro: no dataset found.** A TV 2 Kosmopol article says that, unlike buses and trains, the Metro has no timetable that Rejseplanen can show. It also says the Metro was looking at ways to send cancellations (Reported, snippet [20]). Treat Metro realtime in SIRI-ET as absent until a dataset appears.
- **Arriva: no dataset found.** On Zealand, Arriva mostly runs bus routes under contract to Movia. Those journeys would then sit in Movia's dataset (Unconfirmed, our inference).
- **Banedanmark Journeys:** what it holds, its format and its licence are all Unconfirmed. Only its name and its role are known.

## Join

### What SIRI says

- In the SIRI schema, `EstimatedVehicleJourney` names its journey in one of three ways: a `FramedVehicleJourneyRef`, a `DatedVehicleJourneyRef`, or an `EstimatedVehicleJourneyCode` for an unplanned extra journey with `ExtraJourney` true (Confirmed [22]).
- `FramedVehicleJourneyRef` holds a `DataFrameRef`, which makes the journey ref unique within the data horizon ("Often the OPERATING DAY is used for this purpose"), and a `DatedVehicleJourneyRef` (Confirmed [23]).
- In the Nordic profile, these refs are NeTEx IDs. For example, `LineRef` is `RUT:Line:2031` and `DatedVehicleJourneyRef` is `RUT:ServiceJourney:2031-1533` (Confirmed, profile examples [24]).

### What we know about the Danish feeds

- The Sydtrafik, Movia, Lokaltog and S-tog records say the data "has been matched with Plandata in Rejseplanen before submitting to NAP" (Confirmed, snippets [4][5]). Plandata is the source that both the NeTEx and the GTFS exports come from.
- **Which ID space the refs use is Unconfirmed.** No real Danish SIRI message was found in public.
- A community journey planner joins the Danish SIRI feed to the Rejseplanen GTFS, not to NeTEx (Reported [14]). Its matcher first tries `DatedVehicleJourneyRef` and `DataFrameRef` as a GTFS trip and date. If that fails, it looks up each `StopPointRef` as a GTFS `stop_id` and scores candidate trips by stops and times (Reported, code [25]). So the GTFS join works at least through stops and times. Whether the trip IDs match directly is unknown.
- One user of that planner saw about half of events carry a live time, against nearly all in Rejseplanen's own API (Reported [11]). The join, the coverage or both lose data somewhere.
- Rejseplanen's GTFS `stop_id`s are 12-digit, zero-padded numbers, for example `000008600626` for København H, where the API says `8600626` (Reported [12]).
- A Swedish operator that uses the Rejseplanen GTFS had to process it "so that … ID structure for journeys and stop point / stop places matches with the NeTEx" (Reported [26]). So GTFS IDs and NeTEx IDs differ.
- NeTEx refreshes about 4 days a week and GTFS about every 14 days [2]. SIRI is matched to the current plan, so NeTEx will be closer in time to what SIRI refers to. A journey added or changed after the last GTFS release will have no GTFS trip.

### Which to join against

Not settled until a real message is seen. The safe plan is to join on what is known to work, and check the rest on day one:

1. Resolve each `StopPointRef` against GTFS `stop_id`, comparing without leading zeros.
2. Match the journey by its stop sequence and aimed times on the operating day from `DataFrameRef`. Drop ambiguous matches rather than guess. This is how both the community planner and the API bridge do it [12][25].
3. On the first day of a subscription, log a sample of `LineRef`, `DatedVehicleJourneyRef` and `StopPointRef` values. Test whether they equal GTFS `trip_id`s or NeTEx `ServiceJourney` IDs. If they equal NeTEx IDs, consider NeTEx as the timetable source, since it is fresher.

## Terms

| Dataset                     | Licence found                                                                                                                             | Status                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Rejseplan data in general   | "Adgang til Rejseplans data sker under Creative Commons BY 4.0 licens" [8]                                                                | Confirmed (snippet)          |
| SIRI-ET, Movia and Lokaltog | CC BY 4.0, `rightsStatement: Licence-provided` [7]                                                                                        | Reported                     |
| SIRI-ET, DSB                | Licence shown as "None" [3]                                                                                                               | Snippet only, Unconfirmed    |
| NeTEx                       | First CC BY 4.0 on the access point, then "rettet til Creative Commons BY-ND 3.0" in August 2023 [17]                                     | Current value Unconfirmed    |
| GTFS                        | CC BY 4.0 under the Labs guidelines [8]. Listed as CC BY 4.0 by Transitland and a national data catalogue [18][27]. CC BY-ND in 2017 [17] | Confirmed for the guidelines |

- Commercial use: the static data may be used commercially, for example in a paid app or an ad-funded website (Confirmed, snippet [8]). The API may be used commercially only with an agreement and payment (Confirmed, snippet [8]). One snippet of the GTFS page says "free for non-commercial use", which conflicts (Unconfirmed).
- Attribution: CC BY 4.0 requires credit. No required wording was found (Unconfirmed). The GTFS carries an `attributions.txt` (Reported [18]). Other projects credit "Rejsekort & Rejseplan A/S" [14]. Our suggestion, until a required line is found: "Timetable and realtime data: Rejsekort & Rejseplan A/S, CC BY 4.0".
- Map data inside Rejseplan's products, from Klimadatastyrelsen and outside map providers, cannot be passed on (Confirmed, snippet [8]). None of the datasets above is affected.
- If the NeTEx licence is still CC BY-ND 3.0, using it to build derived timetables may not be allowed. Check the dataset page before relying on NeTEx.

## SIRI-SX and SIRI-VM

- **SIRI-SX: none found.** The access point records use the EU data category "disruptions, delays, cancellations", but the delivered type is ET (Reported [7]). One project that consumes the Danish feed says it "currently carries no alerts at all" (Reported [11]).
- Disruption texts are available from the Rejseplanen API's `himsearch`. It returns at most 100 messages, which name stops and a product mask but no lines (Reported [12]).
- **SIRI-VM: none found.** The Movia and Lokaltog records exclude vehicle monitoring (Reported [7]).
- Movia does collect GPS positions every second. They feed Rejseplanen's live map, stop displays and some third parties (Reported, 2020 paper [21]). They are not published as open data.

## Profile

- Trafikstyrelsen's NeTEx guide says: "I Danmark er det besluttet at anvende den Europæiske minimumsprofil, European Passenger Information Profile (EPIP)" (Confirmed, snippet [15]). The 2024 version of the guide adds the file naming rules.
- The Nordic NeTEx profile "is used in Norway, Finland and Sweden" (Confirmed [28]). Denmark takes part in the Nordic ODIN cooperation, whose joint profile builds on Entur's work (Reported, snippet [29]). No Danish adoption of the Nordic profile was found.
- **SIRI profile: Unconfirmed.** No Danish SIRI profile document was found. The SIRI version is said to be 2.x, inferred and not stated (Reported [7]).
- In practice: NeTEx parsers built for the Nordic profile, such as those in OpenTripPlanner, support EPIP only partly [28]. Expect some mapping work.

## What this means for Mylder

1. **Test `journeyPos` on the first day the API key works.** If it returns nothing, reported positions must come from `journeyDetail` `lastPos`, one call per journey. That does not fit a free budget of about one call a minute.
2. **SIRI-ET is the free source for delays and cancellations,** for Movia, S-tog, DSB and Lokaltog. It costs no API calls. It suits Mylder's "Estimated" state: timetable plus latest delay, drawn along GTFS shapes.
3. **It needs a long-running server process** with an AMQP 1.0 client, a token renewal loop and the GTFS timetable in memory. This fits the planned Node server, but not a host that sleeps.
4. **The Metro will likely be "Scheduled only"** in both sources, unless a Metro dataset appears. Say so in the coverage stats.
5. **Before use, read on the dataset pages:** the licence of #785 and of NeTEx, the required credit line, the message rate, and whether a subscription starts with a snapshot.
6. **Parse the API's JSON, or handle nested notes.** On 2026-11-25 the API's XML responses change: a `Note` element can hold child notes (Confirmed, snippet [30]).

## Pages that could not be opened

All refused by the sandbox proxy, not by the sites: labs.rejseplanen.dk and labs.rejseplan.dk (all articles), du-portal-ui.dataudveksler.app.vd.dk (dataset pages and guides), businessservice.dataudveksler.app.vd.dk (catalogue API), vejdirektoratet.atlassian.net, trafikstyrelsen.dk and cdn.trafikstyrelsen.dk, entur.atlassian.net, transit.land, mobilitydatabase.org, datavejviser.dk, lists.openstreetmap.org, gitlab.spline.de (the Danish SIRI converter) and gtfs.spline.de.

## Sources

Primary sources first. "Snippet" means only search-engine quotes were seen. "Read" means the file was read in full.

1. Rejseplan Labs, "Om SIRI-ET" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/25407687677597-Om-SIRI-ET
2. Rejseplan Labs, "Oversigt over udstillede data" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/24750139021341-Oversigt-over-udstillede-data
3. Dataudveksleren, "Realtime data for DSB", #785 (snippet): https://du-portal-ui.dataudveksler.app.vd.dk/data/785
4. Dataudveksleren, "Realtime data for Sydtrafik", #786 (snippet): https://du-portal-ui.dataudveksler.app.vd.dk/data/786/overview
5. Dataudveksleren, DCAT catalogue (snippet): https://businessservice.dataudveksler.app.vd.dk/api/Metadata?format=dcat
6. Rejseplan Labs, "Om GTFS Schedule/Static" and "Adgang til data fra Labs" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/21639730766877-Om-GTFS-Schedule-Static and https://labs.rejseplan.dk/hc/en-us/articles/21553113674909-Adgang-til-data-fra-Labs
7. Survey note on the Danish access point, with records #788 and #799 captured in May 2026 (read, secondary): https://github.com/clemensv/real-time-sources/blob/main/tools/candidates/transit/dk-nap-siri-amqp.md
8. Rejseplan Labs, "Retningslinjer for Labs" (snippet): https://labs.rejseplanen.dk/hc/en-us/articles/21553298043165-Retningslinjer-for-Labs
9. Dataudveksleren, Guides (snippet): https://du-portal-ui.dataudveksler.app.vd.dk/guides?locale=en
10. Vejdirektoratet, "AMQP - Receive messages" (snippet): https://vejdirektoratet.atlassian.net/wiki/spaces/DP/pages/3236430385/AMQP+-+Receive+messages
11. A home dashboard's transit notes and code, using the Danish feed through a community planner (read, secondary): https://github.com/alpacfer/HomeDashboard/blob/main/docs/TRANSPORT.md and https://github.com/alpacfer/HomeDashboard/blob/main/lib/transitous.ts
12. rp-gtfsrt, a Rejseplanen API to GTFS-Realtime bridge, README and architecture notes, observed 2026-10-08/09 (read, secondary): https://github.com/CoffeeIO/rp-gtfsrt and https://github.com/CoffeeIO/rp-gtfsrt/blob/main/docs/architecture.md
13. Example AMQP client for Dataudveksleren (read, secondary): https://github.com/NPRA/DataudvekslerenAMQP/blob/main/getData.js
14. Transitous feed config for Denmark (read): https://github.com/public-transport/transitous/blob/main/feeds/dk.json
15. Trafikstyrelsen, "Vejledning om brug af NeTEx", 2023 and 2024 versions (snippet): https://cdn.trafikstyrelsen.dk/trafikstyrelsen/Media/638676959728060546/Vejledning%20om%20brug%20af%20NeTEx_18112024.pdf and https://www.trafikstyrelsen.dk/kollektiv-trafik/eu/krav-til-deling-af-data-til-rejseplanlaegning
16. Notes on the Rejseplanen NeTEx ZIP from a simulation project (read, secondary, examples may be simplified): https://github.com/Esbern/simulatet-city_code-stubs/blob/main/docs/netex_format.md
17. OpenStreetMap talk-dk list, 2017 and August 2023 threads on Rejseplanen licences (snippet): https://lists.openstreetmap.org/pipermail/talk-dk/2017-October/004895.html and https://lists.openstreetmap.org/pipermail/talk-dk/2023-August/005885.html
18. Mobility Database and Transitland entries for the Rejseplanen GTFS (snippet): https://mobilitydatabase.org/feeds/gtfs/mdb-1292 and https://www.transit.land/feeds/f-rejseplanen~dk~gtfs/
19. Rejseplanen help, "About Rejseplanen" (snippet): https://help.rejseplanen.dk/en-us/about-rejseplanen
20. TV 2 Kosmopol, why the Metro never runs as Rejseplanen says (snippet): https://www.tv2kosmopol.dk/spoerg-os/hvorfor-korer-metroen-aldrig-ligesom-der-star-i-rejseplanen
21. Trafikdage, Aalborg University, 2020 paper on Movia's realtime data (snippet): https://journals.aau.dk/index.php/td/article/download/6208/5470/19273
22. SIRI schema, `siri_estimatedVehicleJourney.xsd` (read): https://github.com/SIRI-CEN/SIRI/blob/master/xsd/siri_model/siri_estimatedVehicleJourney.xsd
23. SIRI schema, `siri_journey_support.xsd`, `FramedVehicleJourneyRefStructure` (read): https://github.com/SIRI-CEN/SIRI/blob/master/xsd/siri_model/siri_journey_support.xsd
24. Entur profile examples, SIRI (read in search results): https://github.com/entur/profile-examples/tree/master/siri
25. MOTIS timetable library, SIRI and VDV matcher `vdv_aus.cc` (read): https://github.com/motis-project/nigiri/blob/master/src/rt/vdv_aus.cc
26. OpenTripPlanner, Skånetrafiken deployment notes (read): https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/doc/user/examples/skanetrafiken/Readme.md
27. Danish data catalogue entry for the Rejseplanen GTFS, listed as CC BY 4.0 (reported via a feed list, not opened): https://datavejviser-indtastning.digst.govcloud.dk/dataset/rejseplanen-gtfs
28. OpenTripPlanner, "NeTEx and SIRI compatibility" (read): https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/doc/user/features-explained/Netex-Siri-Compatibility.md
29. RISE, "Open mobility data in the Nordics" (snippet): https://www.ri.se/en/what-we-do/projects/open-mobility-data-in-the-nordics
30. Rejseplan Labs, breaking change to the API on 2026-11-25, XML `Note` elements may nest (snippet): https://labs.rejseplanen.dk/hc/da/articles/38992766513565-Current-Breaking-change-to-Rejseplanen-API-Wednesday-2026-11-25
