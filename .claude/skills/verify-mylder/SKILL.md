---
name: verify-mylder
description: "Launch Mylder's production build on the weekday recording and drive it in Chromium as a rider would, keeping screenshots and ARIA snapshots as evidence. Use to prove a change works in the real app, and for the factory's verdict."
---

# Verify Mylder

Mylder's surface is one web page, the map at `/en` and `/da`, with its panels and side sheet, served by a Next.js production build. This skill starts that build on the `weekday` recording (`docs/testing-seams.md`), drives it with Playwright as a rider would, and keeps what it saw. Every command runs from the root of the checkout under test; each run has a **run id** you choose (`ticket-92`, `main-92`), and everything it makes lives in `.verify/<run-id>/`, which git ignores.

The feature map in [`features/README.md`](features/README.md) says what to drive for each feature and what proves it. Read it before driving.

## Launch

```sh
.claude/skills/verify-mylder/scripts/launch.sh <run-id> [port]
```

It runs `npm run build`, starts `next start` on the port (4300 by default) with `MYLDER_SOURCE` and `MYLDER_AIRCRAFT_SOURCE` both `recording:weekday`, and waits until `/api/snapshot` answers with vehicles: ready is printed as `Ready: http://localhost:<port>/en`. It refuses a port that already answers. `node_modules` must match the lockfile (`npm ci` in a fresh worktree). `VERIFY_SKIP_BUILD=1` reuses the build when it was made from the same clean commit, which a relaunch on an unchanged checkout wants.

The recording holds ten minutes from 07:20 on 16 June 2026, and the server's clock starts there at launch and runs on in real time; the page takes its time from the server, so nothing in the browser is faked. After ten minutes the recording repeats its last answer and every vehicle ages towards No signal, so drive within nine minutes of launch, or relaunch.

**Main against the branch.** To see how main behaves, launch main from its own worktree on another port: `git worktree add ../mylder-verify-main origin/main`, then `npm ci` and `launch.sh main-<n> 4301` there. Two runs never share a port, a build folder or a run id.

## Doctor

```sh
.claude/skills/verify-mylder/scripts/doctor.sh <run-id>
```

Read-only. Prints `healthy` with the URL, the commit and the recording's minute, or names the fault: the server stopped, the checkout moved since launch, the port isn't held by this run's server, the snapshot has no trips, or the recording has run out. Run it before the first drive, after any failed or surprising drive, and when anything looks off; a fault means clean up and launch again.

## Drive

Write each journey as a small module in `.verify/<run-id>/journeys/<journey>.ts` and run it:

```sh
node .claude/skills/verify-mylder/scripts/drive.ts <run-id> .verify/<run-id>/journeys/<journey>.ts [--phone]
```

```ts
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded')
  // ...the feature's recipe, a step() after each action that changes what the rider sees
}
```

`page` is a Playwright page on the run's server (a Desktop Chrome viewport, or a Pixel 7 with `--phone`), `expect` is Playwright's, and `step(name)` saves the next screenshot and ARIA snapshot. The script exits 0 when the journey passes and 1 with the error when it fails, after saving a `failure` step. In a sandbox whose Chromium differs from the pinned Playwright's, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its binary (`/opt/pw-browsers/chromium` in Claude's cloud containers).

Handles, most stable first: ARIA roles and names (`getByRole('dialog', { name: 'Overview' })`), the address (`?trip=`, `?stop=`, `?aircraft=`, `?tab=`, `?map=<zoom>/<lat>/<lon>`, `?hide=`, `?line=`), and the map's own attributes `[data-vehicles]` and `[data-aircraft]`, which count what the canvas draws, and `data-tilt` and `data-heading` on the same element, the camera's tilt and heading in whole degrees once it comes to rest. The canvas has no handles inside it: to tap a dot, stop or plane, open the page with `?map=15.00/<lat>/<lon>` centred on it (positions are in `/api/snapshot`, `/api/aircraft` and the timetable's stops) and tap the middle of the viewport, retrying with `expect(...).toPass()` while it draws. The feature files give each feature's handles.

## Evidence

A journey's evidence is `.verify/<run-id>/<journey>/`: the numbered `.png` and `.aria.yml` pairs, `console.txt` and `result.json`. The proof standards:

- Drive the rider's path: the chip, tab, row or tap a rider would use. An address is a path only where the feature map lists it as an entry point (a shared link), and `page.route` fakes nothing: the recording is the only outside system, and it stands at the API seam already.
- Capture the action and the state it led to: a `step()` before and after each action that changes what is shown, never only the last screen.
- Check what the rider can't see but the feature promises: the address after opening a panel, a count in `[data-vehicles]`, the language in `html[lang]`.
- A journey asserts what the ticket or the feature map says a rider sees, in their words. When the recording can't show a precondition, the journey fails and says which, rather than asserting less.

## Cleanup

```sh
.claude/skills/verify-mylder/scripts/cleanup.sh <run-id>
```

Stops the server's whole process group by the pid `launch.sh` recorded, and keeps `.verify/<run-id>/`. Run it after every run, failed ones too, and remove a main worktree with `git worktree remove ../mylder-verify-main` once its run is cleaned up. Evidence stays until the worktree goes; copy what a verdict needs out of it first.

## Helpers

All four are in `scripts/` and executable or run with `node`: `launch.sh <run-id> [port]`, `doctor.sh <run-id>`, `drive.ts <run-id> <journey.ts> [--phone]`, `cleanup.sh <run-id>`. Keep this skill honest with `/maintain-verification-skill`.
