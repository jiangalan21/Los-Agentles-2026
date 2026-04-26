import { AnimatePresence, motion } from 'framer-motion'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Music2,
  Shirt,
  Sun,
  Wind,
  Zap,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { JSX, useEffect, useMemo, useState } from 'react'
import {
  createRequest,
  createSession,
  getHourlyForecast,
  getProfile,
  getRecentSessions,
  getRequest,
  getSession,
  getWeatherMapPreviewUrl,
  regenerateMusicForSession,
  savePreferences,
  saveProfile as saveProfileApi,
  sendFeedback,
} from '../lib/api'
import {
  buildPromptFromProfile,
  getUserProfile,
  saveUserProfile,
  splitPreferenceList,
  type UserProfile,
} from '../lib/userProfile'
import {
  clearActiveRequestId,
  clearActiveSessionId,
  getActiveRequestId,
  getActiveSessionId,
  getUserKey,
  setActiveRequestId,
  setActiveSessionId,
} from '../lib/userKey'
import { animation, colors, layout, spacing } from '../tokens'
import { DashboardCard } from './DashboardCard'
import { MusicCard } from './cards/MusicCard'
import { DashboardHeader } from './DashboardHeader'
import { ExpandedPanel } from './ExpandedPanel'
import { BackgroundPulse } from './BackgroundPulse'
import { ProfileModal } from './ProfileModal'
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
  actions: Array<string | { label: string; href?: string }>
}

type AgentOutput = {
  value?: string
  detail?: string
  previewData?: string
  tracks?: Array<{ title: string; artist: string; spotify_id?: string | null }>
}

function isValidSpotifyId(id: string | null | undefined): id is string {
  if (!id || !/^[A-Za-z0-9]{22}$/.test(id)) return false
  const tail = id.slice(-6)
  if (/^(.{2})\1{2}$/.test(tail) || /^(.{3})\1$/.test(tail)) return false
  return true
}

function formatCurrentTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function getWeatherConditionIcon(condition: string) {
  const normalized = condition.toLowerCase()
  if (normalized.includes('thunder')) return CloudLightning
  if (normalized.includes('snow') || normalized.includes('sleet') || normalized.includes('ice')) return CloudSnow
  if (normalized.includes('drizzle')) return CloudDrizzle
  if (normalized.includes('rain') || normalized.includes('shower')) return CloudRain
  if (normalized.includes('fog') || normalized.includes('mist') || normalized.includes('haze') || normalized.includes('smoke')) {
    return CloudFog
  }
  if (normalized.includes('wind')) return Wind
  if (normalized.includes('cloud')) return Cloud
  if (normalized.includes('clear') || normalized.includes('sun')) return Sun
  return CloudSun
}

