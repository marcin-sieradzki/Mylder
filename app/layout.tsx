import '@mylder/perron/perron.css'
import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '../src/screens/Providers'

export const metadata: Metadata = {
  title: 'Mylder',
  description: "A live map of Copenhagen's buses, S-tog, metro and trains.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
