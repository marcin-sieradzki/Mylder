// The listener's settings (#217), every one from the environment, which only the host's secrets
// set: a missing or malformed variable stops it at start with an error naming the variable,
// never its value.
import type { DatasetAddress, ListenerConfig } from './run.ts'

/** The variables, by the setting each gives. */
export const VARIABLES = {
  clientId: 'DU_CLIENT_ID',
  tenantId: 'DU_TENANT_ID',
  secret: 'DU_SECRET',
  /** One AMQP address a dataset, separated by spaces, commas or new lines. */
  addresses: 'DU_ADDRESSES',
  token: 'MYLDER_UPDATES_TOKEN',
  appUrl: 'MYLDER_APP_URL',
  port: 'PORT',
} as const

/** The port it listens on when `PORT` isn't set. */
export const DEFAULT_PORT = 8080

/** The table route's token is at least this long, so it can't be guessed. */
export const TOKEN_LENGTH = 32

export class ConfigError extends Error {}

type Environment = Readonly<Record<string, string | undefined>>

/** The settings, or a `ConfigError` naming every variable missing or wrong. */
export function readConfig(env: Environment): ListenerConfig {
  const value = (name: string) => env[name]?.trim() ?? ''
  const required = [
    VARIABLES.clientId,
    VARIABLES.tenantId,
    VARIABLES.secret,
    VARIABLES.addresses,
    VARIABLES.token,
    VARIABLES.appUrl,
  ]
  const missing = required.filter((name) => !value(name))
  if (missing.length > 0) {
    throw new ConfigError(
      `The listener can’t start: ${listed(missing)} ${missing.length > 1 ? 'are' : 'is'} not set`,
    )
  }
  const wrong: string[] = []
  const datasets = value(VARIABLES.addresses)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(readAddress)
  if (datasets.some((address) => !address)) {
    wrong.push(
      `${VARIABLES.addresses} holds an address not of the form amqps://<host>/t-distribution-<dataset>/<subscription>`,
    )
  }
  if (value(VARIABLES.token).length < TOKEN_LENGTH) {
    wrong.push(`${VARIABLES.token} is shorter than ${TOKEN_LENGTH} characters`)
  }
  if (!URL.canParse(value(VARIABLES.appUrl))) wrong.push(`${VARIABLES.appUrl} is not a URL`)
  const port = value(VARIABLES.port) ? Number(value(VARIABLES.port)) : DEFAULT_PORT
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    wrong.push(`${VARIABLES.port} is not a port`)
  }
  if (wrong.length > 0) throw new ConfigError(`The listener can’t start: ${wrong.join('; ')}`)
  return {
    clientId: value(VARIABLES.clientId),
    tenantId: value(VARIABLES.tenantId),
    secret: value(VARIABLES.secret),
    datasets: datasets as DatasetAddress[],
    token: value(VARIABLES.token),
    appUrl: value(VARIABLES.appUrl),
    port,
  }
}

/** An address in `DU_ADDRESSES`: `amqps://<host>/t-distribution-<dataset>/<subscription>`. */
export function readAddress(address: string): DatasetAddress | undefined {
  const match = /^amqps:\/\/([^/]+)\/(t-distribution-(\d+))\/([^/]+)$/.exec(address.trim())
  if (!match) return undefined
  const [, host, topic, dataset, subscription] = match
  return { host, topic, subscription, dataset }
}

/** Names joined as a sentence says them: "A, B and C". */
const listed = (names: readonly string[]): string =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
