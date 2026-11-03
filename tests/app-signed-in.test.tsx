/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'no membership' } })),
  }
  return {
    supabase: {
      from: () => chain,
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1', email: 'u@example.com' } } } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
    databaseConfigured: true,
  }
})

describe('Application signed-in error state', () => {
  it('shows sign-in when no session is available in setup-configured mode', async () => {
    // Clear session by forcing getSession to return null after module import.
    const { default: App } = await import('../src/App')
    vi.mocked((await import('../src/lib/supabase')).supabase!.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sign in to your workspace/i })).toBeInTheDocument())
  })
})
