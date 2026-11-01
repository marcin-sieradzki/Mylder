import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const dots = page.locator('[data-vehicles]')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map flat')
  const vp = page.viewportSize()!
  const x = vp.width / 2, y = vp.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 150, y, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(dots).not.toHaveAttribute('data-heading', '0')
  await expect(dots).toHaveAttribute('data-tilt', '0')
  await step('right-drag turned')
  const heading = await dots.getAttribute('data-heading')
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(dots).not.toHaveAttribute('data-tilt', '0')
  await expect(dots).toHaveAttribute('data-heading', heading!)
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
  await step('right-drag tilted')
}
