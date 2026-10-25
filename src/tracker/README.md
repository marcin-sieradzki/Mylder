# Tracker

Runs on the server only. Every module here starts with `import 'server-only'`, so importing one from a client component fails `next build`. Callers go through `index.ts`.
