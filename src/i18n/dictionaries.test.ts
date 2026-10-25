import { describe, expect, it } from 'vitest'
import da from './da.json'
import en from './en.json'

/** Every key path in a dictionary, such as `home.heading`, with its value. */
function entries(dictionary: object, prefix = ''): [string, unknown][] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? entries(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  )
}

describe('dictionaries', () => {
  it('give Danish every English key and no other', () => {
    const keys = (dictionary: object) =>
      entries(dictionary)
        .map(([key]) => key)
        .sort()
    expect(keys(da)).toEqual(keys(en))
  })

  it('hold a non-empty string at every key', () => {
    const empty = [...entries(en), ...entries(da)]
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key)
    expect(empty).toEqual([])
  })
})
