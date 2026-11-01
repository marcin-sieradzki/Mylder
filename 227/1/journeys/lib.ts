import type { Journey } from '/home/user/mylder-verify/216-branch/.claude/skills/verify-mylder/scripts/drive.ts'
export type { Journey }
export const LAST_MSG = Date.parse('2026-10-31T08:56:07Z') // 09:56:07 Copenhagen
export const snapshot = async (page: Journey['page']) => (await page.request.get('/api/snapshot')).json()
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Waits on the server's clock until /api/snapshot says the feed is quiet; returns the last fresh and first quiet snapshots. */
export async function untilQuiet(page: Journey['page'], timeoutMs = 600_000) {
  const end = Date.now() + timeoutMs
  let lastFresh: any
  for (;;) {
    const s = await snapshot(page)
    if (!s.updates) throw new Error('/api/snapshot has no updates block')
    if (s.updates.fresh === false) return { lastFresh, quiet: s }
    lastFresh = s
    if (Date.now() > end) throw new Error(`precondition: the feed did not go quiet within ${timeoutMs / 1000} s (snapshot fetched ${new Date(s.fetched).toISOString()})`)
    await sleep(10_000)
  }
}
