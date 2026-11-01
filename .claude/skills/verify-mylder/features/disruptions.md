# Disruptions

The Disruptions tab lists Mylder's own data cards first, then Rejseplanen's messages active now, then those starting later, each as a card with its kind, heading and text in Rejseplanen's words, and a footer saying when they were checked. Show on map on a card rings its stops and raises the highlight chip.

## Sub-features

- `dis-list` lists the active and later messages in order.
- `dis-footer` says when the messages were checked.
- `dis-show` rings a card's stops, fits them clear of the top bar, the notices and the legend at the map's tilt and heading, and raises "Showing: …" until Clear.
- `dis-stop` opens a ringed stop's departures.
- `dis-timetable` on the timetable source says, in place of the list, its footer and Rejseplanen's data cards, that disruption messages come with Rejseplanen's live connection, which isn't connected yet.
- `dis-updates-stale`, with SIRI-ET's delays on, heads the tab with Mylder's card once the feed has sent no message for 5 minutes, on any source, and the tab counts it; the next message takes it away.

## How to get to it (user POV)

- Choose the Disruptions tab in the overview sheet.
- Open a shared link with `?tab=disruptions`.
- On a launch on the timetable source (`launch.sh <run-id> <port> timetable`), the same.
- On a quiet SIRI-ET feed (`launch.sh <run-id> <port> updates:siri-et/quiet`), the same.

## Driving it with drive.ts

Preconditions:

- Baseline; the recording's three messages.

- **List.** In `getByRole('dialog', { name: 'Overview' })`, `getByRole('list', { name: 'Active now' })` holds "Færre S-tog mellem København H og Hellerup" and "Linje 5C kører en anden rute ved Langebro"; `getByRole('list', { name: 'Later' })` holds "Ingen S-tog mellem Hellerup og Holte i weekenden".
- **Footer.** "Messages from Rejseplanen, checked 07:20." is visible.
- **Show on map.** The first active card's `getByRole('button', { name: 'Show on map' })`; a button named `/^Showing: .* · Clear$/` appears; its click takes it away.
- **Show on map, tilted.** Open `/en?tab=disruptions&map=13.00/55.67000/12.57000/-30.0/50.0` and press the 5C card's Show on map: the address settles at `map=15.00/…/-30.0/50.0`, the screenshot shows Klaksvigsgade's ring in the middle of the room between the sheet, the panel, the chip and the legend, and a click there opens its departures. The first active card's stretch, from København H to Hellerup, fits the same way at the same angle.
- **Danish.** `/da?tab=disruptions`: the sheet is `Overblik`, the list `Aktuelle nu`, and the messages stay in Danish without an English caption.
- **On the timetable source.** On its own launch (`timetable` as the third argument), `page.goto('/en?tab=disruptions')`: the tab panel's whole text is "Disruption messages come with Rejseplanen's live connection, which isn't connected yet.", with no `list` in it, no "From Mylder", "No answer from Rejseplanen", "No bus positions since", "Disruption messages not fetched yet" or "Messages from Rejseplanen", and the tab reads `Disruptions` with no count. Open About (the corner credit's Rejseplanen link): its `Disruptions` fact reads "Not connected yet". On `/da?tab=disruptions` the sentence reads "Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu." and About's `Driftsforstyrrelser` "Ikke koblet på endnu". With `--phone` the sentence wraps inside the sheet with no sideways scroll.

- **A quiet SIRI-ET feed.** On its own launch (`updates:siri-et/quiet` as the third argument), `page.goto('/en?tab=disruptions')` at once: the tab panel holds the timetable source's sentence and no `getByRole('list', { name: 'From Mylder' })`. Then wait for the feed to go quiet (when, and the minute of its last message, `HH:MM` below, are in [`../SKILL.md`](../SKILL.md), Launch, "SIRI-ET's delays"), with a long enough `timeout` on `expect(...).toContainText(...)` and no reload: the list `From Mylder` appears above that sentence with one card, "Delays from Rejseplanen not updated since HH:MM", captioned "From Mylder, about its own data", and the tab reads `Disruptions 1`. No `getByRole('status')` says Rejseplanen hasn't answered or that live data is paused. In `/api/snapshot`, every trip with `updated` is `no-signal`, and a bus's panel (`/en?trip=<key>`) says "No signal since HH:MM; moving on the timetable and its last delay." At `/da?tab=disruptions` the card reads "Forsinkelser fra Rejseplanen ikke opdateret siden HH:MM" in `Fra Mylder`. The recording has no message after the gap, so the card's going is proven in the tracker and screen tests, not here.

## Gotchas

- Messages are shown in Rejseplanen's own Danish in both languages; assert them in Danish.
- The footer's time is the server's receipt time of the recording's check, 07:20, not the page's clock.
