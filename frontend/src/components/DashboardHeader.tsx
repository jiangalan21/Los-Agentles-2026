import { typography } from '../tokens'
import { Logo } from './Logo'

type DashboardHeaderProps = {
  userName?: string
  userLocation?: string
}

const navItems = ['Weather', 'Outfit', 'Music', 'Energy', 'Meals']

export function DashboardHeader({ userName = 'Alex', userLocation = 'Los Angeles' }: DashboardHeaderProps) {
  const now = new Date()
  const timeText = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dateText = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-card/15 px-8 py-7">
      <p
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.04em] text-foreground/5"
        style={{ fontSize: typography.ghost }}
      >
        {timeText}
      </p>

      <div className="relative z-10 grid grid-cols-[1fr_auto] items-start gap-10">
        <div className="space-y-6">
          <Logo size="medium" />

          <nav className="flex flex-wrap items-center gap-7">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                className="font-body text-sm font-bold uppercase tracking-[0.14em] text-foreground/70 transition-colors duration-100 ease-out hover:text-foreground"
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="text-right">
          <p className="font-body text-lg font-medium text-foreground/75">
            {dateText} · {userLocation}
          </p>
          <h1
            className="font-display font-extrabold leading-[0.92] tracking-[-0.04em] text-foreground"
            style={{ fontSize: 'clamp(4rem, 8vw, 8rem)' }}
          >
            {userName}
          </h1>
        </div>
      </div>
    </header>
  )
}
