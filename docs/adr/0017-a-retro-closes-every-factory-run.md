# A retro closes every factory run

Every `/factory` run ends with `/retro` on itself, in the same session, while its context is still there: the spec, the tickets, each PR's reworks and verdicts, and the session's own log of what went wrong. The retro ranks what it finds by severity and goes as far as each finding does, from a new check or a clearer brief up to the factory's infrastructure or Mylder's architecture. Fixes to the factory's own files come as one PR, and the rest as proposals with what each costs and buys. The maintainer merges the PR and picks among the proposals; the run never merges a change to itself. This amends ADR 0015, which left `/retro` to the maintainer.

## Considered Options

- **The maintainer calls `/retro` by hand**, as ADR 0015 had it: the first spec run (#149) showed the snags pile up within one run (a brief misread by every implementer, a recording that couldn't show a criterion, a CI wait that fails in the cloud), and a later session has to rebuild the context the run had.
- **A retro every five runs, scored**, as Perron's factory does: worth it once runs are many and alike. Mylder's factory is new enough that each run still finds something.

## Consequences

- Each run takes longer by one retro and leaves one PR open for the maintainer.
- `/improve-codebase-architecture` stays by hand between specs; a retro may propose an architecture change, but doesn't run that skill.
