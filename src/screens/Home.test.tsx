import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import { Home } from './Home'
import { Providers } from './Providers'

describe('Home', () => {
  it('shows the Mylder brand in the banner and says what Mylder is, in English', () => {
    render(
      <Providers lang="en" dictionary={en}>
        <Home />
      </Providers>,
    )
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toHaveAttribute('href', '/en')
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        level: 1,
        name: 'All of Copenhagen moving on one map',
      }),
    ).toBeInTheDocument()
    const languages = screen.getByRole('navigation', { name: 'Language' })
    expect(within(languages).getByRole('link', { name: 'Dansk' })).toHaveAttribute('hreflang', 'da')
  })

  it('says the same in Danish', () => {
    render(
      <Providers lang="da" dictionary={da}>
        <Home />
      </Providers>,
    )
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Mylder' }),
    ).toHaveAttribute('href', '/da')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hele København i bevægelse på ét kort' }),
    ).toBeInTheDocument()
    const languages = screen.getByRole('navigation', { name: 'Sprog' })
    expect(within(languages).getByRole('link', { name: 'English' })).toHaveAttribute(
      'hreflang',
      'en',
    )
  })
})
