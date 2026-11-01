// Pass rule: on the quiet saved moment's launch, with Disruptions open from the start and no reload,
// once delays stop arriving a card from Mylder says delays haven't been updated since 09:56, first in
// the tab, captioned as Mylder's, and the tab counts it; no Paused notice anywhere.
import { type Journey, snapshot, untilQuiet } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  const s0 = await snapshot(page)
  console.log('start', new Date(s0.fetched).toISOString(), JSON.stringify(s0.updates))
  expect(s0.updates.fresh, 'precondition: the feed is fresh at launch').toBe(true)
  const upd0 = s0.trips.filter((t: any) => t.updated)
  expect(upd0.length, 'precondition: trips with an update at launch').toBeGreaterThan(0)
  for (const t of upd0) expect(t.state, `${t.key} while fresh`).toBe('estimated')

  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const panel = sheet.getByRole('tabpanel')
  await expect(panel).toContainText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(sheet.getByRole('list', { name: 'From Mylder' })).toHaveCount(0)
  await expect(sheet.getByRole('tab', { name: /^Disruptions/ })).toHaveText(/^Disruptions$/)
  await step('disruptions while the feed is fresh')

  const { lastFresh, quiet } = await untilQuiet(page)
  console.log('quiet at', new Date(quiet.fetched).toISOString(), JSON.stringify(quiet.updates), 'last fresh', lastFresh && new Date(lastFresh.fetched).toISOString())
  const mylder = sheet.getByRole('list', { name: 'From Mylder' })
  await expect(mylder).toContainText('Delays from Rejseplanen not updated since 09:56', { timeout: 120_000 })
  expect(new URL(page.url()).searchParams.get('tab')).toBe('disruptions')
  await step('feed quiet: the card from Mylder')
  await expect(mylder.getByRole('listitem')).toHaveCount(1)
  await expect(mylder).toContainText('From Mylder, about its own data')
  await expect(sheet.getByRole('tab', { name: /^Disruptions/ })).toHaveText(/^Disruptions\s*1$/)
  // first: the card's list sits above the timetable source's sentence
  const cardBox = (await mylder.boundingBox())!
  const sentence = panel.getByText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(sentence).toBeVisible()
  const sBox = (await sentence.boundingBox())!
  expect(cardBox.y, 'card above the sentence').toBeLessThan(sBox.y)
  const statuses = await page.getByRole('status').allInnerTexts()
  console.log('statuses', JSON.stringify(statuses))
  for (const s of statuses) expect(s).not.toMatch(/paused|hasn't answered|not answered|No answer/i)
  await expect(page.getByText(/paused/i)).toHaveCount(0)
  await step('card first, tab counts it, no paused notice')
}
