import { motion } from 'framer-motion'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'

type ExpandedPanelProps = {
  accent: string
  label: string
  title: string
  titleClassName?: string
  subtitle: string
  icon: ReactNode
  fields: Array<{ key: string; value: string }>
  actions: Array<string | { label: string; href?: string }>
  updatedAt: string
  heroImageUrl?: string | null
  heroImageAlt?: string
  onClose: () => void
  onActionClick?: (action: string) => void
  feedbackState?: 'liked' | 'disliked' | null
  onLike?: () => void
  onDislike?: () => void
  energyInsights?: {
    energyCurve?: Array<{ timeLabel: string; value: number }>
    wellnessTips?: string[]
    quote?: { text?: string; authorOrSource?: string }
  }
}

export function ExpandedPanel({
  accent,
  label,
  title,
  titleClassName,
  subtitle,
  icon,
  fields,
  actions,
  updatedAt,
  heroImageUrl,
  heroImageAlt,
  onClose,
  onActionClick,
  feedbackState = null,
  onLike,
  onDislike,
  energyInsights,
}: ExpandedPanelProps) {
  const [hasHeroImageError, setHasHeroImageError] = useState(false)

  useEffect(() => {
    setHasHeroImageError(false)
  }, [heroImageUrl])

  const shouldShowHeroImage = Boolean(heroImageUrl && !hasHeroImageError)
  const showEnergyInsights = Boolean(
    energyInsights && (energyInsights.energyCurve?.length || energyInsights.wellnessTips?.length || energyInsights.quote?.text),
  )

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/30"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div aria-hidden className="h-px w-full" style={{ backgroundColor: accent }} />

      <div className="sticky top-0 z-20 border-b border-border bg-background/90 px-8 py-6 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
              {label}
            </p>
            <h2
              className={`mt-2 font-display font-extrabold leading-[0.95] tracking-[-0.04em] ${titleClassName ?? 'text-6xl'}`}
            >
              {title}
            </h2>
            <p className="mt-2 font-body text-base text-foreground/75">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-muted/50 px-4 py-2 font-body text-sm font-bold uppercase tracking-[0.14em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/30 hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onLike}
            className="rounded-lg border border-border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-foreground/70 transition-all duration-150 ease-out hover:border-tertiary/60 hover:text-tertiary"
          >
            <span className="inline-flex items-center gap-1">
              <ThumbsUp size={14} className={feedbackState === 'liked' ? 'text-tertiary' : ''} />
              Like
            </span>
          </button>
          <button
            type="button"
            onClick={onDislike}
            className="rounded-lg border border-border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-foreground/70 transition-all duration-150 ease-out hover:border-secondary/60 hover:text-secondary"
          >
            <span className="inline-flex items-center gap-1">
              <ThumbsDown size={14} className={feedbackState === 'disliked' ? 'text-secondary' : ''} />
              Dislike
            </span>
          </button>
        </div>
      </div>

      <div
        className="dayger-scroll flex-1 space-y-6 overflow-y-auto px-8 py-6"
        style={{ ['--scroll-accent' as string]: accent }}
      >
        {/* Hero block — replaced by energy graph when curve data is available */}
        {showEnergyInsights && energyInsights?.energyCurve && energyInsights.energyCurve.length > 1 ? (
          <div
            className="w-full overflow-hidden rounded-2xl border-2 p-5"
            style={{
              borderColor: `${accent}AA`,
              background: `linear-gradient(145deg, ${accent}1A 0%, ${accent}0D 100%)`,
            }}
          >
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
              Energy Curve Today
            </p>
            <svg viewBox="0 0 320 90" className="mt-3 h-28 w-full">
              <path
                d={buildEnergyPath(energyInsights.energyCurve)}
                fill="none"
                stroke={accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div
            className="flex aspect-square max-h-[340px] w-full items-center justify-center overflow-hidden rounded-2xl border-2 text-8xl"
            style={{
              borderColor: `${accent}AA`,
              background: `linear-gradient(145deg, ${accent}1A 0%, ${accent}0D 100%)`,
              color: accent,
            }}
          >
            {shouldShowHeroImage ? (
              <img
                src={heroImageUrl ?? undefined}
                alt={heroImageAlt ?? `${label} cover art`}
                className="h-full w-full object-cover"
                onError={() => setHasHeroImageError(true)}
              />
            ) : (
              icon
            )}
          </div>
        )}

        {/* Quote — shown prominently right after the graph for energy */}
        {showEnergyInsights && energyInsights?.quote?.text ? (
          <div
            className="rounded-2xl border-2 px-5 py-4"
            style={{
              borderColor: `${accent}55`,
              background: `linear-gradient(135deg, ${accent}0F 0%, transparent 100%)`,
            }}
          >
            <p className="font-display text-lg font-extrabold leading-snug tracking-[-0.02em] text-foreground">
              "{energyInsights.quote.text}"
            </p>
            {energyInsights.quote.authorOrSource ? (
              <p className="mt-2 font-body text-xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
                — {energyInsights.quote.authorOrSource}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Wellness checklist — above fields */}
        {showEnergyInsights && energyInsights?.wellnessTips && energyInsights.wellnessTips.length > 0 ? (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-4">
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/65">Wellness Checklist</p>
            <ul className="mt-3 space-y-2">
              {energyInsights.wellnessTips.map((tip, index) => (
                <li key={tip} className="flex items-start gap-2 font-body text-sm text-foreground/85">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: `${accent}33`, color: accent }}
                  >
                    {index + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {fields.map((field) => (
          <motion.div
            key={field.key}
            whileHover={{ borderColor: `${accent}99`, y: -2 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-xl border border-border bg-muted/40 px-4 py-4"
          >
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/65">
              {field.key}
            </p>
            <p className="mt-2 font-body text-base font-medium text-foreground">{field.value}</p>
          </motion.div>
        ))}

        {actions.length > 0 ? (
          <div className="space-y-3">
            {actions.map((action) => {
            const actionLabel = typeof action === 'string' ? action : action.label
            const actionHref = typeof action === 'string' ? undefined : action.href

            if (actionHref) {
              return (
                <a
                  key={actionLabel}
                  href={actionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onActionClick?.(actionLabel)}
                  className="block w-full rounded-xl px-5 py-3 text-left font-body text-sm font-bold uppercase tracking-[0.12em] text-background transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110"
                  style={{ backgroundColor: accent }}
                >
                  {actionLabel}
                </a>
              )
            }

            return (
              <button
                key={actionLabel}
                type="button"
                onClick={() => onActionClick?.(actionLabel)}
                className="w-full rounded-xl px-5 py-3 text-left font-body text-sm font-bold uppercase tracking-[0.12em] text-background transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110"
                style={{ backgroundColor: accent }}
              >
                {actionLabel}
              </button>
            )
            })}
          </div>
        ) : null}
      </div>

      <footer className="border-t border-border px-8 py-4">
        <p className="font-body text-xs font-medium text-foreground/60">Last updated: {updatedAt}</p>
      </footer>
    </div>
  )
}

function buildEnergyPath(points: Array<{ timeLabel: string; value: number }>): string {
  const width = 320
  const height = 84
  const minY = 30
  const maxY = 100

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width
      const normalized = (Math.max(minY, Math.min(maxY, point.value)) - minY) / (maxY - minY)
      const y = height - normalized * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}
