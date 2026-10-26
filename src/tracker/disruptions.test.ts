import { describe, expect, it } from 'vitest'
import { modesOf } from './disruptions'

describe('the modes a message concerns', () => {
  it('reads them from its products, in the order the screens list modes', () => {
    // Bus, Metro and an IC train.
    expect(modesOf(32 | 1024 | 1)).toEqual(['metro', 'train', 'bus'])
    expect(modesOf(16)).toEqual(['s-tog'])
  })

  it('counts every train class as Train, and express, night and harbour buses as Bus', () => {
    expect(modesOf(1 | 2 | 4 | 8)).toEqual(['train'])
    expect(modesOf(64 | 128 | 512)).toEqual(['bus'])
    expect(modesOf(2048)).toEqual(['light-rail'])
  })

  it('names none for a message that gives no products, or only ones Mylder does not show', () => {
    expect(modesOf(undefined)).toEqual([])
    expect(modesOf(256 | 4096)).toEqual([])
  })
})
