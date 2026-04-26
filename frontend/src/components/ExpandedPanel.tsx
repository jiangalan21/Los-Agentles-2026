import { motion } from 'framer-motion'
import { Shirt, ThumbsDown, ThumbsUp } from 'lucide-react'
import { PiPantsBold } from 'react-icons/pi'
import { TbJacket, TbShoe } from 'react-icons/tb'
import { ReactNode, useEffect, useState } from 'react'

type MealDish = {
  name: string
  station: string
  reason: string
}

type MealInsights = {
  meals?: {
    breakfast?: { dishes: MealDish[] }
    lunch?: { dishes: MealDish[] }
    dinner?: { dishes: MealDish[] }
  }
  rationale?: string
  dietFlags?: string[]
  sourceMeta?: { diningHall?: string; diningHalls?: string[]; serviceDate?: string }
}

type ExpandedPanelProps = {
  accent: string
  label: string
  title: string
  titleClassName?: string
  subtitle: string
  layoutVariant?: 'default' | 'outfit' | 'meal' | 'custom'
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
  mealInsights?: MealInsights
}

export function ExpandedPanel({
  accent,
  label,
  title,
  titleClassName,
  subtitle,
  layoutVariant = 'default',
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
  mealInsights,
}: ExpandedPanelProps) {
  const [hasHeroImageError, setHasHeroImageError] = useState(false)

  useEffect(() => {
    setHasHeroImageError(false)
  }, [heroImageUrl])

  const shouldShowHeroImage = Boolean(heroImageUrl && !hasHeroImageError)
  const isOutfitLayout = layoutVariant === 'outfit'
  const isMealLayout = layoutVariant === 'meal'
  const isCustomLayout = layoutVariant === 'custom'
  const showEnergyInsights = Boolean(
    energyInsights && (energyInsights.energyCurve?.length || energyInsights.wellnessTips?.length || energyInsights.quote?.text),
  )
  const showMealLayout = isMealLayout && Boolean(mealInsights?.meals)

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
              className={`mt-2 font-display font-extrabold leading-[0.95] tracking-[-0.04em] ${
                titleClassName ?? (isOutfitLayout ? 'text-3xl xl:text-4xl' : isMealLayout ? 'text-4xl whitespace-nowrap overflow-hidden text-ellipsis' : 'text-6xl')
              }`}
            >
              {title}
            </h2>
            {!isOutfitLayout && !isMealLayout && subtitle ? <p className="mt-2 font-body text-base text-foreground/75">{subtitle}</p> : null}
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
        {!isOutfitLayout && !isCustomLayout && !isMealLayout && showEnergyInsights && energyInsights?.energyCurve && energyInsights.energyCurve.length > 1 ? (
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
        ) : !isOutfitLayout && !isCustomLayout && !isMealLayout ? (
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
        ) : null}

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

        {isOutfitLayout ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((field) => {
              const [itemName, ...reasonParts] = field.value.split(' — ')
              const reason = reasonParts.join(' — ')
              const ItemIcon =
                field.key === 'Top'
                  ? Shirt
                  : field.key === 'Bottom'
                    ? PiPantsBold
                    : field.key === 'Shoes'
                      ? TbShoe
                      : TbJacket
              return (
                <motion.div
                  key={field.key}
                  whileHover={{ borderColor: `${accent}99`, y: -2 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="rounded-xl border border-border bg-muted/40 px-4 py-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-border/80 bg-background/40 p-1.5 text-foreground/70">
                      <ItemIcon size={14} />
                    </span>
                    <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/65">{field.key}</p>
                  </div>
                  <p className="mt-2 font-display text-xl font-extrabold leading-tight tracking-[-0.02em] text-foreground">{itemName || 'No recommendation yet'}</p>
                  {reason ? <p className="mt-2 font-body text-sm text-foreground/75">{reason}</p> : null}
                </motion.div>
              )
            })}
          </div>
        ) : showMealLayout ? (
          <div className="space-y-4">
            {(['breakfast', 'lunch', 'dinner'] as const).map((period) => {
              const window = mealInsights?.meals?.[period]
              if (!window?.dishes?.length) return null
              const periodLocation = Array.from(new Set(window.dishes.map((dish) => dish.station).filter(Boolean))).join(' · ')
              return (
                <div key={period} className="rounded-xl border border-border bg-muted/40 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/65">{period}</p>
                    {periodLocation ? (
                      <div
                        className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1"
                        style={{
                          borderColor: `${accent}66`,
                          backgroundColor: `${accent}14`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                        <p className="font-body text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>
                          {periodLocation}
                          {mealInsights?.sourceMeta?.serviceDate ? ` · ${mealInsights.sourceMeta.serviceDate}` : ''}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {window.dishes.map((dish) => (
                      <motion.div
                        key={dish.name}
                        whileHover={{ borderColor: `${accent}99`, y: -1 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="rounded-lg border border-border/60 bg-background/30 px-3 py-2.5"
                      >
                        <p className="font-display text-base font-extrabold leading-tight tracking-[-0.02em] text-foreground">{dish.name}</p>
                        {dish.reason ? <p className="mt-1 font-body text-xs text-foreground/65">{dish.reason}</p> : null}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )
            })}
            {mealInsights?.dietFlags?.length ? (
              <div className="flex flex-wrap gap-2">
                {mealInsights.dietFlags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full px-3 py-1 font-body text-xs font-bold uppercase tracking-[0.12em]"
                    style={{ backgroundColor: `${accent}22`, color: accent }}
                  >
                    {flag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : isCustomLayout ? (
          <div className="space-y-3">
            {fields.map((field) => (
              (() => {
                const formatterValue = field.value.toLowerCase()
                const isFormatterField = field.key === 'Formatter'
                const formatterBadgeClass =
                  formatterValue.includes('asi')
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : formatterValue.includes('deterministic')
                      ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                      : 'border-slate-400/40 bg-slate-500/15 text-slate-200'

                return (
              <motion.div
                key={field.key}
                whileHover={{ borderColor: `${accent}99`, y: -2 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="rounded-xl border border-border bg-muted/40 px-4 py-4"
              >
                <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/65">{field.key}</p>
                {isFormatterField ? (
                  <span
                    className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 font-body text-[11px] font-bold uppercase tracking-[0.12em] ${formatterBadgeClass}`}
                  >
                    {field.value}
                  </span>
                ) : (
                  <p className={`mt-2 font-body text-sm text-foreground whitespace-pre-wrap break-words ${field.key === 'Response' ? 'max-h-64 overflow-y-auto rounded-md border border-border/60 bg-background/30 p-3 break-all' : ''}`}>
                    {field.value}
                  </p>
                )}
              </motion.div>
                )
              })()
            ))}
          </div>
        ) : (
          fields.map((field) => (
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
          ))
        )}

        {!isOutfitLayout && actions.length > 0 ? (
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
