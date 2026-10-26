# Recordings

Rejseplanen answers the tracker replays with `MYLDER_SOURCE=recording:<name>`, one folder each: the answers per service in call order, the `timetable/` they belong to, `clock.json` with the moment they start, and `snapshots/` with the tracker's snapshot of each minute, which screen tests use.

Until the key arrives, every recording is frozen from the simulation by `npm run recordings`, from the plans in `src/tracker/recording/plans.ts`; edit the plans, not the files. `docs/testing-seams.md` describes the format and the hand-made cases.
