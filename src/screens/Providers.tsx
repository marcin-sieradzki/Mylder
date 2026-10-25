'use client'

import { PerronProvider } from '@mylder/perron'
import type { ReactNode } from 'react'

/** The client providers the server shell wraps the app in once. */
export function Providers({ children }: { children: ReactNode }) {
  return <PerronProvider>{children}</PerronProvider>
}
