# A Claude-only factory builds each ticket to a verified merge

Mylder's specs are built by a software factory: a Claude Code session in a cloud thread, started by the maintainer with `/factory <spec>`, that turns a spec the maintainer has marked ready into merged code, one ticket at a time, without anyone driving it. Each ticket gets its own branch from `main` and its own PR, and starts only once every ticket blocking it has merged. A PR merges only through three brakes: `npm run check` and CI, an automated review of the diff with no hard findings, and a **verdict** of PASS or PASS+NOTES from a verifier that drove the change in the real app. The verifier never wrote the code and never reads it: it gets the ticket's user stories and the `verify-mylder` skill, drives `main` and the branch as a rider would, and posts its verdict with screenshots on the PR. Green CI and a clean review are not a verdict.

The session orchestrates and owns every subagent's work, with at most three subagents at once: implementers (two in parallel only when two tickets are independent), a reviewer and a verifier. Its only memory is GitHub: labels, the PRs, their comments and the issues' state. How the factory runs is in [`docs/agents/factory.md`](../agents/factory.md).

## Considered Options

- **One PR per spec on an integration branch**, as `/implement-spec` built them: one review for the maintainer, but a break found late is buried under the tickets built on it, and nothing lands until the slowest ticket does. With the factory merging, the maintainer's reading cost that favoured it is gone.
- **Stacked PRs, each ticket on its blocker's branch**: dependent tickets start sooner, but every fix below restacks and re-verifies everything above. Deferred: one level of stacking is the first throttle to open, after a spec runs clean without it.
- **The maintainer's Mac, as Perron's factory runs**: Mylder has no Penpot step that needs a local tab, and its spec runs already happen in cloud threads.
- **Many verifier lanes on several model vendors**: the factory runs on the Claude subscription only, with a few subagents. Independence comes from separate inputs instead: the reviewer reads the diff, the verifier only the stories and the running app.
- **Architecture passes and retros chained after every spec**: too often for their worth; the maintainer calls `/improve-codebase-architecture` and `/retro` by hand.

## Consequences

- Merging to `main` deploys the GitHub Pages demo, so a factory merge is a deploy, and the demo can show a spec half-built between its tickets. Once production runs on Vercel (#40), merging goes back to the maintainer.
- Each loop is capped: two failed rework rounds on review or verify stop the ticket at `factory:needs-human` with a comment, and the run carries on with tickets that don't depend on it. A run never waits for a person.
- A failure the verifier catches and CI didn't comes back with a regression test at the right seam, so the checks learn what the verifier found.
- Changes to the factory's own skills and checks are PRs the maintainer merges; the factory never merges a change to itself.
