import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AppProviders from './AppProviders'

vi.mock('@clerk/react', function () {
  return {
    ClerkProvider: function FakeClerkProvider(props: {
      children: ReactNode
      telemetry?: boolean
    }) {
      return <div data-testid="clerk-provider" data-telemetry={String(props.telemetry)}>{props.children}</div>
    },
  }
})

describe('browser provider boundary', function () {
  it('passes the telemetry opt-out to the rendered Clerk provider', function () {
    render(<AppProviders><span>application</span></AppProviders>)
    expect(screen.getByTestId('clerk-provider')).toHaveAttribute('data-telemetry', 'false')
  })
})
