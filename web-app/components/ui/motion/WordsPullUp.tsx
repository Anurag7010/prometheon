'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { EASE_CINEMATIC, STAGGER } from '@/lib/motion'

interface WordsPullUpProps {
  text: string
  className?: string
  showAsterisk?: boolean
  delay?: number
}

export function WordsPullUp({ text, className, showAsterisk, delay = 0 }: WordsPullUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const words = text.split(' ')

  return (
    <span ref={ref} className={className} style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
      {words.map((word, i) => (
        <span key={i} style={{ overflow: 'hidden', display: 'inline-block' }}>
          <motion.span
            initial={{ y: 12, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : undefined}
            transition={{
              duration: 0.7,
              ease: EASE_CINEMATIC,
              delay: delay + i * STAGGER.tight,
            }}
            style={{ display: 'inline-block', whiteSpace: 'pre' }}
          >
            {word}{i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
      {showAsterisk && (
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            fontSize: '0.31em',
            lineHeight: 1,
            verticalAlign: 'top',
            marginTop: '-0.15em',
          }}
        >
          *
        </span>
      )}
    </span>
  )
}
