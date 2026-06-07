'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { EASE_CINEMATIC, STAGGER } from '@/lib/motion'

interface Segment {
  text: string
  className: string
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[]
  containerClassName?: string
  delay?: number
}

export function WordsPullUpMultiStyle({ segments, containerClassName, delay = 0 }: WordsPullUpMultiStyleProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  const allWords: Array<{ word: string; className: string }> = []
  for (const seg of segments) {
    const words = seg.text.split(' ').filter(Boolean)
    for (const w of words) {
      allWords.push({ word: w, className: seg.className })
    }
  }

  return (
    <span
      ref={ref}
      className={containerClassName}
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0 0.3em' }}
    >
      {allWords.map((item, i) => (
        <span key={i} style={{ overflow: 'hidden', display: 'inline-block' }}>
          <motion.span
            className={item.className}
            initial={{ y: 12, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : undefined}
            transition={{
              duration: 0.75,
              ease: EASE_CINEMATIC,
              delay: delay + i * STAGGER.tight,
            }}
            style={{ display: 'inline-block' }}
          >
            {item.word}
          </motion.span>
        </span>
      ))}
    </span>
  )
}
