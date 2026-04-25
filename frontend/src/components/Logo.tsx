import { colors } from '../tokens'

type LogoSize = 'small' | 'medium' | 'large' | 'xlarge' | 'hero'

type LogoProps = {
  size?: LogoSize
  className?: string
  underlineOffsetClassName?: string
  underlineThicknessClassName?: string
  underlineGapClassName?: string
  underlinePrimaryWidthClassName?: string
}

const logoSizeClasses: Record<LogoSize, string> = {
  small: 'text-3xl',
  medium: 'text-5xl',
  large: 'text-7xl',
  xlarge: 'text-[9rem]',
  hero: 'text-[12rem]',
}

export function Logo({
  size = 'medium',
  className = '',
  underlineOffsetClassName = 'mt-2',
  underlineThicknessClassName = 'h-1.5',
  underlineGapClassName = 'gap-x-3',
  underlinePrimaryWidthClassName = 'w-[110%]',
}: LogoProps) {
  return (
    <div className={`inline-grid w-fit grid-cols-[auto_auto] ${className}`}>
      <h1
        className={`col-span-2 inline-grid grid-cols-[auto_auto] font-logo font-black leading-[0.9] tracking-[-0.04em] ${logoSizeClasses[size]}`}
        aria-label="Dayger"
      >
        <span className="inline-block" style={{ color: colors.primary }}>
          Day
        </span>
        <span className="inline-block" style={{ color: colors.foreground }}>
          ger
        </span>
      </h1>

      <div
        className={`col-span-2 inline-grid grid-cols-[auto_auto] ${underlineGapClassName} ${underlineOffsetClassName}`}
        aria-hidden
      >
        <span
          className={`${underlineThicknessClassName} ${underlinePrimaryWidthClassName} rounded-full`}
          style={{ backgroundColor: colors.primary }}
        />
        <span
          className={`${underlineThicknessClassName} w-full rounded-full`}
          style={{ backgroundColor: colors.secondary }}
        />
      </div>
    </div>
  )
}
