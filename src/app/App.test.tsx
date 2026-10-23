import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.tsx'

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Mylder' })).toBeInTheDocument()
  })

  it('runs on React 19', () => {
    render(<App />)
    expect(screen.getByText(/^React 19\./)).toBeInTheDocument()
  })
})
