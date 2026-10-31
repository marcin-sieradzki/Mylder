import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  // Precondition: a stop with more than 4 trips standing at once. Ask every stop of the timetable.
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded')
  const ids: string[] = ["20","663","664","718","738","807","1956","1957","1958","1959","1962","1964","1969","1975","2008","2009","2010","2012","2121","2143","2146","2148","2149","2150","2151","2152","2157","2219","2753","2988","3000","3001","3002","3005","10760","10761","10762","10765","10843","27526","27532","27539","29944","30090","45739","46205","46206","48645","52538","52836","54303","54304","54307","8600626","8600634","8600636","8600645","8600650","8600653","8600654","8600655","8600672","8600673","8600674","8600675","8600676","8600677","8600678","8600681","8600683","8600700","8600760","8600761","8600763","8600764","8600765","8600766","8600767","8600768","8600769","8600770","8600771","8600783","8600790","8600791","8600792","8600793","8600797","8600803","8600805","8600806","8600807","8600809","8600810","8600909","8603301","8603302","8603303","8603304","8603305","8603306","8603308","8603309","8603310","8603311","8603312","8603313","8603315","8603317"] // every stop in the weekday timetable's stops.json
  let best = { id: '', n: 0 }
  for (const id of ids) {
    const j = await (await page.request.get('/api/stops/' + id)).json().catch(() => ({}))
    const n = (j.standing ?? []).length
    if (n > best.n) best = { id, n }
  }
  if (best.n <= 4) throw new Error('Precondition not in the recording: of ' + ids.length + ' stops, the most trips standing at one stop now is ' + best.n + (best.id ? ' (stop ' + best.id + ')' : '') + '; "Show all N" needs more than 4')
  await page.goto('/en?stop=' + best.id)
  const standing = page.getByRole('region', { name: 'At the platforms now' })
  await expect(standing.getByRole('listitem')).toHaveCount(4)
  await step('four rows and show all')
  await standing.getByRole('button', { name: 'Show all ' + best.n }).click()
  await expect(standing.getByRole('listitem')).toHaveCount(best.n)
  await step('all rows shown')
}
