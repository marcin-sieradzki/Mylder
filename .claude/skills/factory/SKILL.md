---
name: factory
description: 'Build a spec issue, or a lone ticket, to merged code, one ticket at a time: implement, review, verify, merge, stopping a ticket only at a cap. Use for /factory <spec>.'
disable-model-invocation: true
argument-hint: '<spec or ticket issue number>'
---

`/factory <spec>` builds every ticket of one spec issue to a merged PR. You are the **orchestrator**: you start every subagent, read what each returns, post the verdicts, merge, and keep the run log. The design, the words (run, brake, verdict, evidence, cap, run log), the labels and the roles are in [`docs/agents/factory.md`](../../../docs/agents/factory.md); read it, and [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) for every issue operation, before step 1. With no `gh`, as in a cloud thread, use the GitHub MCP tools for the same operations.

Subagents are `general-purpose` agents whose prompt starts with the role file to read, [`implementer.md`](implementer.md) or [`verifier.md`](verifier.md), and ends with "Your final message is your return." The review is the repo's `factory-code-review` skill, which you run. Reach a repo skill by reading its `SKILL.md` under `.claude/skills/`: a cloud thread's Skill tool lists none of them. At most three subagents at once, counting the review's two axes; give each pointers (issue numbers, branch, paths), never pasted context. You own their work: read each diff and verdict before acting on it.

## 1. Claim the spec

1. Read the spec and its sub-issues. Refuse, and say why, when the spec lacks `factory:ready`, or carries `factory:running` from a run that is not this thread's (the maintainer removes a stale claim).
2. Add `factory:running`. Find the spec's run log comment (it starts `**Factory run log**`) or post one: a table of ticket, PR, verdict and state.
3. In the checkout, `git fetch origin && git checkout main && git pull`, then `npm ci` when `node_modules` is missing or behind the lockfile.

Done when the spec is claimed and the run log exists.

## 2. Decompose when there are no tickets

When the issue is itself a ticket (it has `## Acceptance criteria` and no sub-issues), it is the run's only ticket: go to step 3, where the spec named under its `## Parent` is the spec its reviewer and verifier read. Otherwise, with no sub-issues, follow `.claude/skills/to-tickets/SKILL.md` on the spec and publish its tickets without the quiz, taking its recommended slicing. Each acceptance criterion a rider can see names the recording that shows its precondition; when no recording in `recordings/` can (more trips standing than any recording has, say), the ticket also builds one, a fixture and a plan as `crowded` was, so the verifier can drive it. Done when the run has its tickets, with their blocking edges, and every rider-visible criterion has a recording that shows it.

## 3. Work the frontier

A ticket is on the **frontier** when it is open, every blocker (native dependency or `## Blocked by`) is closed, it has no `factory:needs-human`, and no open PR from a `factory/<n>-` branch. An open `factory/<n>-` PR left by an earlier run is picked up where its comments leave it: no review yet, review; a review without a verdict, verify.

Take frontier tickets in sub-issue order. Start up to two implementers at once when the tickets are independent (neither blocks the other and their acceptance criteria touch different screens or modules); otherwise one. Run each ticket through steps 4 to 7, and come back here whenever a ticket merges or stops. Done when no ticket is on the frontier and none is in flight.

## 4. Implement

Start an implementer in the background: `Read .claude/skills/factory/implementer.md and follow it. Ticket #<n>, spec #<spec>, branch factory/<n>-<slug>, worktree ../mylder-factory/<n>.` On a rework, add the findings to fix, word for word. When it returns, read its diff (`git diff origin/main...factory/<n>-<slug>`), then push the branch and open its PR, ready for review, titled as the ticket, with a body of what it builds, `Closes #<n>`, and the implementer's summary, and no tool attribution or session link (the GitHub MCP's create adds a footer with one: send the body again with its update right after); on a rework, push to the same PR. Wait for CI's `check` job: with `gh`, `until c=$(gh api repos/marcin-sieradzki/mylder/commits/<head-sha>/check-runs --jq '.check_runs[] | select(.name == "check") | .conclusion') && [ -n "$c" ]; do sleep 30; done; echo "$c"` (REST: a cloud thread's `gh` has no GraphQL, so `gh pr view` fails there); without, subscribe to the PR's activity and end the turn, and the CI event resumes the run. A red check goes back to the implementer as a rework with the failing lines. Done when the PR is open and `check` is green.

