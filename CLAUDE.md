# Mylder

A live map of Copenhagen's buses, S-tog, metro and trains, honest about how fresh each position is. React 19, TypeScript and Vite; see `README.md` for the stack and scripts.

- Work is done when `npm run check` passes.
- Agent skills live in `.claude/skills/`. `/grill-me` settles a plan that fits one session; `/wayfinder` charts one too big for a session as a map of decision tickets on GitHub Issues, and hands off once the way is clear rather than building. `/to-spec` turns a settled plan or a cleared map into a spec issue, and `/to-tickets` slices a spec into tracer-bullet tickets.
- Research notes go in `docs/researches/`, named `YYYY-MM-DD-<slug>.md`.

## Agent skills

### Issue tracker

GitHub Issues in this repository, through the `gh` CLI, with sub-issues and native blocking. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root, created when first needed. See `docs/agents/domain.md`.
