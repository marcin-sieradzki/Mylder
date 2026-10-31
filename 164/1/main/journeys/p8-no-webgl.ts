import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { pause } from './_common.ts'

// Pass rule 8: in a browser without WebGL nothing new appears (the browser's WebGL contexts are refused).
export default async ({ page, step, expect }: Journey) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null
      return (original as any).call(this, type, ...rest)
    } as any
    ;(window as any).WebGLRenderingContext = undefined
    ;(window as any).WebGL2RenderingContext = undefined
  })
  await page.goto('/en')
  await expect(page.getByRole('banner')).toBeVisible()
  await pause(4000)
  const buttons = await page.getByRole('button').evaluateAll((bs) =>
    bs.map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
  )
  console.log('buttons without WebGL', JSON.stringify(buttons))
  console.log('toolbars', await page.getByRole('toolbar').count())
  await step('no WebGL')
  await expect(page.getByRole('button', { name: /3D/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /north/i })).toHaveCount(0)
}
