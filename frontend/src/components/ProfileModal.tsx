import { AnimatePresence, motion } from 'framer-motion'
import { Cloud, Music2, Shirt, Utensils, Zap } from 'lucide-react'
import { FormEvent, KeyboardEvent, useEffect, useState } from 'react'
import type { UserProfile } from '../lib/userProfile'

type ProfileModalProps = {
  isOpen: boolean
  initialProfile: UserProfile
  onClose: () => void
  onSave: (profile: UserProfile) => void
}

export function ProfileModal({ isOpen, initialProfile, onClose, onSave }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile)

  useEffect(() => {
    if (isOpen) {
      setProfile(initialProfile)
    }
  }, [initialProfile, isOpen])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(profile)
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
        >
          <motion.form
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onSubmit={handleSubmit}
            className="dayger-scroll max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card/95 p-8"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-primary">Profile Context</p>
                <h2 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.03em]">Personalize Dayger</h2>
                <p className="mt-2 font-body text-sm text-foreground/60">
                  Each section powers a specific agent card. The more you fill in, the sharper the recommendations.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-border px-4 py-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
              >
                Close
              </button>
            </div>

            {/* About You */}
            <div className="mt-8">
              <SectionHeader label="About You" />
              <Field
                label="Name"
                value={profile.name}
                onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
                placeholder="Alex"
              />
            </div>

            {/* Weather */}
            <div className="mt-6">
              <SectionHeader
                label="Weather"
                icon={<Cloud size={12} strokeWidth={2.5} />}
                agentColor="text-sky-400"
                hint="Powers the weather card and shapes what the outfit agent recommends."
              />
              <Field
                label="Your City"
                value={profile.location}
                onChange={(v) => setProfile((p) => ({ ...p, location: v }))}
                placeholder="Los Angeles"
              />
            </div>

            {/* Energy & Schedule */}
            <div className="mt-6">
              <SectionHeader
                label="Energy & Schedule"
                icon={<Zap size={12} strokeWidth={2.5} />}
                agentColor="text-yellow-400"
                hint="Sets your energy curve start point and shapes the peak/dip windows."
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Typical Wake Time"
                  value={profile.wakeTime}
                  onChange={(v) => setProfile((p) => ({ ...p, wakeTime: v }))}
                  placeholder="07:00"
                  type="time"
                />
                <EnergySlider
                  value={profile.energyBaseline}
                  onChange={(v) => setProfile((p) => ({ ...p, energyBaseline: v }))}
                />
              </div>
              <div className="mt-4 space-y-4">
                <Field
                  label="Morning Focus"
                  value={profile.morningFocus}
                  onChange={(v) => setProfile((p) => ({ ...p, morningFocus: v }))}
                  placeholder="Stay calm and focused for classes"
                />
                <TextAreaField
                  label="Routine Notes"
                  value={profile.routineNotes}
                  onChange={(v) => setProfile((p) => ({ ...p, routineNotes: v }))}
                  placeholder="I leave at 8:30 AM and prefer short recommendations."
                />
              </div>
            </div>

            {/* Outfit */}
            <div className="mt-6">
              <SectionHeader
                label="Outfit"
                icon={<Shirt size={12} strokeWidth={2.5} />}
                agentColor="text-orange-400"
                hint="Outfit agent picks clothes that match these styles and current weather."
              />
              <TagField
                label="Style Tags"
                value={profile.stylePreferences}
                onChange={(v) => setProfile((p) => ({ ...p, stylePreferences: v }))}
                placeholder="e.g. casual"
              />
            </div>

            {/* Music */}
            <div className="mt-6">
              <SectionHeader
                label="Music"
                icon={<Music2 size={12} strokeWidth={2.5} />}
                agentColor="text-purple-400"
                hint="Music agent builds a playlist around these vibes and your current mood."
              />
              <TagField
                label="Genre Tags"
                value={profile.musicPreferences}
                onChange={(v) => setProfile((p) => ({ ...p, musicPreferences: v }))}
                placeholder="e.g. lo-fi"
              />
            </div>

            {/* Meals */}
            <div className="mt-6">
              <SectionHeader
                label="Meals"
                icon={<Utensils size={12} strokeWidth={2.5} />}
                agentColor="text-blue-400"
                hint="Meal agent picks dishes that match your tastes and avoids anything you can't eat."
              />
              <div className="space-y-4">
                <TagField
                  label="Food Preferences"
                  value={profile.foodPreferences}
                  onChange={(v) => setProfile((p) => ({ ...p, foodPreferences: v }))}
                  placeholder="e.g. spicy, pasta"
                />
                <TagField
                  label="Dietary Restrictions / Allergies"
                  value={profile.dietaryRestrictions}
                  onChange={(v) => setProfile((p) => ({ ...p, dietaryRestrictions: v }))}
                  placeholder="e.g. vegetarian, no nuts"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-5 py-3 font-body text-sm font-bold uppercase tracking-[0.12em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-primary px-6 py-3 font-body text-sm font-bold uppercase tracking-[0.12em] text-background transition-all duration-200 ease-out hover:brightness-110"
              >
                Save Profile
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

type SectionHeaderProps = {
  label: string
  icon?: React.ReactNode
  agentColor?: string
  hint?: string
}

function SectionHeader({ label, icon, agentColor, hint }: SectionHeaderProps) {
  return (
    <div className="mb-3 border-b border-border pb-2">
      <div className="flex items-center gap-2">
        {icon && <span className={agentColor ?? 'text-foreground/50'}>{icon}</span>}
        <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/60">{label}</p>
      </div>
      {hint && <p className="mt-0.5 font-body text-[11px] text-foreground/40">{hint}</p>}
    </div>
  )
}

// ── Plain text field ──────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  type?: string
}

