# The factory

How Mylder's software factory turns a spec into merged code ([ADR 0015](../adr/0015-a-claude-only-factory-builds-each-ticket-to-a-verified-merge.md)). The words are the `software-factory` skill's; the issues are handled as [`issue-tracker.md`](issue-tracker.md) says. `/factory <spec>` runs it.

## Words

- **Run**: one `/factory <spec>` session, from its start to the spec's last merge or its last stop. It never waits for a person: it ends, and the maintainer's later change in GitHub is what a new run picks up.
- **Ticket run**: one ticket's way through implement, review, verify and merge, inside a run.
- **Brake**: a gate every PR passes before it merges: the **checks** (`npm run check` and CI), the **review** (the `code-review` skill, by a reviewer that reads the diff cold) and the **verdict**.
- **Verdict**: the verifier's judgement on one PR, PASS, PASS+NOTES or FAIL, posted as a PR comment, with each user story's pass rule and what `main` and the branch showed. It is never called a report: in Mylder a report is a vehicle's.
- **Evidence**: the screenshots and ARIA snapshots `verify-mylder` keeps for a verdict, pushed to the orphan `evidence` branch and linked from the verdict.
- **Cap**: the most rework rounds a ticket gets on one brake, two, before it stops.
- **Run log**: the one comment on the spec that the run keeps up to date: each ticket's PR, verdict and state.

## Services

| Slot                   | Filled by                                                                    |
| ---------------------- | ---------------------------------------------------------------------------- |
| Ticket tracker         | GitHub Issues: specs and their tickets, as sub-issues with native blocking   |
| Ticket source          | The maintainer, through `/wayfinder`, `/to-spec` and `/to-tickets`           |
| Git host               | GitHub: one branch and PR per ticket, the `evidence` branch                  |
| Orchestrator           | The Claude Code session `/factory` runs in, in a project thread in the cloud |
| Runner                 | That session's cloud container, and the worktrees its subagents work in      |
| Observability platform | None: the thread, the run log and the PRs show what each run did             |

## Labels

- `factory:ready` on a spec: the maintainer's word that it may be built. `/factory` refuses a spec without it.
- `factory:running` on a spec while a run holds it: the claim that stops two runs building one spec.
- `factory:needs-human` on a ticket that hit a cap or a fault the run can't fix, with a comment saying which. The maintainer fixes or answers, then removes the label, and the next run picks the ticket up.

Create a label the first time it is needed (`issue-tracker.md`, **Labels**).

## Roles

The session is the **orchestrator**: it reads the task graph, starts every subagent, reads every diff and verdict, merges, and talks to the maintainer. At most three subagents run at once, each in a fresh context, given pointers rather than pasted context:

- **Implementer**: builds one ticket with the `tdd` skill in its own worktree on its own branch, until `npm run check` passes. On a rework it gets only the findings or the failing verdict, and adds a regression test for what the verifier caught.
- **Reviewer**: runs the `code-review` skill on the ticket's PR, read-only, against the ticket and its spec.
- **Verifier**: never sees the diff or the implementer's notes. It gets the ticket's user stories and the `verify-mylder` skill, launches `main` and the branch side by side, drives each story on both, and returns its verdict.

## Tasks

Each task answers the `software-factory` skill's five questions: what triggers it, what it does, what it triggers next, where a person re-enters, and what stops two runs doing the same work.

**Decompose.** Triggered when the spec has no tickets. Runs `/to-tickets` on the spec and carries on. Next: implement. The maintainer re-enters by editing the tickets at any time. The `factory:running` claim keeps it to one run.

**Implement.** Triggered for each ticket on the frontier: open, every blocker merged, no `factory:needs-human`, no open PR. Up to two at once when they are independent. Builds the ticket on `factory/<n>-<slug>` from `main`, opens its PR ready for review with `Closes #<n>`. Next: review, then verify. The maintainer re-enters on the PR. The ticket's open PR is its claim.

**Review.** Triggered by a ticket PR whose checks pass. The reviewer's hard Standards violations and missing or wrong Spec requirements send it back to the implementer, a rework round; judgement calls go in the PR body. Next: verify on a clean review. Capped at two rework rounds.

**Verify.** Triggered by a ticket PR with a clean review. FAIL sends it back to the implementer, a rework round; PASS+NOTES files each note as a follow-up issue under the spec that blocks nothing, and is otherwise a pass. Next: merge. Capped at two rework rounds.

**Merge.** Triggered by a PR with green checks, a clean review and a passing verdict. Brings `main` in first; when the merge had conflicts or `main` changed files the PR touches, the verifier runs again on the new head before the merge. Merges the PR, which closes the ticket, updates the run log, and recomputes the frontier. When the spec's last ticket merges, the run closes the spec, removes `factory:running` and ends.

## Throttle

One spec in the factory at a time, started by the maintainer. The throttles to open, one at a time and only after a spec runs clean at the current setting:

1. One level of stacking: a ticket may start on its blocker's branch while the blocker is in review or verify.
2. Two specs at once, in two threads.
