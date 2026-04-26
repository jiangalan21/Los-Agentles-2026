import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { colors } from '../tokens'

type PulseState = {
  id: number
  color: string
  x: number
  y: number
  size: number
}

const ACCENT_COLORS = [colors.primary, colors.secondary, colors.tertiary, colors.purple, colors.blue] as const

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function createPulse(id: number): PulseState {
  return {
    id,
    color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
    x: randomBetween(6, 94),
    y: randomBetween(6, 94),
    size: randomBetween(460, 760),
  }
}

export function BackgroundPulse() {
  const [pulse, setPulse] = useState<PulseState>(() => createPulse(0))
  const [cycleMs, setCycleMs] = useState(4.2)
  const nextIdRef = useRef(1)

  useEffect(() => {
    let timeoutId: number | undefined
    let isMounted = true

    const scheduleNext = () => {
      const idleDelay = randomBetween(1800, 3200)
      timeoutId = window.setTimeout(() => {
        if (!isMounted) {
          return
        }

        const durationMs = randomBetween(2400, 3000)
        setCycleMs(durationMs / 1000)
        setPulse(createPulse(nextIdRef.current))
        nextIdRef.current += 1
        scheduleNext()
      }, idleDelay)
    }

    scheduleNext()
    return () => {
      isMounted = false
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <motion.div
        key={pulse.id}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0.58, 0.36, 0.2, 0], scale: [0.2, 1.04, 1.12, 1.2, 1.3] }}
        transition={{ duration: cycleMs, times: [0, 0.1, 0.42, 0.72, 1], ease: 'easeOut' }}
        className="absolute rounded-full blur-[110px] mix-blend-screen"
        style={{
          left: `${pulse.x}%`,
          top: `${pulse.y}%`,
          width: `${pulse.size}px`,
          height: `${pulse.size}px`,
          background: `radial-gradient(circle, ${pulse.color} 0%, transparent 80%)`,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
