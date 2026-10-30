# Disruptions

The Disruptions tab lists Mylder's own data cards first, then Rejseplanen's messages active now, then those starting later, each as a card with its kind, heading and text in Rejseplanen's words, and a footer saying when they were checked. Show on map on a card rings its stops and raises the highlight chip.

## Sub-features

- `dis-list` lists the active and later messages in order.
- `dis-footer` says when the messages were checked.
- `dis-show` rings a card's stops and raises "Showing: …" until Clear.
- `dis-stop` opens a ringed stop's departures.

## How to get to it (user POV)

- Choose the Disruptions tab in the overview sheet.
- Open a shared link with `?tab=disruptions`.

## Driving it with drive.ts

Preconditions:

- Baseline; the recording's three messages.

- **List.** In `getByRole('dialog', { name: 'Overview' })`, `getByRole('list', { name: 'Active now' })` holds "Færre S-tog mellem København H og Hellerup" and "Linje 5C kører en anden rute ved Langebro"; `getByRole('list', { name: 'Later' })` holds "Ingen S-tog mellem Hellerup og Holte i weekenden".
- **Footer.** "Messages from Rejseplanen, checked 07:20." is visible.
- **Show on map.** The first active card's `getByRole('button', { name: 'Show on map' })`; a button named `/^Showing: .* · Clear$/` appears; its click takes it away.
- **Danish.** `/da?tab=disruptions`: the sheet is `Overblik`, the list `Aktuelle nu`, and the messages stay in Danish without an English caption.

## Gotchas

- Messages are shown in Rejseplanen's own Danish in both languages; assert them in Danish.
- The footer's time is the server's receipt time of the recording's check, 07:20, not the page's clock.
