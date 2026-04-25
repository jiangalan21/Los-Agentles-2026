import { AnimatePresence, motion } from 'framer-motion'
import { CloudSun, Music2, Shirt, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { animation, colors, layout, spacing } from '../tokens'
import { DashboardCard } from './DashboardCard'
import { DashboardHeader } from './DashboardHeader'
import { ExpandedPanel } from './ExpandedPanel'
import { StatBox } from './StatBox'

type CardDetail = {
  id: string
  accent: string
  label: string
  value: string
  detail: string
  previewData: string
  icon: JSX.Element
  subtitle: string
  fields: Array<{ key: string; value: string }>
  actions: string[]
}

export function DashboardView() {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const cardDetails: CardDetail[] = useMemo(
    () => [
      {
        id: 'weather',
        accent: colors.primary,
        label: 'Weather',
        value: '72°F',
        detail: 'Sunny & clear',
        previewData: 'Feels like 75°. Light jacket optional.',
        icon: <CloudSun size={54} strokeWidth={2.2} />,
        subtitle: 'Warm morning conditions with clear skies all day.',
        fields: [
          { key: 'Conditions', value: 'Sunny with very low cloud cover' },
          { key: 'High / Low', value: '75°F / 61°F' },
          { key: 'Wind', value: '6 mph, light southwesterly breeze' },
        ],
        actions: ['View Hourly Forecast', 'Set Weather Reminder'],
      },
      {
        id: 'outfit',
        accent: colors.secondary,
        label: 'Outfit',
        value: 'Casual',
        detail: 'Relaxed fit',
        previewData: 'Vintage tee, straight jeans, white sneakers.',
        icon: <Shirt size={54} strokeWidth={2.2} />,
        subtitle: 'Comfort-first layering tuned for mild spring weather.',
        fields: [
          { key: 'Top', value: 'Vintage cotton tee, breathable fit' },
          { key: 'Bottom', value: 'Straight-leg denim with light stretch' },
          { key: 'Outer Layer', value: 'Unlined overshirt for morning breeze' },
        ],
        actions: ['Save Outfit', 'Swap Style Profile'],
      },
      {
        id: 'music',
        accent: colors.tertiary,
        label: 'Music',
        value: 'Levitate',
        detail: 'Dua Lipa',
        previewData: 'Mood: confident. Queue is upbeat pop focus.',
        icon: <Music2 size={54} strokeWidth={2.2} />,
        subtitle: 'High-energy tracks to keep momentum before classes.',
        fields: [
          { key: 'Vibe', value: 'Confident, bright, and rhythmic' },
          { key: 'Tempo', value: '118-124 BPM range' },
          { key: 'Queue Length', value: '42 minutes remaining' },
        ],
        actions: ['Open Playlist', 'Regenerate Queue'],
      },
      {
        id: 'energy',
        accent: colors.purple,
        label: 'Energy',
        value: '85%',
        detail: 'Feeling great',
        previewData: 'Peak focus at 10AM after solid sleep.',
        icon: <Zap size={54} strokeWidth={2.2} />,
        subtitle: 'Strong baseline energy with a steady focus window.',
        fields: [
          { key: 'Focus Window', value: '10:00 AM - 12:30 PM' },
          { key: 'Sleep', value: '7h 51m quality rest' },
          { key: 'Recovery', value: 'Hydration and breakfast both on track' },
        ],
        actions: ['Start Focus Timer', 'Log Energy Check-In'],
      },
    ],
    [],
  )

  const selectedCard = cardDetails.find((card) => card.id === selectedCardId) ?? null
  const isPanelOpen = Boolean(selectedCard)
  const updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, ${colors.primary} 0%, transparent 68%)`,
          opacity: layout.orbOpacityMin,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -right-28 h-[580px] w-[580px] rounded-full blur-[140px]"
        style={{
          background: `radial-gradient(circle, ${colors.secondary} 0%, transparent 70%)`,
          opacity: layout.orbOpacityMax,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-1/3 top-1/2 h-[380px] w-[380px] -translate-y-1/2 rounded-full blur-[110px]"
        style={{
          background: `radial-gradient(circle, ${colors.purple} 0%, transparent 72%)`,
          opacity: layout.orbOpacityMin,
        }}
      />

      <div className="relative z-10 flex min-h-screen p-12">
        <motion.section
          animate={{ width: isPanelOpen ? layout.leftOpen : layout.leftClosed }}
          transition={{ duration: animation.slow, ease: 'easeOut' }}
          className="dayger-scroll h-[calc(100vh-6rem)] overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card/20"
          style={{ padding: spacing.pagePadding }}
        >
          <div className="space-y-8">
            <DashboardHeader />
            <div className="grid grid-cols-2 gap-6">
              <DashboardCard
                accent={cardDetails[0].accent}
                icon={<CloudSun size={24} strokeWidth={2.2} />}
                label={cardDetails[0].label}
                value={cardDetails[0].value}
                detail={cardDetails[0].detail}
                previewData={cardDetails[0].previewData}
                onClick={() => setSelectedCardId(cardDetails[0].id)}
              />
              <div className="translate-y-[20px]">
                <DashboardCard
                  accent={cardDetails[1].accent}
                  icon={<Shirt size={24} strokeWidth={2.2} />}
                  label={cardDetails[1].label}
                  value={cardDetails[1].value}
                  detail={cardDetails[1].detail}
                  previewData={cardDetails[1].previewData}
                  onClick={() => setSelectedCardId(cardDetails[1].id)}
                />
              </div>
              <div className="translate-y-[20px]">
                <DashboardCard
                  accent={cardDetails[2].accent}
                  icon={<Music2 size={24} strokeWidth={2.2} />}
                  label={cardDetails[2].label}
                  value={cardDetails[2].value}
                  detail={cardDetails[2].detail}
                  previewData={cardDetails[2].previewData}
                  onClick={() => setSelectedCardId(cardDetails[2].id)}
                />
              </div>
              <DashboardCard
                accent={cardDetails[3].accent}
                icon={<Zap size={24} strokeWidth={2.2} />}
                label={cardDetails[3].label}
                value={cardDetails[3].value}
                detail={cardDetails[3].detail}
                previewData={cardDetails[3].previewData}
                onClick={() => setSelectedCardId(cardDetails[3].id)}
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <StatBox accent={colors.primary} label="Current Time" value="05:31 AM" />
              <StatBox accent={colors.secondary} label="Completion" value="4/4" />
              <StatBox accent={colors.tertiary} label="Status" value="Ready" />
            </div>
          </div>
        </motion.section>

        <AnimatePresence initial={false}>
          {isPanelOpen ? (
            <motion.aside
              key="panel-slot"
              initial={{ width: 0, x: 80, opacity: 0 }}
              animate={{ width: layout.rightOpen, x: 0, opacity: 1 }}
              exit={{ width: 0, x: 80, opacity: 0 }}
              transition={{ duration: animation.slow, ease: 'easeOut' }}
              className="h-[calc(100vh-6rem)] overflow-hidden pl-6"
            >
              <motion.div
                initial={{ x: 80 }}
                animate={{ x: 0 }}
                exit={{ x: 80 }}
                transition={{ duration: 0.4, ease: animation.easeOut }}
                className="h-full"
              >
                {selectedCard ? (
                  <ExpandedPanel
                    accent={selectedCard.accent}
                    label={selectedCard.label}
                    title={selectedCard.value}
                    subtitle={selectedCard.subtitle}
                    icon={selectedCard.icon}
                    fields={selectedCard.fields}
                    actions={selectedCard.actions}
                    updatedAt={updatedAt}
                    onClose={() => setSelectedCardId(null)}
                  />
                ) : null}
              </motion.div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
