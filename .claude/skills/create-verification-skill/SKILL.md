---
name: create-verification-skill
description: 'Generate a project-local verification skill that drives the app the way a user does. Use for /create-verification-skill, or when a repository has no scripted way to prove what a user sees.'
disable-model-invocation: true
---

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behaviour: launch it, exercise a feature the way a user would, and capture evidence. This skill generates that as a project-local skill, `.claude/skills/verify-<app>/`, tailored to the repository. You write it for the next agent, not for a human: the factory's verifier reads it cold, mid-task, having never seen the app (see `docs/agents/factory.md`). Write it with the `writing-for-agents` skill.

## 1. Interview the repo, not the user

Answer these from the codebase and ask the user only what you cannot observe:

- **Surface:** what does a user actually touch? A web UI, a CLI, an API, a library? A repository can have several; pick the primary one and note the rest.
- **Run:** how does the app start locally? Prefer the repository's own documented command (package scripts, README). Note ports, environment variables, seed data and recordings.
- **Drive:** how can an agent work it programmatically? Existing harnesses first: Playwright specs and their helpers, curl-able routes. Only then a generic recipe.
- **Observe:** what evidence can be captured? Screenshots, accessibility snapshots, response bodies, logs, exit codes.
- **Isolate:** can two instances run side by side (ports, build folders, worktrees)? If not, say so in the generated skill: refusing to drive a shared instance twice beats corrupting another run.

If the checkout doesn't build or start as it is, fix that first or report it precisely before generating: a skill written against a broken base teaches wrong steps.

## 2. Generate the skill

Write `.claude/skills/verify-<app>/SKILL.md` with frontmatter (`name: verify-<app>` and a `description` that names the app, the surface and when to reach for it) and these sections, each grounded in what the interview found, with no placeholders left:

- **Launch:** the exact command that starts the app for verification, and how to tell it's ready. Ready means usable, not just that a process answers. Include teardown.
- **Doctor:** one read-only check that answers "is this instance worth driving?": process up, the right build, the port owned by this run. The verifier runs it first, and again whenever anything looks off.
- **Drive:** the harness recipe with real selectors and commands from this repository. Prefer stable handles (ARIA roles and names, data attributes, route paths) over coordinates and tab order.
- **Evidence:** what a proof captures and where it goes. The proof standards: exercise the real user path, never internal setters or test-only routes; capture the action and the resulting state, not just the final screen; check side effects (the address, a stored value) alongside what is visible; fake only where a production boundary already isolates the outside system.
- **Cleanup:** how to stop what the run started. Kill what you started, by its recorded process id, never by process name. Cleanup removes instances and scratch state and keeps the evidence, in a location the skill names.
- **Helpers:** every script the skill ships is executable and its invocation is shown in the skill body. A helper the reader has to reverse-engineer is not a helper.

## 3. Seed the feature map

Create `.claude/skills/verify-<app>/features/README.md` plus one file per user-facing feature (the top three to five to start, from routes, menus or docs). Follow the shape in [`references/feature-map-example/`](references/feature-map-example/): a README index and one file per feature. Each file answers, from the user's point of view, what the feature is, how to reach it, how to drive it with the harness, and what observable end state proves it works, under four H2s: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>` and `Gotchas`. When the seed data lacks a precondition a journey needs, the journey reports a failure and the reason goes in that feature's `Gotchas`; the journey stays as strict as the feature. The map is the repository's maintained verification source: a proof that drives one convenient entry point is incomplete when the map lists others.

## 4. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, doctor, drive one mapped feature, capture evidence, clean up. After cleanup, confirm the evidence still exists at the named location: a cleanup that eats the proof fails this step. Fix what fails, and run the generated cleanup after every failed attempt too, so broken attempts strand no processes or ports. A generated skill that was never executed is a draft, not a deliverable. When you proved it in a stand-in for the real target (a cloud container in place of the maintainer's machine), list every setup step the stand-in did that the target will not; those steps stay unverified until a run on the real target covers them.

## 5. Offer the maintenance loop

Point the user at `/maintain-verification-skill` for keeping the map honest as the app changes.
