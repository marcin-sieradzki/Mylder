// The listener's entry point (#217, ADR 0019), the second in this package beside the app (ADR
// 0012), run by the container image as `node src/listener/main.ts`: it reads its settings, starts
// its links to Dataudveksleren and serves its table on one port, until the host stops it.
import { ConfigError, readConfig } from './config.ts'
import { connectAmqp } from './amqp.ts'
import { jsonLog } from './log.ts'
import { startListener } from './run.ts'
import { serve } from './server.ts'

/** The image's version, which its table names: the commit it was built from. */
const VERSION = process.env.MYLDER_LISTENER_VERSION?.trim() || 'dev'

function settings() {
  try {
    return readConfig(process.env)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}

const config = settings()
const running = startListener({
  config,
  connect: connectAmqp,
  fetch: globalThis.fetch,
  log: jsonLog,
  version: VERSION,
})
const server = await serve(running.listener.handle, config.port)
jsonLog({ level: 'info', message: `The listener serves its table on port ${config.port}` })

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    running.stop()
    server.close(() => process.exit(0))
  })
}
