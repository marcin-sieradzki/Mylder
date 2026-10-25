# Issue tracker: GitHub

Mylder's work is tracked in this repository's GitHub Issues, through the `gh` CLI, which finds the repository from the clone. The `wayfinder`, `to-spec`, `to-tickets`, `implement-spec` and `code-review` skills read and write issues as this page says.

## Operations

Where `gh` isn't available, such as in a cloud session, do the same operations with the GitHub MCP tools (`issue_read`, `issue_write`, `sub_issue_write`, `add_issue_comment`).

- **Create**: `gh issue create --title "..." --body-file -`, with the body in a heredoc.
- **Read**: `gh issue view <n> --json number,title,body,labels,comments`. A bare `#<n>` may be a PR, since issues and PRs share numbers: fall back to `gh pr view <n>`.
- **List**: `gh issue list --state open --json number,title,labels`, with `--label` and `--state` filters as needed.
- **Sub-issue**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`, with the child's database id as in **Blocking** below.
- **Comment**: `gh issue comment <n> --body-file -`.
- **Labels**: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`. Create a label the repository lacks with `gh label create <name>` before its first use, or `gh issue create --label` fails.
- **Close**: `gh issue close <n> --comment "..."`.

## Specs and tickets

A spec from `to-spec` is a GitHub issue. `to-tickets` slices it into tickets, each a sub-issue of the spec, blocked through GitHub's native issue dependencies (see **Blocking** under Wayfinding operations). Where a native edge couldn't be added, the ticket's body lists its blockers under `## Blocked by`, and names its spec under `## Parent`; read both kinds of edge. Specs and tickets go up unlabelled: Mylder has no triage labels, and the only labels these skills use are wayfinder's. A ticket closes through a PR whose body says `Closes #<n>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / Not-yet-specified / Out-of-scope body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Sub-issue**). Labels: `wayfinder:<type>` (`research`, `prototype`, `grilling` or `task`), and no other label. Once claimed, the ticket is assigned to the driving dev.
- **Labels**: the five `wayfinder:` labels (`map`, `research`, `prototype`, `grilling`, `task`) are created on first use, as in **Labels** above.
- **Blocking**: GitHub's **native issue dependencies**, which show the frontier in GitHub's own UI. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by`, which counts open blockers only. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open sub-issues (`gh api repos/<owner>/<repo>/issues/<map>/sub_issues`), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body-file -` with the answer, then `gh issue close <n>`, then append a context pointer (gist and link) to the map's Decisions-so-far.
- **Research branches**: a research ticket's findings go on a `research/<name>` branch, pushed with no PR and never merged, with a link from the ticket.
