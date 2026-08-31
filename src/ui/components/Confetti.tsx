'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

/*
  The app's own dyes, not a generic party palette. These were six unmodified
  Tailwind hexes left over from the pre-redesign look, so the one moment the
  app celebrates was the one moment it stopped looking like itself.
*/
const COLORS = ['#e8c14a', '#2fbdbd', '#4db06b', '#e0563f', '#f0f1ec'];
const PIECES = 50;

/** One-shot celebratory confetti. Skipped entirely under reduced motion. */
export function Confetti() {
  const reducedMotion = useReducedMotion();
  // Deterministic pseudo-random layout per mount, stable across re-renders.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const rand = (n: number) => {
          const v = Math.abs(Math.sin(seed * (n + 1)) * 10_000);
          return v - Math.floor(v);
        };
        return {
          left: rand(1) * 100,
          delay: rand(2) * 0.6,
          duration: 1.6 + rand(3) * 1.4,
          size: 6 + rand(4) * 6,
          color: COLORS[i % COLORS.length]!,
          drift: (rand(5) - 0.5) * 160,
          spin: 360 + rand(6) * 540,
        };
      }),
    [],
  );

  if (reducedMotion) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-[-5%] block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.8, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
