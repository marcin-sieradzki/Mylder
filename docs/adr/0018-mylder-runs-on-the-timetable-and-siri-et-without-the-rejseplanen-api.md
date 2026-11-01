# Mylder runs on the timetable and SIRI-ET, without the Rejseplanen API

Mylder no longer plans to use Rejseplanen API 2.0. The key (#23) was still pending a week after it was asked for, and by then Mylder had two free sources that need none: the Labs GTFS timetable, which the daily job prepares from the Mobility Database's public copy (ADR 0010), and Rejseplanen's SIRI-ET datasets on Dataudveksleren, which bring every trip's expected times and cancellations for Movia, DSB, the S-tog and Lokaltog about an hour ahead (#146). Production runs the timetable source (#144), with SIRI-ET updates on top once #146 is built. This supersedes ADR 0002, which made the API the only realtime source and dropped SIRI-ET, and ADR 0009, the call budget.

## Considered Options

- **Keep waiting for the key.** Every API-dependent ticket (#35 and its sub-issues, #12) stays blocked on a manual approval with no date, and Labs has announced a breaking API change for 25 November 2026.
- **Use the key as an extra layer when it arrives.** Brings reported positions, so Live and Ageing dots, and `himsearch` disruption messages. Kept out because it brings back the call budget, the lease, the on-demand calls and a second realtime path to keep right, for one call a minute.

## Consequences

- No trip is ever Live or Ageing: SIRI-ET carries no positions, and no Danish SIRI-VM feed exists. A trip with a SIRI-ET update this service day is Estimated, placed from its timetable plus its delay; every other trip, and every Metro and light rail trip, is Timetable only (ADR 0005 and ADR 0006 stand). No signal is judged on the SIRI-ET feed going quiet.
- Disruption messages have no source. Cancellations from SIRI-ET are what the Disruptions screen can show.
- There is no call budget, no Paused notice for a spent month and no per-minute lease on a call; the store keeps history, the latest snapshot and the listener's update table (ADR 0008).
- The API code (`src/tracker/rejseplanen/`, the budget, the on-demand calls, the position mode and `MYLDER_SOURCE=rejseplanen`) stays until #144 and #146 are built, because the simulation, the recordings and the GitHub Pages demo still speak the API's answers. A later cleanup removes it and reshapes the simulation to invent SIRI-ET updates, so the demo shows what production shows. Until then, `docs/live-data.md`, `docs/data-states.md` and `docs/screens.md` describe that code as it is.
