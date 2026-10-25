# Mylder

A live map of Copenhagen's buses, S-tog, metro and trains, honest about how fresh each position is. Next.js 16, React 19 and TypeScript; see `README.md` for the stack and scripts.

- Work is done when `npm run check` passes.
- Agent skills live in `.claude/skills/`. `/grill-me` settles a plan that fits one session; `/wayfinder` charts one too big for a session as a map of decision tickets on GitHub Issues, and hands off once the way is clear rather than building. `/to-spec` turns a settled plan or a cleared map into a spec issue, and `/to-tickets` slices a spec into tracer-bullet tickets. `/implement-spec <issue>` builds a spec's tickets test-first (`tdd`) on one integration branch and reviews it (`code-review`); `/improve-codebase-architecture` looks for deepening refactors, run between specs.
- Writing or changing React code: follow the `vercel-react-best-practices` skill. Its Next.js server and data-fetching rules apply too; where a rule differs from an ADR in `docs/adr/`, the ADR wins.
- Tests cut in at the seams in `docs/testing-seams.md`.
- Research notes go in `docs/researches/`, named `YYYY-MM-DD-<slug>.md`.

## Agent skills

### Issue tracker

GitHub Issues in this repository, through the `gh` CLI, with sub-issues and native blocking. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root, created when first needed. See `docs/agents/domain.md`.
