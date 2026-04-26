import { AnimatePresence, motion } from 'framer-motion'
import { FormEvent, useEffect, useState } from 'react'
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
            className="dayger-scroll max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card/95 p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-primary">Profile Context</p>
                <h2 className="mt-2 font-display text-5xl font-extrabold tracking-[-0.03em]">Personalize Dayger</h2>
                <p className="mt-2 font-body text-base text-foreground/75">
                  This information helps the agents generate better daily recommendations.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-foreground/80 transition-all duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <Field
                label="Name"
                value={profile.name}
                onChange={(value) => setProfile((prev) => ({ ...prev, name: value }))}
                placeholder="Alex"
              />
              <Field
                label="Location"
                value={profile.location}
                onChange={(value) => setProfile((prev) => ({ ...prev, location: value }))}
                placeholder="Los Angeles"
              />
            </div>

            <div className="mt-4 space-y-4">
              <Field
                label="Morning Focus"
                value={profile.morningFocus}
                onChange={(value) => setProfile((prev) => ({ ...prev, morningFocus: value }))}
                placeholder="Stay calm and focused for classes"
              />
              <TextAreaField
                label="Routine Notes"
                value={profile.routineNotes}
                onChange={(value) => setProfile((prev) => ({ ...prev, routineNotes: value }))}
                placeholder="I leave at 8:30 AM and prefer short recommendations."
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <Field
                label="Dietary Preferences (comma separated)"
                value={profile.dietaryPreferences}
                onChange={(value) => setProfile((prev) => ({ ...prev, dietaryPreferences: value }))}
                placeholder="Ramen, comfort food"
              />
              <Field
                label="Music Preferences (comma separated)"
                value={profile.musicPreferences}
                onChange={(value) => setProfile((prev) => ({ ...prev, musicPreferences: value }))}
                placeholder="Pop, lo-fi"
              />
              <Field
                label="Style Preferences (comma separated)"
                value={profile.stylePreferences}
                onChange={(value) => setProfile((prev) => ({ ...prev, stylePreferences: value }))}
                placeholder="Casual, layered"
              />
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

type FieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function Field({ label, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="block">
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 font-body text-base text-foreground outline-none transition-all duration-150 ease-out placeholder:text-foreground/45 focus:border-primary/60"
      />
    </label>
  )
}

function TextAreaField({ label, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="block">
      <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 font-body text-base text-foreground outline-none transition-all duration-150 ease-out placeholder:text-foreground/45 focus:border-primary/60"
      />
    </label>
  )
}
