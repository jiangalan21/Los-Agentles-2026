import { motion } from 'framer-motion'
import { ArrowRight, CloudSun, Shirt, Zap } from 'lucide-react'
import { colors } from '../tokens'
import { Logo } from './Logo'

type LandingPageProps = {
  onStartDashboard: () => void
}

const tickerItems = ['Weather', 'Outfit', 'Music', 'Energy']
const tickerColors = [colors.primary, colors.secondary, colors.tertiary, colors.purple]

export function LandingPage({ onStartDashboard }: LandingPageProps) {
  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 12% 28%, rgba(255, 149, 0, 0.07) 0%, transparent 40%), radial-gradient(circle at 82% 74%, rgba(255, 55, 95, 0.07) 0%, transparent 43%)',
        }}
      />

      <p className="pointer-events-none absolute left-8 top-1 z-0 font-display text-[12rem] font-extrabold tracking-[-0.05em] text-foreground/5">
        05:31
      </p>
      <p className="pointer-events-none absolute right-8 top-3 z-0 font-logo text-[12rem] font-black tracking-[-0.05em] text-foreground/5">
        AM
      </p>

      <main className="relative z-10 mx-auto flex h-screen w-full max-w-[1600px] flex-col px-10 pb-28 pt-8">
        <section className="grid flex-1 grid-cols-12 gap-6">
          <div className="col-span-7 flex flex-col justify-center">
            <div className="rounded-full border border-primary/30 bg-primary/10 px-5 py-2 font-body text-sm font-bold uppercase tracking-[0.14em] text-primary w-fit">
              Morning Dashboard
            </div>

            <div className="mt-6">
              <Logo
                size="xlarge"
                underlineOffsetClassName="mt-5"
                underlineThicknessClassName="h-2"
                underlineGapClassName="gap-x-12"
                underlinePrimaryWidthClassName="w-[118%]"
              />
            </div>

            <h1 className="mt-10 max-w-4xl font-display text-[clamp(2.9rem,4.4vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">
              Your morning briefing in 4 seconds
            </h1>
            <p className="mt-4 max-w-3xl font-body text-xl font-medium leading-relaxed text-foreground/75">
              Weather, outfit, music, energy. No scrolling, no decisions, no bullshit. Just what you need to walk out
              the door.
            </p>

            <div className="mt-7 flex items-center gap-8">
              <button
                type="button"
                onClick={onStartDashboard}
                className="group inline-flex items-center gap-3 rounded-xl bg-primary px-9 py-5 font-display text-xl font-bold text-background shadow-xl shadow-primary/40 transition-all duration-200 ease-out hover:scale-105 hover:brightness-110"
              >
                Start Dashboard
                <ArrowRight className="h-6 w-6 transition-transform duration-200 ease-out group-hover:translate-x-1" />
              </button>

              <div className="flex items-center gap-4">
                <div className="flex">
                  <span className="h-9 w-9 rounded-full border border-background/40 bg-gradient-to-br from-primary to-secondary" />
                  <span className="-ml-3 h-9 w-9 rounded-full border border-background/40 bg-gradient-to-br from-secondary to-purple" />
                </div>
                <p className="font-body text-base font-medium text-foreground/80">2.4k using today</p>
              </div>
            </div>
          </div>

          <div className="col-span-5 flex items-center justify-end">
            <div className="w-full max-w-[520px] space-y-4">
              <PreviewCard
                accent={colors.primary}
                label="Weather"
                value="72°"
                detail="Sunny all day, light jacket optional"
                icon={<CloudSun className="h-6 w-6" />}
              />
              <PreviewCard
                accent={colors.secondary}
                label="Outfit"
                value="Fit"
                detail="Casual layers - Your vintage tee works"
                icon={<Shirt className="h-6 w-6" />}
              />
              <PreviewCard
                accent={colors.purple}
                label="Energy"
                value="85%"
                detail="Peak focus at 10AM - 7.5hrs sleep"
                icon={<Zap className="h-6 w-6" />}
              />
            </div>
          </div>
        </section>

      </main>

      <footer className="absolute bottom-0 left-0 right-0 z-20 h-12 overflow-hidden border-t border-border bg-card/35 backdrop-blur-sm">
        <motion.div
          animate={{ x: ['0%', '-100%'] }}
          transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
          className="absolute left-0 top-0 flex h-full w-full items-center whitespace-nowrap leading-none"
        >
          <TickerRow />
        </motion.div>

        <motion.div
          animate={{ x: ['100%', '0%'] }}
          transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
          className="absolute left-0 top-0 flex h-full w-full items-center whitespace-nowrap leading-none"
        >
          <TickerRow />
        </motion.div>
      </footer>
    </div>
  )
}

function TickerRow() {
  return (
    <div className="flex w-full items-center justify-around gap-6 px-6">
      {tickerItems.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="font-display text-3xl font-bold tracking-[0.02em]"
          style={{ color: tickerColors[index % tickerColors.length] }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

type PreviewCardProps = {
  accent: string
  label: string
  value: string
  detail: string
  icon: JSX.Element
}

function PreviewCard({ accent, label, value, detail, icon }: PreviewCardProps) {
  return (
    <motion.article
      whileHover={{ y: -6, borderColor: accent, boxShadow: `0 20px 50px ${accent}33` }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border-2 border-border bg-card/75 px-5 py-4"
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-center justify-between">
        <div className="rounded-xl border-2 p-2" style={{ borderColor: `${accent}AA`, color: accent, background: `${accent}1A` }}>
          {icon}
        </div>
        <p className="font-body text-xs font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
          {label}
        </p>
      </div>
      <h3 className="mt-3 font-display text-4xl font-extrabold leading-none tracking-[-0.04em]">{value}</h3>
      <p className="mt-2 font-body text-sm font-medium text-foreground/75">{detail}</p>
    </motion.article>
  )
}
