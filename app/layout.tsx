import type { ReactNode } from 'react'
import '@mylder/perron/perron.css'
import 'maplibre-gl/dist/maplibre-gl.css'

export const metadata = {
  title: 'Mylder map prototype',
  description: 'A throwaway prototype of the live map layer. Simulated vehicles, not live data.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
