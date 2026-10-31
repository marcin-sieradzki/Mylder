'use client'

import { useEffect, useState } from 'react'
import { serverNow } from '../map/live'

/**
 * The server's time, read again on each of its whole seconds while the component is mounted, for
 * what ages by the clock: a card's label, a departure's countdown. None while the server's clock
 * isn't known, `clockOffset` unset.
 */
export function useServerSecond(clockOffset: number): number
export function useServerSecond(clockOffset: number | undefined): number | undefined
export function useServerSecond(clockOffset: number | undefined): number | undefined {
  const [now, setNow] = useState(() =>
    clockOffset === undefined ? undefined : serverNow({ clockOffset }),
  )
  useEffect(() => {
    if (clockOffset === undefined) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = serverNow({ clockOffset })
      setNow(at)
      timer = setTimeout(tick, 1000 - (at % 1000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [clockOffset])
  return clockOffset === undefined ? undefined : now
}