export function DashboardView() {
  const userKey = useMemo(() => getUserKey(), [])
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState<UserProfile>(() => getUserProfile())
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(() => getActiveSessionId())
  const [requestId, setRequestId] = useState<string | null>(() => getActiveRequestId())
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [profileToast, setProfileToast] = useState<string | null>(null)
  const [feedbackStateByAgent, setFeedbackStateByAgent] = useState<Record<string, 'liked' | 'disliked' | null>>({})
  const [currentTimeText, setCurrentTimeText] = useState(() => formatCurrentTime(new Date()))
  const [isForecastModalOpen, setIsForecastModalOpen] = useState(false)

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

  const createSessionMutation = useMutation({
    mutationFn: ({ prompt, reqId }: { prompt: string; reqId?: string | null }) =>
      createSession(userKey, prompt, reqId),
    onSuccess: (data) => {
      setSessionId(data.sessionId)
      setActiveSessionId(data.sessionId)
      if (data.requestId) {
        setRequestId(data.requestId)
        setActiveRequestId(data.requestId)
      }
      setSessionError(null)
    },
    onError: (error) => {
      setSessionError(error instanceof Error ? error.message : 'Unable to create session')
    },
  })

  const regenerateMusicMutation = useMutation({
    mutationFn: () => regenerateMusicForSession(userKey, sessionId as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId, userKey] })
      void sendFeedback({ userKey, sessionId: sessionId ?? undefined, agentName: 'music', signal: 'regenerated' })
    },
  })

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId, userKey],
    queryFn: () => getSession(userKey, sessionId as string),
    enabled: Boolean(sessionId),
    retry: 1,
    refetchInterval: (query) => {
      const outputs = (query.state.data as { outputs?: unknown[] } | undefined)?.outputs ?? []
      return outputs.length >= 4 ? false : 1000
    },
  })

  const recentSessionsQuery = useQuery({
    queryKey: ['recent-sessions', userKey],
    queryFn: () => getRecentSessions(userKey),
    staleTime: 60_000,
  })

  const requestStatusQuery = useQuery({
    queryKey: ['request-status', requestId, userKey],
    queryFn: () => getRequest(userKey, requestId as string),
    enabled: Boolean(requestId),
    refetchInterval: 1500,
  })

  const profileQuery = useQuery({
    queryKey: ['profile', userKey],
    queryFn: () => getProfile(userKey),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (sessionId || createSessionMutation.isPending) {
      return
    }

    if (recentSessionsQuery.isLoading) {
      return
    }

    const latestExistingSession = recentSessionsQuery.data?.sessions?.[0]?.id
    if (latestExistingSession) {
      setSessionId(latestExistingSession)
      setActiveSessionId(latestExistingSession)
      return
    }

    void createRequest(userKey, buildPromptFromProfile(profile))
      .then((request) => {
        setRequestId(request.requestId)
        setActiveRequestId(request.requestId)
        createSessionMutation.mutate({
          prompt: buildPromptFromProfile(profile),
          reqId: request.requestId,
        })
      })
      .catch((error) => {
        setSessionError(error instanceof Error ? error.message : 'Unable to create request')
      })
  }, [createSessionMutation, profile, recentSessionsQuery.data?.sessions, recentSessionsQuery.isLoading, sessionId])

  useEffect(() => {
    if (!profileQuery.data?.profile) {
      return
    }

    const remoteProfile = profileQuery.data.profile
    setProfile((current) => ({
      ...current,
      ...remoteProfile,
    }))
  }, [profileQuery.data?.profile])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeText(formatCurrentTime(new Date()))
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!sessionQuery.isError) {
      return
    }

    clearActiveSessionId()
    clearActiveRequestId()
    setSessionId(null)
    setRequestId(null)
    setSessionError('Session expired. Creating a fresh dashboard context.')
  }, [sessionQuery.isError])

  useEffect(() => {
    void savePreferences(userKey, {
      cuisine: splitPreferenceList(profile.dietaryPreferences),
      music: splitPreferenceList(profile.musicPreferences),
      style: splitPreferenceList(profile.stylePreferences),
      agentsEnabled: {
        weather: true,
        outfit: true,
        music: true,
        energy: true,
      },
    }).catch((error) => {
      console.warn('[preferences] autosave failed:', error)
    })
  }, [profile.dietaryPreferences, profile.musicPreferences, profile.stylePreferences, userKey])

  const outputsByAgent = useMemo(() => {
    const outputs = sessionQuery.data?.outputs ?? []
    return outputs.reduce<Record<string, AgentOutput>>((acc, output) => {
      if (output.output && typeof output.output === 'object') {
        acc[output.agentName] = output.output as AgentOutput
      }
      return acc
    }, {})
  }, [sessionQuery.data?.outputs])

  const enrichedCards = useMemo(
    () =>
      cardDetails.map((card) => {
        const output = outputsByAgent[card.id]
        return {
          ...card,
          value: output?.value ?? card.value,
          detail: output?.detail ?? card.detail,
          previewData: output?.previewData ?? card.previewData,
        }
      }),
    [cardDetails, outputsByAgent],
  )

  const completedCount = sessionQuery.data?.outputs?.length ?? 0
  const selectedCard = enrichedCards.find((card) => card.id === selectedCardId) ?? null
  const selectedCardOutput = selectedCard ? outputsByAgent[selectedCard.id] : undefined
  const topMusicTrack = selectedCard?.id === 'music' ? selectedCardOutput?.tracks?.[0] : undefined
  const topMusicTrackSpotifyId = isValidSpotifyId(topMusicTrack?.spotify_id) ? topMusicTrack.spotify_id : null
  const topMusicTrackName = topMusicTrack ? `${topMusicTrack.title} - ${topMusicTrack.artist}` : null
  const musicAlbumCoverQuery = useQuery({
    queryKey: ['music-album-cover', topMusicTrackSpotifyId],
    enabled: Boolean(selectedCard?.id === 'music' && topMusicTrackSpotifyId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!topMusicTrackSpotifyId) {
        return null
      }
      const oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(
        `https://open.spotify.com/track/${topMusicTrackSpotifyId}`,
      )}`
      const response = await fetch(oEmbedUrl)
      if (!response.ok) {
        throw new Error('Unable to fetch album artwork')
      }
      const data = (await response.json()) as { thumbnail_url?: string }
      return data.thumbnail_url ?? null
    },
  })
  const weatherMapPreviewUrl =
    selectedCard?.id === 'weather' && profile.location.trim()
      ? getWeatherMapPreviewUrl(profile.location.trim())
      : null
  const weatherLocationQuery = profile.location.trim() || 'Los Angeles'
  const hourlyForecastQuery = useQuery({
    queryKey: ['weather-hourly-forecast', userKey, weatherLocationQuery],
    enabled: Boolean(selectedCard?.id === 'weather' && isForecastModalOpen),
    staleTime: 5 * 60_000,
    queryFn: () => getHourlyForecast(userKey, weatherLocationQuery),
  })
  const selectedCardPanel = useMemo(() => {
    if (!selectedCard) {
      return null
    }

    if (selectedCard.id === 'weather') {
      const weatherOutput = selectedCardOutput
      const previewText = weatherOutput?.previewData ?? selectedCard.previewData
      const feelsLikeMatch = previewText.match(/Feels like\s+([^.\n]+)/i)
      const humidityMatch = previewText.match(/Humidity\s+([^.\n]+)/i)
      const windMatch = previewText.match(/Wind\s+([^.\n]+)/i)

      const dynamicFields = [
        { key: 'Current', value: weatherOutput?.detail ?? selectedCard.detail },
        { key: 'Feels Like', value: feelsLikeMatch?.[1]?.trim() ?? 'Not available yet' },
        { key: 'Humidity', value: humidityMatch?.[1]?.trim() ?? 'Not available yet' },
        { key: 'Wind', value: windMatch?.[1]?.trim() ?? 'Not available yet' },
      ]

      return {
        ...selectedCard,
        subtitle: previewText || 'Live weather summary from your current session.',
        fields: dynamicFields,
        actions: ['View Hourly Forecast'],
      }
    }

    if (selectedCard.id === 'outfit') {
      const outfitOutput = selectedCardOutput as (AgentOutput & {
        items?: {
          top?: { name: string; reason: string } | null
          bottom?: { name: string; reason: string } | null
          shoes?: { name: string; reason: string } | null
          outer?: { name: string; reason: string } | null
        }
      }) | undefined

      const items = outfitOutput?.items
      const dynamicFields: Array<{ key: string; value: string }> = []
      if (items?.top) dynamicFields.push({ key: 'Top', value: `${items.top.name} — ${items.top.reason}` })
      if (items?.bottom) dynamicFields.push({ key: 'Bottom', value: `${items.bottom.name} — ${items.bottom.reason}` })
      if (items?.shoes) dynamicFields.push({ key: 'Shoes', value: `${items.shoes.name} — ${items.shoes.reason}` })
      if (items?.outer) dynamicFields.push({ key: 'Outer', value: `${items.outer.name} — ${items.outer.reason}` })

      return {
        ...selectedCard,
        subtitle: outfitOutput?.previewData ?? selectedCard.previewData,
        fields: dynamicFields.length > 0 ? dynamicFields : selectedCard.fields,
      }
    }

    if (selectedCard.id === 'music') {
      const musicOutput = selectedCardOutput
      const tracks = musicOutput?.tracks ?? []
      const firstTrack = tracks[0]
      const topArtists = Array.from(new Set(tracks.map((track) => track.artist).filter(Boolean))).slice(0, 3)

      return {
        ...selectedCard,
        subtitle: musicOutput?.previewData ?? selectedCard.previewData,
        actions: ['Regenerate Queue'],
        fields: [
          { key: 'Vibe', value: musicOutput?.detail ?? selectedCard.detail },
          { key: 'Track Count', value: `${tracks.length || 0} tracks` },
          {
            key: 'Now Suggested',
            value: firstTrack ? `${firstTrack.title} - ${firstTrack.artist}` : 'Track list is still loading',
          },
          {
            key: 'Top Artists',
            value: topArtists.length > 0 ? topArtists.join(', ') : 'Artist data not available yet',
          },
        ],
      }
    }

    return selectedCard
  }, [profile.location, selectedCard, selectedCardOutput])
  const panelHeroImageUrl =
    selectedCard?.id === 'music'
      ? (musicAlbumCoverQuery.data ?? null)
      : selectedCard?.id === 'weather'
        ? weatherMapPreviewUrl
        : null
  const panelHeroImageAlt =
    selectedCard?.id === 'music' && topMusicTrackName
      ? `${topMusicTrackName} album cover`
      : selectedCard?.id === 'weather' && profile.location.trim()
        ? `Map preview of ${profile.location.trim()}`
        : undefined
  const isPanelOpen = Boolean(selectedCard)
  const completedAgents = useMemo(
    () =>
      new Set(
        (requestStatusQuery.data?.agents ?? [])
          .filter((agent) => agent.status === 'completed')
          .map((agent) => agent.agentName),
      ),
    [requestStatusQuery.data?.agents],
  )
  const showProfileBadge = useMemo(() => {
    const fieldsToCheck = [
      profile.name,
      profile.location,
      profile.morningFocus,
      profile.routineNotes,
      profile.dietaryPreferences,
      profile.musicPreferences,
      profile.stylePreferences,
    ]
    return fieldsToCheck.some((field) => field.trim().length === 0)
  }, [profile])
  const updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    if (selectedCard?.id !== 'weather') {
      setIsForecastModalOpen(false)
    }
  }, [selectedCard?.id])

  const handleFeedback = async (agentName: string, signal: 'accepted' | 'rejected' | 'regenerated') => {
    if (!sessionId) {
      return
    }

    await sendFeedback({
      userKey,
      sessionId,
      agentName,
      signal,
    })
  }

  const startNewSession = (profileOverride?: UserProfile) => {
    const promptProfile = profileOverride ?? profile
    clearActiveRequestId()
    clearActiveSessionId()
    setSessionId(null)
    setRequestId(null)
    setSelectedCardId(null)
    setSessionError(null)
    createSessionMutation.reset()
    void createRequest(userKey, buildPromptFromProfile(promptProfile))
      .then((request) => {
        setRequestId(request.requestId)
        setActiveRequestId(request.requestId)
        createSessionMutation.mutate({
          prompt: buildPromptFromProfile(promptProfile),
          reqId: request.requestId,
        })
      })
      .catch((error) => {
        setSessionError(error instanceof Error ? error.message : 'Unable to create request')
      })
  }

  const saveProfile = (nextProfile: UserProfile) => {
    setProfile(nextProfile)
    saveUserProfile(nextProfile)
    void saveProfileApi(userKey, nextProfile).catch(() => {
      setSessionError('Profile saved locally, but syncing to server failed.')
    })
    setIsProfileOpen(false)
    setSessionError(null)
    setProfileToast('Profile updated. Starting a fresh session with your new context.')
    startNewSession(nextProfile)
  }

  const submitThumbFeedback = (agentName: string, signal: 'liked' | 'disliked') => {
    setFeedbackStateByAgent((prev) => ({ ...prev, [agentName]: signal }))
    void sendFeedback({
      userKey,
      sessionId: sessionId ?? undefined,
      agentName,
      signal,
      sessionPhase: 'dashboard',
      moduleVariant: 'card',
    })
  }

  useEffect(() => {
    if (!profileToast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setProfileToast(null)
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [profileToast])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <BackgroundPulse />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 -left-24 -top-24 h-[520px] w-[520px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, ${colors.primary} 0%, transparent 68%)`,
          opacity: layout.orbOpacityMin,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 -bottom-28 -right-28 h-[580px] w-[580px] rounded-full blur-[140px]"
        style={{
          background: `radial-gradient(circle, ${colors.secondary} 0%, transparent 70%)`,
          opacity: layout.orbOpacityMax,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 right-1/3 top-1/2 h-[380px] w-[380px] -translate-y-1/2 rounded-full blur-[110px]"
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
            <DashboardHeader userName={profile.name} userLocation={profile.location} />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                className="relative rounded-xl border border-border bg-muted/30 px-4 py-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
              >
                Profile
                {showProfileBadge ? (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-3.5 w-3.5 animate-pulse rounded-full border border-background bg-secondary" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => startNewSession()}
                className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-primary transition-all duration-200 ease-out hover:border-primary hover:bg-primary/20"
              >
                Start New Session
              </button>
            </div>
            {requestId ? (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 font-body text-xs uppercase tracking-[0.12em] text-foreground/70">
                Request {requestId.slice(0, 8)} ·{' '}
                {requestStatusQuery.data?.request.status ?? 'initializing'} · Agents done:{' '}
                {requestStatusQuery.data?.agents.filter((agent) => agent.status === 'completed').length ?? 0}/4
              </div>
            ) : null}
            {sessionError ? (
              <div className="rounded-xl border border-secondary/50 bg-secondary/10 px-4 py-3 font-body text-sm text-secondary">
                {sessionError}
              </div>
            ) : null}
            <AnimatePresence>
              {profileToast ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="rounded-xl border border-tertiary/40 bg-tertiary/10 px-4 py-3 font-body text-sm text-tertiary"
                >
                  {profileToast}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="grid grid-cols-2 gap-6">
              <DashboardCard
                accent={enrichedCards[0].accent}
                icon={<CloudSun size={24} strokeWidth={2.2} />}
                label={enrichedCards[0].label}
                value={enrichedCards[0].value}
                detail={enrichedCards[0].detail}
                previewData={enrichedCards[0].previewData}
                onClick={() => setSelectedCardId(enrichedCards[0].id)}
                isLoading={!completedAgents.has(enrichedCards[0].id)}
              />
              <div className="translate-y-[20px]">
                <DashboardCard
                  accent={enrichedCards[1].accent}
                  icon={<Shirt size={24} strokeWidth={2.2} />}
                  label={enrichedCards[1].label}
                  value={enrichedCards[1].value}
                  detail={enrichedCards[1].detail}
                  previewData={enrichedCards[1].previewData}
                  onClick={() => setSelectedCardId(enrichedCards[1].id)}
                  feedbackState={feedbackStateByAgent[enrichedCards[1].id] ?? null}
                  onLike={() => submitThumbFeedback(enrichedCards[1].id, 'liked')}
                  onDislike={() => submitThumbFeedback(enrichedCards[1].id, 'disliked')}
                  isLoading={!completedAgents.has(enrichedCards[1].id)}
                />
              </div>
              <div className="translate-y-[20px]">
                <MusicCard
                  value={enrichedCards[2].value}
                  detail={enrichedCards[2].detail}
                  previewData={enrichedCards[2].previewData}
                  tracks={(outputsByAgent['music'] as { tracks?: Array<{ title: string; artist: string; spotify_id?: string | null }> } | undefined)?.tracks}
                  isLoading={!completedAgents.has('music') || regenerateMusicMutation.isPending}
                  feedbackState={feedbackStateByAgent['music'] ?? null}
                  onLike={() => submitThumbFeedback('music', 'liked')}
                  onDislike={() => submitThumbFeedback('music', 'disliked')}
                  onRegenerate={sessionId ? () => regenerateMusicMutation.mutate() : undefined}
                  onClick={() => setSelectedCardId(enrichedCards[2].id)}
                />
              </div>
              <DashboardCard
                accent={enrichedCards[3].accent}
                icon={<Zap size={24} strokeWidth={2.2} />}
                label={enrichedCards[3].label}
                value={enrichedCards[3].value}
                detail={enrichedCards[3].detail}
                previewData={enrichedCards[3].previewData}
                onClick={() => setSelectedCardId(enrichedCards[3].id)}
                feedbackState={feedbackStateByAgent[enrichedCards[3].id] ?? null}
                onLike={() => submitThumbFeedback(enrichedCards[3].id, 'liked')}
                onDislike={() => submitThumbFeedback(enrichedCards[3].id, 'disliked')}
                isLoading={!completedAgents.has(enrichedCards[3].id)}
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <StatBox accent={colors.primary} label="Current Time" value={currentTimeText} />
              <StatBox accent={colors.secondary} label="Completion" value={`${completedCount}/4`} />
              <StatBox
                accent={colors.tertiary}
                label="Status"
                value={sessionQuery.isFetching ? 'Loading' : completedCount >= 4 ? 'Ready' : 'Working'}
              />
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
                    accent={(selectedCardPanel ?? selectedCard).accent}
                    label={(selectedCardPanel ?? selectedCard).label}
                    title={(selectedCardPanel ?? selectedCard).value}
                    titleClassName={selectedCard.id === 'music' ? 'text-4xl xl:text-5xl break-words' : undefined}
                    subtitle={(selectedCardPanel ?? selectedCard).subtitle}
                    icon={(selectedCardPanel ?? selectedCard).icon}
                    fields={(selectedCardPanel ?? selectedCard).fields}
                    actions={(selectedCardPanel ?? selectedCard).actions}
                    updatedAt={updatedAt}
                    heroImageUrl={panelHeroImageUrl}
                    heroImageAlt={panelHeroImageAlt}
                    onClose={() => {
                      void handleFeedback(selectedCard.id, 'rejected')
                      setSelectedCardId(null)
                    }}
                    feedbackState={feedbackStateByAgent[selectedCard.id] ?? null}
                    onLike={() => submitThumbFeedback(selectedCard.id, 'liked')}
                    onDislike={() => submitThumbFeedback(selectedCard.id, 'disliked')}
                    onActionClick={(action) => {
                      if (selectedCard.id === 'weather') {
                        if (action === 'View Hourly Forecast') {
                          setIsForecastModalOpen(true)
                          return
                        }
                      }
                      const signal = action.toLowerCase().includes('regenerate') ? 'regenerated' : 'accepted'
                      void handleFeedback(selectedCard.id, signal)
                    }}
                  />
                ) : null}
              </motion.div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isForecastModalOpen && selectedCard?.id === 'weather' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background p-8 backdrop-blur-sm"
          >
            <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-4">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  Hourly Forecast
                </p>
                <h2 className="mt-2 font-display text-5xl font-extrabold tracking-[-0.03em]">
                  {hourlyForecastQuery.data?.resolvedLocation ?? weatherLocationQuery}
                </h2>
                <p className="mt-2 font-body text-sm text-foreground/70">
                  Branded in-app 3-hour forecast timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsForecastModalOpen(false)}
                className="rounded-xl border border-border bg-muted/40 px-4 py-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
              >
                Close Forecast
              </button>
            </div>

            <div className="mx-auto mt-8 w-full max-w-[1600px] flex-1 overflow-hidden rounded-2xl border border-border bg-card/70 p-6">
              {hourlyForecastQuery.isError ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-secondary/40 bg-secondary/10 px-6 py-5 text-secondary">
                  Unable to load hourly forecast right now.
                </div>
              ) : hourlyForecastQuery.isPending ? (
                <div className="flex h-full items-center justify-center">
                  <div className="dayger-shimmer h-24 w-64 rounded-xl" />
                </div>
              ) : (
                <div className="grid h-full grid-cols-6 grid-rows-2 gap-3">
                  {(hourlyForecastQuery.data?.entries ?? []).slice(0, 12).map((entry) => {
                    const ConditionIcon = getWeatherConditionIcon(entry.condition)
                    return (
                      <div
                        key={entry.timestamp}
                        className="flex min-h-0 flex-col rounded-2xl border border-border bg-muted/30 p-3"
                      >
                        <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-foreground/65">
                          {entry.timeLabel}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <ConditionIcon size={22} className="text-primary" />
                          <p className="font-display text-2xl font-extrabold tracking-[-0.02em]">{entry.tempF}°</p>
                        </div>
                        <p className="mt-2 truncate font-body text-sm font-semibold text-foreground/85">{entry.condition}</p>
                        <p className="truncate font-body text-[11px] text-foreground/55 capitalize">{entry.description}</p>
                        <div className="mt-2 space-y-1 font-body text-[11px] text-foreground/70">
                          <p>Feels: {entry.feelsLikeF}°F</p>
                          <p>Rain: {entry.precipitationChance}%</p>
                          <p>Wind: {entry.windMph} mph</p>
                          <p>Humidity: {entry.humidity}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ProfileModal
        isOpen={isProfileOpen}
        initialProfile={profile}
        onClose={() => setIsProfileOpen(false)}
        onSave={saveProfile}
      />
    </div>
  )
}
