# Domain docs

How the agent skills read Mylder's domain documentation. Mylder is a single context.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: the ADRs that touch the area you're about to work in.

If either doesn't exist yet, **proceed silently**. Don't flag its absence or suggest creating it upfront: the `domain-modeling` skill, which `wayfinder`'s grilling tickets call, creates them lazily when a term or decision is actually resolved.

## File structure

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-slug.md
│   └── 0002-slug.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a proposal, a hypothesis, a test name), use the term as `GLOSSARY.md` defines it. Don't drift to synonyms the glossary avoids.

If the concept you need isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than silently overriding it:

> _Contradicts ADR-0007 (vehicle positions are reported, never guessed), but worth reopening because…_
