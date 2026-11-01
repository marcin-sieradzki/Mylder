import { describe, expect, it } from 'vitest'
import { readListener, readUpdates } from './updates'

describe('the update switch, MYLDER_UPDATES', () => {
  it('reads unset, empty, blank and off as off, the default', () => {
    for (const value of [undefined, '', '  ', 'off', ' off ']) {
      expect(readUpdates(value)).toEqual({ kind: 'off' })
    }
  })

  it('reads recording:<folder> as the reader over that folder’s messages', () => {
    expect(readUpdates('recording:siri-et')).toEqual({ kind: 'recording', folder: 'siri-et' })
  })

  it('reads recording:<folder>/<moment> as the same messages from a saved moment’s clock', () => {
    expect(readUpdates('recording:siri-et/quiet')).toEqual({
      kind: 'recording',
      folder: 'siri-et',
      moment: 'quiet',
    })
    expect(() => readUpdates('recording:siri-et/')).toThrow(/recording:<folder>/)
    expect(() => readUpdates('recording:siri-et/a/b')).toThrow(/recording:<folder>/)
  })

  it('reads siri as the listener’s table, fetched over HTTPS', () => {
    expect(readUpdates('siri')).toEqual({ kind: 'siri' })
  })

  it('stops at anything else, naming the choices', () => {
    expect(() => readUpdates('on')).toThrow(/MYLDER_UPDATES="on" is none of off, siri/)
    expect(() => readUpdates('recording:')).toThrow(/recording:<folder>/)
    expect(() => readUpdates('recording:../siri-et')).toThrow(/recording:<folder>/)
  })
})

describe('the listener’s address, MYLDER_UPDATES_URL and MYLDER_UPDATES_TOKEN', () => {
  it('reads the table route’s URL and its token', () => {
    expect(
      readListener({
        MYLDER_UPDATES_URL: ' https://listener.example/table ',
        MYLDER_UPDATES_TOKEN: 'secret',
      }),
    ).toEqual({ url: 'https://listener.example/table', token: 'secret' })
  })

  it('reads none when either is missing or blank', () => {
    expect(readListener({ MYLDER_UPDATES_URL: 'https://listener.example/table' })).toBeUndefined()
    expect(
      readListener({ MYLDER_UPDATES_TOKEN: 'secret', MYLDER_UPDATES_URL: ' ' }),
    ).toBeUndefined()
  })
})
