import { motion } from 'framer-motion'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { animation, colors } from '../tokens'

type DashboardCardProps = {
  accent: string
  icon: ReactNode
  label: string
  value: string
  detail: string
  previewData: string
  isLoading?: boolean
  onClick?: () => void
  feedbackState?: 'liked' | 'disliked' | null
  onLike?: () => void
  onDislike?: () => void
  energyCurve?: Array<{ timeLabel: string; value: number }>
  energyWindows?: { peakStart?: string; peakEnd?: string; dipStart?: string; dipEnd?: string } | null
  quoteText?: string
}

export function DashboardCard({
  accent,
  icon,
  label,
  value,
  detail,
  previewData,
  isLoading = false,
  onClick,
  feedbackState = null,
  onLike,
  onDislike,
  energyCurve,
  energyWindows,
  quoteText,
}: DashboardCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const showFeedback = label.toLowerCase() !== 'energy' && Boolean(onLike || onDislike)
  const shouldShowEnergyInsights = !isLoading && label.toLowerCase() === 'energy' && Array.isArray(energyCurve) && energyCurve.length > 1
  const chartGeometry = shouldShowEnergyInsights ? buildEnergyGeometry(energyCurve) : null
  const axisTicks =
    chartGeometry && chartGeometry.points.length > 2
      ? [chartGeometry.points[0], chartGeometry.points[Math.floor(chartGeometry.points.length / 2)], chartGeometry.points[chartGeometry.points.length - 1]]
      : chartGeometry?.points ?? []
  const peakMarkerX = chartGeometry ? getTimeMarkerX(energyWindows?.peakStart, chartGeometry.minMinute, chartGeometry.maxMinute, chartGeometry.width) : null
  const dipMarkerX = chartGeometry ? getTimeMarkerX(energyWindows?.dipStart, chartGeometry.minMinute, chartGeometry.maxMinute, chartGeometry.width) : null

  return (
    <motion.article
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={isLoading ? undefined : onClick}
      onKeyDown={(event) => {
        if (!isLoading && (event.key === 'Enter' || event.key === ' ') && onClick) {
          event.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      transition={{ duration: animation.standard, ease: 'easeOut' }}
      animate={{
        y: isHovered ? -8 : 0,
        borderColor: isHovered ? accent : colors.border,
        boxShadow: isHovered ? `0 24px 64px ${accent}33` : '0 0 0 rgba(0,0,0,0)',
      }}
      className={`group relative ${shouldShowEnergyInsights ? 'min-h-[340px]' : 'min-h-[260px]'} overflow-hidden rounded-2xl border-2 bg-card p-8 outline-none focus-visible:border-[var(--focus-accent)] focus-visible:shadow-[0_0_0_2px_rgba(248,248,248,0.12)] ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
      style={{ ['--focus-accent' as string]: accent }}
    >
      <motion.span
        aria-hidden
        animate={{ width: isHovered ? 4 : 2, backgroundColor: accent }}
        transition={{ duration: animation.standard, ease: 'easeOut' }}
        className="absolute left-0 top-0 h-full"
      />

      <motion.div
        aria-hidden
        animate={{ opacity: isHovered ? 0.2 : 0.08, scale: isHovered ? 1.25 : 0.85 }}
        transition={{ duration: animation.standard, ease: 'easeOut' }}
        className="pointer-events-none absolute -bottom-20 -right-20 h-52 w-52 rounded-full blur-3xl"
        style={{ backgroundColor: accent }}
      />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between">
          <motion.div
            animate={{
              scale: isHovered ? 1.1 : 1,
              boxShadow: isHovered ? `0 0 24px ${accent}66` : `0 0 0 ${accent}00`,
            }}
            transition={{ duration: animation.standard, ease: 'easeOut' }}
            className="flex h-14 w-14 items-center justify-center rounded-xl border-2 text-xl"
            style={{
              color: accent,
              borderColor: `${accent}AA`,
              backgroundColor: `${accent}1A`,
            }}
          >
            {icon}
          </motion.div>

          <motion.span
            animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : -6 }}
            transition={{ duration: animation.fast, ease: 'easeOut' }}
            className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70"
          >
            {isLoading ? 'Loading...' : 'Click to expand'}
          </motion.span>
        </div>

        <div className="mt-8 space-y-2">
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
            {label}
          </p>
          {isLoading ? (
            <>
              <div className="dayger-shimmer h-12 w-2/3 rounded-lg" />
              <div className="dayger-shimmer h-5 w-4/5 rounded-lg" />
            </>
          ) : (
            <>
              <h3 className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.03em]">{value}</h3>
              <p className="font-body text-base font-medium text-foreground/80">{detail}</p>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="mt-auto space-y-2 pt-6">
            <div className="dayger-shimmer h-4 w-5/6 rounded-lg" />
            <div className="dayger-shimmer h-4 w-3/4 rounded-lg" />
          </div>
        ) : (
          <div className={`mt-auto ${shouldShowEnergyInsights ? 'pt-3' : 'pt-6'}`}>
            {shouldShowEnergyInsights && chartGeometry ? (
              <div className="mb-2 space-y-3 rounded-xl border border-border/70 bg-muted/30 p-2">
                <svg viewBox={`0 0 ${chartGeometry.width} 184`} className="h-72 w-full">
                  <line x1="0" y1="150" x2={chartGeometry.width} y2="150" stroke={`${accent}66`} strokeWidth="1.2" />
                  {axisTicks.map((tick) => (
                    <g key={`${tick.timeLabel}-${tick.x}`}>
                      <line x1={tick.x} y1="150" x2={tick.x} y2="154" stroke={`${accent}99`} strokeWidth="1.1" />
                      <text x={tick.x} y="176" textAnchor="middle" fill="currentColor" className="text-[9px] uppercase tracking-[0.1em] text-foreground/65">
                        {tick.timeLabel}
                      </text>
                    </g>
                  ))}
                  {peakMarkerX !== null ? (
                    <line x1={peakMarkerX} y1="8" x2={peakMarkerX} y2="150" stroke={`${accent}80`} strokeWidth="1.2" strokeDasharray="3 3" />
                  ) : null}
                  {dipMarkerX !== null ? (
                    <line x1={dipMarkerX} y1="8" x2={dipMarkerX} y2="150" stroke="#F87171AA" strokeWidth="1.2" strokeDasharray="3 3" />
                  ) : null}
                  <path d={chartGeometry.path} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/70">
                    Peak {energyWindows?.peakStart ?? '--'} - {energyWindows?.peakEnd ?? '--'}
                  </span>
                  <span className="rounded-full border border-border/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/70">
                    Dip {energyWindows?.dipStart ?? '--'} - {energyWindows?.dipEnd ?? '--'}
                  </span>
                </div>
                {quoteText ? (
                  <div
                    className="rounded-lg border px-3 py-2"
                    style={{
                      borderColor: `${accent}66`,
                      background: `linear-gradient(135deg, ${accent}22 0%, transparent 100%)`,
                    }}
                  >
                    <p className="font-body text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>
                      Motivation
                    </p>
                    <p className="mt-1 font-display text-sm font-bold leading-snug tracking-[-0.01em] text-foreground">
                      "{quoteText}"
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!shouldShowEnergyInsights ? (
              <motion.p
                animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
                transition={{ duration: animation.standard, ease: 'easeOut' }}
                className="font-body text-sm font-medium text-foreground/75"
              >
                {previewData}
              </motion.p>
            ) : null}
          </div>
        )}

        {showFeedback ? (
          <div className="mt-4 flex items-center gap-2">
            {onLike ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={(event) => {
                  event.stopPropagation()
                  onLike()
                }}
                className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-tertiary/60 hover:text-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Like ${label}`}
              >
                <ThumbsUp
                  size={14}
                  className={feedbackState === 'liked' ? 'text-tertiary' : ''}
                />
              </button>
            ) : null}
            {onDislike ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={(event) => {
                  event.stopPropagation()
                  onDislike()
                }}
                className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Dislike ${label}`}
              >
                <ThumbsDown
                  size={14}
                  className={feedbackState === 'disliked' ? 'text-secondary' : ''}
                />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <motion.span
        aria-hidden
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: animation.fast, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 h-px w-full"
        style={{ backgroundColor: accent }}
      />
    </motion.article>
  )
}

export type EnergyGeometry = {
  width: number
  minMinute: number
  maxMinute: number
  points: Array<{ x: number; y: number; timeLabel: string }>
  path: string
}

export function buildEnergyGeometry(points: Array<{ timeLabel: string; value: number }>): EnergyGeometry {
  const width = 260
  const height = 124
  const minY = 30
  const maxY = 100
  const parsedMinutes = points.map((point) => parseClockToMinutes(point.timeLabel)).filter((value): value is number => value !== null)
  const fallbackMin = 7 * 60
  const fallbackMax = 15 * 60
  const minMinute = parsedMinutes.length > 0 ? Math.min(...parsedMinutes) : fallbackMin
  const maxMinute = parsedMinutes.length > 0 ? Math.max(...parsedMinutes) : fallbackMax
  const span = Math.max(1, maxMinute - minMinute)

  const chartPoints = points.map((point, index) => {
    const parsed = parseClockToMinutes(point.timeLabel)
    const minute = parsed ?? minMinute + (index / Math.max(1, points.length - 1)) * span
    const x = ((minute - minMinute) / span) * width
    const normalized = (Math.max(minY, Math.min(maxY, point.value)) - minY) / (maxY - minY)
    const y = height - normalized * height + 10
    return { x, y, timeLabel: point.timeLabel }
  })

  const path = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')

  return {
    width,
    minMinute,
    maxMinute,
    points: chartPoints,
    path,
  }
}

export function getTimeMarkerX(
  timeLabel: string | undefined,
  minMinute: number,
  maxMinute: number,
  width: number,
): number | null {
  if (!timeLabel) return null
  const minute = parseClockToMinutes(timeLabel)
  if (minute === null) return null
  const span = Math.max(1, maxMinute - minMinute)
  const x = ((minute - minMinute) / span) * width
  return Math.max(0, Math.min(width, x))
}

export function parseClockToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? '0')
  const meridiem = match[3]?.toLowerCase()
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = 0
    if (meridiem === 'pm') hour += 12
  } else if (hour > 23) {
    return null
  }
  return hour * 60 + minute
}
