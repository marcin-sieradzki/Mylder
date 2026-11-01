// Regression on the timetable source: the banner and legend (map-timetable), and About's
// source, note, credit and Disruptions fact together (about-timetable, dis-timetable), EN and DA.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const L = {
  en: {
    banner: "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be.",
    legend: "Every vehicle is Timetable only for now: live positions aren't connected yet.",
    about: 'About Mylder', aboutBtn: 'About Mylder',
    source: ['Source', "Rejseplanen's timetable, no live positions yet"],
    note: "The positions on this page are the timetable's plan, not reports from the vehicles.",
    credit: /Timetable data: Rejseplanen, under CC BY 4\.0\. Timetable of 1 November( 2026)?\./,
    facts: [['Positions', 'No position calls'], ['Calls this month', '0'], ['Disruptions', 'Not connected yet']],
    tab: '?tab=disruptions', sentence: "Disruption messages come with Rejseplanen's live connection, which isn't connected yet.",
    notReal: /not real/i,
  },
  da: {
    banner: 'Kun køreplan: der er endnu ingen livepositioner, så hvert køretøj er placeret, hvor køreplanen siger, det skal være.',
    legend: 'Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.',
    about: 'Om Mylder', aboutBtn: 'Om Mylder',
    source: ['Kilde', 'Rejseplanens køreplan, endnu ingen livepositioner'],
    note: 'Positionerne på denne side er køreplanens plan, ikke meldinger fra køretøjerne.',
    credit: /Køreplansdata: Rejseplanen, under CC BY 4\.0\. Køreplan fra 1\. november( 2026)?\./,
    facts: [['Driftsforstyrrelser', 'Ikke koblet på endnu']],
    tab: '?tab=disruptions', sentence: 'Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.',
    notReal: /ikke ægte|ikke rigtige/i,
  },
} as const
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da'] as const) {
    const w = L[lang]
    await page.goto(`/${lang}${w.tab}`)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    // banner: the only status outside a dialog is the timetable one, then the planes' sentence
    const statuses = page.locator('[role=status]:not([role=dialog] [role=status])')
    await expect(statuses.filter({ hasText: w.banner })).toHaveCount(1)
    const st = (await statuses.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
    console.log(`${lang} statuses: ${JSON.stringify(st)}`)
    expect(st[0].startsWith(w.banner)).toBe(true)
    expect(st.join(' ')).not.toMatch(/paused|hasn't answered|sat på pause|har ikke svaret/i)
    await expect(page.getByRole('list', { name: lang === 'en' ? 'Data states' : 'Datatilstande' }).locator('xpath=..')).toContainText(w.legend)
    await expect(page.getByRole('tabpanel')).toHaveText(w.sentence)
    await step(`${lang} banner, legend and disruptions`)
    const snap = await (await page.request.get('/api/snapshot')).json()
    expect(snap.status.timetable.prepared).toBe('2026-11-01')
    await page.getByRole('button', { name: w.aboutBtn }).click()
    const dialog = page.getByRole('dialog', { name: w.about })
    await expect(dialog).toBeVisible()
    const text = (await dialog.innerText()).replace(/\s+/g, ' ')
    console.log(`${lang} about: ${text}`)
    expect(text).toContain(`${w.source[0]} ${w.source[1]}`)
    expect(text).toContain(w.note)
    expect(text).not.toMatch(w.notReal)
    expect(text).toMatch(w.credit)
    for (const [k, v] of w.facts) expect(text).toMatch(new RegExp(`${k}:? ${v}( |$)`))
    if (lang === 'en') expect(text).toContain("Every vehicle is Timetable only for now: live positions aren't connected yet.")
    await step(`${lang} About, top`)
    await dialog.getByText(w.credit).scrollIntoViewIfNeeded()
    await step(`${lang} About, credit`)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
}
