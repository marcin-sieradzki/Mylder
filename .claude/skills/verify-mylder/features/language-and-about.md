# Language and About

The page reads in English at `/en` and Danish at `/da`; the language switch keeps the rest of the address (map view, filters, open panel). The About dialog holds the sources and licences, the data states, the page's status and the keys.

## Sub-features

- `lang-switch` moves between `/en` and `/da` and keeps the query.
- `lang-root` sends `/` to the browser's language.
- `about-open` opens About from the top bar's button or the corner credit, and Esc closes it.

## How to get to it (user POV)

- Choose Dansk or English in the top bar.
- Choose the About button (ⓘ) or the Rejseplanen link in the corner credit.

## Driving it with drive.ts

Preconditions:

- Baseline.

- **Switch.** `page.goto('/en?line=5C')`, `page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()`; the address is `/da?line=5C` and `html[lang]` is `da`; back with the `Sprog` navigation's `English` link.
- **About.** `page.getByRole('button', { name: 'About Mylder' }).click()` (`Om Mylder` in Danish) opens `getByRole('dialog', { name: 'About Mylder' })` with the data states and the keys; Esc closes it.
- **From the credit.** With `--phone`, `page.getByRole('link', { name: 'Rejseplanen' }).click()` opens the same dialog.

## Gotchas

- `/` redirects by the browser's `Accept-Language`; set the context's locale to test it.