function Field({ label, value, placeholder, onChange, type = 'text' }: FieldProps) {
  return (
    <label className="block">
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 font-body text-base text-foreground outline-none transition-all duration-150 ease-out placeholder:text-foreground/45 focus:border-primary/60 [color-scheme:dark]"
      />
    </label>
  )
}

function TextAreaField({ label, value, placeholder, onChange }: Omit<FieldProps, 'type'>) {
  return (
    <label className="block">
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 font-body text-base text-foreground outline-none transition-all duration-150 ease-out placeholder:text-foreground/45 focus:border-primary/60"
      />
    </label>
  )
}

// ── Energy baseline slider ────────────────────────────────────────────────────

function EnergySlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const level = Number.parseInt(value, 10) || 7
  return (
    <div>
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">
        Morning Energy Baseline
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={10}
          value={level}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 accent-primary"
        />
        <span className="w-8 text-center font-body text-sm font-bold text-foreground">{level}</span>
      </div>
      <div className="mt-1 flex justify-between font-body text-[10px] text-foreground/35">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  )
}

// ── Tag chip input ────────────────────────────────────────────────────────────

type TagFieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function TagField({ label, value, onChange, placeholder }: TagFieldProps) {
  const [inputText, setInputText] = useState('')
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const addTag = (raw: string) => {
    const trimmed = raw.trim().toLowerCase()
    if (!trimmed || tags.map((t) => t.toLowerCase()).includes(trimmed)) return
    onChange([...tags, raw.trim()].join(', '))
  }

  const removeTag = (tag: string) => {
    onChange(
      tags
        .filter((t) => t !== tag)
        .join(', '),
    )
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputText.trim()) {
        addTag(inputText)
        setInputText('')
      }
    } else if (e.key === 'Backspace' && !inputText && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div>
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 py-2 transition-all duration-150 ease-out focus-within:border-primary/60">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1 font-body text-xs font-semibold text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="leading-none opacity-50 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputText.trim()) {
              addTag(inputText)
              setInputText('')
            }
          }}
          placeholder={tags.length === 0 ? placeholder : 'Add tag…'}
          className="min-w-[80px] flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
      </div>
      <p className="mt-1.5 font-body text-[11px] text-foreground/35">Press Enter or comma to add a tag</p>
    </div>
  )
}
