// Regression, vehicle-detail "With SIRI-ET's delays" (the 214 verifier's journey, reused): a late bus's panel.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { vehicleDelay } from './v214/lib.ts'
export default async (j: Journey) => {
  await vehicleDelay(j, 'en', 'late')
  // the snapshot's delay is the delay at the next call, as the panel gives it
  const { page, expect } = j
  const key = new URL(page.url()).searchParams.get('trip')!
  await expect.poll(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    const t = s.trips.find((x: any) => x.key === key)
    const f = await (await page.request.get(`/api/trips/${encodeURIComponent(key)}`)).json()
    const c = f.calls.find((c: any) => c.name === t.next?.[0]?.name) ?? null
    console.log('snapshot delay', t.delay, 'next', JSON.stringify(t.next?.[0]), 'call', JSON.stringify(c))
    return t.next?.[0] ? 'ok' : 'no next'
  }, { timeout: 30_000 }).toBe('ok')
}
