import { Suspense } from 'react'
import MapPrototype from './MapPrototype'

// Prototype route (the prototype skill's sub-shape B: there is no map page yet to host variants).
// Three variants of the vehicle glyphs on one route, switchable via `?variant=a|b|c`.
export default function MapPrototypePage() {
  return (
    <Suspense fallback={null}>
      <MapPrototype />
    </Suspense>
  )
}
