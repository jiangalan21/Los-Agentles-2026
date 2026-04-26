import { describe, expect, it } from 'vitest'
import { buildEnergyGeometry, getTimeMarkerX, parseClockToMinutes } from './DashboardCard'

describe('energy graph time mapping', () => {
  it('parses 12-hour labels into minutes', () => {
    expect(parseClockToMinutes('10:30 AM')).toBe(630)
    expect(parseClockToMinutes('2:00 PM')).toBe(840)
  })

  it('uses time-aware x positioning for points', () => {
    const geometry = buildEnergyGeometry([
      { timeLabel: '8:00 AM', value: 50 },
      { timeLabel: '10:00 AM', value: 80 },
      { timeLabel: '2:00 PM', value: 60 },
    ])
    expect(geometry.points[0].x).toBe(0)
    expect(geometry.points[2].x).toBe(geometry.width)
    expect(geometry.points[1].x).toBeCloseTo(geometry.width / 3, 1)
  })

  it('positions peak marker using actual time scale', () => {
    const geometry = buildEnergyGeometry([
      { timeLabel: '8:00 AM', value: 50 },
      { timeLabel: '10:00 AM', value: 80 },
      { timeLabel: '2:00 PM', value: 60 },
    ])
    const peakX = getTimeMarkerX('10:00 AM', geometry.minMinute, geometry.maxMinute, geometry.width)
    expect(peakX).not.toBeNull()
    expect(peakX!).toBeCloseTo(geometry.width / 3, 1)
  })
})

