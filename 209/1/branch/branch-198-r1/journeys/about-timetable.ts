import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// language-and-about: about-timetable on the default source.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map')
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  await expect(about).toContainText("Rejseplanen's timetable, no live positions yet")
  await expect(about).toContainText("The positions on this page are the timetable's plan, not reports from the vehicles.")
  await expect(about).not.toContainText('not real')
  await expect(about).toContainText(/Timetable data: Rejseplanen, under CC BY 4\.0\. Timetable of [^.]+\./)
  await expect(about).toContainText("Every vehicle is Timetable only for now: live positions aren't connected yet.")
  await expect(about).toContainText('No position calls')
  await expect(about).toContainText(/Calls this month\s*0/)
  await step('about')
  await page.keyboard.press('Escape')
  await expect(about).toHaveCount(0)
  await page.goto('/da')
  await page.getByRole('button', { name: 'Om Mylder' }).click()
  const om = page.getByRole('dialog', { name: 'Om Mylder' })
  await expect(om).toContainText('Rejseplanens køreplan, endnu ingen livepositioner')
  await expect(om).toContainText('Positionerne på denne side er køreplanens plan, ikke meldinger fra køretøjerne.')
  await expect(om).toContainText(/Køreplansdata: Rejseplanen, under CC BY 4\.0\. Køreplan fra /)
  await step('om mylder')
}
