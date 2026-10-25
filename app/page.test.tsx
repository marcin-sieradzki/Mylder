import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Page from './page'

describe('Home page', () => {
  it('says what Mylder is', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mylder' })).toBeInTheDocument()
    expect(screen.getByText(/live map of Copenhagen/i)).toBeInTheDocument()
  })
})
