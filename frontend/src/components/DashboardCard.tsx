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
}: DashboardCardProps) {
  const [isHovered, setIsHovered] = useState(false)

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
      className={`group relative min-h-[260px] overflow-hidden rounded-2xl border-2 bg-card p-8 outline-none focus-visible:border-[var(--focus-accent)] focus-visible:shadow-[0_0_0_2px_rgba(248,248,248,0.12)] ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
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
          <motion.p
            animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
            transition={{ duration: animation.standard, ease: 'easeOut' }}
            className="mt-auto pt-6 font-body text-sm font-medium text-foreground/75"
          >
            {previewData}
          </motion.p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation()
              onLike?.()
            }}
            className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-tertiary/60 hover:text-tertiary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Like ${label}`}
          >
            <ThumbsUp
              size={14}
              className={feedbackState === 'liked' ? 'text-tertiary' : ''}
            />
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation()
              onDislike?.()
            }}
            className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Dislike ${label}`}
          >
            <ThumbsDown
              size={14}
              className={feedbackState === 'disliked' ? 'text-secondary' : ''}
            />
          </button>
        </div>
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
