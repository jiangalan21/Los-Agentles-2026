import { AnimatePresence, motion } from 'framer-motion'
import { CloudSun, Music2, Shirt, Zap } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { JSX, useEffect, useMemo, useState } from 'react'
import {
  createRequest,
  createSession,
  getProfile,
  getRecentSessions,
  getRequest,
  getSession,
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
  actions: string[]
}

function formatCurrentTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function DashboardView() {
  const userKey = useMemo(() => getUserKey(), [])
  const [profile, setProfile] = useState<UserProfile>(() => getUserProfile())
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(() => getActiveSessionId())
  const [requestId, setRequestId] = useState<string | null>(() => getActiveRequestId())
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [profileToast, setProfileToast] = useState<string | null>(null)
  const [feedbackStateByAgent, setFeedbackStateByAgent] = useState<Record<string, 'liked' | 'disliked' | null>>({})
  const [currentTimeText, setCurrentTimeText] = useState(() => formatCurrentTime(new Date()))

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
    })
  }, [profile.dietaryPreferences, profile.musicPreferences, profile.stylePreferences, userKey])

  const outputsByAgent = useMemo(() => {
    const outputs = sessionQuery.data?.outputs ?? []
    return outputs.reduce<Record<string, { value?: string; detail?: string; previewData?: string }>>((acc, output) => {
      if (output.output && typeof output.output === 'object') {
        acc[output.agentName] = output.output
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
                feedbackState={feedbackStateByAgent[enrichedCards[0].id] ?? null}
                onLike={() => submitThumbFeedback(enrichedCards[0].id, 'liked')}
                onDislike={() => submitThumbFeedback(enrichedCards[0].id, 'disliked')}
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
                <DashboardCard
                  accent={enrichedCards[2].accent}
                  icon={<Music2 size={24} strokeWidth={2.2} />}
                  label={enrichedCards[2].label}
                  value={enrichedCards[2].value}
                  detail={enrichedCards[2].detail}
                  previewData={enrichedCards[2].previewData}
                  onClick={() => setSelectedCardId(enrichedCards[2].id)}
                  feedbackState={feedbackStateByAgent[enrichedCards[2].id] ?? null}
                  onLike={() => submitThumbFeedback(enrichedCards[2].id, 'liked')}
                  onDislike={() => submitThumbFeedback(enrichedCards[2].id, 'disliked')}
                  isLoading={!completedAgents.has(enrichedCards[2].id)}
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
                    accent={selectedCard.accent}
                    label={selectedCard.label}
                    title={selectedCard.value}
                    subtitle={selectedCard.subtitle}
                    icon={selectedCard.icon}
                    fields={selectedCard.fields}
                    actions={selectedCard.actions}
                    updatedAt={updatedAt}
                    onClose={() => {
                      void handleFeedback(selectedCard.id, 'rejected')
                      setSelectedCardId(null)
                    }}
                    feedbackState={feedbackStateByAgent[selectedCard.id] ?? null}
                    onLike={() => submitThumbFeedback(selectedCard.id, 'liked')}
                    onDislike={() => submitThumbFeedback(selectedCard.id, 'disliked')}
                    onActionClick={(action) => {
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

      <ProfileModal
        isOpen={isProfileOpen}
        initialProfile={profile}
        onClose={() => setIsProfileOpen(false)}
        onSave={saveProfile}
      />
    </div>
  )
}
