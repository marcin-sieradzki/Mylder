// The little of Node's `process` the tracker's modules touch as they load: the working folder the
// server's timetable and recordings sit under, which the worker never reads, and no settings.
const global = globalThis as { process?: unknown }

global.process ??= { cwd: () => '/', env: {} }
