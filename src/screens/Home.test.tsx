import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './Home'

describe('Home', () => {
  it('shows the Mylder brand in the banner and says what Mylder is', () => {
    render(<Home />)
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        level: 1,
        name: 'Watch Copenhagen move.',
      }),
    ).toBeInTheDocument()
  })
})
