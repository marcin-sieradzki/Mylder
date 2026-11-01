# One Next.js package, no workspaces

> Amended by [ADR 0019](0019-siri-et-brings-delays-and-cancellations-through-one-always-on-listener.md): the SIRI-ET listener is a second deployable, its own container image on Fly.io, built from a second entry point in this one package (`src/listener/main.ts`). The package stays one, with no workspaces: the listener's folders are fenced by lint from the app's, as the tracker's are.

Mylder is one deployable, a Next.js app on Vercel, whose tracker module is meant to be movable to an always-on service later. We keep one package at the repo root rather than npm workspaces with a `tracker` and a `domain` package: the boundaries are folders (`src/tracker/` with `server-only`, `src/map/` with `client-only`, `src/domain/` importing nothing from the others) that fail the build on a wrong import, which is all the separation a move needs, and a workspace would add a build step, a second `package.json` and version plumbing for code only this app uses. Perron, the design system, is the only shared package, and it is consumed from npm at an exact version; a local link while both repos change stays on the developer's machine and is never committed, because CI and Vercel install from npm.

## Consequences

- Moving the tracker out later means copying `src/tracker/` and `src/domain/` behind an HTTP server and changing the route handlers' callers, not untangling a package graph.
- Mylder cannot use a Perron component before it is published; until the Perron release with its components (0.2.0 as its changesets stand) is on npm, screen work runs on a local link and its pull requests wait.
