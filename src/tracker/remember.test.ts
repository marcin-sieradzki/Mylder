import { Context, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { remember, rememberRuntime } from './remember'

describe('remember', () => {
  it('builds once and keeps what it built', async () => {
    let builds = 0
    const runtime = remember(async () => ++builds)
    expect(await Promise.all([runtime(), runtime()])).toEqual([1, 1])
    expect(await runtime()).toBe(1)
  })

  it('forgets a build that failed, so the next ask builds again', async () => {
    let builds = 0
    const runtime = remember(async () => {
      if (++builds === 1) throw new Error('no timetable')
      return builds
    })
    await expect(runtime()).rejects.toThrow('no timetable')
    expect(await runtime()).toBe(2)
  })
})

class Recording extends Context.Service<Recording, { readonly calls: number }>()(
  'mylder/tracker/remember.test/Recording',
) {}

describe('rememberRuntime', () => {
  it('forgets a runtime whose layer failed to build, so the next ask builds it again', async () => {
    let builds = 0
    const runtime = rememberRuntime(async () =>
      Layer.effect(
        Recording,
        Effect.suspend(() =>
          ++builds === 1
            ? Effect.die(new Error('a malformed recording'))
            : Effect.succeed({ calls: builds }),
        ),
      ),
    )
    await expect(runtime()).rejects.toThrow('a malformed recording')
    const built = await runtime()
    const read = Effect.gen(function* () {
      return yield* Recording
    })
    expect(await built.runPromise(read)).toEqual({ calls: 2 })
    expect(await runtime()).toBe(built)
  })
})
