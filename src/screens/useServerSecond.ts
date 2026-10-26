'use client'

import { useEffect, useState } from 'react'
import { serverNow } from '../map/states'

/**
 * The server's time, read again on each of its whole seconds while the component is mounted, for
 * what ages by the clock: a card's label, a departure's countdown.
 */
export function useServerSecond(clockOffset: number): number {
  const [now, setNow] = useState(() => serverNow({ clockOffset }))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = serverNow({ clockOffset })
      setNow(at)
      timer = setTimeout(tick, 1000 - (at % 1000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [clockOffset])
  return now
}
