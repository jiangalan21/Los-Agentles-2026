import { describe, expect, it } from 'vitest'
import { hasAllCoreAgentOutputs } from './DashboardView'

describe('dashboard polling completion logic', () => {
  it('returns false when not all four core agents are present', () => {
    const outputs = [{ agentName: 'weather' }, { agentName: 'music' }, { agentName: 'energy' }]
    expect(hasAllCoreAgentOutputs(outputs)).toBe(false)
  })

  it('returns true when all unique core agents are present', () => {
    const outputs = [
      { agentName: 'weather' },
      { agentName: 'outfit' },
      { agentName: 'music' },
      { agentName: 'energy' },
      { agentName: 'energy' },
    ]
    expect(hasAllCoreAgentOutputs(outputs)).toBe(true)
  })
})

