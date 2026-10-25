# Map layer

Runs in the browser only. Every module here starts with `import 'client-only'`, so importing one from a server module fails `next build`. Callers go through `index.ts`.
