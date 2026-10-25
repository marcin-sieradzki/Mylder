---
name: implement-spec
description: 'Implement the result of /to-spec and /to-tickets in code.'
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

Mylder's specs and tickets live in GitHub Issues: read [docs/agents/issue-tracker.md](../../../docs/agents/issue-tracker.md) before touching one.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

## Steps

1. Read the spec and tickets to understand the task graph. The tickets are the spec's sub-issues; a ticket's blockers are its native issue dependencies and the issues in its `## Blocked by` section, and it is ready once every one of them is closed or merged to the integration branch.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch. Open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), its body saying `Closes #<n>` for the spec and each ticket.

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;
   - calls the Skill tool with `tdd` to build the ticket;
   - merges the integration branch tip into its own branch before reporting done

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single **implementer subagent**, until `npm run check` passes on the integration branch and the PR's CI is green.

8. Mark the draft PR ready for review, and report it. Merging it closes the spec and its tickets.

9. Clean up all **implementer subagent** worktrees.
