import { motion } from 'framer-motion'
import { ExternalLink, Music2, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { animation, colors } from '../../tokens'

type MusicTrack = {
  title: string
  artist: string
  spotify_id?: string | null
}

type MusicCardProps = {
  value: string
  detail: string
  previewData: string
  tracks?: MusicTrack[]
  isLoading?: boolean
  feedbackState?: 'liked' | 'disliked' | null
  onLike?: () => void
  onDislike?: () => void
  onRegenerate?: () => void
  onClick?: () => void
  isSelected?: boolean
}

const accent = colors.tertiary
const MAX_TRACKS = 5

// Spotify IDs are always exactly 22 base-62 characters.
// LLMs sometimes hallucinate IDs with obvious repeating patterns — reject those.
function isValidSpotifyId(id: string | null | undefined): id is string {
  if (!id || !/^[A-Za-z0-9]{22}$/.test(id)) return false
  // reject if the last 6 chars are an obvious repeated unit (e.g. "q0q0q0" or "0t0t0t")
  const tail = id.slice(-6)
  if (/^(.{2})\1{2}$/.test(tail) || /^(.{3})\1$/.test(tail)) return false
  return true
}

export function MusicCard({
  value,
  detail,
  previewData,
  tracks,
  isLoading = false,
  feedbackState = null,
  onLike,
  onDislike,
  onRegenerate,
  onClick,
  isSelected = false,
}: MusicCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isActive = isHovered || isSelected

  const visibleTracks = tracks?.slice(0, MAX_TRACKS) ?? []

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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      transition={{ duration: animation.standard, ease: 'easeOut' }}
      animate={{
        y: isActive ? -8 : 0,
        borderColor: isActive ? accent : colors.border,
        boxShadow: isActive ? `0 24px 64px ${accent}33` : '0 0 0 rgba(0,0,0,0)',
      }}
      className="group relative overflow-hidden rounded-2xl border-2 bg-card p-8 outline-none focus-visible:border-[var(--focus-accent)] focus-visible:shadow-[0_0_0_2px_rgba(248,248,248,0.12)]"
      style={{ ['--focus-accent' as string]: accent }}
    >
      {/* Left accent bar */}
      <motion.span
        aria-hidden
        animate={{ width: isActive ? 4 : 2, backgroundColor: accent }}
        transition={{ duration: animation.standard, ease: 'easeOut' }}
        className="absolute left-0 top-0 h-full"
      />

      {/* Background glow */}
      <motion.div
        aria-hidden
        animate={{ opacity: isActive ? 0.2 : 0.08, scale: isActive ? 1.25 : 0.85 }}
        transition={{ duration: animation.standard, ease: 'easeOut' }}
        className="pointer-events-none absolute -bottom-20 -right-20 h-52 w-52 rounded-full blur-3xl"
        style={{ backgroundColor: accent }}
      />

      {/* Bottom accent line */}
      <motion.span
        aria-hidden
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={{ duration: animation.fast, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 h-px w-full"
        style={{ backgroundColor: accent }}
      />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <motion.div
            animate={{
              scale: isActive ? 1.1 : 1,
              boxShadow: isActive ? `0 0 24px ${accent}66` : `0 0 0 ${accent}00`,
            }}
            transition={{ duration: animation.standard, ease: 'easeOut' }}
            className="flex h-14 w-14 items-center justify-center rounded-xl border-2"
            style={{
              color: accent,
              borderColor: `${accent}AA`,
              backgroundColor: `${accent}1A`,
            }}
          >
            <Music2 size={24} strokeWidth={2.2} />
          </motion.div>
          <p
            className="font-body text-xs font-bold uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            Music
          </p>
        </div>

        {/* Playlist identity */}
        {isLoading ? (
          <div className="space-y-3">
            <div className="dayger-shimmer h-10 w-2/3 rounded-lg" />
            <div className="dayger-shimmer h-5 w-4/5 rounded-lg" />
            <div className="dayger-shimmer h-4 w-3/4 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="font-display text-4xl font-extrabold leading-tight tracking-[-0.03em]">
              {value}
            </h3>
            <p className="font-body text-base font-medium text-foreground/80">{detail}</p>
            <motion.p
              animate={{ opacity: isActive ? 1 : 0.6, y: isActive ? 0 : 4 }}
              transition={{ duration: animation.standard, ease: 'easeOut' }}
              className="font-body text-sm text-foreground/60"
            >
              {previewData}
            </motion.p>
          </div>
        )}

        {/* Track list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: MAX_TRACKS }).map((_, i) => (
              <div key={i} className="dayger-shimmer h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : visibleTracks.length > 0 ? (
          <div className="space-y-2">
            {visibleTracks.map((track, index) =>
              isValidSpotifyId(track.spotify_id) ? (
                <div key={index} onClick={(e) => e.stopPropagation()}>
                  <iframe
                    src={`https://open.spotify.com/embed/track/${track.spotify_id}?utm_source=generator&theme=0`}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-xl"
                    title={`${track.title} by ${track.artist}`}
                  />
                </div>
              ) : (
                <a
                  key={index}
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.title} ${track.artist}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 transition-all duration-150 hover:border-tertiary/50 hover:bg-tertiary/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-semibold text-foreground/90">
                      {track.title}
                    </p>
                    <p className="truncate font-body text-xs text-foreground/50">{track.artist}</p>
                  </div>
                  <ExternalLink size={12} className="shrink-0 text-foreground/30" />
                </a>
              )
            )}
          </div>
        ) : (
          <p className="font-body text-xs text-foreground/40">
            Tracks will appear once the music agent connects.
          </p>
        )}

        {/* Feedback + regenerate buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation()
              onLike?.()
            }}
            className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-tertiary/60 hover:text-tertiary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Like Music"
          >
            <ThumbsUp size={14} className={feedbackState === 'liked' ? 'text-tertiary' : ''} />
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation()
              onDislike?.()
            }}
            className="rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Dislike Music"
          >
            <ThumbsDown size={14} className={feedbackState === 'disliked' ? 'text-secondary' : ''} />
          </button>
          {onRegenerate ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation()
                onRegenerate()
              }}
              className="ml-auto rounded-lg border border-border/70 p-2 text-foreground/70 transition-all duration-150 ease-out hover:border-tertiary/60 hover:text-tertiary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Regenerate playlist"
              title="Get a new playlist"
            >
              <RefreshCw size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </motion.article>
  )
}
