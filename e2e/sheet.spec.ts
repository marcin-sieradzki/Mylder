import { expect, test } from './recording'

// The sheet beside the map on the weekday recording.

test('a reload and the language switch keep the open tab', async ({ page }) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL('/en?tab=vehicles')
  await page.reload()
  await expect(sheet.getByRole('tab', { name: /^Vehicles/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page
    .getByRole('navigation', { name: 'Language' })
    .getByRole('link', { name: 'Dansk' })
    .click()
  await expect(page).toHaveURL('/da?tab=vehicles')
  await expect(
    page.getByRole('dialog', { name: 'Overblik' }).getByRole('tab', { name: /^Køretøjer/ }),
  ).toHaveAttribute('aria-selected', 'true')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the peek keeps the credit and the Updated line in view', async ({ page }) => {
    await page.goto('/en')
    const sheet = page.getByRole('dialog', { name: 'Overview' })
    await expect(sheet).toHaveAttribute('data-anchor', 'bottom')
    await expect(sheet.getByRole('group', { name: 'On the move' })).toBeVisible()

    const updated = page.getByRole('banner').getByText(/^Updated /)
    const credit = page.getByRole('link', { name: 'Rejseplanen' })
    await expect(updated).toBeInViewport()
    await expect(credit).toBeInViewport()
    // Neither sits under the sheet at its peek, once it has settled there.
    await expect
      .poll(async () => {
        const top = (await sheet.boundingBox())!.y
        const below = async (locator: typeof credit) => {
          const box = (await locator.boundingBox())!
          return box.y + box.height <= top
        }
        return [await below(updated), await below(credit)]
      })
      .toEqual([true, true])
  })
})

test('the Vehicles list has a row for every vehicle the map draws', async ({ page }) => {
  await page.goto('/en?tab=vehicles')
  const map = page.locator('[data-vehicles]')
  const table = page
    .getByRole('dialog', { name: 'Overview' })
    .getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  // One row per vehicle drawn, the header row aside, both from the same snapshot.
  const counts = async () => {
    const drawn = Number(await map.getAttribute('data-vehicles'))
    const rows = (await table.getByRole('row').count()) - 1
    return { drawn, same: drawn > 0 && rows === drawn }
  }
  await expect.poll(async () => (await counts()).same).toBe(true)

  // A row's destination opens that vehicle's detail, in place.
  await table.getByRole('link', { name: 'Næstved St.' }).click()
  await expect(page).toHaveURL(/[?&]trip=train\.RE\./)
  await expect(page.getByRole('dialog', { name: /to Næstved St\./ })).toBeVisible()
})
