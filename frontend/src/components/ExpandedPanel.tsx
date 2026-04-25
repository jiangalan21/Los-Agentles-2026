import { motion } from 'framer-motion'
import { ReactNode } from 'react'

type ExpandedPanelProps = {
  accent: string
  label: string
  title: string
  subtitle: string
  icon: ReactNode
  fields: Array<{ key: string; value: string }>
  actions: string[]
  updatedAt: string
  onClose: () => void
}

export function ExpandedPanel({
  accent,
  label,
  title,
  subtitle,
  icon,
  fields,
  actions,
  updatedAt,
  onClose,
}: ExpandedPanelProps) {
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
            <h2 className="mt-2 font-display text-6xl font-extrabold leading-[0.95] tracking-[-0.04em]">
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
      </div>

      <div
        className="dayger-scroll flex-1 space-y-6 overflow-y-auto px-8 py-6"
        style={{ ['--scroll-accent' as string]: accent }}
      >
        <div
          className="flex aspect-square max-h-[340px] w-full items-center justify-center rounded-2xl border-2 text-8xl"
          style={{
            borderColor: `${accent}AA`,
            background: `linear-gradient(145deg, ${accent}1A 0%, ${accent}0D 100%)`,
            color: accent,
          }}
        >
          {icon}
        </div>

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

        <div className="space-y-3">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className="w-full rounded-xl px-5 py-3 text-left font-body text-sm font-bold uppercase tracking-[0.12em] text-background transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110"
              style={{ backgroundColor: accent }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-8 py-4">
        <p className="font-body text-xs font-medium text-foreground/60">Last updated: {updatedAt}</p>
      </footer>
    </div>
  )
}
