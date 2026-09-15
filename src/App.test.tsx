// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App gantt interactions', () => {
  it('renders scheduling output and switches gantt scale labels', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    expect(screen.getByText('Editable BOQ and estimating table')).toBeTruthy()
    expect(screen.getAllByText('01 Oct').length).toBeGreaterThan(0)
    expect(container.querySelector('.gantt-bar')?.getAttribute('style')).toContain('span 4')

    await user.clear(screen.getByLabelText('Start date'))
    await user.type(screen.getByLabelText('Start date'), '2026-10-15')
    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(screen.getAllByText(/W1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/15 Oct · W1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/22 Oct · W2/).length).toBeGreaterThan(0)
    expect(container.querySelector('.gantt-bar')?.getAttribute('style')).toContain('span 1')
  })
})
