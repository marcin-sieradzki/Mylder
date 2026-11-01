import { describe, expect, it } from 'vitest'
import { readUpdates } from './updates'

describe('the update switch, MYLDER_UPDATES', () => {
  it('reads unset, empty, blank and off as off, the default', () => {
    for (const value of [undefined, '', '  ', 'off', ' off ']) {
      expect(readUpdates(value)).toEqual({ kind: 'off' })
    }
  })

  it('reads recording:<folder> as the reader over that folder’s messages', () => {
    expect(readUpdates('recording:siri-et')).toEqual({ kind: 'recording', folder: 'siri-et' })
  })

  it('reads siri as the listener’s table in the store', () => {
    expect(readUpdates('siri')).toEqual({ kind: 'siri' })
  })

  it('stops at anything else, naming the choices', () => {
    expect(() => readUpdates('on')).toThrow(/MYLDER_UPDATES="on" is none of off, siri/)
    expect(() => readUpdates('recording:')).toThrow(/recording:<folder>/)
  })
})
