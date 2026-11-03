/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null, databaseConfigured: false }))

describe('Application setup mode', () => {
  it('renders database setup guidance instead of fabricated records', async () => {
    const { default: App } = await import('../src/App')
    render(<App />)
    expect(screen.getByText(/Connect the workspace database to get started/i)).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_URL/i)).toBeInTheDocument()
    expect(screen.queryByText(/EIDEN Sales OS/i)).not.toBeInTheDocument()
  })
})