## 5. Review

Follow `.claude/skills/factory-code-review/SKILL.md` on the ticket's branch, fixed point `origin/main`, the ticket as its spec. Every hard Standards violation, and every missing or wrong Spec requirement, goes back to step 4 as a rework round with those findings; judgement calls and smells go in the PR body under **Review notes**. Two rework rounds on the review without a clean one: stop the ticket (step 8). Done when a review finds no hard violation and no Spec gap.

## 6. Verify

Start a verifier in the foreground: `Read .claude/skills/factory/verifier.md and follow it. Ticket #<n>, spec #<spec>, branch factory/<n>-<slug>, round <r>, ports <4300 + 2r> and <4301 + 2r>, and <4400 + r> for a recipe on another recording.` It never gets the diff, the review or the implementer's notes. It returns a verdict and the paths of its evidence. Then:

1. Push the evidence to the orphan `evidence` branch under `<pr>/<round>/` (a worktree of `origin/evidence`, or `git worktree add --orphan -b evidence ../mylder-evidence` the first time), and post the verdict on the PR as a comment, each screenshot linked as `https://github.com/marcin-sieradzki/mylder/blob/evidence/<pr>/<round>/<file>?raw=true`.
2. **FAIL**: back to step 4 as a rework round, with the verdict's failing stories and what the branch showed; the implementer adds a regression test for each. Two rework rounds on verify without a pass: stop the ticket (step 8).
3. **PASS+NOTES**: file each note as an issue, linked from the verdict. A note this spec's changes caused goes under the spec, blocking nothing, and this run builds it. A note `main` shows too (the verdict's `main` column, or a check of `main` for anything the verdict doesn't cover) is a standalone issue for a later run.

Done when the PR's latest verdict is PASS or PASS+NOTES.

## 7. Merge

1. Bring `main` in: in the ticket's worktree, `git fetch origin && git merge --no-commit origin/main`, resolve conflicts keeping both sides' intent, run `npm run check`, commit and push. When the merge had a conflict, or `main` brought changes to files the PR touches (`git diff --name-only` of each side against the merge base), run step 6 again on the new head; otherwise the verdict stands.
2. Wait for `check` as in step 4, then merge the PR with a merge commit (`gh pr merge <pr> --merge --delete-branch`, or the MCP's merge with method `merge`). Confirm it reads merged and the ticket closed.
3. Update the run log, remove the ticket's worktree, and go back to step 3.

Done when the PR is merged and the run log says so.

## 8. Stop a ticket

Label the ticket `factory:needs-human` and comment on it: the brake that stopped it, each round's findings or failing verdict by link, and what you would try next. Leave its PR open, add the stop to the run log, and go back to step 3: tickets that don't depend on it carry on. Done when the label and comment are on the ticket.

## 9. End the run

When every ticket is closed, close the spec. Otherwise the remaining tickets are stopped or blocked by stopped ones. Either way, remove `factory:running`, bring the run log to its final state, clean up every worktree under `../mylder-factory/`, and tell the maintainer: what merged, each verdict by link, each stop and why, and the follow-up issues filed. Done when the claim is gone and the maintainer has the summary.

## 10. Retro

Follow `.claude/skills/retro/SKILL.md` on the run you just ended: its spec, tickets, PRs, verdicts, run log and this session's own log ([ADR 0017](../../../docs/adr/0017-a-retro-closes-every-factory-run.md)). Keep a note of every snag as the run goes (a brief a subagent misread, a check that missed, a rework a recording or a tool caused, the slowest stage), and start from it. Rank what you find by severity, and go as far as the finding does: a check, a brief, a doc, or a change to the factory's infrastructure or Mylder's architecture. Open the fixes to the factory's own files as one PR, and give the maintainer the rest as proposals with what each costs and buys. The maintainer merges both; the run never merges a change to itself. Done when the PR is open and the maintainer has the proposals.

## Resuming

A run keeps nothing outside GitHub. A new `/factory <spec>` in the same thread, or after the maintainer has removed a stale `factory:running`, starts at step 1 and picks up each ticket from its PR's state in step 3.
