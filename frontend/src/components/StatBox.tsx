import { motion } from 'framer-motion'
import { useState } from 'react'
import { animation } from '../tokens'

type StatBoxProps = {
  accent: string
  label: string
  value: string
}

export function StatBox({ accent, label, value }: StatBoxProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <motion.article
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        scale: 1.05,
        borderColor: `${accent}99`,
        boxShadow: `0 16px 36px ${accent}33`,
      }}
      transition={{ duration: animation.standard, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-2xl border-2 px-6 py-5"
      style={{
        borderColor: `${accent}4D`,
        background: `linear-gradient(135deg, ${accent}1A 0%, ${accent}0D 100%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full animate-pulse"
          style={{ backgroundColor: accent }}
        />
        <p className="font-body text-xs font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
          {label}
        </p>
      </div>

      <motion.p
        animate={{ color: isHovered ? accent : '#f8f8f8' }}
        transition={{ duration: animation.fast, ease: 'easeOut' }}
        className="mt-3 font-display text-4xl font-extrabold leading-none tracking-[-0.03em]"
      >
        {value}
      </motion.p>
    </motion.article>
  )
}
