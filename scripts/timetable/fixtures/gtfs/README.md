# The frozen GTFS fixture

A few trips cut from one real release of the Rejseplan Labs GTFS, frozen so the timetable job's tests don't change when the timetable does. The rows are copied unchanged from the release; only rows for other trips, stops, shapes and services are left out.

**Source:** Rejseplanen (Rejsekort & Rejseplan A/S), [www.rejseplanen.dk](https://www.rejseplanen.dk), CC BY 4.0. The release of 2026-06-01 (calendar 2026-06-01 to 2026-08-26), taken from the Mobility Database's public copy of the latest Labs download, SHA-256 `4f2b8119f3dfa34ea89863353cd4980498fac8c75b37b293747f71ce5d3e3a62`.

## What it holds

Twenty trips, all running on Tuesday 2026-06-16 unless noted:

| Line | Mode                     | Trips                                                                                                                                    |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A    | S-tog                    | Two each way around 07:10, and one to København H leaving at 24:11, which belongs to the service day before the calendar date it runs on |
| E    | S-tog                    | One each way around 07:00, along the same tracks as A                                                                                    |
| M1   | Metro                    | Two each way around 07:05, on a service that runs only through `calendar_dates`                                                          |
| 5C   | Bus                      | Two each way around 07:10, and a third southbound on a different stop sequence                                                           |
| 991  | Bus (harbour bus, Movia) | Two, at 07:00 and 07:30, on a weekday service that `calendar_dates` cancels on Friday 2026-06-05                                         |
| RE   | Train                    | One from København H to Næstved at 07:17, which leaves the Copenhagen box and keeps its calls outside it                                 |
| L    | Light rail (Odense)      | One, wholly outside the box, so it and the stops only it serves are cut                                                                  |

Nørreport is four of the rows in `stops.txt`: the S-tog row, the Metro row and two bus stands, which the job groups into one Stop.
