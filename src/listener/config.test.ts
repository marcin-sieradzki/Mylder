// The listener's settings (#217): all from the environment, and a clear error naming each
// variable missing or wrong, never its value, when one is. The last test starts the entry point in
// plain Node, as the container image does.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readConfig } from './config'

const SECRET = 'fake-secret-7f3a9c2e'
const TOKEN = 'fake-updates-token-4e8b6d1f0a2c3e5f'
const env = {
  DU_CLIENT_ID: 'fake-client',
  DU_TENANT_ID: 'fake-tenant',
  DU_SECRET: SECRET,
  DU_ADDRESSES:
    'amqps://broker.example/t-distribution-788/sub-a amqps://broker.example/t-distribution-785/sub-b',
  MYLDER_UPDATES_TOKEN: TOKEN,
  MYLDER_APP_URL: 'https://mylder.example',
}

describe('the listener’s settings', () => {
  it('reads every one from the environment', () => {
    expect(readConfig({ ...env, PORT: '9000' })).toEqual({
      clientId: 'fake-client',
      tenantId: 'fake-tenant',
      secret: SECRET,
      datasets: [
        {
          host: 'broker.example',
          topic: 't-distribution-788',
          subscription: 'sub-a',
          dataset: '788',
        },
        {
          host: 'broker.example',
          topic: 't-distribution-785',
          subscription: 'sub-b',
          dataset: '785',
        },
      ],
      token: TOKEN,
      appUrl: 'https://mylder.example',
      port: 9000,
    })
    expect(readConfig(env).port).toBe(8080)
  })

  it('names every variable that is missing, and none’s value', () => {
    expect(() => readConfig({ DU_SECRET: SECRET })).toThrow(
      'The listener can’t start: DU_CLIENT_ID, DU_TENANT_ID, DU_ADDRESSES, MYLDER_UPDATES_TOKEN and MYLDER_APP_URL are not set',
    )
  })

  it('refuses a short token, an address of another shape or an app that isn’t a URL', () => {
    const wrong = (changed: Record<string, string>) => {
      try {
        readConfig({ ...env, ...changed })
      } catch (error) {
        return (error as Error).message
      }
    }
    expect(wrong({ MYLDER_UPDATES_TOKEN: 'short' })).toMatch(
      /MYLDER_UPDATES_TOKEN is shorter than 32 characters/,
    )
    expect(wrong({ DU_ADDRESSES: 'amqps://broker.example/topic-788/sub-a' })).toMatch(
      /DU_ADDRESSES holds an address not of the form amqps:\/\/<host>\/t-distribution-<dataset>\/<subscription>/,
    )
    expect(wrong({ MYLDER_APP_URL: 'mylder' })).toMatch(/MYLDER_APP_URL is not a URL/)
    expect(wrong({ PORT: 'eighty' })).toMatch(/PORT is not a port/)
    for (const message of [wrong({ MYLDER_UPDATES_TOKEN: 'short' }), wrong({ PORT: 'x' })]) {
      expect(message).not.toContain(SECRET)
      expect(message).not.toContain('sub-a')
    }
  })

  it('stops the entry point with a clear error when a variable is missing', () => {
    const { MYLDER_APP_URL: _, ...missing } = env
    const started = spawnSync(process.execPath, [join('src', 'listener', 'main.ts')], {
      env: { PATH: process.env.PATH, ...missing },
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(started.status).toBe(1)
    expect(started.stderr).toContain('The listener can’t start: MYLDER_APP_URL is not set')
    expect(started.stdout + started.stderr).not.toContain(SECRET)
    expect(started.stdout + started.stderr).not.toContain(TOKEN)
  })
})
