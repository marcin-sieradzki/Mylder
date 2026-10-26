import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The map itself draws with WebGL, which jsdom lacks; the end-to-end test sees its canvas.
describe('the map screen', () => {
  it('keeps the brand and the language switch over the map, in English', () => {
    render(
      <Providers lang="en" dictionary={en}>
        <MapScreen />
      </Providers>,
    )
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toHaveAttribute('href', '/en')
    const languages = within(banner).getByRole('navigation', { name: 'Language' })
    expect(within(languages).getByRole('link', { name: 'Dansk' })).toHaveAttribute('hreflang', 'da')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('says the same in Danish', () => {
    render(
      <Providers lang="da" dictionary={da}>
        <MapScreen />
      </Providers>,
    )
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toHaveAttribute('href', '/da')
    const languages = within(banner).getByRole('navigation', { name: 'Sprog' })
    expect(within(languages).getByRole('link', { name: 'English' })).toHaveAttribute(
      'hreflang',
      'en',
    )
  })
})
